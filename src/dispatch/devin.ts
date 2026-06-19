/**
 * Devin Cloud adapter (M6-2) — the flagship wake-up.
 *
 * `agent:devin` on an issue -> POST a Devin session whose prompt is the Coach's grilled
 * brief plus operating instructions. Devin works the repo and opens a PR. Pure cloud API
 * call: runs on a hosted runner, no daemon, no GUI, no self-hosted runner.
 *
 * Doc: POST https://api.devin.ai/v3/organizations/{org_id}/sessions
 *      Authorization: Bearer $DEVIN_API_KEY ; body { "prompt": "..." }   (docs.devin.ai)
 */
import type { FighterAdapter, WakeContext, WakeResult } from "./adapter.js";

const DEVIN_API = "https://api.devin.ai/v3/organizations";

/** Pure: assemble the session prompt from the grilled brief + operating contract. */
export function buildDevinPrompt(ctx: WakeContext): string {
  return `${ctx.brief}

---
Operating instructions (Foreman):
- Repository: ${ctx.repo}. Work on a new branch \`${ctx.branch}\`.
- Open a pull request whose body contains \`Closes #${ctx.issueNumber}\`.
- When finished, comment on the PR exactly: \`@hayssamhob ✅ #${ctx.issueNumber} done — <one sentence>\`.
- Stay strictly in scope. Do NOT touch auth, payments, secrets, database migrations, deletions, or spend limits; if the task seems to require any of these, stop and say so on the issue instead of proceeding.`;
}

export const devinAdapter: FighterAdapter = {
  name: "devin",
  async wake(ctx: WakeContext): Promise<WakeResult> {
    const apiKey = process.env.DEVIN_API_KEY;
    const orgId = process.env.DEVIN_ORG_ID;
    const prompt = buildDevinPrompt(ctx);

    if (!apiKey || !orgId) {
      return {
        status: "dry-run",
        detail: `No DEVIN_API_KEY/DEVIN_ORG_ID in env — would POST a session for #${ctx.issueNumber}. Prompt preview: ${prompt.slice(0, 200)}…`,
      };
    }

    const res = await fetch(`${DEVIN_API}/${orgId}/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) {
      throw new Error(`Devin API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as { session_id?: string; url?: string };
    return {
      status: "woken",
      detail: `Devin session ${data.session_id ?? "(created)"}${data.url ? ` — ${data.url}` : ""}`,
    };
  },
};
