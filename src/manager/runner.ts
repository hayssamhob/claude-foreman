import { spawn } from "node:child_process";
import { config } from "../config.js";
import { parseRateLimit, RateLimitedError } from "../ratelimit.js";

/**
 * Invoke the manager model (headless Claude Code by default) with a prompt on
 * stdin and parse a JSON object from its output. The Claude Code CLI with
 * `--output-format json` wraps the answer in an envelope `{ result: "..." }`;
 * we unwrap that, strip code fences, and parse.
 */
export async function runManager<T>(prompt: string): Promise<T> {
  if (config.managerDisabled) {
    throw new ManagerUnavailableError("MANAGER_DISABLED=1");
  }
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(config.managerCmd, { shell: true, windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => reject(new ManagerUnavailableError(e.message)));
    child.on("close", (code) => {
      // A provider limit can surface on either stream and at any exit code.
      const rl = parseRateLimit(`${out}\n${err}`);
      if (rl.limited) {
        reject(new RateLimitedError(rl.reason, rl.resetAt));
        return;
      }
      if (code === 0) resolve(out);
      else
        reject(
          new Error(
            `manager exited with code ${code}; stderr: ${err.slice(0, 1000) || "<empty>"}; stdout: ${out.slice(0, 2000) || "<empty>"}`
          )
        );
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
  try {
    return extractJson<T>(stdout);
  } catch (e) {
    throw new Error(
      `manager output not parseable as JSON (${e}); len=${stdout.length}; tail: ${stdout.slice(-300)}`
    );
  }
}

export class ManagerUnavailableError extends Error {}

export function extractJson<T>(raw: string): T {
  let text = raw.trim();
  // Unwrap the Claude Code CLI JSON envelope if present
  try {
    const envelope = JSON.parse(text);
    if (envelope && typeof envelope === "object" && typeof envelope.result === "string") {
      text = envelope.result.trim();
    } else if (envelope && typeof envelope === "object") {
      return envelope as T; // bare JSON answer
    }
  } catch {
    /* not an envelope; fall through */
  }
  // Try, in order: the text as-is; fences stripped (greedy — the payload's own
  // strings may contain ``` sequences); the outermost {...} span.
  const candidates: string[] = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*)```/);
  if (fenced) candidates.push(fenced[1].trim());
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
