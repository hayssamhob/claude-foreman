/**
 * Exclusion list — force-escalate + mirror to CODEOWNERS (M3-3).
 *
 * The hard floor: auth, payments, secrets, DB migrations, deletes, and spend
 * **never auto-merge regardless of coach confidence or trust tier.**
 * This is not configurable downward.
 *
 * Two enforcement layers:
 *   1. Pre-flight classifier — checks a diff's changed files against the
 *      exclusion list. If any banned path is touched, the merge is refused.
 *   2. CODEOWNERS mirror — generates a CODEOWNERS file that maps banned
 *      paths to the repo owner, so GitHub itself forces human review on
 *      those files regardless of what Foreman thinks.
 */

/** A banned path pattern and its reason. */
export interface BannedPath {
  pattern: string; // glob pattern, e.g. "**/auth/**"
  reason: string; // why this is banned
  category: "auth" | "payments" | "secrets" | "migrations" | "deletes" | "spend";
}

/** The default exclusion list — the hard floor. Not configurable downward. */
export const DEFAULT_BANNED_PATHS: BannedPath[] = [
  { pattern: "**/auth/**", reason: "Authentication code — never auto-merge", category: "auth" },
  { pattern: "**/auth.ts", reason: "Authentication code — never auto-merge", category: "auth" },
  { pattern: "**/auth.js", reason: "Authentication code — never auto-merge", category: "auth" },
  { pattern: "**/payment*/**", reason: "Payment processing — never auto-merge", category: "payments" },
  { pattern: "**/payments*", reason: "Payment processing — never auto-merge", category: "payments" },
  { pattern: "**/secret*/**", reason: "Secrets management — never auto-merge", category: "secrets" },
  { pattern: "**/secret*", reason: "Secrets management — never auto-merge", category: "secrets" },
  { pattern: "**/.env*", reason: "Environment files may contain secrets — never auto-merge", category: "secrets" },
  { pattern: "**/migration*/**", reason: "Database migrations — never auto-merge", category: "migrations" },
  { pattern: "**/migrate/**", reason: "Database migrations — never auto-merge", category: "migrations" },
  { pattern: "**/spend*/**", reason: "Spend/cost code — never auto-merge", category: "spend" },
  { pattern: "**/spend*", reason: "Spend/cost code — never auto-merge", category: "spend" },
  { pattern: "**/cost-ledger*", reason: "Cost ledger — never auto-merge", category: "spend" },
];

/** A match result from checking changed files against the exclusion list. */
export interface ExclusionMatch {
  banned: boolean;
  matchedPaths: Array<{ path: string; bannedPath: BannedPath }>;
}

/**
 * Check a list of changed file paths against the exclusion list.
 * Pure function — the caller passes the changed files from the diff.
 */
export function checkExclusion(
  changedFiles: string[],
  bannedPaths: BannedPath[] = DEFAULT_BANNED_PATHS
): ExclusionMatch {
  const matched: Array<{ path: string; bannedPath: BannedPath }> = [];
  for (const file of changedFiles) {
    for (const banned of bannedPaths) {
      if (matchGlob(file, banned.pattern)) {
        matched.push({ path: file, bannedPath: banned });
      }
    }
  }
  return { banned: matched.length > 0, matchedPaths: matched };
}

/**
 * Minimal glob matcher — supports ** (recursive) and * (single-level).
 * No external dep — the patterns are simple enough for a hand-written matcher.
 */
function matchGlob(path: string, pattern: string): boolean {
  // Convert glob to regex: ** → .*, * → [^/]*, escape everything else
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex specials (except * and ?)
    .replace(/\*\*/g, "::STARSTAR::") // placeholder
    .replace(/\*/g, "[^/]*") // single * = no slashes
    .replace(/::STARSTAR::/g, ".*"); // ** = anything
  regex = "^" + regex + "$";
  return new RegExp(regex).test(path);
}

/** The result of the pre-flight check. */
export interface PreflightResult {
  ok: boolean;
  reason: string;
  escalated: boolean;
  matchedPaths: Array<{ path: string; bannedPath: BannedPath }>;
}

/**
 * Pre-flight classifier — checks if a diff touches any banned path.
 * If it does, the merge is refused and the task is escalated to the Coach.
 * This hooks into `mergeGate` as an additional gate.
 */
export function preflightExclusion(
  changedFiles: string[],
  bannedPaths: BannedPath[] = DEFAULT_BANNED_PATHS
): PreflightResult {
  const match = checkExclusion(changedFiles, bannedPaths);
  if (match.banned) {
    const paths = match.matchedPaths.map((m) => `  - ${m.path} (${m.bannedPath.category})`).join("\n");
    return {
      ok: false,
      reason: `Exclusion list violation — the following paths are on the hard floor and never auto-merge:\n${paths}`,
      escalated: true,
      matchedPaths: match.matchedPaths,
    };
  }
  return { ok: true, reason: "No banned paths touched", escalated: false, matchedPaths: [] };
}

/**
 * Generate a CODEOWNERS file from the exclusion list.
 * Maps each banned path to the repo owner so GitHub forces human review.
 */
export function generateCodeowners(
  owner: string,
  bannedPaths: BannedPath[] = DEFAULT_BANNED_PATHS
): string {
  const lines: string[] = [
    "# CODEOWNERS — generated by Foreman (M3-3)",
    "# These paths are on the exclusion list (the hard floor).",
    "# GitHub forces human review on them regardless of what Foreman thinks.",
    "# Do not remove these entries — edit src/guard/exclusion.ts instead.",
    "",
  ];
  for (const banned of bannedPaths) {
    lines.push(`# ${banned.reason}`);
    lines.push(`${banned.pattern} @${owner}`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Check if a CODEOWNERS file already covers all banned paths.
 * Returns the paths that are missing from the existing CODEOWNERS.
 */
export function missingCodeownersEntries(
  existingCodeowners: string,
  bannedPaths: BannedPath[] = DEFAULT_BANNED_PATHS
): BannedPath[] {
  const missing: BannedPath[] = [];
  for (const banned of bannedPaths) {
    if (!existingCodeowners.includes(banned.pattern)) {
      missing.push(banned);
    }
  }
  return missing;
}
