export interface ClaimViolation {
  line: number;
  kind: "label";
  value: string;       // the invented reference
}

export interface ClaimCheckResult {
  pass: boolean;
  violations: ClaimViolation[];
  summary: string;     // human-readable, e.g. "3 invented references found"
}

/**
 * Check a diff string for invented label/file/import references.
 * Pure function — takes the diff text and the repo root path; no Octokit needed.
 */
export function checkClaims(diff: string, repoRoot: string, knownLabels: string[]): ClaimCheckResult {
  const violations: ClaimViolation[] = [];
  const lines = diff.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("+")) continue; // only check added lines

    // 1. Label references: area:*, spine:*, epic:*, type:*, weight:*, priority:*, agent:*, fusion:*
    const labelMatches = line.matchAll(/\b(area|spine|epic|type|weight|priority|agent|fusion):[\w-]+/g);
    for (const m of labelMatches) {
      if (!knownLabels.includes(m[0])) {
        violations.push({ line: i + 1, kind: "label", value: m[0] });
      }
    }

  }

  const pass = violations.length === 0;
  return {
    pass,
    violations,
    summary: pass ? "No invented references" : `${violations.length} invented reference(s) found`,
  };
}
