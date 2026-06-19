/**
 * Audit tick — the harness "buys the lock" with the cheap model.
 *
 * A cheap/open-weight model (Ollama by default) audits ONE rotating slice of the repo
 * each run for security + complexity/AX smells, and files findings as GitHub issues so
 * they flow into the same queue the dispatch loop already drains. The frontier Coach is
 * never involved — this is exactly the work a cheap, iterable model should do again and
 * again. GitHub is the hub: issues + labels in, no sidechannels.
 *
 * Coach/model-agnostic by design: swap the Coach (Claude Code, Codex, …) and this keeps
 * running, because it lives in GitHub Actions and talks to GitHub, not to any one Coach.
 *
 *   npx tsx scripts/audit-tick.ts            # DRY RUN — print findings, file nothing
 *   npx tsx scripts/audit-tick.ts --file     # actually create GitHub issues
 *   AUDIT_SLICE=src/referee npx tsx scripts/audit-tick.ts   # force a slice
 *
 * Env:
 *   AUDIT_MODEL_URL  Ollama generate endpoint (default http://localhost:11434/api/generate)
 *   AUDIT_MODEL      model tag (default qwen3:30b-a3b)
 *   AUDIT_REPO       owner/repo for `gh` (default: the repo `gh` resolves in cwd)
 *   AUDIT_MAX_ISSUES cap issues filed per run (default 5; extra findings are logged, not dropped silently)
 *   AUDIT_SLICE      force a directory slice instead of the daily rotation
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const MODEL_URL = process.env.AUDIT_MODEL_URL ?? "http://localhost:11434/api/generate";
const MODEL = process.env.AUDIT_MODEL ?? "qwen3:30b-a3b";
const REPO = process.env.AUDIT_REPO ?? "";
const MAX_ISSUES = Number(process.env.AUDIT_MAX_ISSUES ?? "5");
const FILE_MODE = process.argv.includes("--file") || process.env.AUDIT_FILE === "1";

const ROOT = process.cwd();
// The slices the tick rotates through — one "part of the repo" per day, per Pocock.
const SLICES = ["src/manager", "src/referee", "src/junior", "src/drivers", "src/protocol", "src/state"];
const CODE_EXT = new Set([".ts", ".js", ".mjs"]);
const MAX_FILE_BYTES = 16_000;
const MAX_BATCH_CHARS = 24_000;

interface Finding {
  title: string;
  severity: "high" | "medium" | "low";
  file: string;
  line?: number | string;
  kind: "security" | "complexity" | "ax";
  detail: string;
  fix?: string;
}

function log(msg: string): void {
  console.log(`[audit-tick] ${msg}`);
}

/** Deterministic daily slice — no Math.random / Date.now drift, just the calendar day. */
function pickSlice(): string {
  if (process.env.AUDIT_SLICE) return process.env.AUDIT_SLICE;
  const day = Math.floor(Date.parse(new Date().toISOString().slice(0, 10)) / 86_400_000);
  return SLICES[day % SLICES.length];
}

function listCodeFiles(dir: string): string[] {
  const abs = join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of entries) {
    const full = join(abs, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...listCodeFiles(relative(ROOT, full)));
      continue;
    }
    if (name.endsWith(".test.ts") || name.endsWith(".d.ts")) continue;
    if (CODE_EXT.has(name.slice(name.lastIndexOf("."))) && st.size <= MAX_FILE_BYTES) {
      out.push(relative(ROOT, full));
    }
  }
  return out.sort();
}

/** Rotate the file window within the slice by day, so a big slice is covered over time. */
function dailyWindow(files: string[]): string[] {
  if (files.length === 0) return [];
  const day = Math.floor(Date.parse(new Date().toISOString().slice(0, 10)) / 86_400_000);
  const batch: string[] = [];
  let chars = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[(day + i) % files.length];
    if (batch.includes(f)) break;
    const size = statSync(join(ROOT, f)).size;
    if (chars + size > MAX_BATCH_CHARS && batch.length > 0) break;
    batch.push(f);
    chars += size;
  }
  return batch;
}

/** Redact anything that looks like a live secret before it ever reaches a GitHub issue. */
function redact(text: string): string {
  return text
    .replace(/\b(gh[pousr]_[A-Za-z0-9]{20,})\b/g, "[REDACTED_TOKEN]")
    .replace(/\b(sk-[A-Za-z0-9]{20,})\b/g, "[REDACTED_KEY]")
    .replace(/\b([A-Za-z0-9+/]{40,}={0,2})\b/g, "[REDACTED_BLOB]")
    .replace(/(-----BEGIN [A-Z ]+PRIVATE KEY-----)[\s\S]*?(-----END [A-Z ]+PRIVATE KEY-----)/g, "[REDACTED_PRIVATE_KEY]");
}

