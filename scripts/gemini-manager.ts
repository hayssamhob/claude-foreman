import { GoogleGenerativeAI } from "@google/generative-ai";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error(JSON.stringify({
      error: "GEMINI_API_KEY is not set in the environment variables."
    }));
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  // We use gemini-2.5-pro to power the Antigravity Coach
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-pro",
    generationConfig: {
      responseMimeType: "application/json"
    }
  });

  // Read stdin completely
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const prompt = Buffer.concat(chunks).toString("utf-8");

  if (!prompt.trim()) {
    console.error("No prompt provided on stdin");
    process.exit(1);
  }

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    console.log(response);
  } catch (error: any) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
