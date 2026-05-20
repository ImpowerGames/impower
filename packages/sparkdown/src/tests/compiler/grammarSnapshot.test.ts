import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";
import { dumpTree, stripAnsi } from "./grammarSnapshot";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = join(__dirname, "__snapshots__/grammar");

// Fixtures live as `.sd` source files inside `__snapshots__/grammar/<category>/`
// and are paired with `<name>.snap` snapshots in the same folder. Adding a
// fixture is as simple as dropping a new `.sd` file in the appropriate
// category folder — no JS array maintenance.

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

describe("grammar snapshots", () => {
  for (const [category, list] of byCategory) {
    describe(category, () => {
      for (const fixture of list) {
        test(fixture.name, async () => {
          const tree = stripAnsi(dumpTree(fixture.source));
          await expect(tree).toMatchFileSnapshot(
            join(fixture.dir, `${fixture.name}.snap`),
          );
          // The parser silently closes EOF-truncated scopes and only
          // emits an `ERROR_INCOMPLETE` node when a rule's `end:`
          // pattern fails mid-content (real grammar bug, not just EOF
          // running out of source). Assert here so any new fixture
          // that accidentally introduces such a failure fails the
          // test loudly — without relying on a developer reading the
          // snapshot diff to spot the added node.
          expect(
            tree,
            `Fixture ${fixture.category}/${fixture.name}: tree contains \`ERROR_INCOMPLETE\` — a Scoped rule's \`end:\` pattern failed mid-content. See docs/compiler/GRAMMAR.md.`,
          ).not.toContain("ERROR_INCOMPLETE");
        });
      }
    });
  }
});
