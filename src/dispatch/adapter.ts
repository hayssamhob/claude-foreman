/**
 * The wake-up layer's adapter contract (M6-1).
 *
 * A Fighter is not an autonomous GitHub citizen — posting a brief on an issue does not
 * wake it. An adapter is the courier: given a labeled issue, it invokes the Fighter's
 * runtime so the Fighter opens a PR. Every Fighter plugs in by implementing FighterAdapter;
 * the router (scripts/dispatch.ts) maps an `agent:X` label to the matching adapter.
 *
 * The Coach's grilled brief (the issue body) IS the prompt for every adapter — write once,
 * wake anyone. Keep adapters PURE of GitHub side-effects where possible (the router posts
 * the audit comment); that keeps them unit-testable without the network.
 */

export interface WakeContext {
  repo: string; // "owner/name"
  issueNumber: number; // the labeled issue
  agent: string; // parsed from agent:<X>, lowercased
  brief: string; // the issue body = the Coach's grilled brief (G3-safe: not raw external text)
  branch: string; // feat/issue-<N>-<slug>, precomputed
}

const EXCLUDED_SCOPE = /(auth|payment|secret|migration|delete|DROP|spend)/i;

/** Returns the matched term if the brief contains excluded scope, null otherwise. */
export function isExcludedScope(brief: string): string | null {
  const m = EXCLUDED_SCOPE.exec(brief);
  return m ? m[0] : null;
}

export interface WakeResult {
  status: "woken" | "dry-run" | "skipped";
  detail: string;
}

export interface FighterAdapter {
  readonly name: string;
  wake(ctx: WakeContext): Promise<WakeResult>;
}

/** "agent:devin" -> "devin"; anything not an agent label -> null. */
export function parseAgent(label: string): string | null {
  const m = /^agent:(.+)$/.exec(label.trim());
  return m ? m[1].trim().toLowerCase() : null;
}

/** Stable, readable branch slug from an issue title (first few words). */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 3)
    .join("-");
  return slug || "task";
}

export function branchFor(issueNumber: number, title: string): string {
  return `feat/issue-${issueNumber}-${slugify(title)}`;
}

/** Always-available adapter for end-to-end testing the trigger without a real Fighter. */
export const noopAdapter: FighterAdapter = {
  name: "noop",
  async wake(ctx: WakeContext): Promise<WakeResult> {
    return { status: "skipped", detail: `noop received issue #${ctx.issueNumber} on ${ctx.branch}` };
  },
};
