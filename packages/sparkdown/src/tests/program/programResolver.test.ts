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
import { parsedChildren, ProgramResolver } from "../../program/ProgramResolver";
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
  const c = programCompiler(texts, { ...config });
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
  quietly(() => programCompiler(texts, { ...config }).compile().program);

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

/** The statements whose parsed objects the last resolve generated or
 *  resolved outside any statement's generation and resolution: an object
 *  the story adds itself stands in none. */
const visitedOutsideUnits = (resolver: ProgramResolver): Set<object> => {
  const units = new Set<object>();
  for (const obj of resolver.visitedOutsideLastResolve ?? []) {
    const unit = resolver.unitOf(obj);
    if (unit) {
      units.add(unit);
    }
  }
  return units;
};

/** That the last resolve visited no object of a statement it did not
 *  generate and resolve anew, inside any statement's resolution or
 *  outside. */
const visitedOnlyFresh = (resolver: ProgramResolver) => {
  const keys = new Set(resolver.freshLastResolve().map((u) => u.key));
  for (const unit of visitedUnits(resolver)) {
    expect(keys.has(unit), "a visited object stands in a statement resolved anew").toBe(true);
  }
  for (const unit of visitedOutsideUnits(resolver)) {
    expect(keys.has(unit), "an object visited outside any statement's resolution stands in a statement resolved anew").toBe(true);
  }
};

/** Runs `run` (an edit, which compiles), and returns where the resolve it
 *  makes read what any statement it carried holds: every read of the
 *  `content` of a parsed object under a statement the resolve did not
 *  generate and resolve anew, by the object's type and the calls that read
 *  it. A walk of a subtree (`FindAll`, `Find`, `CollectByType`, a resolution
 *  or a generation) reads it. */
