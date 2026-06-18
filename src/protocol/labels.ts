/** Label and branch conventions — the visible half of the protocol. */

export const LABEL_TASK = "agent-task"; // marks an issue as a dispatchable task
export const LABEL_EPIC = "epic"; // marks an issue for manager decomposition

export type TaskStatus =
  | "queued"
  | "claimed"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "done"
  | "failed"
  | "stopped"; // halted by the owner; relaunch returns it to queued

export function agentLabel(agent: string): string {
  return `agent:${agent}`;
}

export function statusLabel(status: TaskStatus): string {
  return `status:${status.replace(/_/g, "-")}`;
}

export function parseAgentLabel(label: string): string | null {
  return label.startsWith("agent:") ? label.slice("agent:".length) : null;
}

export function taskBranch(agent: string, issueNumber: number): string {
  return `agent/${agent}/${issueNumber}`;
}

/** Extract (agent, issue) from a branch name following the convention, else null. */
export function parseTaskBranch(ref: string): { agent: string; issue: number } | null {
  const m = ref.match(/^agent\/([a-z0-9-]+)\/(\d+)$/);
  return m ? { agent: m[1], issue: parseInt(m[2], 10) } : null;
}

export const ALL_STATUS: TaskStatus[] = [
  "queued",
  "claimed",
  "in_review",
  "changes_requested",
  "approved",
  "done",
  "failed",
  "stopped",
];

export interface LabelDef {
  name: string;
  color: string;
  description: string;
}

/** Every label the protocol needs in a repo — shared by the onboarding handler and the ensure-labels script. */
export function labelDefinitions(agents: string[], holdLabel: string): LabelDef[] {
  return [
    { name: LABEL_TASK, color: "1d76db", description: "Dispatchable task for an AI agent" },
    { name: LABEL_EPIC, color: "5319e7", description: "Epic — manager will decompose into tasks" },
    { name: holdLabel, color: "cf222e", description: "Do not auto-merge — the owner will merge manually" },
    ...agents.map((a) => ({ name: agentLabel(a), color: "0e8a16", description: `Routed to agent: ${a}` })),
    ...ALL_STATUS.map((s) => ({ name: statusLabel(s), color: "fbca04", description: `Task status: ${s}` })),
  ];
}
