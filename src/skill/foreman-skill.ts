/**
 * /foreman skill — watch & steer the live loop (M2-3).
 *
 * Steer mechanism defined against the spine:
 * - **pause** = stop dispatching new jobs (set `hold` label on the task issue)
 * - **resume** = remove `hold` label, allow dispatching
 * - **redirect** = requeue/reassign via leases + db
 * - **state** = GET /api/state — return the current loop state
 *
 * Steering works as **author-association-gated PR ChatOps** (§5.9) —
 * plain-English `@foreman …` comments, no CLI needed. Only OWNER/MEMBER/COLLABORATOR
 * comments trigger automation.
 */

/** The loop state snapshot returned by `@foreman state`. */
export interface LoopState {
  queued: number;
  claimed: number;
  inReview: number;
  approved: number;
  failed: number;
  stopped: number;
  activeAgents: string[];
  holdIssues: number[];
}

/** A parsed ChatOps command from a PR comment. */
export interface ParsedCommand {
  action: "pause" | "resume" | "redirect" | "state" | "retry" | "help";
  issueNumber?: number;
  agent?: string;
  raw: string;
}

/** The result of executing a ChatOps command. */
export interface CommandResult {
  ok: boolean;
  message: string;
  action: string;
}

/**
 * Parse a `@foreman ...` comment into a structured command.
 * Returns null if the comment doesn't start with @foreman.
 */
export function parseCommand(comment: string): ParsedCommand | null {
  const trimmed = comment.trim();
  const match = trimmed.match(/^@foreman\s+(.+)/i);
  if (!match) return null;

  const rest = match[1].trim().toLowerCase();
  const raw = match[1].trim();

  // @foreman pause [#N]
  if (rest.startsWith("pause")) {
    const issueMatch = rest.match(/#(\d+)/);
    return { action: "pause", issueNumber: issueMatch ? parseInt(issueMatch[1], 10) : undefined, raw };
  }

  // @foreman resume [#N]
  if (rest.startsWith("resume") || rest.startsWith("unpause")) {
    const issueMatch = rest.match(/#(\d+)/);
    return { action: "resume", issueNumber: issueMatch ? parseInt(issueMatch[1], 10) : undefined, raw };
  }

  // @foreman redirect #N to <agent>
  if (rest.startsWith("redirect")) {
    const issueMatch = rest.match(/#(\d+)/);
    const agentMatch = rest.match(/to\s+(\S+)/);
    return { action: "redirect", issueNumber: issueMatch ? parseInt(issueMatch[1], 10) : undefined, agent: agentMatch ? agentMatch[1] : undefined, raw };
  }

  // @foreman retry #N
  if (rest.startsWith("retry")) {
    const issueMatch = rest.match(/#(\d+)/);
    return { action: "retry", issueNumber: issueMatch ? parseInt(issueMatch[1], 10) : undefined, raw };
  }

  // @foreman state
  if (rest.startsWith("state") || rest.startsWith("status")) {
    return { action: "state", raw };
  }

  // @foreman help
  if (rest.startsWith("help") || rest.startsWith("commands")) {
    return { action: "help", raw };
  }

  return { action: "help", raw }; // unknown → show help
}

/**
 * Check if a comment author is allowed to steer (author-association gate).
 * Only OWNER, MEMBER, or COLLABORATOR can trigger ChatOps.
 */
export function canSteer(authorAssociation: string): boolean {
  const allowed = ["OWNER", "MEMBER", "COLLABORATOR"];
  return allowed.includes(authorAssociation.toUpperCase());
}

/** Format the help text for `@foreman help`. */
export function formatHelp(): string {
  return `## /foreman — loop steering commands

| Command | What it does |
|---|---|
| \`@foreman state\` | Show the current loop state (queued, claimed, in review, etc.) |
| \`@foreman pause #N\` | Pause dispatching for issue #N (sets \`hold\` label) |
| \`@foreman pause\` | Pause all dispatching (sets \`hold\` on all queued issues) |
| \`@foreman resume #N\` | Resume dispatching for issue #N (removes \`hold\` label) |
| \`@foreman redirect #N to <agent>\` | Reassign issue #N to a different agent |
| \`@foreman retry #N\` | Requeue issue #N (resets to \`queued\` status) |
| \`@foreman help\` | Show this help |

> Only OWNER, MEMBER, or COLLABORATOR comments trigger automation (§5.9).`;
}

/** Format the loop state for `@foreman state`. */
export function formatState(state: LoopState): string {
  const lines = [
    `## Loop State`,
    ``,
    `| Status | Count |`,
    `|---|---|`,
    `| Queued | ${state.queued} |`,
    `| Claimed | ${state.claimed} |`,
    `| In Review | ${state.inReview} |`,
    `| Approved | ${state.approved} |`,
    `| Failed | ${state.failed} |`,
    `| Stopped | ${state.stopped} |`,
    ``,
    `**Active agents:** ${state.activeAgents.length > 0 ? state.activeAgents.join(", ") : "none"}`,
    `**On hold:** ${state.holdIssues.length > 0 ? state.holdIssues.map((n) => `#${n}`).join(", ") : "none"}`,
  ];
  return lines.join("\n");
}

/**
 * Execute a parsed command against the loop state.
 * This is a pure function — the caller (the Probot app or the CLI) performs
 * the actual GitHub API calls (labels, comments, etc.).
 */
export function executeCommand(
  cmd: ParsedCommand,
  ctx: { canSteer: boolean; state?: LoopState }
): CommandResult {
  if (!ctx.canSteer) {
    return {
      ok: false,
      message: "Only OWNER, MEMBER, or COLLABORATOR can steer the loop.",
      action: cmd.action,
    };
  }

  switch (cmd.action) {
    case "pause":
      if (cmd.issueNumber) {
        return { ok: true, message: `Pausing dispatching for issue #${cmd.issueNumber} — setting \`hold\` label.`, action: "pause" };
      }
      return { ok: true, message: "Pausing all dispatching — setting `hold` label on all queued issues.", action: "pause" };

    case "resume":
      if (cmd.issueNumber) {
        return { ok: true, message: `Resuming dispatching for issue #${cmd.issueNumber} — removing \`hold\` label.`, action: "resume" };
      }
      return { ok: true, message: "Resuming all dispatching — removing `hold` label from all issues.", action: "resume" };

    case "redirect":
      if (!cmd.issueNumber || !cmd.agent) {
        return { ok: false, message: "Usage: `@foreman redirect #N to <agent>` — both issue number and agent are required.", action: "redirect" };
      }
      return { ok: true, message: `Redirecting issue #${cmd.issueNumber} to agent \`${cmd.agent}\` — requeuing with new agent label.`, action: "redirect" };

    case "retry":
      if (!cmd.issueNumber) {
        return { ok: false, message: "Usage: `@foreman retry #N` — issue number is required.", action: "retry" };
      }
      return { ok: true, message: `Retrying issue #${cmd.issueNumber} — resetting to \`queued\` status.`, action: "retry" };

    case "state":
      if (!ctx.state) {
        return { ok: false, message: "Loop state not available.", action: "state" };
      }
      return { ok: true, message: formatState(ctx.state), action: "state" };

    case "help":
      return { ok: true, message: formatHelp(), action: "help" };

    default:
      return { ok: false, message: "Unknown command. Type `@foreman help` for available commands.", action: "unknown" };
  }
}
