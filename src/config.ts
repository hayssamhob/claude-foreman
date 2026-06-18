import "dotenv/config";

function int(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  agents: (process.env.AGENTS ?? "antigravity,devin,claude")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean),
  leaseTtlMinutes: int("LEASE_TTL_MINUTES", 120),
  /**
   * Soft "going dark" threshold per agent: minutes of silence (no progress
   * heartbeat or push while a lease is running) after which the owner gets an
   * early "likely crashed" ping — well before the hard lease TTL reassigns the
   * task. Tuned to each agent's polling cadence (Antigravity self-polls ~5 min,
   * so 15 min of silence means it's down). 0 disables it — e.g. the in-process
   * junior, which we monitor directly via its subprocess. Unlisted agents fall
   * back to staleWarnMinutes. Format: "antigravity:15,devin:30".
   */
  staleWarnMinutes: int("STALE_WARN_MINUTES", 30),
  agentStaleWarn: Object.fromEntries(
    (process.env.AGENT_STALE_WARN ?? "antigravity:15,devin:30,claude:0")
      .split(",")
      .map((p) => p.split(":"))
      .filter((p) => p.length === 2)
      .map(([a, n]) => [a.trim().toLowerCase(), parseInt(n, 10)])
      .filter(([, n]) => Number.isFinite(n as number))
  ) as Record<string, number>,
  /**
   * Max tasks an agent can hold concurrently (claimed/in revision). Some
   * agents juggle parallel branches well (Antigravity), others get confused
   * working multiple tasks in one window (Windsurf).
   * Format: "windsurf:1,antigravity:3"; unlisted agents default to 2.
   */
  agentLimits: Object.fromEntries(
    (process.env.AGENT_LIMITS ?? "antigravity:3,devin:2,claude:1")
      .split(",")
      .map((p) => p.split(":"))
      .filter((p) => p.length === 2)
      .map(([a, n]) => [a.trim().toLowerCase(), parseInt(n, 10) || 1])
  ) as Record<string, number>,
  defaultAgentLimit: 2,
  maxRevisionRounds: int("MAX_REVISION_ROUNDS", 2),
  managerCmd: process.env.MANAGER_CMD ?? 'claude -p --output-format json --tools "" --max-turns 1',
  managerDisabled: process.env.MANAGER_DISABLED === "1",
  dbPath: process.env.DB_PATH ?? "./data/agent-manager.db",
  /** This app's own repo URL, surfaced in the account-rotation handoff bundle. */
  projectRepoUrl: process.env.PROJECT_REPO_URL ?? "",
  checkName: "Manager Review",
  managerName: "manager",
  /**
   * When on (default), approved PRs merge automatically once every gate is
   * green: CI passing, no unresolved review conversations, no `hold` label.
   * Put the `hold` label on the task issue to keep a specific PR for yourself.
   */
  autoMerge: process.env.AUTO_MERGE !== "0",
  holdLabel: "hold",
  /** ntfy.sh topic for push notifications; empty = notifications off. */
  ntfyTopic: process.env.NTFY_TOPIC ?? "",
  ntfyServer: process.env.NTFY_SERVER ?? "https://ntfy.sh",
  /**
   * The in-process junior: a headless Claude Code session that claims tasks
   * routed to `agent:claude`, codes them in a local workspace clone, and
   * opens PRs — same protocol as the external IDE agents.
   */
  juniorAgent: (process.env.JUNIOR_AGENT ?? "claude").toLowerCase(),
  juniorEnabled: process.env.JUNIOR_ENABLED !== "0",
  juniorCmd: process.env.JUNIOR_CMD ?? "claude -p --output-format json --dangerously-skip-permissions",
  juniorTimeoutMinutes: int("JUNIOR_TIMEOUT_MINUTES", 30),
  workspacesDir: process.env.WORKSPACES_DIR ?? "./data/workspaces",
};

export type Config = typeof config;
