import { describe, it, expect } from "vitest";
import {
  parseCouncilRecipe,
  validateCouncilRecipe,
  serializeCouncilRecipe,
  type CouncilRecipe
} from "../src/drivers/council.js";

describe("Council Recipe Data Layer", () => {
  const validRecipe: CouncilRecipe = {
    slug: "my-valid-recipe",
    description: "A valid recipe for testing",
    panel: [
      { name: "fighter-a", role: "panel" },
      { name: "fighter-b", role: "panel" }
    ],
    judge: { name: "judge-fighter", role: "judge" },
    writer: { name: "writer-fighter", role: "writer" },
    maxRounds: 3,
    taskTypes: ["codegen"],
    gotchas: ["Don't use loops"]
  };

  it("parses valid JSON", () => {
    const json = JSON.stringify(validRecipe);
    const parsed = parseCouncilRecipe(json);
    expect(parsed).toEqual(validRecipe);
  });

  it("wraps SyntaxError on malformed JSON", () => {
    expect(() => parseCouncilRecipe("{ bad json")).toThrow("Council recipe JSON is malformed: ");
  });

  it("serialize round-trips through parse", () => {
    const json = serializeCouncilRecipe(validRecipe);
    const parsed = parseCouncilRecipe(json);
    expect(parsed).toEqual(validRecipe);
  });

  describe("validateCouncilRecipe", () => {
    it("returns empty array for valid recipe", () => {
      expect(validateCouncilRecipe(validRecipe)).toEqual([]);
    });

    it("rule 1: slug matches lowercase-kebab", () => {
      expect(validateCouncilRecipe({ ...validRecipe, slug: "BadSlug!" })).toContain("slug must be lowercase-kebab");
      expect(validateCouncilRecipe({ ...validRecipe, slug: "bad_slug" })).toContain("slug must be lowercase-kebab");
      expect(validateCouncilRecipe({ ...validRecipe, slug: "" })).toContain("slug must be lowercase-kebab");
    });

    it("rule 2: panel must have at least one member", () => {
      expect(validateCouncilRecipe({ ...validRecipe, panel: [] })).toContain("panel must have at least one member");
      expect(validateCouncilRecipe({ ...validRecipe, panel: undefined as any })).toContain("panel must have at least one member");
    });

    it("rule 3: Every panel member has role === 'panel'", () => {
      expect(validateCouncilRecipe({
        ...validRecipe,
        panel: [{ name: "foo", role: "judge" as any }]
      })).toContain("panel member foo has wrong role judge");
    });

    it("rule 4: judge has wrong role", () => {
      expect(validateCouncilRecipe({
        ...validRecipe,
        judge: { name: "judge-fighter", role: "panel" as any }
      })).toContain("judge has wrong role");
    });

    it("rule 5: writer has wrong role", () => {
      expect(validateCouncilRecipe({
        ...validRecipe,
        writer: { name: "writer-fighter", role: "judge" as any }
      })).toContain("writer has wrong role");
    });

    it("rule 6: judge and writer must be different fighters", () => {
      expect(validateCouncilRecipe({
        ...validRecipe,
        judge: { name: "same-fighter", role: "judge" },
        writer: { name: "same-fighter", role: "writer" }
      })).toContain("judge and writer must be different fighters");
    });

    it("rule 7: maxRounds must be >= 1", () => {
      expect(validateCouncilRecipe({ ...validRecipe, maxRounds: 0 })).toContain("maxRounds must be >= 1");
      expect(validateCouncilRecipe({ ...validRecipe, maxRounds: -5 })).toContain("maxRounds must be >= 1");
    });

    it("rule 8: taskTypes must have at least one entry", () => {
      expect(validateCouncilRecipe({ ...validRecipe, taskTypes: [] })).toContain("taskTypes must have at least one entry");
      expect(validateCouncilRecipe({ ...validRecipe, taskTypes: undefined as any })).toContain("taskTypes must have at least one entry");
    });

    it("rule 9: no panel/judge/writer name starts with recipe:", () => {
      const vJudge = validateCouncilRecipe({
        ...validRecipe,
        judge: { name: "recipe:nested", role: "judge" }
      });
      expect(vJudge).toContain("judge name must not reference a nested recipe");

      const vWriter = validateCouncilRecipe({
        ...validRecipe,
        writer: { name: "recipe:nested", role: "writer" }
      });
      expect(vWriter).toContain("writer name must not reference a nested recipe");

      const vPanel = validateCouncilRecipe({
        ...validRecipe,
        panel: [{ name: "recipe:nested", role: "panel" }]
      });
      expect(vPanel).toContain("panel name must not reference a nested recipe");
    });

    it("rule 10: No duplicate fighter names in panel", () => {
      expect(validateCouncilRecipe({
        ...validRecipe,
        panel: [
          { name: "dupe", role: "panel" },
          { name: "dupe", role: "panel" }
        ]
      })).toContain("duplicate panel member dupe");
    });
  });
});