const carriedSubtreeReads = (s: ReturnType<typeof session>, run: () => void): string[] => {
  const resolver = s.resolver;
  let armed = false;
  const reads: { key: object; what: string }[] = [];
  const seen = new Set<ParsedObject>();
  const watch = (key: object, obj: ParsedObject) => {
    if (seen.has(obj)) {
      return;
    }
    seen.add(obj);
    const children = parsedChildren(obj);
    let content = obj.content;
    Object.defineProperty(obj, "content", {
      configurable: true,
      get() {
        if (armed) {
          const calls = (new Error().stack ?? "")
            .split("\n")
            .slice(2, 7)
            .map((line) => line.trim().replace(/^at /, "").replace(/ \(.*$/, ""))
            .join(" < ");
          reads.push({ key, what: `${obj.typeName}: ${calls}` });
        }
        return content;
      },
      set(value) {
        content = value;
      },
    });
    for (const child of children) {
      watch(key, child);
    }
  };
  for (const unit of (resolver as any)._order as { key: object; members: ParsedObject[] }[]) {
    for (const member of unit.members) {
      watch(unit.key, member);
    }
  }
  const resolve = resolver.resolve;
  // The harness's check of what the resolver knows walks the whole story
  // (`ProgramResolver.verifyFacts`), which is not the resolve's own reading.
  const verify = ProgramResolver.verifyFacts;
  resolver.resolve = (...args) => {
    armed = true;
    ProgramResolver.verifyFacts = false;
    try {
      return resolve.apply(resolver, args);
    } finally {
      armed = false;
      ProgramResolver.verifyFacts = verify;
    }
  };
  try {
    run();
  } finally {
    resolver.resolve = resolve;
  }
  const fresh = new Set(resolver.freshLastResolve().map((u) => u.key));
  return [...new Set(reads.filter((r) => !fresh.has(r.key)).map((r) => r.what))];
};

/** That the last resolve generated and resolved only the statements the
 *  incremental parse lowered anew, at most `most` of them, and visited no
 *  object of any other statement. */
const resolvedOnlyLoweredAnew = (resolver: ProgramResolver, most: number) => {
  const fresh = resolver.freshLastResolve();
  expect(fresh.map((u) => u.reason)).toEqual(fresh.map(() => "new"));
  expect(fresh.length).toBeGreaterThan(0);
  expect(fresh.length).toBeLessThanOrEqual(most);
  visitedOnlyFresh(resolver);
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
      expect(carriedSubtreeReads(s, () => s.edit(line, `${line} Still.`, from))).toEqual([]);
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

describe("a constant", () => {
  const text = [
    "const A = 1",
    "",
    ...Array.from({ length: 10 }, (_, i) => [
      `scene S${i}`,
      `  Line of S${i}.`,
      `  Second line of S${i}.`,
      `  Third line of S${i}.`,
      "end",
      "",
    ]).flat(),
    "const B = A + 1",
    "",
    "scene MAIN",
    "  Line {B}.",
    "end",
    "",
    "const C = B * 2",
    "store total = C + 1",
    "",
    "scene LAST",
    "  Line {C} {total}.",
    "end",
    "",
  ].join("\n");
  const invalid = (program: SparkProgram) =>
    diagnostics(program).filter((d) => d.includes("is not a valid const"));

  it("that can no longer be registered is reported at the constants that read it, and no longer once it can", () => {
    const s = session({ [MAIN_URI]: text });
    expect(invalid(s.program)).toEqual([]);
    // B's and C's statements are carried; A's is lowered anew from a
    // non-constant, which makes B, and through it C, no valid constant.
    s.edit("const A = 1", "const A = missing");
    expect(s.resolver.passesLastResolve.cold).toBe(false);
    expect(invalid(s.program)).toHaveLength(2);
    expect(diagnostics(s.program)).toEqual(diagnostics(cold({ [MAIN_URI]: s.text })));
    s.edit("const A = missing", "const A = 1");
    expect(s.resolver.passesLastResolve.cold).toBe(false);
    expect(invalid(s.program)).toEqual([]);
    expect(diagnostics(s.program)).toEqual(diagnostics(cold({ [MAIN_URI]: s.text })));
  });

  it("carried by an edit elsewhere is neither walked nor initialized again", () => {
    const s = session({ [MAIN_URI]: text });
    const reads = carriedSubtreeReads(s, () =>
      s.edit("  Second line of S4.", "  Second line of S4, again."),
    );
    // No walk of a carried initializer (`Story.RegisterConstantGlobals`
    // reads each constant's names from what it kept of them), and no
    // initializer of a carried statement written again.
    expect(reads).toEqual([]);
    resolvedOnlyLoweredAnew(s.resolver, 3);
    expect(s.resolver.passesLastResolve.initialized).toBe(0);
    expect(diagnostics(s.program)).toEqual(diagnostics(cold({ [MAIN_URI]: s.text })));
  });
});

describe("a scene named `kind`", () => {
  it("is no branch of itself, on either engine", () => {
    // The story's tables are maps that record the names a resolution reads;
    // `kind`, the name of a table's kind, is no entry of one.
    const text = "scene kind\n  Hello.\nend\n";
    for (const programChunks of [true, false]) {
      const collisions = diagnostics(cold({ [MAIN_URI]: text }, { programChunks })).filter((d) =>
        d.includes("Duplicate identifier"),
      );
      expect(collisions, `programChunks ${programChunks}`).toEqual([]);
    }
  });
});

describe("a statement resolved anew", () => {
  const filler = Array.from({ length: 30 }, (_, i) => `  Filler line ${i}.`);

  it("finds a library-named local before it from what each statement declares, and reads none of them", () => {
    // `table` names a library, so a dotted read of it reads the local only
    // where the local is in scope (`FlowBase.IsLocalInScope`): in the scene,
    // after its declaration; in the branch, through the top-level local.
    const text = [
      "local table = { value = 1 }",
      "",
      "scene MAIN",
      "  local table = { value = 2 }",
      ...filler,
      "  Value {table.value}.",
      "  do",
      "    local string = { value = 3 }",
      "  end",
      ...filler,
      "  Other {string.value}.",
      "  branch INNER",
      "    Inner {table.value}.",
      "  end",
      "end",
      "",
    ].join("\n");
    const s = session({ [MAIN_URI]: text });
    for (const [find, replace] of [
      ["  Value {table.value}.", "  Value {table.value} again."],
      ["  Other {string.value}.", "  Other {string.value} again."],
      ["    Inner {table.value}.", "    Inner {table.value} again."],
    ] as const) {
      expect(carriedSubtreeReads(s, () => s.edit(find, replace)), find).toEqual([]);
      expect(s.resolver.passesLastResolve.cold).toBe(false);
      visitedOnlyFresh(s.resolver);
      expect(diagnostics(s.program)).toEqual(diagnostics(cold({ [MAIN_URI]: s.text })));
    }
  });

  it("declares a library-named local otherwise when an edit closes or opens a block around it", () => {
    // The local is declared at the same place of the same flow either way,
    // but a `do` block closes before the read, which then reads the library
    // (`FlowBase.IsLocalInScope`). The incremental parse lowers the read
    // anew with the declaration here; the name is declared otherwise all
    // the same, so a read it carried would be resolved again.
    const beats = (from: number) =>
      Array.from({ length: 30 }, (_, i) => [`  Beat ${from + i}.`, ""]).flat();
    const text = [
      "scene MAIN",
      ...beats(0),
      "  local table = { value = 1 }",
      "",
      ...beats(30),
      "  Value {table.value}.",
      "end",
      "",
    ].join("\n");
    const s = session({ [MAIN_URI]: text });
    const unresolved = () => diagnostics(s.program).filter((d) => d.includes("`table.value`"));
    expect(unresolved()).toEqual([]);
    s.edit("  local table = { value = 1 }", "  do local table = { value = 1 } end");
    expect(s.resolver.passesLastResolve.cold).toBe(false);
    expect(s.resolver.changedNamesLastResolve).toContain("table");
    expect(unresolved()).toHaveLength(1);
    expect(diagnostics(s.program)).toEqual(diagnostics(cold({ [MAIN_URI]: s.text })));
    s.edit("  do local table = { value = 1 } end", "  local table = { value = 1 }");
    expect(s.resolver.passesLastResolve.cold).toBe(false);
    expect(s.resolver.changedNamesLastResolve).toContain("table");
    expect(unresolved()).toEqual([]);
    expect(diagnostics(s.program)).toEqual(diagnostics(cold({ [MAIN_URI]: s.text })));
  });

  it("finds the story's assignments for a divert to a builtin's global from what each statement holds, and reads none of them", () => {
    // Whether an author binds `game` decides the severity of the divert's
    // report (`Divert.hasAuthoredBinding`), from every assignment of the
    // story (`Story.globalAssignmentNames`).
    const text = [
      "scene MAIN",
      "  Line.",
      ...filler,
      "  -> game",
      "end",
      "",
      "scene OTHER",
      ...filler,
      "end",
      "",
      "function rebind()",
      "  game = 1",
      "end",
      "",
    ].join("\n");
    const s = session({ [MAIN_URI]: text });
    const reports = () => diagnostics(s.program).filter((d) => d.includes("`game`"));
    // Bound by `rebind`, the divert is reported as a warning.
    expect(reports()).toHaveLength(1);
    const bound = reports()[0];
    for (const [find, replace] of [
      ["  -> game", "  -> game "],
      ["  game = 1", "  other = 1"],
      ["  -> game", "  -> game  "],
    ] as const) {
      expect(carriedSubtreeReads(s, () => s.edit(find, replace)), find).toEqual([]);
      expect(s.resolver.passesLastResolve.cold).toBe(false);
      visitedOnlyFresh(s.resolver);
      expect(diagnostics(s.program)).toEqual(diagnostics(cold({ [MAIN_URI]: s.text })));
    }
    // Unbound once `rebind` assigns another name, it is reported otherwise.
    expect(reports()).toHaveLength(1);
    expect(reports()[0]).not.toEqual(bound);
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
