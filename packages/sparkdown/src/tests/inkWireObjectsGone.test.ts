// The ink wire objects the program engine never makes are deleted (#1753): a
// function value is a `SymbolValue`, so no file under `packages/*/src` names
// the divert-target value class (`DivertTargetValue`), in code or in a
// comment, or imports the runtime's `Path` that backed it; and the control
// commands are the five the program engine and the lowerers make. The one
// exception is the text a function value prints and keys a table under,
// which a save holds (`SymbolValue.toString`): the string literal that opens
// it, the class name followed by a parenthesis, is passed over.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { ControlCommand } from "../runtime/ControlCommand";
import { scanOf, sourcesUnder } from "./repositoryScan";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PACKAGES = "@impower/";

/** The deleted value class, as a whole word. */
const NAMES = /\b(DivertTargetValue)\b/g;

/** The saved form of a function value's text, which is not a reference to
 *  the class: the double-quoted literal of the name and an opening
 *  parenthesis. */
const SAVED_TEXT = /"DivertTargetValue\("/g;

/** The deleted module, relative to the repository. */
const PATH_MODULE = "packages/sparkdown/src/runtime/Path";

/** Every module specifier a file names, as TypeScript reads them past any
 *  comment. */
const specifiersOf = (text: string): string[] =>
  ts.preProcessFile(text, true, true).importedFiles.map((f) => f.fileName);

/** Each name of the deleted class a file under the `src` of a package of
 *  `repo` holds, as `<file> names <name>`, and each import of the deleted
 *  module, as `<file> -> <module>`, relative to `repo`, this file aside. */
const whatRemains = (repo: string): string[] => {
  const found = new Set<string>();
  const packages = join(repo, "packages");
  if (!existsSync(packages)) return [];
  for (const name of readdirSync(packages)) {
    for (const file of sourcesUnder(join(packages, name, "src"))) {
      if (file === fileURLToPath(import.meta.url)) continue;
      const at = relative(repo, file).split("\\").join("/");
      const text = readFileSync(file, "utf8");
      for (const match of text.replace(SAVED_TEXT, "").matchAll(NAMES)) {
        found.add(`${at} names ${match[1]}`);
      }
      for (const spec of specifiersOf(text)) {
        let target: string;
        if (spec.startsWith(".")) {
          target = normalize(join(dirname(file), spec));
        } else if (spec.startsWith(PACKAGES)) {
          target = normalize(join(repo, "packages", spec.slice(PACKAGES.length)));
        } else {
          continue;
        }
        const module = relative(repo, target).split("\\").join("/").replace(/\.(m?ts|m?js)$/, "");
        if (module === PATH_MODULE) found.add(`${at} -> ${module}`);
      }
    }
  }
  return [...found].sort();
};

test("no file under packages/*/src names the divert-target value class or imports the runtime's Path", () => {
  expect(whatRemains(REPO)).toEqual([]);
});

test("the control commands are the five the program engine and the lowerers make", () => {
  const members = Object.keys(ControlCommand.CommandType).filter((key) => Number.isNaN(Number(key)));
  expect(members).toEqual(["BeginString", "BeginTag", "EndTag", "BeginScope", "EndScope", "TOTAL_VALUES"]);
});

describe("the scan the check is held to", () => {
  // A repository of its own, written to a temporary directory.
  const withRepo = (files: Record<string, string>): string[] =>
    scanOf("ink-wire-objects-gone-", files, whatRemains);

  test("finds the name in an import, in code and in a comment, and an import of Path from any package", () => {
    expect(
      withRepo({
        "packages/sparkdown/src/runtime/A.ts": `import { DivertTargetValue } from "./Value";\nimport { Path } from "./Path";\n`,
        "packages/sparkdown/src/program/B.ts": `// a DivertTargetValue\nconst p = await import("../runtime/Path");\n`,
        "packages/spark-engine/src/C.ts": `import type { Path } from "@impower/sparkdown/src/runtime/Path";\nconst n = "DivertTargetValue";\n`,
      }),
    ).toEqual([
      "packages/spark-engine/src/C.ts -> packages/sparkdown/src/runtime/Path",
      "packages/spark-engine/src/C.ts names DivertTargetValue",
      "packages/sparkdown/src/program/B.ts -> packages/sparkdown/src/runtime/Path",
      "packages/sparkdown/src/program/B.ts names DivertTargetValue",
      "packages/sparkdown/src/runtime/A.ts -> packages/sparkdown/src/runtime/Path",
      "packages/sparkdown/src/runtime/A.ts names DivertTargetValue",
    ]);
  });

  test("finds the name beside the saved text, in a comment or a single-quoted string", () => {
    expect(
      withRepo({
        "packages/sparkdown/src/A.ts": `// prints as a DivertTargetValue\nconst s = "DivertTargetValue(" + label + ")";\n`,
        "packages/sparkdown/src/B.ts": `const s = 'DivertTargetValue(' + label;\n`,
      }),
    ).toEqual([
      "packages/sparkdown/src/A.ts names DivertTargetValue",
      "packages/sparkdown/src/B.ts names DivertTargetValue",
    ]);
  });

  test("passes over names that only contain it, the saved text, other Path modules and files outside src", () => {
    expect(
      withRepo({
        "packages/sparkdown/src/A.ts": `const n = "runtimeDivertTargetValue";\nconst s = "DivertTargetValue(" + label + ")";\nimport { Path } from "./compiler/typecheck/TypePath";\nimport { P } from "./inkjs/compiler/Parser/ParsedHierarchy/Path";\n`,
        "packages/sparkdown/docs/B.ts": `DivertTargetValue\n`,
      }),
    ).toEqual([]);
  });
});
