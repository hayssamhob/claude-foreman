import { describe, it, expect } from "vitest";
import { costForecast, FREE_AGENTS } from "../src/cost-forecast.js";

describe("costForecast", () => {
  const rows = [
    { agent: "ollama", usd: 0, tokens: 50_000 }, // free
    { agent: "manager", usd: 4.20, tokens: 200_000 }, // paid
    { agent: null, usd: 0, tokens: 1_000 }, // null → treated as free
  ];

  it("splits free vs paid tokens", () => {
    const r = costForecast(rows, undefined);
    expect(r.freeTokens).toBe(51_000); // ollama + null
    expect(r.paidTokens).toBe(200_000);
  });

  it("computes paidUsd", () => {
    expect(costForecast(rows, undefined).paidUsd).toBeCloseTo(4.20);
  });

  it("remainingUsd is null without ceiling", () => {
    expect(costForecast(rows, undefined).remainingUsd).toBeNull();
  });

  it("computes remaining and pct with ceiling", () => {
    const r = costForecast(rows, 50);
    expect(r.remainingUsd).toBeCloseTo(45.80);
    expect(r.usedPct).toBe(8); // floor(4.20/50*100) = 8
  });

  it("summary contains free and paid sections", () => {
    const r = costForecast(rows, 50);
    expect(r.summary).toContain("free fighters");
    expect(r.summary).toContain("paid coach");
    expect(r.summary).toContain("budget");
  });

  it("handles empty rows", () => {
    const r = costForecast([], 10);
    expect(r.freeTokens).toBe(0);
    expect(r.paidUsd).toBe(0);
    expect(r.remainingUsd).toBeCloseTo(10);
  });
});

describe("FREE_AGENTS", () => {
  it("includes ollama", () => expect(FREE_AGENTS.has("ollama")).toBe(true));
  it("includes devin-local", () => expect(FREE_AGENTS.has("devin-local")).toBe(true));
  it("does not include manager", () => expect(FREE_AGENTS.has("manager")).toBe(false));
});
