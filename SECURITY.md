# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| main    | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please report vulnerabilities privately:

1. Email the maintainer at the address listed in the GitHub profile
2. Or use [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)

You will receive a response within 48 hours. If the vulnerability is confirmed, a fix will be prioritized and a security advisory will be published after the fix is released.

## Security Architecture

Foreman is built on a **single GitHub App trust boundary** — every byte that reaches GitHub is signed by one installation token belonging to one App. Fighters (Kimi, Gemini, Ollama, Claude, Cursor, Devin) never hold a credential; they write code into a worktree, and the App is the only thing that talks to GitHub.

### Guardrails

- **G1**: Fighters must not invent label names, file paths, or function signatures
- **G2**: Ollama prompts go through the HTTP API, never `ollama run` (shell injection)
- **G3**: Untrusted input (issue/PR bodies, web content) is sanitized via `guardIssueBody()` before entering LLM prompts
- **G4**: Hard-exclusion regex prevents Fighters from touching auth/payment/secret/migration/delete/spend code
- **Secret-scan hook** (`src/guard/secretscan.ts`): Fighter output is scrubbed for credentials before parsing or committing

### What Fighters Cannot Do

- Hold a GitHub credential (the App is the only authenticated actor)
- Exceed the App's permissions (blast radius = App scopes)
- Touch auth, payment, secret, migration, delete, or spend code (hard exclusion)
- Execute raw issue/PR text as instructions (G3 guard)
- Push secrets in their output (secret-scan hook redacts them)
