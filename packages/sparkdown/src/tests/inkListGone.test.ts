import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { scanOf, sourcesUnder } from "./repositoryScan";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const NAMES = /\b(InkList\w*|ListValue|ListDefinition\w*|ListElementDefinition)\b/g;

const whatRemains = (repo: string): string[] => {
  const found = new Set<string>();
  const packages = join(repo, "packages");
  if (!existsSync(packages)) return [];
  for (const name of readdirSync(packages)) {
    for (const file of sourcesUnder(join(packages, name, "src"))) {
      if (file === fileURLToPath(import.meta.url)) continue;
      const at = relative(repo, file).split("\\").join("/");
      for (const match of readFileSync(file, "utf8").matchAll(NAMES)) {
        found.add(`${at} names ${match[1]}`);
      }
    }
  }
  return [...found].sort();
};

test("no file under packages/*/src names the ink LIST type", () => {
  expect(whatRemains(REPO)).toEqual([]);
});

describe("the scan the check is held to", () => {
  const withRepo = (files: Record<string, string>): string[] =>
    scanOf("ink-list-gone-", files, whatRemains);

  test("finds each name, in an import, in code and in a comment, in any package", () => {
    expect(
      withRepo({
        "packages/sparkdown/src/runtime/A.ts": `import { InkList, InkListItem } from "./InkList";\n// a ListValue\n`,
        "packages/sparkdown/src/program/B.ts": `const o: ListDefinitionsOrigin | null = null;\nif (x instanceof ListDefinition) {}\n`,
        "packages/spark-engine/src/C.ts": `type T = ListElementDefinition;\n`,
      }),
    ).toEqual([
      "packages/spark-engine/src/C.ts names ListElementDefinition",
      "packages/sparkdown/src/program/B.ts names ListDefinition",
      "packages/sparkdown/src/program/B.ts names ListDefinitionsOrigin",
      "packages/sparkdown/src/runtime/A.ts names InkList",
      "packages/sparkdown/src/runtime/A.ts names InkListItem",
      "packages/sparkdown/src/runtime/A.ts names ListValue",
    ]);
  });

  test("passes over names that only contain one, and files outside src", () => {
    expect(
      withRepo({
        "packages/sparkdown/src/A.ts": `const n = "LuauStructListValue";\nconst listDefinitions = 1;\n`,
        "packages/sparkdown/docs/B.ts": `InkList\n`,
      }),
    ).toEqual([]);
  });
});
