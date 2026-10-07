// The program path resolves references with a resolver of its own (#1607;
// docs/engine/binary-program.md, sections 1 and 2): with statement chunks on,
// a compile neither exports the runtime story nor runs its whole-story
// `ResolveReferences`. The resolver resolves the statements the incremental
// parse lowered anew and the carried statements a name they read changed
// for, and reports again, without visiting them, what every other statement
// reported. These tests count what it visited (`ProgramResolver.passesLastResolve`,
// `visitedLastResolve`), spy on the passes it replaces, and compare its
// diagnostics with a cold compile's.
import "../../inkjs/engine/Container";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildBeatsFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Story } from "../../inkjs/compiler/Parser/ParsedHierarchy/Story";
import { ProgramResolver } from "../../program/ProgramResolver";
import { describeRoot, MAIN_URI, programCompiler } from "./programHarness";

const CHARACTERS = "inmemory:///scripts/characters.sd";

beforeAll(() => {
  ProgramResolver.traceVisits = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function posAt(text: string, offset: number) {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
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

/** A compiler over `texts` with statement chunks on and the language
 *  server's configuration otherwise, and an editor of its main script that
 *  compiles after each edit. */
function session(texts: Record<string, string>, config = {}) {
  const c = programCompiler(texts, { programChunks: true, ...config });
  let text = texts[MAIN_URI]!;
  let version = 1;
  let program = quietly(() => c.compile().program);
  return {
    compiler: c.compiler as SparkdownCompiler,
    get program(): SparkProgram {
      return program;
    },
    get text() {
      return text;
    },
    get resolver(): ProgramResolver {
      return (c.compiler as any).programResolver;
    },
    /** Replaces the first `find` at or after `from` with `replace`. */
    edit(find: string, replace: string, from = 0): SparkProgram {
      const offset = text.indexOf(find, from);
      expect(offset, `"${find}" is in the script`).toBeGreaterThanOrEqual(0);
      version += 1;
      c.compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version },
        contentChanges: [
          {
            range: { start: posAt(text, offset), end: posAt(text, offset + find.length) },
            text: replace,
          },
        ],
      });
      text = text.slice(0, offset) + replace + text.slice(offset + find.length);
      program = quietly(() => c.compile().program);
      return program;
    },
  };
}

const cold = (texts: Record<string, string>, config = {}): SparkProgram =>
  quietly(() => programCompiler(texts, { programChunks: true, ...config }).compile().program);

/** Every diagnostic of a program, by script, in the order it was reported. */
const diagnostics = (program: SparkProgram): string[] =>
  Object.keys(program.diagnostics ?? {})
    .sort()
    .flatMap((uri) =>
      (program.diagnostics![uri] ?? []).map((d: any) => {
        const message = typeof d.message === "string" ? d.message : d.message?.value;
        const r = d.range;
        return `${uri} ${r.start.line}:${r.start.character}-${r.end.line}:${r.end.character} ${d.severity} ${message}`;
      }),
    );

// The beats fixture's scene, 2,000 lines of display beats, ending in a
// `choose` block whose `then` clause holds the scene's last lines.
const flatScene = () => {
  const { files } = buildBeatsFixture({ lines: 2000 });
  const main = files.get("main.sd")!;
  const end = main.lastIndexOf("\nend\n");
  const clause = Array.from({ length: 40 }, (_, i) => `    The clause runs on, line ${i}.`);
  return {
    [MAIN_URI]:
      main.slice(0, end) +
      [
        "",
        "  choose",
        "    + [Go on]",
        "      You go on.",
        "    + [Stay]",
        "      You stay.",
        "  then",
        ...clause,
        "  end",
      ].join("\n") +
      main.slice(end),
    [CHARACTERS]: files.get("scripts/characters.sd")!,
  };
};

/** The statements whose parsed objects the last resolve generated or
 *  resolved, by the unit each object stands in. */
const visitedUnits = (resolver: ProgramResolver): Set<object> => {
  const units = new Set<object>();
  for (const obj of resolver.visitedLastResolve) {
    const unit = resolver.unitOf(obj);
    expect(unit, `${obj.typeName} stands in a statement`).toBeDefined();
    units.add(unit!);
  }
  return units;
};

/** That the last resolve generated and resolved only the statements the
 *  incremental parse lowered anew, at most `most` of them, and visited no
 *  object of any other statement. */
