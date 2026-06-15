import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";
import { formatExpression, lowerExpressionFromText } from "./expressionSnapshot";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = join(__dirname, "__snapshots__/expression");

// Fixtures live as `.sd` source files inside `__snapshots__/expression/<category>/`
// and are paired with `<name>.snap` snapshots in the same folder. Each `.sd`
// contains a luau expression that's wrapped as `& __ = <source>` before
// parsing, so the file content is the expression itself.

interface Fixture {
  category: string;
  name: string;
  source: string;
  dir: string;
}

function loadFixtures(): Fixture[] {
  const fixtures: Fixture[] = [];
  for (const category of readdirSync(SNAPSHOTS_DIR)) {
    const categoryDir = join(SNAPSHOTS_DIR, category);
    if (!statSync(categoryDir).isDirectory()) continue;
    for (const file of readdirSync(categoryDir)) {
      if (!file.endsWith(".sd")) continue;
      fixtures.push({
        category,
        name: file.slice(0, -3),
        source: readFileSync(join(categoryDir, file), "utf8"),
        dir: categoryDir,
      });
    }
  }
  return fixtures;
}

const fixtures = loadFixtures();
const byCategory = new Map<string, Fixture[]>();
for (const fixture of fixtures) {
  const list = byCategory.get(fixture.category) ?? [];
  list.push(fixture);
  byCategory.set(fixture.category, list);
}

describe("expression snapshots", () => {
  for (const [category, list] of byCategory) {
    describe(category, () => {
      for (const fixture of list) {
        test(fixture.name, async () => {
          const expr = lowerExpressionFromText(fixture.source);
          await expect(formatExpression(expr)).toMatchFileSnapshot(
            join(fixture.dir, `${fixture.name}.snap`),
          );
        });
      }
    });
  }
});
