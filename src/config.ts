import "dotenv/config";

function int(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Apply an effort knob to a Claude CLI command string (M2-5).
 *
 * Effort maps to `--max-turns N` — the maximum number of agentic turns the
 * in-process Claude session can take. Only applies when the command starts
 * with `claude` (an in-process session); external commands (e.g. a custom
 * shell script) are passed through unchanged.
 *
 * - If the command already has `--max-turns N`, it's replaced with the new value.
 * - If not, `--max-turns N` is appended.
 * - If effort is undefined, the command is returned as-is.
 */
export function applyEffort(cmd: string, effort: number | undefined): string {
  if (effort === undefined || !cmd.trim().startsWith("claude")) return cmd;
  if (cmd.includes("--max-turns")) {
    return cmd.replace(/--max-turns\s+\d+/, `--max-turns ${effort}`);
  }
  return `${cmd} --max-turns ${effort}`;
}

const managerEffort = (() => { const n = parseInt(process.env.MANAGER_EFFORT ?? "", 10); return Number.isFinite(n) ? n : undefined; })();
const juniorEffort = (() => { const n = parseInt(process.env.JUNIOR_EFFORT ?? "", 10); return Number.isFinite(n) ? n : undefined; })();

export const config = {
  agents: (process.env.AGENTS ?? "ollama,windsurf-kimi,claude-jr")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean),
  installationId: (() => { const n = parseInt(process.env.INSTALLATION_ID ?? "", 10); return Number.isFinite(n) ? n : undefined; })(),
  leaseTtlMinutes: int("LEASE_TTL_MINUTES", 120),
  /**
   * Soft "going dark" threshold per agent: minutes of silence (no progress
   * heartbeat or push while a lease is running) after which the owner gets an
   * early "likely crashed" ping — well before the hard lease TTL reassigns the
   * task. Tuned to each agent's polling cadence (Windsurf-kimi self-polls ~5 min,
   * so 15 min of silence means it's down). 0 disables it — e.g. a local Ollama
   * Fighter or the in-process junior, which we monitor directly via their
   * subprocess. Unlisted agents fall back to staleWarnMinutes. Format:
   * "windsurf-kimi:15,ollama:0".
   */
  staleWarnMinutes: int("STALE_WARN_MINUTES", 30),
  agentStaleWarn: Object.fromEntries(
    (process.env.AGENT_STALE_WARN ?? "ollama:0,windsurf-kimi:15,claude-jr:0")
      .split(",")
      .map((p) => p.split(":"))
      .filter((p) => p.length === 2)
      .map(([a, n]) => [a.trim().toLowerCase(), parseInt(n, 10)])
      .filter(([, n]) => Number.isFinite(n as number))
  ) as Record<string, number>,
  /**
   * Max tasks an agent can hold concurrently (claimed/in revision). Some
   * agents juggle parallel branches well (a headless Ollama Fighter), others get
   * confused working multiple tasks in one GUI window (Windsurf-kimi).
   * Format: "windsurf-kimi:1,ollama:3"; unlisted agents default to 2.
   */
  agentLimits: Object.fromEntries(
    (process.env.AGENT_LIMITS ?? "ollama:3,windsurf-kimi:1,claude-jr:1")
      .split(",")
      .map((p) => p.split(":"))
      .filter((p) => p.length === 2)
      .map(([a, n]) => [a.trim().toLowerCase(), parseInt(n, 10) || 1])
  ) as Record<string, number>,
  defaultAgentLimit: 2,
  maxRevisionRounds: int("MAX_REVISION_ROUNDS", 2),
  managerCmd: applyEffort(process.env.MANAGER_CMD ?? 'claude -p --output-format json --tools "" --max-turns 1', managerEffort),
  managerEffort,
  managerDisabled: process.env.MANAGER_DISABLED === "1",
  dbPath: process.env.DB_PATH ?? "./data/foreman.db",
  /** This app's own repo URL, surfaced in the account-rotation handoff bundle. */
  projectRepoUrl: process.env.PROJECT_REPO_URL ?? "",
  checkName: "Coach Review",
  managerName: "coach",
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
  maxUsd: (() => { const n = parseFloat(process.env.MAX_USD ?? ""); return Number.isFinite(n) ? n : undefined; })(),
  maxTokens: (() => { const n = parseInt(process.env.MAX_TOKENS ?? "", 10); return Number.isFinite(n) ? n : undefined; })(),
  maxTokens5h: (() => { const n = parseInt(process.env.MAX_TOKENS_5H ?? "", 10); return Number.isFinite(n) ? n : undefined; })(),
  maxQueue: (() => { const n = parseInt(process.env.MAX_QUEUE ?? "", 10); return Number.isFinite(n) ? n : undefined; })(),
  /**
   * The in-process junior: a headless Claude Code session that claims tasks
   * routed to `agent:claude`, codes them in a local workspace clone, and
   * opens PRs — same protocol as the external IDE agents.
   */
  juniorAgent: (process.env.JUNIOR_AGENT ?? "claude-jr").toLowerCase(),
  juniorEnabled: process.env.JUNIOR_ENABLED !== "0",
  juniorCmd: applyEffort(process.env.JUNIOR_CMD ?? "claude -p --output-format json --dangerously-skip-permissions", juniorEffort),
  juniorEffort,
  juniorTimeoutMinutes: int("JUNIOR_TIMEOUT_MINUTES", 30),
  workspacesDir: process.env.WORKSPACES_DIR ?? "./data/workspaces",
};

export type Config = typeof config;
