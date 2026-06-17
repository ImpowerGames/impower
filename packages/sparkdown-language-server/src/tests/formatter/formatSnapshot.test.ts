import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

// Fixtures live as `.sd` source files inside
// `__snapshots__/format/<category>/`. The formatter runs over each
// fixture and the result is snapshotted to a sibling
// `<name>.formatted.sd` file. Adding a fixture is just dropping a new
// `.sd` file in a category folder — the loader picks it up.
//
// To inspect what changed: open the `.sd` and the `.formatted.sd`
// side-by-side. The expectation is committed; reviewing the diff on a
// `.formatted.sd` is how you confirm a formatter change is intentional.

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = join(__dirname, "__snapshots__/format");

interface Fixture {
  category: string;
  name: string;
  source: string;
  dir: string;
}

function loadFixtures(): Fixture[] {
  const fixtures: Fixture[] = [];
  let categories: string[] = [];
  try {
    categories = readdirSync(SNAPSHOTS_DIR);
  } catch {
    return fixtures;
  }
  for (const category of categories) {
    const categoryDir = join(SNAPSHOTS_DIR, category);
    if (!statSync(categoryDir).isDirectory()) continue;
    for (const file of readdirSync(categoryDir)) {
      if (!file.endsWith(".sd") || file.endsWith(".formatted.sd")) continue;
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

// Variant fixtures share a base name with a canonical fixture but
// have one of these suffixes. They're expected to format to *the
// same* output as the canonical — they exist to stress-test that
// the formatter normalizes back to one shape regardless of how
// "messy" or "tight" the source is. Add suffixes here to register
// new variant kinds.
const VARIANT_SUFFIXES = ["-messy", "-tight"];

describe("format snapshots", () => {
  for (const [category, list] of byCategory) {
    describe(category, () => {
      for (const fixture of list) {
        test(fixture.name, async () => {
          const formatted = formatSource(fixture.source);
          await expect(formatted).toMatchFileSnapshot(
            join(fixture.dir, `${fixture.name}.formatted.sd`),
          );
          // Variant cross-check: if this fixture is a variant, its
          // formatted output must match the canonical's formatted
          // output exactly. That's the actual assertion variants
          // exist for — the snapshot alone could drift in lockstep
          // and hide a real bug.
          for (const suffix of VARIANT_SUFFIXES) {
            if (!fixture.name.endsWith(suffix)) continue;
            const canonicalName = fixture.name.slice(0, -suffix.length);
            const canonical = list.find((f) => f.name === canonicalName);
            if (!canonical) break;
            const canonicalFormatted = formatSource(canonical.source);
            expect(
              formatted,
              `${fixture.name} should format identically to ${canonicalName}`,
            ).toBe(canonicalFormatted);
            break;
          }
          // Idempotency: formatting an already-formatted file must
          // be a no-op. Two passes that disagree are almost always a
          // bug (an edit that shifts a position the second pass then
          // tries to re-normalize). Catching it via the snapshot
          // suite is much faster than hunting it in the editor.
          const reformatted = formatSource(formatted);
          expect(reformatted).toBe(formatted);
        });
      }
    });
  }
});
