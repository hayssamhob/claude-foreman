/**
 * ApiDriver adapter (M5-3) — the BYO-key wake-up for cheap open-weights APIs.
 *
 * `agent:api` on an issue -> call an OpenAI-compatible endpoint (DeepSeek, MiniMax,
 * Qwen, GLM, etc.), write the files it returns, commit, push, and open a PR.
 *
 * This follows the same pattern as `src/dispatch/ollama.ts` — it's a FighterAdapter
 * that uses fetch to call an OpenAI-compatible /v1/chat/completions endpoint, parses
 * the JSON file output, writes them, and opens a PR.
 *
 * Env:
 *   API_KEY     the API key for the provider
 *   API_BASE    the base URL (e.g. https://api.deepseek.com)
 *   API_MODEL   the model name (e.g. deepseek-chat, minimax-01, qwen-plus, glm-4-plus)
 *
 * G2: HTTP API, no streaming — never run a local CLI.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isExcludedScope } from "../dispatch/adapter.js";
import type { FighterAdapter, WakeContext, WakeResult } from "../dispatch/adapter.js";

/** Pure: assemble the API prompt from the grilled brief + a strict JSON output contract. */
export function buildApiPrompt(ctx: WakeContext): string {
  return `${ctx.brief}

---
Output ONLY valid JSON in this exact shape — no explanation, no markdown, no extra keys:
{ "files": [{ "path": "relative/path/from/repo/root", "contents": "full file contents" }] }

Rules:
- paths must be relative (no leading "/" or "..").
- Include the complete file contents — never a partial patch.`;
}

/** Returns the absolute path if it stays inside repoRoot, `null` if it escapes. */
export function safePath(repoRoot: string, relativePath: string): string | null {
  if (!relativePath || relativePath.startsWith("/") || relativePath.includes("..")) return null;
  const abs = join(repoRoot, relativePath);
  if (abs !== repoRoot && !abs.startsWith(repoRoot + "/")) return null;
  return abs;
}

/**
 * Create an ApiDriver adapter for a specific OpenAI-compatible provider.
 *
 * @param apiKey  The API key (or read from API_KEY env)
 * @param baseUrl The base URL (e.g. https://api.deepseek.com, or read from API_BASE env)
 * @param model   The model name (e.g. deepseek-chat, or read from API_MODEL env)
 */
export function createApiAdapter(
  apiKey?: string,
  baseUrl?: string,
  model?: string
): FighterAdapter {
  return {
    name: "api",
    async wake(ctx: WakeContext): Promise<WakeResult> {
      const key = apiKey ?? process.env.API_KEY;
      const base = baseUrl ?? process.env.API_BASE ?? "https://api.openai.com";
      const mdl = model ?? process.env.API_MODEL ?? "gpt-3.5-turbo";

      if (!key) {
        return {
          status: "dry-run",
          detail: `API_KEY not set — would call ${base}/v1/chat/completions with model ${mdl} for #${ctx.issueNumber}.`,
        };
      }

      // 0. Hard-exclusion: never touch auth/payments/secrets/migrations/deletes/spend.
      const excluded = isExcludedScope(ctx.brief);
      if (excluded) {
        return { status: "skipped", detail: `brief contains excluded scope: ${excluded}` };
      }

      const prompt = buildApiPrompt(ctx);

      // 1. Dry-run probe — if the API is unreachable, do NOT throw.
      try {
        await fetch(base, { method: "HEAD" });
      } catch {
        return {
          status: "dry-run",
          detail: `API unreachable at ${base} — would run against #${ctx.issueNumber}. Prompt preview: ${prompt.slice(0, 200)}…`,
        };
      }

      // 2. Call the OpenAI-compatible /v1/chat/completions endpoint.
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: mdl,
          messages: [
            { role: "system", content: "You are a code assistant. Output ONLY valid JSON." },
            { role: "user", content: prompt },
          ],
          max_tokens: 4096,
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`API ${res.status}: ${errBody.slice(0, 300)}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = data.choices?.[0]?.message?.content ?? "";

      // 3. Parse files.
      let files: Array<{ path: string; contents: string }>;
      try {
        const parsed = JSON.parse(raw) as { files?: unknown };
        if (!Array.isArray(parsed.files)) throw new Error("no files array");
        files = parsed.files as Array<{ path: string; contents: string }>;
      } catch {
        throw new Error(`API returned unparseable output: ${raw.slice(0, 200)}`);
      }

      // 4. Write files (path-traversal guarded).
      const root = process.cwd();
      for (const { path: rel, contents } of files) {
        const abs = safePath(root, rel);
        if (!abs) {
          console.warn(`[api] skipped unsafe path: ${rel}`);
          continue;
        }
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, contents, "utf8");
      }

      // 5. Git operations.
      try {
        execFileSync("git", ["checkout", "-b", ctx.branch], { stdio: "inherit" });
      } catch {
        execFileSync("git", ["checkout", ctx.branch], { stdio: "inherit" });
      }
      execFileSync("git", ["add", "-A"], { stdio: "inherit" });
      execFileSync(
        "git",
        ["commit", "-m", `feat(#${ctx.issueNumber}): implement issue #${ctx.issueNumber}\n\n[api agent: ${mdl}]`],
        { stdio: "inherit" }
      );
      execFileSync("git", ["push", "--set-upstream", "origin", ctx.branch], { stdio: "inherit" });

      // 6. Open PR.
      const prUrl = execFileSync(
        "gh",
        ["pr", "create", "--title", `feat(#${ctx.issueNumber}): implement issue #${ctx.issueNumber}`, "--body", `Closes #${ctx.issueNumber}\n\nGenerated by ApiDriver agent (\`${mdl}\`).`],
        { encoding: "utf8" }
      ).trim();

      // 7. Done-signal.
      const prMatch = /\/pull\/(\d+)/.exec(prUrl);
      if (prMatch) {
        execFileSync(
          "gh",
          ["pr", "comment", prMatch[1], "--body", `@hayssamhob ✅ #${ctx.issueNumber} done — ApiDriver agent completed the implementation.`],
          { stdio: "inherit" }
        );
      }

      // 8. Return.
      return { status: "woken", detail: `PR opened: ${prUrl}` };
    },
  };
}

/** Default adapter instance — reads config from env vars at call time. */
export const apiAdapter: FighterAdapter = createApiAdapter();
