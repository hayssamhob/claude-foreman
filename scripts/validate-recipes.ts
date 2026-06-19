import fs from "fs";
import path from "path";

function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, body: content };

  const fmText = match[1];
  const body = match[2];
  const data: Record<string, string> = {};

  for (const line of fmText.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    } else if (val.startsWith("'") && val.endsWith("'")) {
      val = val.slice(1, -1);
    }
    data[key] = val;
  }

  return { data, body };
}

function main() {
  const recipesDir = path.join(process.cwd(), "recipes");
  if (!fs.existsSync(recipesDir)) {
    console.error("recipes/ directory not found");
    process.exit(1);
  }

  const files = fs.readdirSync(recipesDir).filter((f) => f.endsWith(".md"));
  let hasErrors = false;

  for (const file of files) {
    const fullPath = path.join(recipesDir, file);
    const content = fs.readFileSync(fullPath, "utf8");
    const basename = path.basename(file, ".md");

    const { data, body } = parseFrontmatter(content);
    const errors: string[] = [];

    if (!data.name) {
      errors.push("Missing 'name' in frontmatter");
    } else if (data.name !== basename) {
      errors.push(`'name' in frontmatter ("${data.name}") does not match filename "${basename}"`);
    }

    if (!data.description) {
      errors.push("Missing 'description' in frontmatter");
    }

    if (!data.costTier) {
      errors.push("Missing 'costTier' in frontmatter (e.g. 'fly', 'low', 'middle', 'heavy')");
    }

    // Validate body structure: must have at least one top level heading
    if (!/^#\s+.+/m.test(body)) {
      errors.push("Missing top-level heading (# Name) in body");
    }

    if (errors.length > 0) {
      hasErrors = true;
      console.error(`❌ Validation failed for ${file}:`);
      for (const err of errors) {
        console.error(`   - ${err}`);
      }
    } else {
      console.log(`✅ Validated ${file}`);
    }
  }

  if (hasErrors) {
    process.exit(1);
  }
  console.log("All recipes validated successfully!");
}

main();
