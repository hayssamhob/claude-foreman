async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const prompt = Buffer.concat(chunks).toString("utf-8");

  if (!prompt.trim()) {
    console.error("No prompt provided on stdin");
    process.exit(1);
  }

  const model = process.env.OLLAMA_MODEL || "openhermes";

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        format: "json",
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { response: string };
    console.log(data.response);
  } catch (error: any) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