const resolvedOnlyLoweredAnew = (resolver: ProgramResolver, most: number) => {
  const fresh = resolver.freshLastResolve();
  expect(fresh.map((u) => u.reason)).toEqual(fresh.map(() => "new"));
  expect(fresh.length).toBeGreaterThan(0);
  expect(fresh.length).toBeLessThanOrEqual(most);
  const keys = new Set(fresh.map((u) => u.key));
  for (const unit of visitedUnits(resolver)) {
    expect(keys.has(unit), "a visited object stands in a statement lowered anew").toBe(true);
  }
  const passes = resolver.passesLastResolve;
  expect(passes.cold).toBe(false);
  expect(passes.invalidated).toBe(0);
  expect(passes.changedNames).toBe(0);
  expect(passes.replayed).toBe(passes.units - fresh.length);
};

describe("a compile with statement chunks on", () => {
  it("calls neither ExportRuntime nor ResolveReferences, and a program that falls back calls both", () => {
    // The builtins prelude's context is compiled once per process, by a
    // compiler of its own with statement chunks off.
    cold({ [MAIN_URI]: "Line.\n" });
    const exportRuntime = vi.spyOn(Story.prototype, "ExportRuntime");
    const resolve = vi.spyOn(ParsedObject.prototype, "ResolveReferences");
    const s = session(flatScene());
    expect(s.program.chunks).toBeDefined();
    s.edit("The clause runs on, line 27.", "The clause runs on, line 27, slowly.");
    expect(s.program.chunks).toBeDefined();
    expect(exportRuntime).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    // An external function makes the program fall back, and the current
    // engine's story is exported for it.
    const fallback = cold({ [MAIN_URI]: "external ext(a)\nscene MAIN\n  ~ ext(1)\n  Line.\nend\n" });
    expect(fallback.chunks).toBeUndefined();
    expect(fallback.fallback?.construct).toBe("external");
    expect(exportRuntime).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalled();
  });
});

describe("an edit inside one beat", () => {
  it("of a flat 2,000-line scene resolves that statement and visits no object of another", () => {
    const s = session(flatScene());
    const lines = s.text.split("\n");
    expect(s.resolver.passesLastResolve.cold).toBe(true);
    const total = s.resolver.passesLastResolve.units;
    expect(total).toBeGreaterThan(500);
    // Lines of dialogue and action well inside the flat part of the scene.
    const targets = [40, 700, 1500].map((at) =>
      lines.findIndex((l, i) => i >= at && /^ {4}\S/.test(l)),
    );
    for (const target of targets) {
      const line = s.text.split("\n")[target]!;
      const from = s.text.split("\n").slice(0, target).join("\n").length;
      s.edit(line, `${line} Still.`, from);
      // The edited statement, and the neighbours the incremental parse
      // lowered anew with it.
      resolvedOnlyLoweredAnew(s.resolver, 3);
      const passes = s.resolver.passesLastResolve;
      expect(passes.generated + passes.resolved).toBeLessThan(60);
      expect(diagnostics(s.program)).toEqual(
        diagnostics(cold({ [MAIN_URI]: s.text, [CHARACTERS]: flatScene()[CHARACTERS]! })),
      );
    }
  });

  it("of the `then` clause at its bottom resolves that block alone", () => {
    const s = session(flatScene());
    s.edit("The clause runs on, line 27.", "The clause runs on, line 27, slowly.");
    // The `choose` block, which the incremental parse lowered again whole
    // (#656), and the line before it.
    resolvedOnlyLoweredAnew(s.resolver, 2);
    const passes = s.resolver.passesLastResolve;
    expect(passes.generated + passes.resolved).toBeLessThan(passes.units);
  });
});

