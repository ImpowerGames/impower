import { describe, expect, it } from "vitest";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { FlowBase } from "../../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowBase";
import type { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { programListing } from "../programListing";
import { describeRoot, MAIN_URI, programCompiler } from "./programHarness";

const SHARED_URI = "inmemory:///shared.sd";

function posAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines.at(-1)!.length };
}

const quietly = <T>(run: () => T): T => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

const cold = (texts: Record<string, string>): SparkProgram =>
  quietly(() => programCompiler(texts, { seedBuiltinsIntoStory: true }).compile().program);

function session(texts: Record<string, string>) {
  const c = programCompiler(texts, { seedBuiltinsIntoStory: true });
  const compiler = c.compiler as SparkdownCompiler;
  let text = texts[MAIN_URI]!;
  let version = 1;
  let program = quietly(() => c.compile()).program;
  return {
    get text() {
      return text;
    },
    get root(): ProgramRoot {
      return program.chunks!;
    },
    edit(find: string, replace: string) {
      const offset = text.indexOf(find);
      expect(offset, `"${find}" is in the script`).toBeGreaterThanOrEqual(0);
      version += 1;
      compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version },
        contentChanges: [
          {
            range: { start: posAt(text, offset), end: posAt(text, offset + find.length) },
            text: replace,
          },
        ],
      });
      text = text.slice(0, offset) + replace + text.slice(offset + find.length);
      program = quietly(() => c.compile()).program;
      expect(describeRoot(program.chunks!), "incremental matches cold").toEqual(
        describeRoot(cold({ ...texts, [MAIN_URI]: text }).chunks!),
      );
    },
    renamedFlows(): string[] {
      const names = new Set<string>();
      for (const obj of (compiler as any)._renamedNames as ParsedObject[]) {
        let at: ParsedObject | null = obj;
        while (at && !(at instanceof FlowBase && at.parent === at.story)) {
          at = at.parent;
        }
        names.add(at?.identifier?.name ?? "");
      }
      return [...names].sort();
    },
    resolvedForRenames(): number {
      return (compiler as any)._programResolver
        .freshLastResolve()
        .filter((unit: { reason: string }) => unit.reason === "renamed").length;
    },
    emitted(): number {
      return compiler.chunkStore!.emittedLastBuild;
    },
    numbered(): string[] {
      return [...((compiler as any)._syntheticNamesLastRun as Map<string, string>).values()];
    },
  };
}

function groups(root: ProgramRoot): string[] {
  const listing = programListing(root);
  return listing.flatMap((line, i) => {
    const value = line === 'Str "group"' ? /^Str (".*")$/.exec(listing[i + 1] ?? "") : null;
    return value ? [JSON.parse(value[1]!) as string] : [];
  });
}

const SCENES = Array.from({ length: 12 }, (_, i) => `s${i + 1}`);

const scenes = (body: (name: string) => string[]) =>
  SCENES.flatMap((name) => [
    `scene ${name}`,
    `  The room ${name} is quiet.`,
    ...body(name),
    ...Array.from({ length: 4 }, (_, i) => `  Line ${i} of ${name}.`),
    "end",
    "",
  ]).join("\n");

describe("names numbered within their flow (#851)", () => {
  it("a continuation typed into one scene renames the groups of that scene only", () => {
    const s = session({
      [MAIN_URI]: scenes((name) => [`HERO: Glued in ${name} ..`, `.. carried in ${name}.`]),
    });
    const before = new Set(groups(s.root));
    s.edit("  Line 0 of s3.\n", "  Line 0 of s3.\nHERO: New glue ..\n.. new tail.\n");
    expect(s.emitted()).toBeLessThanOrEqual(2);
    const after = groups(s.root);
    const added = after.filter((group) => !before.has(group));
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((group) => group.startsWith("__group$s3$"))).toBe(true);
    s.edit("  Line 1 of s3.", "  Line 1 of s3, edited.");
    expect(s.emitted()).toBeLessThanOrEqual(2);
  });

  it("a function typed into one scene renames the names of that scene and its functions only", () => {
    const s = session({
      [MAIN_URI]: scenes((name) => [
        "  local keep = function() return 1 end",
        `  Kept {keep()} in ${name}.`,
      ]),
    });
    s.edit("  The room s3 is quiet.\n", "  The room s3 is quiet.\n  local extra = function() return 2 end\n");
    expect(s.renamedFlows().filter((name) => !name.startsWith("__synth$s3$"))).toEqual(["s3"]);
    expect(s.resolvedForRenames()).toBe(0);
    expect(s.emitted()).toBeLessThanOrEqual(2);
  });

  it("keeps names unique across scenes, the top-level content and another script of the project", () => {
    const shared = [
      "store shared_fn = function() return 3 end",
      "",
      "scene shared",
      "  local h = function() return 3 end",
      "  Got {h()}.",
      "HERO: Shared glue ..",
      ".. shared tail.",
      "end",
      "",
    ].join("\n");
    const main = [
      "store top = function() return 1 end",
      "HERO: Top glue ..",
      ".. top tail.",
      "",
      "scene first",
      "  local f = function() return 1 end",
      "  Got {f()}.",
      "HERO: First glue ..",
      ".. first tail.",
      "end",
      "",
      "scene second",
      "  local f = function() return 2 end",
      "  Got {f()}.",
      "HERO: Second glue ..",
      ".. second tail.",
      "end",
      "",
    ].join("\n");
    const s = session({ [MAIN_URI]: main, [SHARED_URI]: shared });
    const unique = () => {
      const numbered = s.numbered();
      expect(new Set(numbered).size).toBe(numbered.length);
      expect(numbered.some((name) => name.startsWith("__synth$$"))).toBe(true);
      expect(numbered.some((name) => name.startsWith("__synth$first$"))).toBe(true);
      expect(numbered.some((name) => name.startsWith("__synth$second$"))).toBe(true);
      expect(numbered.some((name) => name.startsWith("__synth$shared$"))).toBe(true);
      const names = groups(s.root);
      expect(names.filter((name) => name === "")).toEqual([]);
      expect(new Set(names.filter((name) => name.startsWith("__group$$"))).size).toBeGreaterThan(0);
      expect(names.some((name) => name.startsWith("__group$first$"))).toBe(true);
      expect(names.some((name) => name.startsWith("__group$second$"))).toBe(true);
      expect(names.some((name) => name.startsWith("__group$shared$"))).toBe(true);
    };
    unique();
    s.edit("scene first\n", "scene first\n  local g = function() return 0 end\nHERO: Early ..\n.. early.\n");
    unique();
    s.edit("store top = function() return 1 end\n", "store before = function() return 0 end\nstore top = function() return 1 end\n");
    unique();
  });
});
