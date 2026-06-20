import type { FighterDriver } from "./fighter.js";

/** The seats a council member can hold. Mirrors the `role:<role>` label family. */
export type CouncilRole = "panel" | "judge" | "writer";

/** A task type the recipe is scoped to (e.g. "codegen", "refactor", "docs"). */
export type TaskType = string;

/** A reference to a fighter by its roster name (e.g. "ollama", "kimi"). */
export interface FighterRef {
  name: string;       // roster name; must match a FighterDriver.name at runtime
  role: CouncilRole;  // this member's seat in the council
}

/**
 * A council fusion recipe — declarative, shareable, forkable (SPEC §5.6, §9).
 * Shape: { panel, judge, writer, max_rounds, task_types, gotchas }.
 */
export interface CouncilRecipe {
  slug: string;          // recipe:<slug> label value, lowercase-kebab
  description: string;
  panel: FighterRef[];   // the panelists (each role: "panel")
  judge: FighterRef;     // the test-grounded judge (role: "judge")
  writer: FighterRef;    // the synthesizer (role: "writer")
  maxRounds: number;     // 1 = single pass; >1 = iterative refinement
  taskTypes: TaskType[]; // which task types this recipe is scoped to
  gotchas: string[];     // recipe-specific pitfalls, read by the panel
}

/** Parse a council recipe from a JSON string. Throws on malformed JSON. */
export function parseCouncilRecipe(json: string): CouncilRecipe {
  try {
    return JSON.parse(json) as CouncilRecipe;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Council recipe JSON is malformed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Validate a parsed CouncilRecipe. Returns an array of violation messages.
 * Empty array = valid. Deterministic — no LLM, no network.
 */
export function validateCouncilRecipe(recipe: CouncilRecipe): string[] {
  const violations: string[] = [];

  if (!recipe.slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(recipe.slug)) {
    violations.push("slug must be lowercase-kebab");
  }

  if (!recipe.panel || recipe.panel.length < 1) {
    violations.push("panel must have at least one member");
  } else {
    for (const member of recipe.panel) {
      if (member.role !== "panel") {
        violations.push(`panel member ${member.name} has wrong role ${member.role}`);
      }
    }
    const panelNames = recipe.panel.map(m => m.name);
    const uniquePanelNames = new Set(panelNames);
    if (uniquePanelNames.size !== panelNames.length) {
      const seen = new Set<string>();
      for (const name of panelNames) {
        if (seen.has(name)) {
          violations.push(`duplicate panel member ${name}`);
        }
        seen.add(name);
      }
    }
  }

  if (recipe.judge?.role !== "judge") {
    violations.push("judge has wrong role");
  }

  if (recipe.writer?.role !== "writer") {
    violations.push("writer has wrong role");
  }

  if (recipe.judge && recipe.writer && recipe.judge.name === recipe.writer.name) {
    violations.push("judge and writer must be different fighters");
  }

  if (recipe.maxRounds === undefined || recipe.maxRounds < 1) {
    violations.push("maxRounds must be >= 1");
  }

  if (!recipe.taskTypes || recipe.taskTypes.length < 1) {
    violations.push("taskTypes must have at least one entry");
  }

  if (recipe.judge?.name?.startsWith("recipe:")) {
    violations.push("judge name must not reference a nested recipe");
  }
  if (recipe.writer?.name?.startsWith("recipe:")) {
    violations.push("writer name must not reference a nested recipe");
  }
  if (recipe.panel) {
    for (const member of recipe.panel) {
      if (member.name?.startsWith("recipe:")) {
        violations.push("panel name must not reference a nested recipe");
        break; // Issue asks for message per violation type, we break to avoid duplicates
      }
    }
  }

  return violations;
}

/** Serialize a CouncilRecipe to a shareable/forkable JSON string. */
export function serializeCouncilRecipe(recipe: CouncilRecipe): string {
  return JSON.stringify(recipe, null, 2);
}
