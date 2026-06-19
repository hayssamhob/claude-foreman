/** Real-capacity accounting for the dispatch loop (M6-6).
 *
 * A Fighter is "active" only when it has genuine work in flight:
 * an open PR or a pushed branch. A label-only assignment with no branch
 * and no PR is "stale" — the slot is actually free.
 */

export interface FighterLoad {
  agent: string;
  activeIssues: number; // issues with a real branch OR open PR
  staleAssignments: number[]; // issue numbers that are label-only, no real work, old enough to reclaim
}

export function computeLoad(args: {
  agent: string;
  assignedIssues: number[]; // all issues currently labeled agent:<this agent>
  openPrIssues: number[]; // subset that have an open PR
  branchedIssues: number[]; // subset that have a remote feat/issue-N-* branch
  now: number; // epoch ms (pass Date.now() from the caller; never call it inside)
  assignedAtByIssue: Record<number, number>; // epoch ms when each issue was labeled
  staleHours?: number; // threshold for stale, default 6
}): FighterLoad {
  const staleMs = (args.staleHours ?? 6) * 3_600_000;
  const activeSet = new Set([...args.openPrIssues, ...args.branchedIssues]);

  const activeIssues = args.assignedIssues.filter((n) => activeSet.has(n)).length;

  const staleAssignments = args.assignedIssues.filter((n) => {
    if (activeSet.has(n)) return false; // real work → not stale
    const at = args.assignedAtByIssue[n];
    if (at === undefined) return false; // no timestamp → conservative: not stale
    return args.now - at > staleMs;
  });

  return { agent: args.agent, activeIssues, staleAssignments };
}
