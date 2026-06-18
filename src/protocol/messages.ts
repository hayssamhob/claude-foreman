/**
 * The mailbox protocol: every machine-to-machine message is a GitHub comment
 * (or issue body) carrying a structured header in an HTML comment, invisible
 * to humans but trivially parseable by agents:
 *
 *   <!-- agent-msg {"v":1,"type":"claim","from":"antigravity","to":"manager","task":123} -->
 *
 * Agents act ONLY on messages addressed to them (`to`), and never on their
 * own messages — this is the loop-prevention rule.
 */

export const MSG_MARKER = "agent-msg";

export type MessageType =
  | "assignment" // manager -> junior, in the task issue body
  | "claim" // junior -> manager: I am taking this task
  | "progress" // junior -> manager: heartbeat, renews lease
  | "revision-request" // manager -> junior, on the PR
  | "approval" // manager -> junior, on the PR
  | "timeout" // manager -> all: lease expired, task reopened
  | "reassignment" // manager -> junior: task moved to another agent
  | "rate-limited"; // junior -> manager: I hit a provider limit, back off until resetAt

export interface AgentMessage {
  v: 1;
  type: MessageType;
  from: string;
  to: string;
  task: number; // task issue number (0 when not task-specific, e.g. a fleet-wide rate-limit notice)
  pr?: number;
  round?: number; // revision round, on revision-request
  resetAt?: number; // epoch ms the limit clears, on rate-limited
  reason?: string; // short cause, on rate-limited
}

export function serializeMessage(msg: AgentMessage, humanText: string): string {
  return `<!-- ${MSG_MARKER} ${JSON.stringify(msg)} -->\n${humanText}`;
}

export function parseMessage(body: string | null | undefined): AgentMessage | null {
  if (!body) return null;
  const m = body.match(new RegExp(`<!--\\s*${MSG_MARKER}\\s+(\\{.*?\\})\\s*-->`, "s"));
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    if (parsed?.v !== 1 || typeof parsed.type !== "string" || typeof parsed.task !== "number") {
      return null;
    }
    return parsed as AgentMessage;
  } catch {
    return null;
  }
}
