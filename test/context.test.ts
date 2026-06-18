import { describe, it, expect } from "vitest";
import { formatContextPacket, type ContextPacket } from "../src/context.js";
import { workPrompt } from "../src/junior/prompts.js";

describe("formatContextPacket", () => {
  const base: ContextPacket = {
    gotchas: null,
    labels: [],
    fileTree: [],
  };

  it("renders ground truth header and empty sections", () => {
    const rendered = formatContextPacket(base);
    expect(rendered).toContain("Ground truth");
    expect(rendered).toContain("(none)");
  });

  it("renders labels, file tree, and gotchas", () => {
    const packet: ContextPacket = {
      gotchas: "- Don't invent labels",
      labels: ["area:cli", "type:feat"],
      fileTree: ["src/index.ts", "src/github.ts"],
    };
    const rendered = formatContextPacket(packet);
    expect(rendered).toContain("### Labels");
    expect(rendered).toContain("`area:cli`");
    expect(rendered).toContain("### File tree");
    expect(rendered).toContain("`src/index.ts`");
    expect(rendered).toContain("### Gotchas");
    expect(rendered).toContain("Don't invent labels");
  });
});

describe("workPrompt with context packet", () => {
  it("includes the formatted context packet when provided", () => {
    const packet: ContextPacket = {
      gotchas: "- Don't invent labels",
      labels: ["area:cli"],
      fileTree: ["src/index.ts"],
    };
    const prompt = workPrompt({
      repoFull: "o/r",
      issue: 7,
      title: "Add a contact form",
      spec: "Acceptance: form posts to /contact",
      branch: "agent/claude/7",
      contextPacket: packet,
    });
    expect(prompt).toContain("Acceptance: form posts to /contact");
    expect(prompt).toContain("Ground truth");
    expect(prompt).toContain("### Labels");
    expect(prompt).toContain("### File tree");
    expect(prompt).toContain("### Gotchas");
  });

  it("omits the context packet when not provided", () => {
    const prompt = workPrompt({
      repoFull: "o/r",
      issue: 7,
      title: "Add a contact form",
      spec: "Acceptance: form posts to /contact",
      branch: "agent/claude/7",
    });
    expect(prompt).toContain("Acceptance: form posts to /contact");
    expect(prompt).not.toContain("Ground truth");
  });
});