async function callModel(prompt: string): Promise<string> {
  const res = await fetch(MODEL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // G2: HTTP API, stream:false, think:false for qwen3 — never `ollama run`.
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      think: false,
      format: "json",
      options: { temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`model ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { response?: string };
  return data.response ?? "";
}

function buildPrompt(files: { path: string; body: string }[]): string {
  const corpus = files.map((f) => `=== FILE: ${f.path} ===\n${f.body}`).join("\n\n");
  return `You are a strict code auditor. Audit ONLY the files below for real, specific problems in two categories:
- security: injection, unsafe auth/token handling, secrets in code, missing input validation, path traversal, unsafe shell/exec.
- complexity / AX (agent experience): shallow modules leaking internals, needless coupling, duplicated logic, confusing interfaces that make the code expensive to change.

Rules:
- Report only concrete, defensible findings tied to a file and (if possible) a line. No style nits, no speculation.
- NEVER quote a secret value. If you find a secret, report its location and type only.
- If a file is clean, do not invent a finding for it.

Return ONLY JSON of this exact shape:
{"findings":[{"title":"<short imperative>","severity":"high|medium|low","file":"<path>","line":<number or null>,"kind":"security|complexity|ax","detail":"<why it matters, 1-3 sentences>","fix":"<concrete suggested fix>"}]}

FILES:
${corpus}`;
}

function ghJson<T>(args: string[]): T {
  const repoArgs = REPO ? ["--repo", REPO] : [];
  const out = execFileSync("gh", [...args, ...repoArgs], { encoding: "utf8" });
  return JSON.parse(out) as T;
}

function existingAuditTitles(): Set<string> {
  try {
    const issues = ghJson<{ title: string }[]>([
      "issue", "list", "--label", "audit", "--state", "open", "--limit", "200", "--json", "title",
    ]);
    return new Set(issues.map((i) => i.title.toLowerCase().trim()));
  } catch (e) {
    log(`warning: could not list existing audit issues (${String(e).slice(0, 120)})`);
    return new Set();
  }
}

function ensureAuditLabel(): void {
  try {
    execFileSync(
      "gh",
      ["label", "create", "audit", "--color", "5319e7", "--description", "Filed by the cheap-model audit tick", ...(REPO ? ["--repo", REPO] : [])],
      { encoding: "utf8", stdio: "pipe" }
    );
    log("created label `audit`");
  } catch {
    /* already exists — fine */
  }
}

function priorityFor(sev: Finding["severity"]): string {
  return sev === "high" ? "priority:high" : sev === "medium" ? "priority:medium" : "priority:low";
}

function fileIssue(f: Finding): void {
  const labels = ["audit", priorityFor(f.severity)];
  if (f.kind === "security") labels.push("area:security");
  const title = redact(f.title).slice(0, 100);
  const body = [
    redact(f.detail),
    "",
    `**File:** \`${f.file}\`${f.line ? ` (around line ${f.line})` : ""}`,
    `**Kind:** ${f.kind} · **Severity:** ${f.severity}`,
    f.fix ? `\n**Suggested fix:** ${redact(f.fix)}` : "",
    "",
    `---`,
    `🔒 Filed by the audit tick (cheap model: \`${MODEL}\`). Triage like any queue item — the Coach grills + dispatches a fix; nothing auto-merges. Security/secret findings stay with the Coach.`,
  ].join("\n");
  const args = ["issue", "create", "--title", title, "--body", body];
  for (const l of labels) args.push("--label", l);
  if (REPO) args.push("--repo", REPO);
  const url = execFileSync("gh", args, { encoding: "utf8" }).trim();
  log(`filed: ${title} → ${url}`);
}

async function main(): Promise<void> {
  const slice = pickSlice();
  const allFiles = listCodeFiles(slice);
  const batch = dailyWindow(allFiles);
  log(`slice: ${slice} (${allFiles.length} files) → auditing ${batch.length}: ${batch.map((f) => f.split("/").pop()).join(", ")}`);
  if (batch.length === 0) {
    log("nothing to audit in this slice; exiting clean");
    return;
  }

  // Cheap model reachable? If not, no-op cleanly so scheduled runs don't fail noisily.
  const files = batch.map((p) => ({ path: p, body: readFileSync(join(ROOT, p), "utf8") }));
  let raw: string;
  try {
    raw = await callModel(buildPrompt(files));
  } catch (e) {
    log(`cheap model unreachable at ${MODEL_URL} (${String(e).slice(0, 120)}); skipping this tick`);
    return;
  }

  let findings: Finding[] = [];
  try {
    const parsed = JSON.parse(raw) as { findings?: Finding[] };
    findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  } catch {
    log(`model did not return valid JSON; skipping. First 200 chars: ${raw.slice(0, 200)}`);
    return;
  }

  // Keep only findings that point at a file we actually audited (anti-hallucination, G1).
  const audited = new Set(batch);
  findings = findings.filter((f) => f && typeof f.file === "string" && audited.has(f.file.replace(/^\.\//, "")));
  log(`model returned ${findings.length} finding(s) tied to audited files`);
  if (findings.length === 0) return;

  if (!FILE_MODE) {
    log("DRY RUN (pass --file to create issues). Findings:");
    for (const f of findings) console.log(`  • [${f.severity}/${f.kind}] ${f.file}: ${f.title}`);
    return;
  }

  ensureAuditLabel();
  const seen = existingAuditTitles();
  const fresh = findings.filter((f) => !seen.has(redact(f.title).toLowerCase().trim()));
  log(`${fresh.length} fresh after dedupe (${findings.length - fresh.length} already filed)`);

  const toFile = fresh.slice(0, MAX_ISSUES);
  if (fresh.length > toFile.length) {
    log(`capping at ${MAX_ISSUES} this run; ${fresh.length - toFile.length} carried to next tick (not dropped): ${fresh.slice(MAX_ISSUES).map((f) => f.title).join("; ")}`);
  }
  for (const f of toFile) fileIssue(f);
  log(`done — ${toFile.length} issue(s) filed`);
}

main().catch((e) => {
  console.error(`[audit-tick] fatal: ${e}`);
  process.exit(1);
});
