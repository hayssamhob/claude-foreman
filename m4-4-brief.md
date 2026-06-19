**Grilled Spec / Brief for Claude-jr**

Implement M4-4: Extend `src/dashboard.ts` with cost + trust-tier panels.

**Decisions & Interface Design:**
1. **Cost Panel:**
   - Modify `export function renderDashboard` in `src/dashboard.ts` to call `const cost = forecastRunCost(store);` (import it from `./cost-forecast.js`).
   - Add a new `<section class="card">` at the top of the dashboard displaying the cost summary (`cost.summary`), `usedPct`, and `remainingUsd`.
2. **Trust-Tier Panel:**
   - Modify `renderDashboard` to accept a new parameter: `trustTiers: Record<string, string> = {}` (map of `repoFullName` -> `TrustTier` string).
   - In `projectCard` inside `src/dashboard.ts`, display the trust tier (e.g. "Trust tier: L2") next to the project name.
   - In `src/index.ts` (around line 237 where `Promise.all` handles `/dashboard`), inject a call to fetch the `ReadinessScore` for each repo. You can map over `repos` from `installedRepos()` and call `readReadiness(octokit, owner, repo)` from `src/referee/readiness.js`, then construct the `Record<string, string>` dictionary to pass into `renderDashboard`.
   - **Important:** Handle caching or catching errors if `readReadiness` throws, so the dashboard doesn't 500.

**Done-Signal Format:**
`claude-jr` needs no done signal (you just push to `feat/issue-44-m4-4-dashboard` and the Coach loop will pick it up).

Implement this vertically, ensure tests pass, and push your branch.
