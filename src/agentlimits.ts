import { config } from "./config.js";
import { notify } from "./notify.js";
import type { Store } from "./state/db.js";

/** Back-off when the provider gives no reset time, so an agent never stays paused forever. */
const DEFAULT_BACKOFF_MS = 15 * 60_000;

/** Format a reset time as a short local clock, e.g. "2:20 AM". */
export function resetClock(resetAt: number | null): string {
  if (!resetAt) return "an unknown time";
  return new Date(resetAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Record that one or more agents are rate-limited, and push a notification the
 * FIRST time each transitions from ok → limited (so a back-off retry loop does
 * not spam the owner). The Claude manager and the in-process Claude junior
 * share one login, so a limit on either implies both.
 */
export function recordRateLimit(
  store: Store,
  agents: string[],
  reason: string,
  resetAt: number | null,
  log: (m: string) => void
): void {
  // Never pause forever: if no reset time is known, retry after a default back-off.
  const effectiveReset = resetAt ?? Date.now() + DEFAULT_BACKOFF_MS;
  const newlyLimited: string[] = [];
  for (const agent of agents) {
    if (!store.isRateLimited(agent)) newlyLimited.push(agent);
    store.setAgentStatus(agent, "rate_limited", reason, effectiveReset);
    log(`rate limit: ${agent} (${reason}), resets ${resetClock(effectiveReset)}`);
  }
  // Notify once per provider on the ok -> limited edge. The manager and the
  // in-process Claude junior share one login, so collapse them into one ping.
  const display = [...new Set(newlyLimited.map(providerLabel))];
  if (display.length) {
    void notify(
      `${display.join(" & ")} rate-limited ⏳`,
      `${reason}. Expected back around ${resetClock(effectiveReset)}. The fleet is holding off until then; other agents keep working.`,
      { priority: "high", tags: ["hourglass_flowing_sand"] }
    );
  }
}

/**
 * Flip agents whose rate-limit reset time has passed back to ok, and notify the
 * owner once that they're available again. Agents we run in-process (manager +
 * Claude junior) resume their queued work automatically on the next worker/junior
 * tick — that's the "wake". External IDE agents poll on their own schedule, so
 * the ping just tells the owner they can lean on them again. Idempotent: a
 * recovered agent is only stored as 'ok' once, so re-running the sweep is a no-op.
 */
export function sweepRateLimitRecoveries(store: Store, log: (m: string) => void): void {
  const recovered = store.recoveredAgents();
  if (recovered.length === 0) return;
  for (const r of recovered) {
    store.setAgentStatus(r.agent, "ok", null, null);
    log(`rate limit cleared: ${r.agent} (was ${r.reason ?? "limited"})`);
  }
  const display = [...new Set(recovered.map((r) => providerLabel(r.agent)))];
  const autoResumes = recovered.some((r) => r.agent === config.managerName || r.agent === config.juniorAgent);
  void notify(
    `${display.join(" & ")} back online ▶️`,
    `${display.length === 1 ? "It is" : "They are"} off the rate limit. ` +
      (autoResumes ? "Queued work resumes automatically." : "Ready for work on the next poll."),
    { priority: "default", tags: ["arrow_forward"] }
  );
}

/** Agents that share the Claude provider account (manager + in-process junior). */
export function claudeAccountAgents(): string[] {
  const set = new Set([config.managerName]);
  if (config.agents.includes(config.juniorAgent)) set.add(config.juniorAgent);
  return [...set];
}

/**
 * Owner-facing name grouped by provider account: the manager and the Claude
 * junior both surface as "Claude" so the shared login reads as one thing.
 */
export function providerLabel(agent: string): string {
  if (agent === config.managerName || agent === config.juniorAgent) return "Claude";
  return agent.charAt(0).toUpperCase() + agent.slice(1);
}
