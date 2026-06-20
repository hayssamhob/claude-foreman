/**
 * Fusion adapter (M5-4) — an opt-in quality ceiling for free recipes.
 *
 * `agent:fusion` on an issue -> call the OpenRouter /fusion endpoint (a best-of-N
 * model) using the same ApiDriver machinery as `agent:api`. This is NOT the default
 * driver; it is a deliberate opt-in for benchmarking against a higher-quality ceiling.
 *
 * Env:
 *   OPENROUTER_API_KEY  the API key
 *   OPENROUTER_MODEL    model name (default openrouter/auto)
 */
import { createApiAdapter } from "../drivers/api.js";
import type { FighterAdapter } from "./adapter.js";

export const fusionAdapter: FighterAdapter = {
  ...createApiAdapter(
    process.env.OPENROUTER_API_KEY,
    "https://openrouter.ai/api",
    process.env.OPENROUTER_MODEL ?? "openrouter/auto"
  ),
  name: "fusion",
};
