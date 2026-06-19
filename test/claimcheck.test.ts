import { describe, it, expect } from "vitest";
import { checkClaims } from "../src/referee/claimcheck.js";

const LABELS = [
  "area:cli", "area:config", "area:connectors", "area:daemon", "area:dashboard", "area:driver", "area:evolution", "area:fusion", "area:github", "area:referee", "area:loop", "area:security", "area:coach", "area:skill", 
  "epic:M0", "epic:M1", "epic:M2", "epic:M3", "epic:M4", "epic:M5", 
  "spine:adopt", "spine:build", "spine:expose", "spine:extend", "spine:harden", 
  "type:feat", "type:fix", "type:docs", "type:chore", 
  "weight:flyweight", "weight:lightweight", "weight:middleweight", "weight:heavyweight", 
  "priority:high", "priority:medium", "priority:low", 
  "agent:antigravity", "agent:ollama", "agent:claude", "agent:devin", "agent:devin-local", "agent:cursor",
  "fusion:on"
];

describe("checkClaims", () => {
  it("passes a diff with no references", () => {
    const diff = "+ const x = 42;\n- const y = 10;";
    const r = checkClaims(diff, ".", LABELS);
    expect(r.pass).toBe(true);
    expect(r.violations.length).toBe(0);
  });

  it("passes a diff with known labels", () => {
    const diff = "+  labels: ['area:coach', 'priority:high']\n";
    const r = checkClaims(diff, ".", LABELS);
    expect(r.pass).toBe(true);
    expect(r.violations.length).toBe(0);
  });

  it("flags an invented label (area:api)", () => {
    const diff = "+  labels: ['area:api']\n";
    const r = checkClaims(diff, ".", LABELS);
    expect(r.pass).toBe(false);
    expect(r.violations.length).toBe(1);
    expect(r.violations[0].value).toBe("area:api");
  });

  it("ignores lines not starting with +", () => {
    const diff = "-  labels: ['area:api']\n   // context: area:unknown";
    const r = checkClaims(diff, ".", LABELS);
    expect(r.pass).toBe(true);
    expect(r.violations.length).toBe(0);
  });

  it("catches the #64 case: area:api and spine:probot", () => {
    const diff = "+  const issueLabels = ['area:api', 'spine:probot'];\n";
    const r = checkClaims(diff, ".", LABELS);
    expect(r.pass).toBe(false);
    expect(r.violations.length).toBe(2);
    expect(r.violations[0].value).toBe("area:api");
    expect(r.violations[1].value).toBe("spine:probot");
  });
});
