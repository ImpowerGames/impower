import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";
import { formatTokens, tokenize } from "./vscodeGrammarSnapshot";

// VSCode uses vscode-textmate + vscode-oniguruma. The textmate-grammar-tree
// library used by `grammarSnapshot.test.ts` is a re-implementation of TextMate
// in TypeScript — close but not identical. Some grammar bugs only surface
// under the real engine (see the bug where `LuauTypeLiteral`'s `end` pattern
// didn't stop before `)`, leaving `LuauFunctionParameters` open across every
// subsequent line).
//
// This test reuses the same `.sd` source fixtures as the tree-based snapshot
// test and produces a parallel `<name>.vsc.snap` containing the token/scope
// stream the actual TextMate engine emits. The two snapshots together cover
// both "is the structural tree right?" and "will VSCode highlight it right?".

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = join(__dirname, "__snapshots__/grammar");

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

describe("vscode grammar snapshots", () => {
  for (const [category, list] of byCategory) {
    describe(category, () => {
      for (const fixture of list) {
        test(fixture.name, async () => {
          const dumps = await tokenize(fixture.source);
          const formatted = formatTokens(dumps);
          await expect(formatted).toMatchFileSnapshot(
            join(fixture.dir, `${fixture.name}.vsc.snap`),
          );
        });
      }
    });
  }
});
