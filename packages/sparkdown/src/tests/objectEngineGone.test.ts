import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { scanOf, sourcesUnder } from "./repositoryScan";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PACKAGES = "@impower/";

const DELETED = [
  /^packages\/sparkdown\/src\/inkjs\/engine(\/|$)/,
  /^packages\/sparkdown\/src\/runtime\/Pointer$/,
  /^packages\/sparkdown\/src\/runtime\/StoryActivation$/,
];

const GENERATION = /\b(GenerateRuntimeObject|GenerateIntoContainer)\b/;

const specifiersOf = (text: string): string[] =>
  ts.preProcessFile(text, true, true).importedFiles.map((f) => f.fileName);

const rootsOf = (repo: string): string[] => [
  ...(existsSync(join(repo, "packages"))
    ? readdirSync(join(repo, "packages")).map((name) => join(repo, "packages", name, "src"))
    : []),
  join(repo, "vscode-sparkdown", "src"),
  join(repo, "scripts", "bench"),
];

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
  const withRepo = (files: Record<string, string>): string[] =>
    scanOf("object-engine-gone-", files, whatRemains);

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
