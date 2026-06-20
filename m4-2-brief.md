**Grilled Spec / Brief for Devin**

We need to implement the Live preview merge gate via a named MCP connector (M4-2).

**Decisions & Interface Design:**
1. **Dependency:** Add `@modelcontextprotocol/sdk` to `package.json`.
2. **Config:** Add `mcpPreviewCommand: process.env.MCP_PREVIEW_COMMAND` and `mcpPreviewAssertion: process.env.MCP_PREVIEW_ASSERTION` to `src/config.ts`. If `mcpPreviewCommand` is unset, the preview gate automatically passes (opt-in feature).
3. **Where code lives:** Create `src/mcp/preview.ts` exporting:
   `export async function verifyLivePreview(dir: string, cmd: string, assertion: string): Promise<boolean>`
   This function spins up the MCP server (using `Client` with `StdioClientTransport`), initializes it, and uses it to start the app/verify the assertion. (Note: standard MCP doesn't natively "start the app", so just assume the MCP server provides a tool named `preview_smoke_test` that takes `dir` and `assertion` and returns success/failure).
   *Wait, the spec says "named MCP connector to start the app and a smoke check (GET / returns 200...)*. Let's simplify: the MCP server exposes a tool `run_preview` that does the starting and checking. Foreman just calls it.
4. **Integration:** In `src/automerge.ts`, before calling `mergeGate`, if `config.mcpPreviewCommand` is set, `await verifyLivePreview(...)` and pass `previewOk: boolean | null` (null = skipped) into `mergeGate()`.
5. **Merge Gate logic:** Update `mergeGate` to return `{ ok: false, reason: "live preview smoke test failed" }` if `previewOk === false`.

**Done-Signal Format:**
`@hayssamhob ✅ #42 done — <one sentence>`

Implement this vertically, ensure tests pass, and open a PR.
