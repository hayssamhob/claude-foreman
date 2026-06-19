/**
 * Untrusted-input guard (M3-5).
 *
 * Sanitizes free text from untrusted sources before it is handed to an LLM prompt.
 * Rule: summarize/classify, never execute. Strip any text that looks like a command
 * addressed to an agent or coach.
 */

// Patterns that flag a string as a potential prompt-injection attempt
const INJECTION_PATTERNS = [
  /ignore (previous|all|above) instructions/i,
  /you are now/i,
  /act as (a|an|the)/i,
  /<!-- agent-msg/i, // our own protocol marker — never in free text
  /@(manager|coach|claude|antigravity|ollama|devin)\s*:/i,
];

export type TrustLevel = "trusted" | "untrusted";

export interface GuardedText {
  original: string;
  safe: string; // sanitized version to hand to LLM
  injectionDetected: boolean;
  reason: string | null;
}

/** Classify and sanitize free text from an untrusted source. */
export function guardText(text: string, source: string): GuardedText {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        original: text,
        safe: `[Content from ${source} was summarized to prevent prompt injection. Original length: ${text.length} chars.]`,
        injectionDetected: true,
        reason: `Matched pattern: ${pattern}`,
      };
    }
  }
  return { original: text, safe: text, injectionDetected: false, reason: null };
}

/** Apply guard to the fields of a GitHub issue/PR that flow into LLM prompts. */
export function guardIssueBody(body: string | null | undefined, issueRef: string): string {
  if (!body) return "";
  const result = guardText(body, issueRef);
  return result.safe;
}
