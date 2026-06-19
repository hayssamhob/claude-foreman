/**
 * Secret-scan hook on Fighter output (M3-4).
 *
 * Before Fighter output (stdout from MANAGER_CMD / JUNIOR_CMD) is parsed or committed,
 * scrub it for credentials. Zero LLM cost — pure regex. A planted key in the output
 * must be redacted and flagged.
 */

export interface ScanResult {
  clean: boolean;
  redacted: string; // output with secrets replaced by [REDACTED]
  findings: string[]; // human-readable: ["AWS key at char 42", ...]
}

// Common credential patterns — extend as needed
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/g },
  { name: "AWS Secret Key", pattern: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g },
  { name: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g },
  { name: "Generic API key", pattern: /api[_-]?key\s*[:=]\s*['"]?([A-Za-z0-9_\-]{20,})['"]?/gi },
  { name: "Bearer token", pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g },
  { name: "Private key header", pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
];

export function scanOutput(text: string): ScanResult {
  let redacted = text;
  const findings: string[] = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (match, _g1, offset) => {
      findings.push(`${name} at offset ${offset}`);
      return "[REDACTED]";
    });
  }
  return { clean: findings.length === 0, redacted, findings };
}
