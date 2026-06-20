import { config } from "./config.js";
import type { Store } from "./state/db.js";

export const FREE_AGENTS = new Set([
  "ollama",
  "windsurf-kimi",
  "antigravity",
  "devin-local",
]);

export interface CostForecastResult {
  freeTokens: number;
  paidUsd: number;
  paidTokens: number;
  remainingUsd: number | null; // null if no MAX_USD ceiling configured
  usedPct: number | null; // null if no ceiling
  summary: string; // one-line log prefix "[cost] ..."
}

export function costForecast(
  rows: Array<{ agent: string | null; usd: number; tokens: number }>,
  maxUsd: number | undefined
): CostForecastResult {
  let freeTokens = 0;
  let paidUsd = 0;
  let paidTokens = 0;

  for (const row of rows) {
    if (row.agent === null || FREE_AGENTS.has(row.agent)) {
      freeTokens += row.tokens;
    } else {
      paidUsd += row.usd;
      paidTokens += row.tokens;
    }
  }

  const remainingUsd = maxUsd !== undefined ? maxUsd - paidUsd : null;
  const usedPct =
    maxUsd !== undefined && maxUsd > 0
      ? Math.round((paidUsd / maxUsd) * 100)
      : null;

  const freeStr = `free fighters: ${(freeTokens / 1000).toFixed(1)}k tok · $0.00`;
  const paidStr = `paid coach: ${(paidTokens / 1000).toFixed(1)}k tok · $${paidUsd.toFixed(2)}`;
  const budgetStr =
    maxUsd !== undefined
      ? ` | budget: $${paidUsd.toFixed(2)} / $${maxUsd.toFixed(2)} (${usedPct}%)`
      : "";
  const summary = `[cost] ${freeStr} | ${paidStr}${budgetStr}`;

  return { freeTokens, paidUsd, paidTokens, remainingUsd, usedPct, summary };
}

/** Forecast spend for the current run from the SQLite ledger. */
export function forecastRunCost(store: Store): CostForecastResult {
  return costForecast(store.getLedgerByAgent(0), config.maxUsd);
}
