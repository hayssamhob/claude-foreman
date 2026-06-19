/**
 * Bounded work-discovery heartbeat (M5-7).
 *
 * The running daemon's tick generates its own **bounded** tickets —
 * failing tests, stale deps, TODOs — never open-ended. Each discovery
 * is a specific, actionable ticket with a clear done-contract.
 *
 * "Find & fix failing tests" is bounded. "Improve the codebase" is not.
 * This module never generates open-ended work — every ticket has a
 * finite scope and a machine-checkable done-contract.
 */

/** A discovered work item — always bounded, always actionable. */
export interface DiscoveredWork {
  type: "failing-test" | "stale-dep" | "todo" | "flakey-test";
  title: string;
  description: string;
  doneContract: string; // machine-checkable AC
  priority: "high" | "medium" | "low";
  bounded: true; // type-level guarantee — every DiscoveredWork is bounded
}

/** A discovery source — scans one surface and returns bounded work items. */
export interface DiscoverySource {
  name: string;
  scan(): DiscoveredWork[];
}

/** Scan test output for failing tests. Bounded: "fix test X" is one ticket. */
export function scanFailingTests(testOutput: string): DiscoveredWork[] {
  const failures: DiscoveredWork[] = [];
  // Match vitest/jest failure lines: "FAIL test/foo.test.ts > suite > test name"
  // or "× test name"
  const lines = testOutput.split("\n");
  for (const line of lines) {
    const failMatch = line.match(/FAIL\s+(\S+\.test\.\S+)/);
    if (failMatch) {
      const testFile = failMatch[1];
      failures.push({
        type: "failing-test",
        title: `Fix failing test: ${testFile}`,
        description: `Test file ${testFile} is failing. Read the test, identify the failure, fix it.`,
        doneContract: `npm test -- ${testFile} passes`,
        priority: "high",
        bounded: true,
      });
    }
    const xMatch = line.match(/×\s+(.+)/);
    if (xMatch && !failures.some((f) => f.title.includes(xMatch[1]))) {
      const testName = xMatch[1].trim();
      failures.push({
        type: "failing-test",
        title: `Fix failing test: ${testName}`,
        description: `Test "${testName}" is failing. Read the test output, identify the failure, fix it.`,
        doneContract: `npm test passes with no failures for "${testName}"`,
        priority: "high",
        bounded: true,
      });
    }
  }
  return dedupeByTitle(failures);
}

/** Scan package.json deps for stale/outdated versions. Bounded: "bump dep X" is one ticket. */
export function scanStaleDeps(packageJson: string, outdatedOutput: string): DiscoveredWork[] {
  const work: DiscoveredWork[] = [];
  // Parse `npm outdated --json` output: { "dep-name": { "current": "1.0", "wanted": "1.1", "latest": "2.0" } }
  try {
    const outdated = JSON.parse(outdatedOutput);
    for (const [dep, info] of Object.entries(outdated)) {
      const { current, latest } = info as { current: string; wanted: string; latest: string };
      const isMajor = current && latest && current.split(".")[0] !== latest.split(".")[0];
      work.push({
        type: "stale-dep",
        title: `Bump ${dep} from ${current} to ${latest}`,
        description: `Dependency ${dep} is outdated (current: ${current}, latest: ${latest}). ${isMajor ? "Major version bump — review breaking changes." : "Patch/minor bump — should be safe."}`,
        doneContract: `npm test passes with ${dep}@${latest}`,
        priority: isMajor ? "medium" : "low",
        bounded: true,
      });
    }
  } catch {
    // Not JSON or empty — no stale deps found
  }
  return work;
}

/** Scan source files for TODO/FIXME/HACK comments. Bounded: "resolve TODO in file:line" is one ticket. */
export function scanTodos(sourceFiles: { path: string; content: string }[]): DiscoveredWork[] {
  const work: DiscoveredWork[] = [];
  const todoRegex = /(TODO|FIXME|HACK|XXX)\b[:\s]*(.+)/g;
  for (const file of sourceFiles) {
    let match: RegExpExecArray | null;
    const content = file.content;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = todoRegex.exec(lines[i]);
      if (m) {
        const marker = m[1];
        const text = m[2].trim().replace(/\*\/$/, "").trim();
        work.push({
          type: "todo",
          title: `Resolve ${marker}: ${text} (${file.path}:${i + 1})`,
          description: `${marker} found in ${file.path}:${i + 1}: "${text}". Resolve it or document why it's acceptable.`,
          doneContract: `The ${marker} comment in ${file.path}:${i + 1} is resolved (removed or documented)`,
          priority: marker === "FIXME" || marker === "XXX" ? "medium" : "low",
          bounded: true,
        });
      }
    }
  }
  return dedupeByTitle(work);
}

/** Cap the number of discovered items — the heartbeat is bounded. */
export function capDiscoveries(work: DiscoveredWork[], max: number): DiscoveredWork[] {
  // Sort by priority: high > medium > low
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return [...work]
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    .slice(0, max);
}

/**
 * The heartbeat tick — runs all discovery sources and returns bounded work items.
 * The max parameter is the hard cap: the heartbeat never generates more than `max`
 * tickets in one tick. This is the "bounded" guarantee.
 */
export function discoveryTick(sources: DiscoverySource[], max: number = 5): DiscoveredWork[] {
  const allWork: DiscoveredWork[] = [];
  for (const source of sources) {
    const items = source.scan();
    allWork.push(...items);
  }
  return capDiscoveries(allWork, max);
}

function dedupeByTitle(work: DiscoveredWork[]): DiscoveredWork[] {
  const seen = new Set<string>();
  return work.filter((w) => {
    if (seen.has(w.title)) return false;
    seen.add(w.title);
    return true;
  });
}
