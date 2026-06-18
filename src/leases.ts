import { config } from "./config.js";
import { postMessage, setStatusLabel, splitRepo } from "./github.js";
import { agentLabel, taskBranch } from "./protocol/labels.js";
import { providerLabel } from "./agentlimits.js";
import { notify } from "./notify.js";
import type { Store } from "./state/db.js";
import type { AuthFn } from "./manager/worker.js";

/**
 * Lease sweeper: tasks claimed (or in revision) whose lease expired are taken
 * back from the holding agent and either requeued or handed to the next agent.
 */
export async function sweepLeases(store: Store, auth: AuthFn, log: (m: string) => void): Promise<void> {
  for (const task of store.expiredLeases()) {
    try {
      const octokit = await auth(task.installation_id);
      const others = config.agents.filter((a) => a !== task.agent);
      const next = others.length > 0 ? others[task.reassign_count % others.length] : task.agent;
      const reassigning = next !== task.agent;

      store.updateTask(task.repo, task.issue, {
        agent: next,
        status: "queued",
        lease_expires_at: null,
        revision_round: 0,
        reassign_count: reassigning ? task.reassign_count + 1 : task.reassign_count,
      });

      const { owner, repo } = splitRepo(task.repo);
      if (reassigning) {
        await octokit.rest.issues
          .removeLabel({ owner, repo, issue_number: task.issue, name: agentLabel(task.agent) })
          .catch(() => {});
        await octokit.rest.issues.addLabels({ owner, repo, issue_number: task.issue, labels: [agentLabel(next)] });
      }
      await setStatusLabel(octokit, task.repo, task.issue, "queued");
      await postMessage(
        octokit,
        task.repo,
        task.issue,
        { v: 1, type: "timeout", from: config.managerName, to: next, task: task.issue },
        `⏰ Lease held by \`${task.agent}\` expired after ${config.leaseTtlMinutes} minutes without a PR or progress heartbeat. ` +
          (reassigning
            ? `Task reassigned to \`${next}\`.\n\n@${next}: claim this task and work on branch \`${taskBranch(next, task.issue)}\`.`
            : `Task requeued.`)
      );
      log(`lease expired: ${task.repo}#${task.issue} ${task.agent} -> ${next}`);

      // Surface it: a lease lapsing means the agent went dark mid-task (crash,
      // stall, or an overnight death) — exactly the thing the owner wants pushed
      // to their phone rather than discovered hours later.
      const who = providerLabel(task.agent);
      const what = task.title ?? `#${task.issue}`;
      void notify(
        reassigning ? `${who} went quiet — reassigned 🛑` : `${who} went quiet — requeued ⏰`,
        `No PR or progress heartbeat from ${who} on "${what}" for ${config.leaseTtlMinutes} min (likely a crash or stall). ` +
          (reassigning ? `Handed to ${providerLabel(next)}.` : "Back in the queue for it to retry."),
        { priority: "high", tags: ["alarm_clock"], click: `https://github.com/${task.repo}/issues/${task.issue}` }
      );
    } catch (e) {
      log(`lease sweep failed for ${task.repo}#${task.issue}: ${e}`);
    }
  }
}

/**
 * Early-warning sweep for an agent that went dark mid-lease — the overnight-crash
 * case. An external IDE agent (Devin Desktop, Antigravity) can't be polled
 * remotely, so the only signal we have is silence: no progress heartbeat or push
 * renewing its lease. Once the silence exceeds the agent's tuned threshold (well
 * short of the hard lease TTL), ping the owner ONCE so they can restart the IDE,
 * rather than discovering it dead hours later. We do NOT reassign here — that
 * stays with the hard lease, since the agent may simply need a restart.
 */
export function sweepSilentAgents(store: Store, log: (m: string) => void, now = Date.now()): void {
  const ttlMs = config.leaseTtlMinutes * 60_000;
  for (const task of store.claimedWithActiveLease(now)) {
    const warnMin = config.agentStaleWarn[task.agent] ?? config.staleWarnMinutes;
    if (!warnMin || warnMin <= 0) continue; // monitoring disabled for this agent
    // The lease is renewed to now+TTL on every claim/heartbeat, so the last sign
    // of life is (lease_expires_at - TTL).
    const lastRenewal = (task.lease_expires_at ?? now) - ttlMs;
    const silentMs = now - lastRenewal;
    if (silentMs < warnMin * 60_000) continue; // still within normal working silence
    // Warn once per silence streak: a heartbeat moves lastRenewal forward, which
    // re-arms the warning only after a fresh stretch of silence.
    if (task.stale_warned_at && task.stale_warned_at >= lastRenewal) continue;

    const who = providerLabel(task.agent);
    const what = task.title ?? `#${task.issue}`;
    const mins = Math.round(silentMs / 60_000);
    void notify(
      `${who} may have crashed ⚠️`,
      `No heartbeat from ${who} on "${what}" for ${mins} min (expected within ${warnMin}). It likely went down — restart the IDE, or it'll be reassigned when the ${config.leaseTtlMinutes}-min lease expires.`,
      { priority: "high", tags: ["warning"], click: `https://github.com/${task.repo}/issues/${task.issue}` }
    );
    store.updateTask(task.repo, task.issue, { stale_warned_at: now });
    log(`silent-agent warning: ${task.repo}#${task.issue} ${task.agent} silent ${mins}m`);
  }
}
