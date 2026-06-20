import { readFileSync } from "node:fs";
import type { CouncilRecipe } from "./council.js";
import { parseCouncilRecipe, validateCouncilRecipe } from "./council.js";

/** Weight classes — mirror the `weight:*` label family. */
export type WeightClass = "flyweight" | "middleweight" | "heavyweight";

/** A route key: task type + weight class determines the recipe. */
export interface RouteKey {
  taskType: string;
  weight: WeightClass;
}

/** The router — maps (taskType, weight) → CouncilRecipe. */
export interface RecipeRouter {
  route(key: RouteKey): CouncilRecipe | null;
  register(key: RouteKey, recipe: CouncilRecipe): void;
  list(): Array<{ key: RouteKey; recipe: CouncilRecipe }>;
}

/** Built-in default routes — 3 recipes, one per weight class, all taskType: "codegen". */
export const DEFAULT_ROUTES: Array<{ key: RouteKey; recipe: CouncilRecipe }> = [
  {
    key: { taskType: "codegen", weight: "flyweight" },
    recipe: {
      slug: "codegen-flyweight",
      description: "Fast codegen with a single panelist",
      panel: [{ name: "fighter-a", role: "panel" }],
      judge: { name: "judge-fighter", role: "judge" },
      writer: { name: "writer-fighter", role: "writer" },
      maxRounds: 1,
      taskTypes: ["codegen"],
      gotchas: []
    }
  },
  {
    key: { taskType: "codegen", weight: "middleweight" },
    recipe: {
      slug: "codegen-middleweight",
      description: "Standard codegen with a dual panel",
      panel: [
        { name: "fighter-a", role: "panel" },
        { name: "fighter-b", role: "panel" }
      ],
      judge: { name: "judge-fighter", role: "judge" },
      writer: { name: "writer-fighter", role: "writer" },
      maxRounds: 2,
      taskTypes: ["codegen", "refactor"],
      gotchas: []
    }
  },
  {
    key: { taskType: "codegen", weight: "heavyweight" },
    recipe: {
      slug: "codegen-heavyweight",
      description: "Complex codegen with a 3-fighter panel",
      panel: [
        { name: "fighter-a", role: "panel" },
        { name: "fighter-b", role: "panel" },
        { name: "fighter-c", role: "panel" }
      ],
      judge: { name: "judge-fighter", role: "judge" },
      writer: { name: "writer-fighter", role: "writer" },
      maxRounds: 3,
      taskTypes: ["codegen", "refactor", "architecture"],
      gotchas: []
    }
  }
];

class RecipeRouterImpl implements RecipeRouter {
  private routes: Array<{ key: RouteKey; recipe: CouncilRecipe }> = [];

  constructor() {
    // Seed defaults
    for (const entry of DEFAULT_ROUTES) {
      this.register(entry.key, entry.recipe);
    }
  }

  route(key: RouteKey): CouncilRecipe | null {
    const match = this.routes.find(
      r => r.key.taskType === key.taskType && r.key.weight === key.weight
    );
    return match ? match.recipe : null;
  }

  register(key: RouteKey, recipe: CouncilRecipe): void {
    const index = this.routes.findIndex(
      r => r.key.taskType === key.taskType && r.key.weight === key.weight
    );
    if (index !== -1) {
      this.routes[index] = { key, recipe };
    } else {
      this.routes.push({ key, recipe });
    }
  }

  list(): Array<{ key: RouteKey; recipe: CouncilRecipe }> {
    return [...this.routes];
  }
}

/** Create a router seeded with DEFAULT_ROUTES + optional custom routes. */
export function createRecipeRouter(custom?: Array<{ key: RouteKey; recipe: CouncilRecipe }>): RecipeRouter {
  const router = new RecipeRouterImpl();
  if (custom) {
    for (const entry of custom) {
      router.register(entry.key, entry.recipe);
    }
  }
  return router;
}

/** Load a recipe from a JSON file path. One-line import for shareable/forkable recipes. */
export function loadRecipeFile(path: string): CouncilRecipe {
  const fileContent = readFileSync(path, "utf-8");
  const recipe = parseCouncilRecipe(fileContent);
  const violations = validateCouncilRecipe(recipe);
  if (violations.length > 0) {
    throw new Error(`Invalid recipe at ${path}: ${violations.join("; ")}`);
  }
  return recipe;
}
