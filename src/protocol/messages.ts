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

export interface LoopContract {
  trigger: string;       // what event starts the work, e.g. "issues.labeled agent:antigravity"
  scope: string[];       // file paths or glob patterns the Fighter may touch, e.g. ["src/**", "test/**"]
  action: string;        // what the task does, e.g. "Add LoopContract schema to messages.ts"
  budget: {
    maxTokens?: number;  // optional token ceiling for this assignment
    maxUsd?: number;     // optional cost ceiling in USD
  };
  stop: string;          // when work is done, e.g. "npm test passes, PR opened with done-signal"
  report: string;        // done-signal format, e.g. "@hayssamhob ✅ #N done — <one sentence>"
}

/**
 * Validate a LoopContract from untrusted input. Returns null if malformed.
 * Rules:
 *   trigger — non-empty string
 *   scope   — non-empty array of strings (at least one element)
 *   action  — non-empty string
 *   budget  — object (maxTokens / maxUsd optional; if present, must be number > 0)
 *   stop    — non-empty string
 *   report  — non-empty string
 */
export function validateLoopContract(value: unknown): LoopContract | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  if (typeof c.trigger !== "string" || !c.trigger.trim()) return null;
  if (!Array.isArray(c.scope) || c.scope.length === 0 || !c.scope.every((s) => typeof s === "string" && s.trim())) return null;
  if (typeof c.action !== "string" || !c.action.trim()) return null;
  if (typeof c.budget !== "object" || c.budget === null || Array.isArray(c.budget)) return null;
  const b = c.budget as Record<string, unknown>;
  if (b.maxTokens !== undefined && (typeof b.maxTokens !== "number" || b.maxTokens <= 0)) return null;
  if (b.maxUsd !== undefined && (typeof b.maxUsd !== "number" || b.maxUsd <= 0)) return null;
  if (typeof c.stop !== "string" || !c.stop.trim()) return null;
  if (typeof c.report !== "string" || !c.report.trim()) return null;
  return c as unknown as LoopContract;
}
