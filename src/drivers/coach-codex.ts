/**
 * coach-codex — Codex CLI CoachDriver adapter (OpenAI / ChatGPT).
 *
 * Shells out to the OpenAI Codex CLI (`codex`), reads its plain-text stdout,
 * and extracts a JSON verdict. Codex does NOT emit the Claude Code
 * `{ result: "..." }` envelope, so this adapter does its own JSON extraction
 * (strip prose, find outermost `{...}` span, parse).
 *
 * CLI flags used:
 *   codex --full-auto -q "<prompt>"
 *   (or set CODEX_FLAGS to override)
 *
 * $0 auth — two paths, either is free:
 *   1. ChatGPT Plus/Pro subscription: run `codex auth login` once and the CLI
 *      uses OAuth (no API key needed, billed to your subscription).
 *   2. API key: set OPENAI_API_KEY in the environment; metered, billed per token.
 *
 * MANAGER_CMD example:
 *   MANAGER_CMD="codex --full-auto -q" COACH_DRIVER=codex node ...
 */
import { spawn } from 'node:child_process';
import { extractJson } from '../manager/runner.js';
import { config } from '../config.js';
import type { CoachDriver, CoachDriverDeps } from './coach.js';

export function createCodexCoachDriver(_deps: CoachDriverDeps): CoachDriver {
  return {
    name: 'coach-codex',
    async run<T>(prompt: string): Promise<T> {
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = spawn(config.managerCmd, { shell: true, windowsHide: true });
        child.stdin.on('error', () => {});
        let out = '';
        let err = '';
        child.stdout.on('data', (d: Buffer) => (out += d));
        child.stderr.on('data', (d: Buffer) => (err += d));
        child.on('error', (e: Error) => reject(new Error(`codex spawn failed: ${e.message}`)));
        child.on('close', (code: number | null) => {
          if (code === 0) resolve(out);
          else reject(new Error(`codex exited ${code}; stderr: ${err.slice(0, 1000) || '<empty>'}; stdout: ${out.slice(0, 2000) || '<empty>'}`));
        });
        child.stdin.write(prompt);
        child.stdin.end();
      });
      // Codex emits plain text — no envelope. extractJson handles fence-strip + brace-scan.
      return extractJson<T>(stdout);
    },
  };
}
