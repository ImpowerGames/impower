// The object-hierarchy engine is deleted (#705): nothing under
// `packages/*/src`, `vscode-sparkdown/src` or `scripts/bench` imports a
// runtime object class for code (`src/inkjs/engine`, the pointer that walked
// its containers, the activation that shared them between stories), and no
// parsed class generates runtime objects (`GenerateRuntimeObject`,
// `GenerateIntoContainer`). Each file is read for every module specifier it
// names, as TypeScript reads them past any comment, and each specifier of
// this package (relative, or `@impower/sparkdown/...`) is resolved to the
// file it names.
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
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vitest";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PACKAGES = "@impower/";

/** The modules of the deleted engine, relative to the repository. */
const DELETED = [
  /^packages\/sparkdown\/src\/inkjs\/engine(\/|$)/,
  /^packages\/sparkdown\/src\/runtime\/Pointer$/,
  /^packages\/sparkdown\/src\/runtime\/StoryActivation$/,
];

/** The members that generated runtime objects. */
const GENERATION = /\b(GenerateRuntimeObject|GenerateIntoContainer)\b/;

/** Every module specifier a file names, as TypeScript reads them past any
 *  comment: `import ... from`, `export ... from`, a side-effect
 *  `import "..."`, `import type`, and `import("...")`. */
const specifiersOf = (text: string): string[] =>
  ts.preProcessFile(text, true, true).importedFiles.map((f) => f.fileName);

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

/** The roots the check reads, under `repo`. */
const rootsOf = (repo: string): string[] => [
  ...(existsSync(join(repo, "packages"))
    ? readdirSync(join(repo, "packages")).map((name) => join(repo, "packages", name, "src"))
    : []),
  join(repo, "vscode-sparkdown", "src"),
  join(repo, "scripts", "bench"),
];

/**
 * Each import of a deleted module, as `<file> -> <module>` relative to
 * `repo` (a relative specifier resolved from the importing file, and a
 * package specifier `@impower/<name>/...` from `packages/<name>`), and each
 * file that names a generating member, as `<file> names <member>`.
 */
const whatRemains = (repo: string): string[] => {
  const found = new Set<string>();
  for (const root of rootsOf(repo)) {
    for (const file of sourcesUnder(root)) {
      const text = readFileSync(file, "utf8");
      const at = relative(repo, file).split("\\").join("/");
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
        if (DELETED.some((re) => re.test(module))) found.add(`${at} -> ${module}`);
      }
      const member = GENERATION.exec(text);
      if (member && file !== fileURLToPath(import.meta.url)) found.add(`${at} names ${member[1]}`);
    }
  }
  return [...found].sort();
};

test("nothing imports the object-hierarchy engine or generates runtime objects", () => {
  expect(whatRemains(REPO)).toEqual([]);
});

describe("the scan the check is held to", () => {
  // A repository of its own, written to a temporary directory, with each way
  // a file can name a module of the deleted engine.
  const withRepo = (files: Record<string, string>): string[] => {
    const root = mkdtempSync(join(tmpdir(), "object-engine-gone-"));
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

  test("finds a relative import, an export from and a dynamic import", () => {
    expect(
      withRepo({
        "packages/sparkdown/src/program/A.ts": `import { X } from "../inkjs/engine/Story";\nexport { Y } from "../inkjs/engine/Container";\nconst z = await import("../runtime/Pointer");\n`,
      }),
    ).toEqual([
      "packages/sparkdown/src/program/A.ts -> packages/sparkdown/src/inkjs/engine/Container",
      "packages/sparkdown/src/program/A.ts -> packages/sparkdown/src/inkjs/engine/Story",
      "packages/sparkdown/src/program/A.ts -> packages/sparkdown/src/runtime/Pointer",
    ]);
  });

  test("finds an import with a comment where the specifier stands, and a side-effect import", () => {
    expect(
      withRepo({
        "packages/sparkdown/src/A.ts": `import /* hierarchy */ "./inkjs/engine/Container";\nimport { Y } from /* y */ "./runtime/StoryActivation";\n`,
      }),
    ).toEqual([
      "packages/sparkdown/src/A.ts -> packages/sparkdown/src/inkjs/engine/Container",
      "packages/sparkdown/src/A.ts -> packages/sparkdown/src/runtime/StoryActivation",
    ]);
  });

  test("finds a package specifier from another package, the extension and the benchmarks", () => {
    expect(
      withRepo({
        "packages/spark-engine/src/Game.ts": `import { Story } from "@impower/sparkdown/src/inkjs/engine/Story";\n`,
        "vscode-sparkdown/src/view.ts": `import "@impower/sparkdown/src/inkjs/engine/Container";\n`,
        "scripts/bench/bench.ts": `import { Story } from "../../packages/sparkdown/src/inkjs/engine/Story.ts";\n`,
      }),
    ).toEqual([
      "packages/spark-engine/src/Game.ts -> packages/sparkdown/src/inkjs/engine/Story",
      "scripts/bench/bench.ts -> packages/sparkdown/src/inkjs/engine/Story",
      "vscode-sparkdown/src/view.ts -> packages/sparkdown/src/inkjs/engine/Container",
    ]);
  });

  test("finds a member that generates runtime objects", () => {
    expect(
      withRepo({
        "packages/sparkdown/src/Text.ts": `class Text { GenerateRuntimeObject() { return null; } }\n`,
      }),
    ).toEqual(["packages/sparkdown/src/Text.ts names GenerateRuntimeObject"]);
  });

  test("passes over the value layer, other modules and other packages", () => {
    expect(
      withRepo({
        "packages/sparkdown/src/program/A.ts": `import { B } from "../runtime/Value";\nimport { C } from "@impower/sparkdown/src/runtime/CallStack";\nimport { expect } from "vitest";\n`,
      }),
    ).toEqual([]);
  });
});
