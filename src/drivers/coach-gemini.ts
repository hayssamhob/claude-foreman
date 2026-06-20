/**
 * coach-gemini — Gemini CLI CoachDriver adapter (Google / Gemini).
 *
 * Shells out to the Google Gemini CLI (`gemini`), reads its plain-text stdout,
 * and extracts a JSON verdict. The Gemini CLI does NOT emit the Claude Code
 * `{ result: "..." }` envelope, so this adapter does its own JSON extraction
 * (strip prose, find outermost `{...}` span, parse).
 *
 * CLI flags used:
 *   gemini -p "<prompt>"
 *   (or set MANAGER_CMD to override the full command)
 *
 * $0 auth — two paths, either is free:
 *   1. Google free tier: run `gemini auth login` once. The CLI uses OAuth with
 *      your Google account; the free tier has generous rate limits for judgment
 *      workloads. No API key needed.
 *   2. API key: set GEMINI_API_KEY in the environment; metered, billed per token.
 *
 * MANAGER_CMD example:
 *   MANAGER_CMD="gemini -p" COACH_DRIVER=gemini node ...
 */
import { spawn } from 'node:child_process';
import { extractJson } from '../manager/runner.js';
import { config } from '../config.js';
import type { CoachDriver, CoachDriverDeps } from './coach.js';

export function createGeminiCoachDriver(_deps: CoachDriverDeps): CoachDriver {
  return {
    name: 'coach-gemini',
    async run<T>(prompt: string): Promise<T> {
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = spawn(config.managerCmd, { shell: true, windowsHide: true });
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdin.on('error', () => {});
        let out = '';
        let err = '';
        child.stdout.on('data', (d: string) => (out += d));
        child.stderr.on('data', (d: string) => (err += d));
        child.on('error', (e: Error) => reject(new Error(`gemini spawn failed: ${e.message}`)));
        child.on('close', (code: number | null) => {
          if (code === 0) resolve(out);
          else reject(new Error(`gemini exited ${code}; stderr: ${err.slice(0, 1000) || '<empty>'}; stdout: ${out.slice(0, 2000) || '<empty>'}`));
        });
        child.stdin.write(prompt);
        child.stdin.end();
      });
      // Gemini emits plain text — no envelope. extractJson handles fence-strip + brace-scan.
      return extractJson<T>(stdout);
    },
  };
}
