// The ink LIST type is deleted (#1752): Sparkdown has no list syntax, so no
// program could make a list value, a list definition or a parsed list. No
// file under `packages/*/src` names the type's classes (`InkList` and its
// item, `ListValue`, the runtime and parsed `ListDefinition`,
// `ListDefinitionsOrigin`, `ListElementDefinition`), in code or in a
// comment, so the type does not come back piece by piece.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/** The names of the deleted type's classes, as whole words: `InkList` and
 *  every name it begins (`InkListItem`), and every name `ListDefinition`
 *  begins (`ListDefinitionsOrigin`). */
const NAMES = /\b(InkList\w*|ListValue|ListDefinition\w*|ListElementDefinition)\b/g;

/** Every `.ts`, `.mts`, `.js` and `.mjs` file under `dir`, at any depth,
 *  outside `node_modules`. */
const sourcesUnder = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => {
        if (name === "node_modules") return [];
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sourcesUnder(path);
        return /\.(m?ts|m?js)$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
      })
    : [];

/** Each name of the deleted type a file under the `src` of a package of
 *  `repo` holds, as `<file> names <name>` relative to `repo`, this file
 *  aside. */
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
  // A repository of its own, written to a temporary directory.
  const withRepo = (files: Record<string, string>): string[] => {
    const root = mkdtempSync(join(tmpdir(), "ink-list-gone-"));
    try {
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), text);
      }
      return whatRemains(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

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
