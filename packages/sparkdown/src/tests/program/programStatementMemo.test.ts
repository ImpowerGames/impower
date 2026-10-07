// The statement memo (#656; docs/engine/binary-program.md, section 1,
// Identity, and What is built, The statement memo): a statement of a block's
// body that the incremental parse did not rebuild is served from its memo
// when the block is lowered again, without being lowered, while every read
// its lowering recorded through the lowering context reads the same, and it
// keeps the program chunk the memo holds. The memo holds no parsed object.
import "../../inkjs/engine/Container";
import v8 from "node:v8";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { buildChunksFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import type { CompiledBlock } from "../../compiler/classes/annotators/CompilationAnnotator";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { StatementShape } from "../../compiler/lower/utils/statementShape";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import type { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { parsedChildren } from "../../program/ProgramResolver";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { describeRoot, MAIN_URI, programCompiler, rootChunks } from "./programHarness";
import { programStatements } from "./programStatements";

const CHARACTERS = "inmemory:///scripts/characters.sd";

// A field this test adds to the lowering context, and one lowerer that reads
// it (`a field of the context the recording has never seen`, below). Unset,
// both leave every lowering as it is.
const probe = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("../../compiler/lower/lower", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../compiler/lower/lower")>();
  return {
    ...actual,
    // The compilation annotator lowers each top-level node through `lower`,
    // with the context every statement of the node is lowered with.
    lower: (nodeRef: unknown, ctx: Record<string, unknown>) => {
      ctx["probe"] = probe.value;
      return actual.lower(nodeRef as never, ctx as never);
    },
  };
});

vi.mock("../../compiler/lower/lowerers/lowerAssetLine", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../compiler/lower/lowerers/lowerAssetLine")>();
  const { Text } = await import("../../inkjs/compiler/Parser/ParsedHierarchy/Text");
  return {
    ...actual,
    // An image line writes the field's value after its directive.
    lowerImageLine: (nodeRef: unknown, ctx: Record<string, unknown>) => {
      const block = actual.lowerImageLine(nodeRef as never, ctx as never);
      const value = ctx["probe"];
      const weave = block.content?.[0];
      if (typeof value === "string" && weave) {
        weave.AddContent(new Text(value));
      }
      return block;
    },
  };
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

/** A compiler over `texts` with statement chunks on, and an editor of its
 *  main script that compiles after each edit. */
function session(texts: Record<string, string>) {
  const c = programCompiler(texts, { programChunks: true });
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
    get root(): ProgramRoot {
      return program.chunks!;
    },
    get stats() {
      return c.compiler.memoStats(MAIN_URI)!;
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

const cold = (texts: Record<string, string>): SparkProgram =>
  quietly(() => programCompiler(texts, { programChunks: true }).compile().program);

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

// A scene that ends in a `choose` block whose `then` clause holds the rest of
// the scene, 300 lines of beats with portraits, calls, interpolations and
// `if` blocks, as the real projects write it.
const fixture = (scenes = 2) => {
  const { files } = buildChunksFixture({ scenes, linesPerScene: 30, thenLines: 300 });
  return {
    [MAIN_URI]: files.get("main.sd")!,
    [CHARACTERS]: files.get("scripts/characters.sd")!,
  };
};

/** A line of the `then` clause, `back` lines above its `end`, that writes a
 *  beat of dialogue or action. */
const clauseLine = (text: string, back: number): { line: string; from: number } => {
  const lines = text.split("\n");
  const end = lines.lastIndexOf("  end");
  for (let at = end - back; at > 0; at -= 1) {
    const line = lines[at]!;
    if (/^ {6}\S/.test(line) && !/[{&\[]/.test(line)) {
      return { line, from: lines.slice(0, at).join("\n").length };
    }
  }
  throw new Error("No beat in the clause");
};

/** A session over the fixture whose `then` clause one edit has already
 *  reparsed: the first incremental parse after a cold one reparses the whole
 *  block, since the parse has no place inside the block to restart from until
 *  it has reparsed it once (on the Raffles and Bunny project too). */
const warmSession = (scenes = 2) => {
  const s = session(fixture(scenes));
  const { line, from } = clauseLine(s.text, 200);
  s.edit(line, `${line} At first.`, from);
  return s;
};

describe("an edit to one line inside a long `then` clause", () => {
  it("lowers only the statements the parse rebuilt, and keeps every other statement's chunk", () => {
    const s = warmSession();
    const before = new Set(rootChunks(s.root));
    const { line, from } = clauseLine(s.text, 120);
    s.edit(line, `${line} Still.`, from);
    // The edited statement and the neighbours the parse rebuilt with it, and
    // the statements no memo can stand for: the clause's `if` blocks, whose
    // bodies' statements are served, and its assignments.
    expect(s.stats.lowered).toBeGreaterThan(0);
    expect(s.stats.lowered).toBeLessThanOrEqual(20);
    expect(s.stats.served).toBeGreaterThan(80);
    const after = rootChunks(s.root);
    const changed = after.filter((chunk) => !before.has(chunk));
    // The edited statement's chunk, and none of the clause's others: the
    // `choose` block's own chunk stays as its syntax does.
    expect(changed.length).toBe(1);
    expect(describeRoot(s.root)).toEqual(
      describeRoot(cold({ ...fixture(), [MAIN_URI]: s.text }).chunks!),
    );
    expect(diagnostics(s.program)).toEqual(
      diagnostics(cold({ ...fixture(), [MAIN_URI]: s.text })),
    );
  });
});

// ---- No parsed object outlives its compile ----------------------------------

/** The compiled blocks of the main script's annotation, by the name of the
 *  node each was lowered from. */
const compiledBlocks = (s: ReturnType<typeof session>, node: string): CompiledBlock[] => {
  const out: CompiledBlock[] = [];
  const iter = (s.compiler as any).documents.annotations(MAIN_URI).compilations.iter();
  while (iter.value) {
    if (iter.value.type.node === node) {
      out.push(iter.value.type);
    }
    iter.next();
  }
  return out;
};

/** A weak reference to every parsed object a compiled block holds: its
 *  objects and everything under them, and the objects the shapes of its
 *  statements record. */
const parsedObjectsOf = (block: CompiledBlock): WeakRef<ParsedObject>[] => {
  const seen = new Set<ParsedObject>();
  const visit = (obj: ParsedObject) => {
    if (seen.has(obj)) {
      return;
    }
    seen.add(obj);
    parsedChildren(obj).forEach(visit);
  };
  (block.content ?? []).forEach(visit);
  (block.hoistedKnots ?? []).forEach(visit);
  const visitShape = (shape: StatementShape) => {
    shape.objects.forEach(visit);
    for (const body of shape.bodies) {
      body.statements.forEach(visitShape);
    }
  };
  if (block.statement) {
    visitShape(block.statement);
  }
  return [...seen].map((obj) => new WeakRef(obj));
};

describe("no parsed object", () => {
  // One scene, so that no statement of another scene holds a divert to the
  // scene: a divert the resolver keeps resolved holds the flow the compile
  // that resolved it assembled (`Divert.targetContent`, #1607), and that flow
  // the objects of that compile's statements of the scene, which is not
  // what this asks of the statement memo.
  it("of a block's lowering outlives the compile that lowers the block again", async () => {
    // A collection on demand, which the test runner's Node gives no flag for.
    v8.setFlagsFromString("--expose-gc");
    const gc = vm.runInNewContext("gc") as () => void;
    const s = warmSession(1);
    const first = clauseLine(s.text, 160);
    s.edit(first.line, `${first.line} Once.`, first.from);
    // The objects the last compile lowered, the statements it served from
    // their memos included, and the objects it kept from earlier lowerings,
    // held weakly, as is the block itself.
    const { refs, block } = (() => {
      const [held] = compiledBlocks(s, "LuauSparkdownChooseBlock");
      expect(held?.memoized?.length ?? 0, "statements served from their memos").toBeGreaterThan(50);
      return { refs: parsedObjectsOf(held!), block: new WeakRef(held!) };
    })();
    expect(refs.length).toBeGreaterThan(100);
    const { line, from } = clauseLine(s.text, 80);
    s.edit(line, `${line} Again.`, from);
    expect(compiledBlocks(s, "LuauSparkdownChooseBlock")[0] === block.deref()).toBe(false);
    // A weak reference holds its target until the job that made it ends.
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc();
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc();
    const alive = refs.map((ref) => ref.deref()).filter((obj) => obj !== undefined);
    expect(alive.map((obj) => obj!.typeName)).toEqual([]);
  });
});

// ---- What a later statement of the block must lower to ---------------------

/** A script whose scene ends in a `choose` block whose `then` clause holds
 *  `clause`, each line indented into it, after `top` at the top level. Its
 *  first line, `Warm line.`, is the clause's line the warming edit makes. */
const clauseScript = (clause: readonly string[], top: readonly string[] = []) =>
  [
    ...top,
    "scene MAIN",
    "  Opening line.",
    "  choose",
    "    + [Go on]",
    "      You go on.",
    "    + [Stay]",
    "      You stay.",
    "  then",
    "    Warm line.",
    ...clause.map((line) => (line ? `    ${line}` : "")),
    "  end",
    "end",
    "",
  ].join("\n");

/** A session over `text` whose block an edit has already reparsed once, as
 *  `warmSession`'s. */
const warmed = (text: string) => {
  const s = session({ [MAIN_URI]: text });
  s.edit("Warm line.", "Warm line!");
  return s;
};

/** The lines (counting from 0) of the statements the last update lowered,
 *  outside the range the parse rebuilt, which is lowered whatever the memos
 *  say, and of each line of `of` the update lowered, wherever it stands. */
const loweredBeyondRebuilt = (s: ReturnType<typeof session>) => {
  const lineOf = (offset: number) => s.text.slice(0, offset).split("\n").length - 1;
  const rebuilt = s.stats.rebuilt;
  const lines = new Set<number>();
  for (const at of s.stats.loweredAt) {
    if (!rebuilt || at > rebuilt.to || at < rebuilt.from) {
      lines.add(lineOf(at));
    }
  }
  return [...lines].sort((a, b) => a - b).map((line) => s.text.split("\n")[line]!.trim());
};

/** That `s`'s program is what a cold compile of its text makes. */
const sameAsCold = (s: ReturnType<typeof session>, texts: Record<string, string> = {}) => {
  const coldProgram = cold({ ...texts, [MAIN_URI]: s.text });
  expect(describeRoot(s.root)).toEqual(describeRoot(coldProgram.chunks!));
  expect(diagnostics(s.program)).toEqual(diagnostics(coldProgram));
};

// Statements far enough from every edit below that the parse never rebuilds
// them.
const FILLER = Array.from({ length: 12 }, (_, i) => `A quiet line, number ${i}.`);

describe("an edit that changes what a later statement of the block lowers to", () => {
  it("of a local declared earlier lowers again the statement that reads it, and no other", () => {
    const s = warmed(
      clauseScript(["Line one.", ...FILLER, "Hello {x}.", ...FILLER], ["store x = 1", ""]),
    );
    const before = new Set(rootChunks(s.root));
    s.edit("    Line one.\n", "    Line one.\n    local x = 2\n");
    expect(loweredBeyondRebuilt(s)).toEqual(["Hello {x}."]);
    // The new local's chunk, and at most the reader's: every other statement
    // keeps its chunk.
    expect(rootChunks(s.root).filter((chunk) => !before.has(chunk)).length).toBeLessThanOrEqual(2);
    sameAsCold(s);
  });

  it("of a label added lowers again the statement that reads it, and no other", () => {
    const s = warmed(clauseScript(["Seen {after} times.", ...FILLER, "Line last.", ...FILLER]));
    s.edit("    Line last.\n", "    label after\n    Line last.\n");
    expect(loweredBeyondRebuilt(s)).toEqual(["Seen {after} times."]);
    sameAsCold(s);
  });

  it("of a nested function hoisted lowers again the statement that calls it, and no other", () => {
    const calls = FILLER.map((_, i) => `  print("quiet ${i}")`);
    const s = session({
      [MAIN_URI]: [
        "function host()",
        ...calls,
        "  print(\"warm\")",
        ...calls,
        "  local a = 1",
        ...calls,
        "  inner()",
        ...calls,
        "end",
        "",
        clauseScript(["& host()"]),
      ].join("\n"),
    });
    s.edit('print("warm")', 'print("warm!")');
    s.edit("  local a = 1\n", "  local a = 1\n  function inner() return 2 end\n");
    expect(loweredBeyondRebuilt(s)).toEqual(["inner()"]);
    sameAsCold(s);
  });

  // A scene above the one the edits below write above, so that the parse
  // rebuilds the edit's lines alone and the block is lowered again for the
  // names its lowering read.
  const ABOVE = ["scene FIRST", ...FILLER.map((line) => `  ${line}`), "end", ""];

  it("of a name entering the global callable names lowers again the statement that read it, and no other", () => {
    const s = warmed(
      clauseScript([...FILLER, "& local cb = function() return later() end", ...FILLER], ABOVE),
    );
    s.edit("scene FIRST\n", "function later()\n  return 7\nend\n\nscene FIRST\n");
    expect(loweredBeyondRebuilt(s)).toEqual(["& local cb = function() return later() end"]);
    sameAsCold(s);
  });

  it("of a name entering the define type names lowers again the statement that read it, and no other", () => {
    const s = warmed(clauseScript([...FILLER, "store thing = 1", ...FILLER], ABOVE));
    s.edit(
      "scene FIRST\n",
      "define thing with\n  x = 1\nend\n\ndefine sidekick as thing with\n  x = 2\nend\n\nscene FIRST\n",
    );
    expect(loweredBeyondRebuilt(s)).toEqual(["store thing = 1"]);
    sameAsCold(s);
  });
});

// ---- A field of the context the recording has never seen -------------------

describe("a field added to the lowering context", () => {
  it("lowers again the statement whose lowering read it when its value changes, with no detector added, and no other", () => {
    try {
      probe.value = "one";
      const text = clauseScript([...FILLER, "[[show backdrop alley]]", ...FILLER, "Line last."]);
      const s = warmed(text);
      const before = new Set(rootChunks(s.root));
      probe.value = "two";
      // An edit elsewhere in the block, which lowers the block again.
      s.edit("Line last.", "Line last, at last.");
      expect(loweredBeyondRebuilt(s)).toEqual(["[[show backdrop alley]]"]);
      // The edited line's chunk and the image line's, which writes the new
      // value; every other statement keeps its chunk.
      expect(rootChunks(s.root).filter((chunk) => !before.has(chunk)).length).toBe(2);
      sameAsCold(s);
      // A cold compile of the same text with the old value differs: the
      // value is what the image line's chunk holds.
      probe.value = "one";
      expect(describeRoot(s.root)).not.toEqual(
        describeRoot(cold({ [MAIN_URI]: s.text }).chunks!),
      );
    } finally {
      probe.value = undefined;
    }
  });
});

// ---- Diagnostics ------------------------------------------------------------

describe("a diagnostic a statement served from its memo raised", () => {
  it("at its resolution is reported again at its current line, and goes when it is lowered again without it", () => {
    const s = warmed(clauseScript([...FILLER, "Hello {missing}.", ...FILLER]));
    const line = () => s.text.split("\n").findIndex((l) => l.includes("Hello {"));
    expect(diagnostics(s.program).some((d) => d.includes(` ${line()}:`))).toBe(true);
    // Two lines written above it move it down: it is served, and reports
    // where it now stands.
    s.edit("    Warm line!\n", "    Warm line!\n    One more.\n    Two more.\n");
    expect(loweredBeyondRebuilt(s)).toEqual([]);
    expect(diagnostics(s.program).some((d) => d.includes(` ${line()}:`))).toBe(true);
    sameAsCold(s);
    s.edit("Hello {missing}.", "Hello there.");
    expect(diagnostics(s.program).some((d) => d.includes(` ${line()}:`))).toBe(false);
    sameAsCold(s);
  });

  it("at its lowering is reported again at its current line, and goes when it is lowered again without it", () => {
    const s = warmed(clauseScript([...FILLER, "Call {{1}} now.", ...FILLER]));
    const line = () => s.text.split("\n").findIndex((l) => l.includes("Call {"));
    expect(diagnostics(s.program).some((d) => d.includes(` ${line()}:`))).toBe(true);
    s.edit("    Warm line!\n", "    Warm line!\n    One more.\n    Two more.\n");
    expect(loweredBeyondRebuilt(s)).toEqual([]);
    expect(diagnostics(s.program).some((d) => d.includes(` ${line()}:`))).toBe(true);
    sameAsCold(s);
    s.edit("Call {{1}} now.", "Call now.");
    expect(diagnostics(s.program).some((d) => d.includes(` ${line()}:`))).toBe(false);
    sameAsCold(s);
  });
});

// ---- A compile that lowers a block again ------------------------------------

describe("a compile that meets a memo it cannot compile from", () => {
  it("lowers the block again and compiles again, and keeps what its first attempt found about the statements it resolved again", () => {
    // `n` is a local of the scene, declared in the clause, which the
    // statement after the `choose` block reads. The edit makes it `m`: that
    // statement reads `n` otherwise, and so does `Body {n}.`, which is
    // served from its memo, so the first attempt meets a memo whose name is
    // declared otherwise and the compile runs again with the clause lowered
    // again. The second attempt does not resolve the statement after the
    // block again, as the first did, nor finds what the first found there:
    // its chunk must not be kept.
    const text = [
      "scene MAIN",
      "  Opening line.",
      "  choose",
      "    + [Go on]",
      "      You go on.",
      "    + [Stay]",
      "      You stay.",
      "  then",
      "    Warm line.",
      "    local n = 5",
      ...FILLER.map((line) => `    ${line}`),
      "    Body {n}.",
      ...FILLER.map((line) => `    ${line}`),
      "  end",
      "  Still {n}.",
      "end",
      "",
    ].join("\n");
    const s = warmed(text);
    const after = () =>
      programStatements(s.compiler).find((statement) => statement.syntax.includes("Still {n}."));
    const before = after();
    expect(before?.key).toContain("n:variable");
    const attempts = vi.spyOn(s.compiler as any, "compileStoryOnce");
    s.edit("    local n = 5", "    local m = 5");
    expect(attempts.mock.calls.length, "the compile ran again").toBeGreaterThan(1);
    attempts.mockRestore();
    expect(after()?.key).toContain("n:unresolved");
    expect(after()?.chunk === before!.chunk, "the statement after the block kept its chunk").toBe(
      false,
    );
    sameAsCold(s);
  });
});
