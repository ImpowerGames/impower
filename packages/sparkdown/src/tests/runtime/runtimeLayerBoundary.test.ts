// The runtime layer (`src/runtime`) is what the binary program's engine keeps
// once #705 deletes the object-hierarchy engine (`src/inkjs/engine`). Until
// then a few of its files still import that hierarchy: each such import is
// listed here, and the test fails on one that is not listed, so that the
// layer takes on no new dependency on what the deletion removes, and on a
// listed one that is gone, so that the list shrinks with the work. The
// deletion ends with the list empty.
import {
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
import { describe, expect, test } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKAGE = "@impower/sparkdown/";

/** Each file of the layer, and each module outside the layer it imports. */
const LEAVING = [
  "CallStack.ts -> inkjs/engine/Story",
  "InkList.ts -> inkjs/engine/Story",
  "JsonSerialisation.ts -> inkjs/engine/ChoicePoint",
  "JsonSerialisation.ts -> inkjs/engine/Container",
  "JsonSerialisation.ts -> inkjs/engine/ControlCommand",
  "JsonSerialisation.ts -> inkjs/engine/Divert",
  "JsonSerialisation.ts -> inkjs/engine/VariableReference",
  "Object.ts -> inkjs/engine/Container",
  "Object.ts -> inkjs/engine/SearchResult",
  "Pointer.ts -> inkjs/engine/Container",
  "StdLib.ts -> inkjs/engine/ControlCommand",
  "evaluation.ts -> inkjs/engine/ControlCommand",
  "outputWhitespace.ts -> inkjs/engine/ControlCommand",
];

// Every module specifier a file names: `import ... from`, `export ... from`,
// a side-effect `import "..."`, and `import("...")`, `typeof import(...)`
// included.
const SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*["']([^"'\n]+)["']/g;

/** Every `.ts` file under `dir`, at any depth. */
const sourcesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourcesUnder(path);
    return name.endsWith(".ts") ? [path] : [];
  });

/**
 * Each import of a file under `layer` that resolves outside `layer`, as
 * `<file, relative to layer> -> <module, relative to src>`: a relative
 * specifier resolved from the importing file, and a specifier of the package
 * itself (`@impower/sparkdown/src/...`) resolved from `packageRoot`. Other
 * packages' modules (`vitest`, `node:fs`) are no part of the hierarchy.
 */
const importsLeaving = (
  layer: string,
  src: string,
  packageRoot: string,
): string[] => {
  const leaving = new Set<string>();
  for (const file of sourcesUnder(layer)) {
    const text = readFileSync(file, "utf8");
    for (const [, spec] of text.matchAll(SPECIFIER)) {
      let target: string;
      if (spec!.startsWith(".")) {
        target = normalize(join(dirname(file), spec!));
      } else if (spec!.startsWith(PACKAGE)) {
        target = normalize(join(packageRoot, spec!.slice(PACKAGE.length)));
      } else {
        continue;
      }
      if (!relative(layer, target).startsWith("..")) continue;
      const from = relative(layer, file).split("\\").join("/");
      const to = relative(src, target).split("\\").join("/");
      leaving.add(`${from} -> ${to}`);
    }
  }
  return [...leaving].sort();
};

test("the runtime layer imports nothing outside it but what the deletion removes", () => {
  expect(importsLeaving(join(SRC, "runtime"), SRC, join(SRC, ".."))).toEqual(
    [...LEAVING].sort(),
  );
});

describe("the scan the list is held to", () => {
  // A layer of its own, written to a temporary directory, with each way a
  // file can name a module outside it.
  const withLayer = (files: Record<string, string>): string[] => {
    const root = mkdtempSync(join(tmpdir(), "runtime-boundary-"));
    try {
      const src = join(root, "src");
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(src, path)), { recursive: true });
        writeFileSync(join(src, path), text);
      }
      return importsLeaving(join(src, "runtime"), src, root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  test("finds a relative import, an export from and a dynamic import", () => {
    expect(
      withLayer({
        "runtime/A.ts": `import { X } from "../inkjs/engine/X";\nexport { Y } from "../inkjs/engine/Y";\nconst z = await import("../inkjs/engine/Z");\n`,
      }),
    ).toEqual([
      "A.ts -> inkjs/engine/X",
      "A.ts -> inkjs/engine/Y",
      "A.ts -> inkjs/engine/Z",
    ]);
  });

  test("finds the package's own specifier", () => {
    expect(
      withLayer({
        "runtime/Void.ts": `import "@impower/sparkdown/src/inkjs/engine/Flow";\n`,
      }),
    ).toEqual(["Void.ts -> inkjs/engine/Flow"]);
  });

  test("finds an import of a file nested in the layer, resolved from that file", () => {
    expect(
      withLayer({
        "runtime/A.ts": `import "./helpers/probe";\n`,
        "runtime/helpers/probe.ts": `import "../../inkjs/engine/Flow";\n`,
      }),
    ).toEqual(["helpers/probe.ts -> inkjs/engine/Flow"]);
  });

  test("passes over imports inside the layer and of other packages", () => {
    expect(
      withLayer({
        "runtime/A.ts": `import { B } from "./B";\nimport { C } from "@impower/sparkdown/src/runtime/C";\nimport { expect } from "vitest";\n`,
      }),
    ).toEqual([]);
  });
});
