/**
 * Preview MCP connector (M4-2) — live preview merge gate.
 *
 * A named MCP connector that starts the app in a preview environment, runs a
 * smoke check (GET / returns 200 + a named body assertion), and reports the
 * result to the merge gate.
 *
 * The merge gate (src/automerge.ts) requires this preview check to pass before
 * auto-merging — it's an additional gate alongside CI, threads, and hold label.
 *
 * Design:
 *   - `PreviewConnector` is the named connector — it has a name, a start command,
 *     a health check URL, and an optional body assertion.
 *   - `runPreviewCheck()` starts the app, waits for it to be healthy, runs the
 *     smoke check, and returns a `PreviewResult`.
 *   - The merge gate calls `runPreviewCheck()` and blocks if it fails.
 *
 * Config via env:
 *   PREVIEW_ENABLED  "true" to enable the preview gate (default: disabled)
 *   PREVIEW_COMMAND  the command to start the app (e.g. "npm start")
 *   PREVIEW_URL      the health check URL (e.g. http://localhost:3000)
 *   PREVIEW_TIMEOUT  ms to wait for the app to start (default: 30000)
 *   PREVIEW_BODY     optional substring the response body must contain
 */

import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

/** The result of a preview check. */
export interface PreviewResult {
  ok: boolean;
  status: number | null;
  bodyMatch: boolean;
  detail: string;
  durationMs: number;
}

/** A named MCP connector for live preview checks. */
export interface PreviewConnector {
  readonly name: string;
  readonly startCommand: string;
  readonly startArgs: string[];
  readonly healthUrl: string;
  readonly bodyAssertion: string | null;
  readonly timeoutMs: number;
}

/** Default connector — reads config from env vars. */
export const defaultPreviewConnector: PreviewConnector = {
  name: process.env.PREVIEW_NAME ?? "preview",
  startCommand: process.env.PREVIEW_COMMAND ?? "npm",
  startArgs: process.env.PREVIEW_COMMAND ? process.env.PREVIEW_COMMAND.split(" ").slice(1) : ["start"],
  healthUrl: process.env.PREVIEW_URL ?? "http://localhost:3000",
  bodyAssertion: process.env.PREVIEW_BODY ?? null,
  timeoutMs: parseInt(process.env.PREVIEW_TIMEOUT ?? "30000", 10),
};

/**
 * Start the app, wait for it to be healthy, run the smoke check.
 *
 * This is the core of the preview merge gate. It:
 *   1. Spawns the start command
 *   2. Polls the health URL until it returns 200 or timeout
 *   3. If a body assertion is set, checks that the response body contains it
 *   4. Kills the app process
 *   5. Returns the result
 */
export async function runPreviewCheck(connector: PreviewConnector = defaultPreviewConnector): Promise<PreviewResult> {
  const start = Date.now();
  let child: ChildProcess | null = null;

  try {
    // 1. Start the app
    child = spawn(connector.startCommand, connector.startArgs, {
      stdio: "ignore",
      detached: false,
      env: { ...process.env },
    });

    // 2. Poll the health URL until 200 or timeout
    const deadline = Date.now() + connector.timeoutMs;
    let healthy = false;
    let lastError = "";

    while (Date.now() < deadline) {
      try {
        const res = await fetch(connector.healthUrl, { method: "GET" });
        if (res.ok) {
          healthy = true;
          // 3. Body assertion check
          if (connector.bodyAssertion) {
            const body = await res.text();
            if (!body.includes(connector.bodyAssertion)) {
              return {
                ok: false,
                status: res.status,
                bodyMatch: false,
                detail: `preview ${connector.name}: GET ${connector.healthUrl} returned ${res.status} but body does not contain "${connector.bodyAssertion}"`,
                durationMs: Date.now() - start,
              };
            }
          }
          return {
            ok: true,
            status: res.status,
            bodyMatch: true,
            detail: `preview ${connector.name}: GET ${connector.healthUrl} returned ${res.status}${connector.bodyAssertion ? ` + body contains "${connector.bodyAssertion}"` : ""}`,
            durationMs: Date.now() - start,
          };
        }
        lastError = `HTTP ${res.status}`;
      } catch (e) {
        lastError = String(e);
      }
      await sleep(1000);
    }

    return {
      ok: false,
      status: null,
      bodyMatch: false,
      detail: healthy
        ? `preview ${connector.name}: app started but health check failed: ${lastError}`
        : `preview ${connector.name}: app did not become healthy within ${connector.timeoutMs}ms (last: ${lastError})`,
      durationMs: Date.now() - start,
    };
  } finally {
    // 4. Kill the app process
    if (child) {
      try {
        if (child.pid) process.kill(child.pid, "SIGTERM");
      } catch {
        // process may have already exited
      }
    }
  }
}

/**
 * Check if the preview gate is enabled.
 * When disabled, the merge gate skips the preview check entirely.
 */
export function isPreviewEnabled(): boolean {
  return process.env.PREVIEW_ENABLED === "true";
}

/**
 * The preview merge gate — returns ok=true if preview is disabled or passes.
 * This is called by the merge gate in automerge.ts.
 */
export async function previewGate(connector: PreviewConnector = defaultPreviewConnector): Promise<{
  ok: boolean;
  reason: string;
}> {
  if (!isPreviewEnabled()) {
    return { ok: true, reason: "preview gate disabled (PREVIEW_ENABLED != true)" };
  }

  const result = await runPreviewCheck(connector);
  return {
    ok: result.ok,
    reason: result.detail,
  };
}
