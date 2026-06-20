import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DEFAULT_ROUTES,
  createRecipeRouter,
  loadRecipeFile
} from "../src/drivers/recipe-router.js";
import { validateCouncilRecipe, type CouncilRecipe } from "../src/drivers/council.js";

describe("Recipe Router", () => {
  it("DEFAULT_ROUTES has 3 entries, one per weight class", () => {
    expect(DEFAULT_ROUTES).toHaveLength(3);
    const weights = DEFAULT_ROUTES.map(r => r.key.weight);
    expect(weights).toContain("flyweight");
    expect(weights).toContain("middleweight");
    expect(weights).toContain("heavyweight");
  });

  it("All DEFAULT_ROUTES recipes pass validateCouncilRecipe", () => {
    for (const route of DEFAULT_ROUTES) {
      expect(validateCouncilRecipe(route.recipe)).toEqual([]);
    }
  });

  it("route() returns the right recipe for each weight class", () => {
    const router = createRecipeRouter();
    expect(router.route({ taskType: "codegen", weight: "flyweight" })?.slug).toBe("codegen-flyweight");
    expect(router.route({ taskType: "codegen", weight: "middleweight" })?.slug).toBe("codegen-middleweight");
    expect(router.route({ taskType: "codegen", weight: "heavyweight" })?.slug).toBe("codegen-heavyweight");
  });

  it("route() returns null for unknown task type", () => {
    const router = createRecipeRouter();
    expect(router.route({ taskType: "unknown", weight: "flyweight" })).toBeNull();
  });

  it("route() returns null for unknown weight", () => {
    const router = createRecipeRouter();
    // @ts-expect-error Intentionally invalid weight
    expect(router.route({ taskType: "codegen", weight: "unknown" })).toBeNull();
  });

  it("register() adds a new custom route", () => {
    const router = createRecipeRouter();
    const customRecipe: CouncilRecipe = { ...DEFAULT_ROUTES[0].recipe, slug: "custom-recipe" };
    router.register({ taskType: "docs", weight: "flyweight" }, customRecipe);
    expect(router.route({ taskType: "docs", weight: "flyweight" })?.slug).toBe("custom-recipe");
  });

  it("register() overrides a default on key collision", () => {
    const router = createRecipeRouter();
    const customRecipe: CouncilRecipe = { ...DEFAULT_ROUTES[0].recipe, slug: "overridden-recipe" };
    router.register({ taskType: "codegen", weight: "flyweight" }, customRecipe);
    expect(router.route({ taskType: "codegen", weight: "flyweight" })?.slug).toBe("overridden-recipe");
  });

  it("list() returns entries in insertion order", () => {
    const router = createRecipeRouter();
    const customRecipe: CouncilRecipe = { ...DEFAULT_ROUTES[0].recipe, slug: "custom-list-recipe" };
    router.register({ taskType: "docs", weight: "heavyweight" }, customRecipe);
    const list = router.list();
    expect(list).toHaveLength(4);
    expect(list[0].key.taskType).toBe("codegen");
    expect(list[3].key.taskType).toBe("docs");
  });

  it("createRecipeRouter(custom) pre-seeds defaults + customs", () => {
    const customRecipe: CouncilRecipe = { ...DEFAULT_ROUTES[0].recipe, slug: "pre-seeded-custom" };
    const router = createRecipeRouter([
      { key: { taskType: "refactor", weight: "middleweight" }, recipe: customRecipe }
    ]);
    expect(router.list()).toHaveLength(4);
    expect(router.route({ taskType: "refactor", weight: "middleweight" })?.slug).toBe("pre-seeded-custom");
  });

  describe("loadRecipeFile", () => {
    const tempFile = join(tmpdir(), "test-recipe.json");

    afterEach(() => {
      try {
        unlinkSync(tempFile);
      } catch (e) {
        // ignore
      }
    });

    it("loads a valid JSON recipe", () => {
      const validRecipe = DEFAULT_ROUTES[0].recipe;
      writeFileSync(tempFile, JSON.stringify(validRecipe));
      const loaded = loadRecipeFile(tempFile);
      expect(loaded.slug).toBe(validRecipe.slug);
    });

    it("throws on invalid recipe", () => {
      const invalidRecipe = { ...DEFAULT_ROUTES[0].recipe, slug: "Bad Slug!" };
      writeFileSync(tempFile, JSON.stringify(invalidRecipe));
      expect(() => loadRecipeFile(tempFile)).toThrow("Invalid recipe at " + tempFile + ": slug must be lowercase-kebab");
    });

    it("throws on nonexistent file path", () => {
      expect(() => loadRecipeFile(join(tmpdir(), "does-not-exist.json"))).toThrow(/ENOENT/);
    });
  });
});
