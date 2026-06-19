/**
 * Crash recovery + cache rebuild from GitHub (M1-10, §5.7).
 *
 * The local SQLite cache is disposable and rebuildable from GitHub.
 * If the daemon crashes, on restart:
 *   1. recoverStaleJobs() — already exists in db.ts, resets 'running' jobs to 'pending'
 *   2. recoverFromCrash() — resets 'claimed' tasks whose lease has expired
 *   3. rebuildCacheFromGitHub() — rebuilds the entire task table from GitHub issues
 *
 * This makes the SQLite cache a pure performance optimization — the source
 * of truth is always GitHub (issues, PRs, labels, comments).
 */

import type { Octokit } from "../octokit.js";
import { splitRepo } from "../github.js";
import type { Store } from "./db.js";
import { LABEL_TASK, type TaskStatus } from "../protocol/labels.js";

/** Parse the agent from a list of labels — returns the first agent:X match. */
function findAgentLabel(labels: string[]): string | null {
  for (const l of labels) {
    if (l.startsWith("agent:")) return l.slice("agent:".length);
  }
  return null;
}

/** Parse the status from a list of labels — returns the first status:X match. */
function findStatusLabel(labels: string[]): TaskStatus | null {
  for (const l of labels) {
    if (l.startsWith("status:")) {
      const raw = l.slice("status:".length).replace(/-/g, "_");
      const valid: TaskStatus[] = ["queued", "claimed", "in_review", "changes_requested", "approved", "done", "failed", "stopped"];
      if (valid.includes(raw as TaskStatus)) return raw as TaskStatus;
    }
  }
  return null;
}

/** The result of a crash recovery sweep. */
export interface RecoveryReport {
  staleJobsReset: number;
  staleTasksReset: number;
  orphanedTasksCleared: number;
}

/**
 * Recover from a crash — reset stale jobs AND stale tasks.
 * This extends the existing recoverStaleJobs() with task recovery.
 */
export function recoverFromCrash(store: Store, now = Date.now()): RecoveryReport {
  // Reset stale tasks — claimed tasks whose lease has expired
  const tasks = store.listTasks();
  let staleTasksReset = 0;
  for (const t of tasks) {
    if (t.status === "claimed" && t.lease_expires_at !== null && t.lease_expires_at < now) {
      // Use updateTask (not upsertTask) so we can clear lease + stale fields
      store.updateTask(t.repo, t.issue, {
        status: "queued",
        lease_expires_at: null,
        stale_warned_at: null,
      });
      staleTasksReset++;
    }
  }

  return {
    staleJobsReset: 0, // counted by recoverStaleJobs() in db.ts
    staleTasksReset,
    orphanedTasksCleared: 0, // reconciled by rebuildCacheFromGitHub
  };
}

/** The result of a full cache rebuild from GitHub. */
export interface RebuildReport {
  reposScanned: number;
  tasksRebuilt: number;
  tasksClosed: number;
  prsLinked: number;
  errors: string[];
}

/**
 * Rebuild the SQLite task cache from GitHub.
 *
 * For each repo the app is installed on:
 *   1. Fetch all open issues labeled with the task label (paginated)
 *   2. Fetch all open PRs once per repo (not N+1 per issue)
 *   3. For each issue, upsert the task row + link the PR via regex matching
 *   4. Close any local tasks whose GitHub issue was closed
 *
 * This makes the cache disposable — delete the DB file, restart, and
 * it rebuilds from GitHub. The source of truth is always GitHub.
 */
export async function rebuildCacheFromGitHub(
  store: Store,
  octokit: Octokit,
  repos: string[],
  taskLabel: string = LABEL_TASK
): Promise<RebuildReport> {
  const report: RebuildReport = {
    reposScanned: 0,
    tasksRebuilt: 0,
    tasksClosed: 0,
    prsLinked: 0,
    errors: [],
  };

  const seenKeys = new Set<string>();

  for (const repoFull of repos) {
    report.reposScanned++;
    try {
      const { owner, repo } = splitRepo(repoFull);

      // Fetch all open issues with the task label (paginated to avoid missing issues)
      const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
        owner,
        repo,
        labels: taskLabel,
        state: "open",
        per_page: 100,
      });

      // Fetch all open PRs once per repo (not N+1 per issue)
      let prs: { number: number; body: string | null }[] = [];
      try {
        prs = await octokit.paginate(octokit.rest.pulls.list, {
          owner,
          repo,
          state: "open",
          per_page: 100,
        });
      } catch {
        // PR lookup is best-effort
      }

      for (const issue of issues) {
        const labels = issue.labels.map((l) => {
          if (typeof l === "string") return l;
          return l.name ?? "";
        });
        const agent = findAgentLabel(labels);
        const status = findStatusLabel(labels);
        if (!agent || !status) continue;

        const key = `${repoFull}#${issue.number}`;
        seenKeys.add(key);

        // Find the PR linked to this task using regex with word boundaries
        // to avoid partial matches (e.g. #8 matching #89)
        let prNumber: number | null = null;
        const linkRegex = new RegExp(`\\bcloses\\s+#${issue.number}\\b`, "i");
        for (const pr of prs) {
          if (pr.body && linkRegex.test(pr.body)) {
            prNumber = pr.number;
            report.prsLinked++;
            break;
          }
        }

        store.upsertTask({
          repo: repoFull,
          issue: issue.number,
          installation_id: 0,
          agent,
          status,
          title: issue.title,
        });
        // upsertTask's ON CONFLICT doesn't update 'pr' — update it explicitly
        store.updateTask(repoFull, issue.number, { pr: prNumber });
        report.tasksRebuilt++;
      }
    } catch (e) {
      report.errors.push(`${repoFull}: ${e}`);
    }
  }

  // Close local tasks that no longer exist on GitHub
  const localTasks = store.listTasks();
  for (const t of localTasks) {
    const key = `${t.repo}#${t.issue}`;
    if (!seenKeys.has(key) && t.status !== "done" && t.status !== "failed") {
      store.updateTask(t.repo, t.issue, { status: "done" });
      report.tasksClosed++;
    }
  }

  return report;
}

/**
 * Health check — is the local cache consistent with GitHub?
 * Returns a report of discrepancies without fixing them.
 */
export interface HealthReport {
  healthy: boolean;
  localTaskCount: number;
  githubTaskCount: number;
  missing: string[]; // tasks on GitHub but not in local cache
  orphaned: string[]; // tasks in local cache but not on GitHub
}

export async function cacheHealthCheck(
  store: Store,
  octokit: Octokit,
  repos: string[],
  taskLabel: string = LABEL_TASK
): Promise<HealthReport> {
  const localTasks = store.listTasks();
  const localKeys = new Set(localTasks.map((t) => `${t.repo}#${t.issue}`));
  const githubKeys = new Set<string>();

  for (const repoFull of repos) {
    try {
      const { owner, repo } = splitRepo(repoFull);
      const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
        owner,
        repo,
        labels: taskLabel,
        state: "open",
        per_page: 100,
      });
      for (const issue of issues) {
        githubKeys.add(`${repoFull}#${issue.number}`);
      }
    } catch {
      // best-effort
    }
  }

  const missing = [...githubKeys].filter((k) => !localKeys.has(k));
  const orphaned = [...localKeys].filter((k) => !githubKeys.has(k));

  return {
    healthy: missing.length === 0 && orphaned.length === 0,
    localTaskCount: localKeys.size,
    githubTaskCount: githubKeys.size,
    missing,
    orphaned,
  };
}
