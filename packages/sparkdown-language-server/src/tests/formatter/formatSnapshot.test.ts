import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

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
          const reformatted = formatSource(formatted);
          expect(reformatted).toBe(formatted);
        });
      }
    });
  }
});
