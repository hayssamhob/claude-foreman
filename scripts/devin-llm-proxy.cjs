const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { get_encoding } = require("tiktoken");

const PORT = 3001;
const DEVIN_BIN = "/Applications/Devin.app/Contents/Resources/app/extensions/windsurf/devin/bin/devin";

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/v1/chat/completions") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        const model = payload.model || "kimi-k2.6";
        
        // Extract text from messages
        const messages = payload.messages || [];
        
        let targetCwd = process.cwd();
        let titlePrefix = "";

        const userMessages = messages.filter(m => m.role === "user");
        if (userMessages.length > 0) {
          const firstUserMsg = userMessages[0].content || "";
          
          // 1. Extract Workspace (cwd)
          const pathMatch = firstUserMsg.match(/\/Users\/[a-zA-Z0-9_-]+\/(?:CascadeProjects|Documents\/antigravity)\/[a-zA-Z0-9_-]+/);
          if (pathMatch) {
            targetCwd = pathMatch[0];
          }

          // 2. Extract Title
          const lines = firstUserMsg.split("\n").map(l => l.trim());
          const titleLine = lines.find(l => l.length > 5 && !l.startsWith("```") && !l.startsWith("[") && !l.startsWith("{") && !l.startsWith("<"));
          if (titleLine) {
            const projectName = require("path").basename(targetCwd);
            titlePrefix = `[${projectName}] ${titleLine.substring(0, 80)}...\n\n`;
          }
        }

        // Put the title at the very top so Devin uses it as the session name.
        // Put SYSTEM messages at the end to avoid title hijacking.
        const systemMessages = messages.filter(m => m.role === "system");
        const otherMessages = messages.filter(m => m.role !== "system");

        let promptText = titlePrefix;
        promptText += otherMessages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join("\n\n");
        if (systemMessages.length > 0) {
           promptText += "\n\n" + systemMessages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join("\n\n");
        }
        
        let promptTokens = 0;
        let completionTokens = 0;
        try {
          const enc = get_encoding("cl100k_base");
          promptTokens = enc.encode(promptText).length;
          enc.free();
        } catch (e) {
          console.error("[Proxy] Token count error (prompt):", e);
        }

        console.log(`[Proxy] Routing request to Devin... Model: ${model}, Messages: ${messages.length}, Approx Prompt Tokens: ${promptTokens}`);

        // Call Devin CLI synchronously
        const output = execFileSync(DEVIN_BIN, ["-p", promptText, "--model", model, "--permission-mode", "dangerous"], {
          cwd: targetCwd,
          encoding: "utf8",
          stdio: ["pipe", "pipe", "inherit"],
        });

        try {
          const enc = get_encoding("cl100k_base");
          completionTokens = enc.encode(output.trim()).length;
          enc.free();
        } catch (e) {
          console.error("[Proxy] Token count error (completion):", e);
        }
        
        const totalTokens = promptTokens + completionTokens;

        if (payload.stream) {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
          });
          
          const chunkId = `chatcmpl-${Date.now()}`;
          const chunkCreated = Math.floor(Date.now() / 1000);
          
          // Send content chunk
          res.write(`data: ${JSON.stringify({
            id: chunkId,
            object: "chat.completion.chunk",
            created: chunkCreated,
            model: model,
            choices: [{ index: 0, delta: { content: output.trim() }, finish_reason: null }]
          })}\n\n`);
          
          // Send stop chunk
          res.write(`data: ${JSON.stringify({
            id: chunkId,
            object: "chat.completion.chunk",
            created: chunkCreated,
            model: model,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
          })}\n\n`);
          
          // Optionally send usage chunk for streaming if supported, but typically streaming clients just ignore or read it from the final chunk
          res.write(`data: ${JSON.stringify({
            id: chunkId,
            object: "chat.completion.chunk",
            created: chunkCreated,
            model: model,
            choices: [],
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: totalTokens
            }
          })}\n\n`);

          // Send done
          res.write(`data: [DONE]\n\n`);
          res.end();
        } else {
          // Wrap response in OpenAI format
          const response = {
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: output.trim(),
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: totalTokens,
            },
          };

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(response));
        }
        console.log(`[Proxy] Successfully replied via Devin!`);

      } catch (err) {
        console.error("[Proxy] Error processing request:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
    });
  } else if (req.method === "GET" && req.url === "/v1/models") {
    // Return dummy models list so clients don't complain
    const response = {
      object: "list",
      data: [
        { id: "kimi-k2.6", object: "model", created: Date.now() },
        { id: "kimi-k2.7", object: "model", created: Date.now() },
        { id: "glm-5.2", object: "model", created: Date.now() },
        { id: "swe-1.6", object: "model", created: Date.now() },
        { id: "minimax-m2.5", object: "model", created: Date.now() },
        { id: "deepseek-v4-pro", object: "model", created: Date.now() }
      ]
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Devin LLM Proxy running on http://localhost:${PORT}`);
  console.log(`Listening for OpenAI-compatible chat completions...`);
});