describe("a statement the resolver kept resolved", () => {
  it("keeps its divert's target when another compiler resolves between two compiles", () => {
    const text = [
      "store acc = { n = 0, add = function(self, n) return self end }",
      "",
      ...Array.from({ length: 10 }, (_, i) => [`scene S${i}`, `  Line one of S${i}.`, `  Line two of S${i}.`, "end", ""]).flat(),
    ].join("\n");
    const s = session({ [MAIN_URI]: text });
    // A cold compile of another compiler resolves the whole of its story in
    // an epoch of its own.
    cold({ [MAIN_URI]: "scene OTHER\n  Elsewhere.\nend\n" });
    s.edit("Line two of S8.", "Line two of S8, still.");
    const passes = s.resolver.passesLastResolve;
    expect(passes.cold).toBe(false);
    expect(passes.fresh, JSON.stringify(passes)).toBeLessThan(passes.units / 2);
    // The store's function is a block of its chunk, which a cold compile of
    // the same text finds through the divert to the function.
    expect(describeRoot(s.program.chunks!)).toEqual(
      describeRoot(cold({ [MAIN_URI]: s.text }).chunks!),
    );
  });

  it("keeps back a diagnostic of a source an earlier statement reported, as a cold compile does", () => {
    // Each local named like the global collides with it, and the story
    // reports one error per source, the global's name: the first local's
    // (with the top-level local's own, as a duplicate declaration).
    const text = [
      "store tally = 1",
      "local tally = 0",
      "",
      ...Array.from({ length: 10 }, (_, i) => [`scene S${i}`, `  Line of S${i}.`, "end", ""]).flat(),
      "function later()",
      "  local tally = 2",
      "  return tally",
      "end",
      "",
      "scene MAIN",
      "  Line.",
      "end",
      "",
    ].join("\n");
    const s = session({ [MAIN_URI]: text });
    const collisions = (program: SparkProgram) =>
      diagnostics(program).filter((d) => d.includes("Duplicate identifier `tally`"));
    expect(collisions(s.program)).toHaveLength(2);
    // The function is resolved anew, after the first local's statement is
    // replayed.
    s.edit("  return tally", "  return tally + 1");
    expect(s.resolver.passesLastResolve.cold).toBe(false);
    expect(s.resolver.passesLastResolve.replayed).toBeGreaterThan(0);
    expect(diagnostics(s.program)).toEqual(diagnostics(cold({ [MAIN_URI]: s.text })));
    expect(collisions(s.program)).toHaveLength(2);
  });

  it("reports where it stands now a line removed above it moves it", () => {
    // A divert has no position of its own, and reports a missing target at
    // a position the report makes from its target's names.
    const text = [
      "scene TOP",
      "  Line one of TOP.",
      "  Line two of TOP.",
      "end",
      "",
      "scene MAIN",
      "  -> MISSING",
      "end",
      "",
      ...Array.from({ length: 10 }, (_, i) => [`scene S${i}`, `  Line of S${i}.`, "end", ""]).flat(),
    ].join("\n");
    const s = session({ [MAIN_URI]: text });
    const missing = (program: SparkProgram) =>
      diagnostics(program).filter((d) => d.includes("MISSING"));
    expect(missing(s.program)).toHaveLength(1);
    s.edit("  Line two of TOP.\n", "");
    expect(s.resolver.passesLastResolve.cold).toBe(false);
    expect(missing(s.program)).toEqual(missing(cold({ [MAIN_URI]: s.text })));
    expect(missing(s.program)[0]).toContain(`${MAIN_URI} 5:`);
  });
});

describe("a naming collision", () => {
  const text = [
    "scene MAIN",
    "  -> TARGET",
    "end",
    "",
    ...Array.from({ length: 30 }, (_, i) => [`scene S${i}`, `  Line of S${i}.`, "end", ""]).flat(),
    "scene TARGET",
    "  Arrived.",
    "end",
    "",
  ].join("\n");
  const collisions = (program: SparkProgram) =>
    diagnostics(program).filter((d) => d.includes("Duplicate identifier"));

  it("is found through the symbol table, keeps both places, and clears when the declaration goes", () => {
    const s = session({ [MAIN_URI]: text });
    expect(collisions(s.program)).toEqual([]);
    s.edit("scene MAIN", "store TARGET = 1\nscene MAIN");
    const reported = collisions(s.program);
    expect(reported).toHaveLength(1);
    // The diagnostic stands at the scene's name and names the declaration's
    // line.
    const sceneLine = s.text.split("\n").indexOf("scene TARGET");
    expect(reported[0]).toContain(`${MAIN_URI} ${sceneLine}:`);
    expect(reported[0]).toContain("line 1 of");
    expect(diagnostics(s.program)).toEqual(diagnostics(cold({ [MAIN_URI]: s.text })));
    // The declaration and the statements that read the name, and no other.
    expect(s.resolver.passesLastResolve.fresh + s.resolver.passesLastResolve.invalidated).toBeLessThanOrEqual(4);
    // A line inserted above both moves both places.
    s.edit("store TARGET = 1", "// a comment\nstore TARGET = 1");
    expect(collisions(s.program)).toHaveLength(1);
    expect(diagnostics(s.program)).toEqual(diagnostics(cold({ [MAIN_URI]: s.text })));
    s.edit("store TARGET = 1\n", "");
    expect(collisions(s.program)).toEqual([]);
    expect(diagnostics(s.program)).toEqual(diagnostics(cold({ [MAIN_URI]: s.text })));
    expect(s.resolver.passesLastResolve.fresh + s.resolver.passesLastResolve.invalidated).toBeLessThanOrEqual(4);
  });
});
