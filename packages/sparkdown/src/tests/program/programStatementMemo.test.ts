// The statement memo (#656; docs/engine/binary-program.md, section 1,
// Identity, and What is built, The statement memo): a statement of a block's
// body that the incremental parse did not rebuild is served from its memo
// when the block is lowered again, without being lowered, while every read
// its lowering recorded through the lowering context reads the same, and it
// keeps the program chunk the memo holds. The memo holds no parsed object.
import v8 from "node:v8";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { buildChunksFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import type { CompiledBlock } from "../../compiler/classes/annotators/CompilationAnnotator";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { StatementShape } from "../../compiler/lower/utils/statementShape";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import type { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import type { ProgramRoot } from "../../program/ProgramRoot";

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

// The package's setup file (`programChunksByDefault.ts`) has already loaded
// the compiler, and `lower` and `lowerImageLine` with it, unmocked; the
// modules are loaded again so that the compiler lowers through the mocks.
vi.resetModules();

const { parsedChildren, ProgramResolver } = await import("../../program/ProgramResolver");
const { describeRoot, MAIN_URI, programCompiler, rootChunks } = await import("./programHarness");
const { programStatements } = await import("./programStatements");

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
  const c = programCompiler(texts);
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
  quietly(() => programCompiler(texts).compile().program);

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
    // The edited statement and the statements around it the parse rebuilt
    // with it: the clause's assignments and `if` blocks, with the
    // statements of their bodies, are served as its lines of dialogue and
    // action are (#1676).
    expect(loweredOutside(s)).toEqual([]);
    expect(s.stats.lowered).toBeGreaterThan(0);
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

/** Waits for the jobs that made weak references to end, which hold their
 *  targets until then, and collects twice. */
const collect = async () => {
  // A collection on demand, which the test runner's Node gives no flag for.
  v8.setFlagsFromString("--expose-gc");
  const gc = vm.runInNewContext("gc") as () => void;
  await new Promise((resolve) => setTimeout(resolve, 0));
  gc();
  await new Promise((resolve) => setTimeout(resolve, 0));
  gc();
};

/** Every parsed object a story holds, from the story down. */
const storyObjects = (story: ParsedObject): ParsedObject[] => {
  const seen = new Set<ParsedObject>();
  const visit = (obj: ParsedObject) => {
    if (seen.has(obj)) {
      return;
    }
    seen.add(obj);
    parsedChildren(obj).forEach(visit);
    // A call generated as a builtin keeps the divert that held its
    // arguments, which generation took out of its content.
    const proxy = (obj as { proxyDivert?: ParsedObject }).proxyDivert;
    if (proxy) {
      visit(proxy);
    }
  };
  visit(story);
  return [...seen];
};

/** Runs `run` with every resolve of the program path reporting the parsed
 *  story it resolves to `seen`, which the caller holds weakly. */
const watchingStories = async <T>(
  seen: (story: ParsedObject) => void,
  run: () => Promise<T>,
): Promise<T> => {
  const resolve = ProgramResolver.prototype.resolve;
  ProgramResolver.prototype.resolve = function (this: InstanceType<typeof ProgramResolver>, ...args) {
    seen(args[0] as unknown as ParsedObject);
    return resolve.apply(this, args);
  };
  try {
    return await run();
  } finally {
    ProgramResolver.prototype.resolve = resolve;
  }
};

describe("no parsed object", () => {
  // With two scenes the first diverts to the second, whose clause is edited:
  // a divert the resolver keeps resolved while its statement is carried
  // holds the flow it was resolved to, which every compile assembles anew.
  for (const scenes of [1, 2]) {
    it(`of a block's lowering outlives the compile that lowers the block again, with ${scenes} scene(s)`, async () => {
      const s = warmSession(scenes);
      const first = clauseLine(s.text, 160);
      s.edit(first.line, `${first.line} Once.`, first.from);
      // The objects the last compile lowered, the statements it served from
      // their memos included, and the objects it kept from earlier
      // lowerings, held weakly, as is the block itself.
      const { refs, block } = (() => {
        const [held] = compiledBlocks(s, "LuauSparkdownChooseBlock");
        expect(held?.memoized?.length ?? 0, "statements served from their memos").toBeGreaterThan(50);
        return { refs: parsedObjectsOf(held!), block: new WeakRef(held!) };
      })();
      expect(refs.length).toBeGreaterThan(100);
      const { line, from } = clauseLine(s.text, 80);
      s.edit(line, `${line} Again.`, from);
      expect(compiledBlocks(s, "LuauSparkdownChooseBlock")[0] === block.deref()).toBe(false);
      await collect();
      const alive = refs.map((ref) => ref.deref()).filter((obj) => obj !== undefined);
      expect(alive.map((obj) => obj!.typeName)).toEqual([]);
    });
  }

  it("of an earlier compile is reachable after a compile, but the objects this compile's story holds", async () => {
    // Two scenes, the first diverting to the second, whose clause is edited
    // twice. Every parsed object an earlier compile's story held that the
    // last compile's story does not hold is collected, whichever compile
    // made it: nothing of the compiler or the chunk store keeps it, the
    // blocks the annotator carried and the statements the resolver carried
    // included.
    const stories: WeakRef<ParsedObject>[] = [];
    const refs: WeakRef<ParsedObject>[] = [];
    const s = await watchingStories(
      (story) => {
        stories.push(new WeakRef(story));
        refs.push(...storyObjects(story).map((obj) => new WeakRef(obj)));
      },
      async () => {
        const s = warmSession(2);
        const first = clauseLine(s.text, 160);
        s.edit(first.line, `${first.line} Once.`, first.from);
        const { line, from } = clauseLine(s.text, 80);
        s.edit(line, `${line} Again.`, from);
        return s;
      },
    );
    expect(stories.length).toBe(4);
    expect(refs.length).toBeGreaterThan(1000);
    const held = new WeakSet(storyObjects(stories.at(-1)!.deref()!));
    await collect();
    const alive = refs
      .map((ref) => ref.deref())
      .filter((obj): obj is ParsedObject => obj !== undefined && !held.has(obj));
    expect(alive.map((obj) => obj.typeName)).toEqual([]);
    expect(s.stats.served).toBeGreaterThan(50);
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

/** Where the statement starting at `at` ends: before the first line after
 *  it, other than a blank one, indented no deeper than its first line, or
 *  past that line when it closes the statement (`end`, `else`). */
const statementEnd = (text: string, at: number): number => {
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  const indent = (line: string) => line.length - line.trimStart().length;
  const depth = indent(text.slice(lineStart, text.indexOf("\n", at)));
  let next = text.indexOf("\n", at) + 1;
  while (next > 0 && next < text.length) {
    const end = text.indexOf("\n", next);
    const line = text.slice(next, end < 0 ? text.length : end);
    if (line.trim() && indent(line) <= depth) {
      return /^(end|else|elseif|until)\b/.test(line.trim()) ? (end < 0 ? text.length : end) : next;
    }
    next = end + 1;
  }
  return text.length;
};

/** The first lines of the statements the last update lowered that the
 *  incremental parse rebuilt none of. */
const loweredOutside = (s: ReturnType<typeof session>) => {
  const rebuilt = s.stats.rebuilt;
  const lineAt = (at: number) => s.text.slice(at, s.text.indexOf("\n", at)).trim();
  return s.stats.loweredAt
    .filter((at) => !rebuilt || at > rebuilt.to || statementEnd(s.text, at) <= rebuilt.from)
    .map(lineAt);
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

// ---- Statements whose objects other passes read (#1676) --------------------

/** A clause with each kind of statement whose objects the weave, the flow's
 *  checks or the story's passes over the whole program read: an assignment,
 *  an `if` block with a body, a label and a divert, among lines of
 *  dialogue, after `top` and before a scene the divert goes to. */
const kindsScript = (clause: readonly string[] = [], top: readonly string[] = []) =>
  [
    clauseScript(
      [
        "Line one.",
        ...clause,
        ...FILLER,
        "& trust = trust + 1",
        "if trust > 2 then",
        "  Big trust {trust}.",
        "end",
        "label later",
        ...FILLER,
        "-> OTHER",
      ],
      ["store trust = 0", "", ...top],
    ),
    "scene OTHER",
    "  Other.",
    "end",
    "",
  ].join("\n");

/** What the story's passes over the whole program found of the last
 *  compile's story: the names plain assignments write, and the globals,
 *  auto-globals included. */
const coldFacts = (text: string) => {
  const c = programCompiler({ [MAIN_URI]: text });
  quietly(() => c.compile());
  return storyFacts(c.compiler as SparkdownCompiler);
};

/** The chunk the main script's statement `name` assigns holds now, served
 *  or lowered. */
const assignmentChunk = (s: ReturnType<typeof session>, name: string) => {
  let found: object | undefined;
  const visit = (shape: StatementShape) => {
    const obj = shape.objects[0] as { variableName?: string } | undefined;
    if (obj?.variableName === name) {
      found = s.compiler.chunkStore!.chunkOf(shape.memo ?? shape);
    }
    for (const body of shape.bodies) {
      body.statements.forEach(visit);
    }
  };
  for (const block of compiledBlocks(s, "LuauSparkdownChooseBlock")) {
    if (block.statement) {
      visit(block.statement);
    }
  }
  return found;
};

const storyFacts = (compiler: SparkdownCompiler) => {
  const story = (compiler as any)._programResolver._story;
  return {
    assigned: [...story.globalAssignmentNames()].sort(),
    globals: [...story.variableDeclarations.keys()].sort(),
  };
};

describe("a statement whose objects another pass reads", () => {
  it("is served when an edit elsewhere in its block lowers the block again, with the statements of an `if` block's body, and keeps its chunk", () => {
    const s = warmed(kindsScript());
    const before = new Set(rootChunks(s.root));
    s.edit("Line one.", "Line one, edited.");
    expect(loweredOutside(s)).toEqual([]);
    // The assignment, the `if` block and its body's line, the label, the
    // divert and the lines of dialogue.
    expect(s.stats.served).toBeGreaterThanOrEqual(2 * FILLER.length + 5);
    // The edited line's chunk, and no other.
    expect(rootChunks(s.root).filter((chunk) => !before.has(chunk)).length).toBe(1);
    sameAsCold(s);
    expect(storyFacts(s.compiler)).toEqual(
      coldFacts(s.text),
    );
  });

  it("an assignment is lowered again when a local declared earlier changes what it assigns, and no other statement is", () => {
    const s = warmed(kindsScript());
    s.edit("    Line one.\n", "    Line one.\n    local trust = 5\n");
    // The assignment, and the `if` block, whose condition reads the name
    // too. The line of its body reads the name only as its resolution does,
    // which its memo repeats.
    expect(loweredOutside(s)).toEqual(["& trust = trust + 1", "if trust > 2 then"]);
    sameAsCold(s);
  });

  it("an `if` block is lowered again with the statement of its body whose lowering reads otherwise, or when its own lowering does, and no other statement is", () => {
    try {
      // A field of the context only the image line in the `if` block's body
      // reads (`probe`, above): the block is lowered again for it, as the
      // line is, and every other statement is served.
      probe.value = "one";
      const s = warmed(
        kindsScript().replace("  Big trust {trust}.", "  [[show backdrop alley]]"),
      );
      probe.value = "two";
      s.edit("Line one.", "Line one, edited.");
      // The line first, as the block lowers it before it is done itself.
      expect(loweredOutside(s)).toEqual(["[[show backdrop alley]]", "if trust > 2 then"]);
      sameAsCold(s);
    } finally {
      probe.value = undefined;
    }
    const t = warmed(
      kindsScript([], ["store x = 1", ""]).replace("  Big trust {trust}.", "  Big trust {x}."),
    );
    t.edit("    Line one.\n", "    Line one.\n    local x = 2\n");
    // The `if` block's own lowering reads the locals declared around it; the
    // line of its body reads the name only as its resolution does, which its
    // memo repeats.
    expect(loweredOutside(t)).toEqual(["if trust > 2 then"]);
    sameAsCold(t);
  });

  it("a label is lowered again when a flow of its name is written, and no other statement is", () => {
    const s = warmed(kindsScript());
    s.edit("scene OTHER\n", "scene later\n  Later.\nend\n\nscene OTHER\n");
    s.edit("Line one.", "Line one, edited.");
    // The divert too: its resolution read the scenes whole, which a scene
    // written changes.
    expect(loweredOutside(s)).toEqual(["label later", "-> OTHER"]);
    sameAsCold(s);
  });

  it("a divert is lowered again when a label of its target's name is written in its block, and no other statement is", () => {
    const s = warmed(kindsScript());
    s.edit("    Line one.\n", "    Line one.\n    label OTHER\n");
    // And the `if` block, whose condition's resolution read the labels
    // whole, which a label written changes.
    expect(loweredOutside(s)).toEqual(["if trust > 2 then", "-> OTHER"]);
    sameAsCold(s);
  });

  it("an assignment that made an auto-global is lowered again when a local of its name is declared before it, while an unrelated one keeps its chunk", () => {
    const s = warmed(kindsScript([...FILLER, "& fresh = 5", ...FILLER, "Count {fresh}."]));
    s.edit("Line one.", "Line one, edited.");
    // Served, with the auto-global it made made again.
    expect(loweredOutside(s)).toEqual([]);
    expect(storyFacts(s.compiler).globals).toContain("fresh");
    expect(storyFacts(s.compiler)).toEqual(coldFacts(s.text));
    const trust = assignmentChunk(s, "trust");
    expect(trust).toBeDefined();
    // A local of the name declared before it, which its lowering reads: the
    // assignment writes the local, and makes no auto-global.
    s.edit("    Line one, edited.\n", "    Line one, edited.\n    local fresh = 1\n");
    expect(loweredOutside(s)).toContain("& fresh = 5");
    expect(loweredOutside(s)).not.toContain("& trust = trust + 1");
    expect(assignmentChunk(s, "trust")).toBe(trust);
    expect(storyFacts(s.compiler).globals).not.toContain("fresh");
    expect(storyFacts(s.compiler)).toEqual(coldFacts(s.text));
    sameAsCold(s);
  });
});

// ---- Local declarations ------------------------------------------------------

describe("a local declaration", () => {
  // A local declared in the clause and read after it, among lines no edit
  // below touches.
  const localScript = (top: readonly string[] = []) =>
    clauseScript(
      ["Line one.", ...FILLER, "local here = 2", ...FILLER, "Here {here}.", ...FILLER, "Line last."],
      top,
    );

  it("is served when an edit elsewhere lowers its block again, and declares its local again for the statements after it", () => {
    const s = warmed(localScript());
    const before = new Set(rootChunks(s.root));
    s.edit("Line last.", "Line last, edited.");
    expect(loweredOutside(s)).toEqual([]);
    // The edited line's chunk, and no other: the line that reads the local
    // reads it as it did, from the local its served declaration declared.
    expect(rootChunks(s.root).filter((chunk) => !before.has(chunk)).length).toBe(1);
    sameAsCold(s);
    // A line that reads the local, lowered anew while the declaration is
    // served, resolves the name to the local the stand-in declared.
    s.edit("Here {here}.", "Here {here}!");
    expect(loweredOutside(s)).toEqual([]);
    expect(s.stats.served).toBeGreaterThan(3 * FILLER.length);
    sameAsCold(s);
  });

  it("is lowered again when a global of its name is declared above it, and no other statement is", () => {
    // A global of the local's name, declared above the scene: the local now
    // shadows it, which its resolution read the name for. The line that
    // reads the local still reads the local its served declaration declares.
    const s = warmed(localScript(["store other = 1", ""]));
    s.edit("store other = 1", "store here = 1");
    s.edit("Line last.", "Line last, edited.");
    expect(loweredOutside(s)).toEqual(["local here = 2"]);
    sameAsCold(s);
  });
});

describe("a local declaration of several names", () => {
  it("is served when an edit elsewhere lowers its block again, and declares its locals again for the statements after it", () => {
    const s = warmed(
      clauseScript(["Line one.", ...FILLER, "local a, b = 1, 2", ...FILLER, "Values {a}, {b}.", ...FILLER, "Line last."]),
    );
    s.edit("Line last.", "Line last, edited.");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
    // A line that reads them, lowered anew while the declaration is served.
    s.edit("Values {a}, {b}.", "Values {a}, {b}!");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
  });
});

// ---- Statements that read alike ---------------------------------------------

describe("statements that read alike", () => {
  // Two lines written alike, far apart, among lines no edit below touches.
  const sameScript = () =>
    clauseScript(["Line one.", ...FILLER, "Same.", ...FILLER, "Same.", ...FILLER, "Line last."]);

  it("each keep their own memo when an edit writes another line like them above them", () => {
    const s = warmed(sameScript());
    const before = new Set(rootChunks(s.root));
    s.edit("    Line one.\n", "    Line one.\n    Same.\n");
    expect(loweredOutside(s)).toEqual([]);
    // The new line's chunk, and no other.
    expect(rootChunks(s.root).filter((chunk) => !before.has(chunk)).length).toBe(1);
    sameAsCold(s);
  });

  it("each keep their own memo when an edit takes away a line like them above them", () => {
    const s = warmed(
      clauseScript(["Line one.", "Same.", ...FILLER, "Same.", ...FILLER, "Same.", ...FILLER, "Line last."]),
    );
    s.edit("    Line one.\n    Same.\n", "    Line one.\n");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
  });
});

describe("a local declared inside an `if` block's body", () => {
  it("keeps the block lowered, so the local stays in the block's scope: a line after the block, lowered anew, reads the global of its name", () => {
    const s = warmed(
      clauseScript(
        ["Line one.", ...FILLER, "if 1 > 0 then", "  local scoped = 1", "  Inside {scoped}.", "end", ...FILLER, "After {scoped}.", ...FILLER, "Line last."],
        ["store scoped = 5", ""],
      ),
    );
    s.edit("Line last.", "Line last, edited.");
    // A block statement's stand-in holds the stand-ins of its bodies' statements
    // with none of the scopes its branches open, so a block that declares a
    // local is lowered, and its body's statements served inside it.
    expect(loweredOutside(s)).toContain("if 1 > 0 then");
    expect(loweredOutside(s)).not.toContain("Inside {scoped}.");
    sameAsCold(s);
    s.edit("After {scoped}.", "After {scoped}!");
    sameAsCold(s);
  });
});

describe("local declarations, further shapes", () => {
  it("one that reads a constant is served, and its program is a cold compile's while the constant's initializer breaks, it becomes a variable and it goes", () => {
    const s = warmed(
      clauseScript(
        ["Line one.", ...FILLER, "local here = BASE", ...FILLER, "Here {here}.", ...FILLER, "Line last."],
        ["const BASE = 1", ""],
      ),
    );
    s.edit("Line last.", "Line last, edited.");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
    s.edit("Here {here}.", "Here {here}!");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
    // A constant whose initializer reads a name no statement declares, which
    // the story then reads as it reads it in a cold compile: the
    // declaration's reader reads the global as it did.
    s.edit("const BASE = 1", "const BASE = missing");
    s.edit("Line last, edited.", "Line last, edited again.");
    sameAsCold(s);
    // A variable of the constant's name in its place declares the name
    // otherwise for its readers.
    // The compile of that edit finds the memo stale and lowers its block
    // again, so the next edit of the block lowers nothing it did not rebuild.
    s.edit("const BASE = missing", "store BASE = 1");
    sameAsCold(s);
    s.edit("Line last, edited again.", "Line last, edited once more.");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
    // No declaration of the name at all: what the declaration's resolution
    // reported and read is no longer what it was.
    s.edit("store BASE = 1", "store OTHER = 1");
    sameAsCold(s);
    s.edit("Line last, edited once more.", "Line last, edited at last.");
    sameAsCold(s);
  });

  it("several on one line are served, and declare their locals again for the statements after them", () => {
    const s = warmed(
      clauseScript(["Line one.", ...FILLER, "& local a = 1; local b = 2", ...FILLER, "Values {a}, {b}.", ...FILLER, "Line last."]),
    );
    s.edit("Line last.", "Line last, edited.");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
    s.edit("Values {a}, {b}.", "Values {a}, {b}!");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
  });
});

// ---- The recording of the lowering context ----------------------------------

describe("the recording of the lowering context", () => {
  it("writes what a lowering writes as itself, and hands it back as itself, so a block's end puts back what it hid", async () => {
    const { recordLowering } = await import("../../compiler/lower/recordingContext");
    const { shadowSiblingSubFlow } = await import("../../compiler/lower/expression/bindings");
    const hidden: { upvals: string[]; arity: number; knotName: string; rebound?: boolean } = {
      upvals: ["base"],
      arity: 1,
      knotName: "foo",
    };
    const frame = new Map<string, typeof hidden>([["foo", hidden]]);
    const ends: (() => void)[] = [];
    const ctx = {
      siblingSubFlowNamesStack: [frame],
      blockEndStack: [ends],
      read: () => "",
      lineNumber: () => 0,
      characterNumber: () => 0,
    } as never;
    // A `local foo` lowered under the recording hides the sibling function
    // for the rest of its block, and the block's end, which runs after the
    // statement's recording is done, puts it back.
    const { ctx: recorded, finish } = recordLowering(ctx, 0, 0);
    shadowSiblingSubFlow("foo", recorded);
    expect(frame.get("foo")).not.toBe(hidden);
    expect(frame.get("foo")?.rebound).toBe(true);
    const recording = finish();
    const reads = recording.reads.length;
    ends.forEach((end) => end());
    expect(frame.get("foo")).toBe(hidden);
    // What the block's end read and wrote after the recording was done is
    // none of the statement's reads.
    expect(recording.reads.length).toBe(reads);
  });

  it("still records what a lowering reads through an object it wrote back as it found it", async () => {
    const { recordLowering, readsHold } = await import("../../compiler/lower/recordingContext");
    const ctx = {
      probe: { value: "one" },
      read: () => "",
      lineNumber: () => 0,
      characterNumber: () => 0,
    };
    const object = ctx.probe;
    const { ctx: recorded, finish } = recordLowering(ctx as never, 0, 0);
    const lowering = recorded as unknown as typeof ctx;
    // The save and restore a lowerer writes around a block of its own
    // (`lowerLuauUI`), then a read of what it put back: the object is the
    // context's, not the lowering's, so its members are inputs.
    const saved = lowering.probe;
    lowering.probe = saved;
    expect(lowering.probe.value).toBe("one");
    const recording = finish();
    expect(recording.unkeyable).toBeNull();
    expect(ctx.probe).toBe(object);
    expect(readsHold(ctx as never, 0, recording.reads)).toBe(true);
    ctx.probe.value = "two";
    expect(readsHold(ctx as never, 0, recording.reads)).toBe(false);
  });
});

// ---- Loops and nested `choose` blocks (#1683) --------------------------------

/** A clause holding a loop of each form and a `choose` block written in it,
 *  with a named choice and a labelled `then` clause, among lines no edit
 *  below touches; `heads` replaces the heads that read `n`. */
const loopsScript = (
  heads: Partial<Record<"while" | "for" | "forIn" | "repeat" | "choice", string>> = {},
  clause: readonly string[] = [],
) =>
  clauseScript(
    [
      "Line one.",
      ...clause,
      ...FILLER,
      heads.while ?? "while trust < 2 do",
      "  & trust = trust + 1",
      "  In the while {trust}.",
      "  if trust > 5 then",
      "    break",
      "  end",
      "end",
      heads.for ?? "for i = 1, 2 do",
      "  In the for {i}.",
      "  if i > 1 then",
      "    continue",
      "  end",
      "end",
      heads.forIn ?? "for k, v in { a = 1 } do",
      "  In the generic for {v}.",
      "end",
      "repeat",
      "  In the repeat.",
      "  & trust = trust - 1",
      heads.repeat ?? "until trust <= 0",
      "choose",
      heads.choice ?? "  + [Left]",
      "    You go left.",
      "  * (right) [Right]",
      "    You go right.",
      "then (inner)",
      "  After the inner choice.",
      "end",
      ...FILLER,
      "Line last.",
    ],
    ["store trust = 0", ""],
  );

describe("a loop or a `choose` block written in a body (#1683)", () => {
  it("is served when an edit elsewhere in its block lowers the block again, with the statements of its bodies, and keeps its chunk", () => {
    const s = warmed(loopsScript());
    const before = new Set(rootChunks(s.root));
    s.edit("Line one.", "Line one, edited.");
    // The loops of each form and the `choose` block, with every statement
    // of their bodies, are served as the lines around them are.
    expect(loweredOutside(s)).toEqual([]);
    expect(s.stats.served).toBeGreaterThanOrEqual(2 * FILLER.length + 5);
    // The edited line's chunk, and no other: each loop's, the `choose`
    // block's and their bodies' statements' are the same objects.
    expect(rootChunks(s.root).filter((chunk) => !before.has(chunk)).length).toBe(1);
    sameAsCold(s);
    expect(storyFacts(s.compiler)).toEqual(coldFacts(s.text));
  });

  it("is served again by a second edit elsewhere, and keeps the chunk it kept", () => {
    const s = warmed(loopsScript());
    s.edit("Line one.", "Line one, edited.");
    const before = new Set(rootChunks(s.root));
    s.edit("Line last.", "Line last, edited.");
    expect(loweredOutside(s)).toEqual([]);
    expect(rootChunks(s.root).filter((chunk) => !before.has(chunk)).length).toBe(1);
    sameAsCold(s);
  });

  it("is served when an edit above it moves it, and its program is a cold compile's", () => {
    const s = warmed(loopsScript());
    s.edit("    Line one.\n", "    Line one.\n    A line written above them.\n");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
    expect(storyFacts(s.compiler)).toEqual(coldFacts(s.text));
  });
});

// Each loop form and a `choose` block written in a clause, alone among lines
// no edit below touches, its head reading a global only it reads.
const KINDS = {
  while: { head: "while w < 2 do", body: ["  In the while.", "end"] },
  for: { head: "for i = 1, f do", body: ["  In the for {i}.", "end"] },
  "for ... in": { head: "for k, v in g do", body: ["  In the generic for {v}.", "end"] },
  repeat: { head: "repeat", body: ["  In the repeat.", "until r <= 0"] },
  choose: {
    head: "choose",
    body: ["  * if c > 0 [Left]", "    You go left.", "  + [Right]", "    You go right.", "end"],
  },
} as const;

const kindScript = (kind: keyof typeof KINDS) =>
  clauseScript(
    ["Line one.", ...FILLER, KINDS[kind].head, ...KINDS[kind].body, ...FILLER, "Line last."],
    ["store w = 0", "store f = 2", "store g = { a = 1 }", "store r = 0", "store c = 1", ""],
  );

describe("an edit that changes what a loop or a `choose` block written in a body lowers to (#1683)", () => {
  const readers = { while: "w", for: "f", "for ... in": "g", repeat: "r", choose: "c" } as const;
  for (const kind of Object.keys(KINDS) as (keyof typeof KINDS)[]) {
    it(`lowers again the ${kind} whose own lowering reads a local declared above it, and no other statement`, () => {
      const s = warmed(kindScript(kind));
      const before = new Set(rootChunks(s.root));
      s.edit("    Line one.\n", `    Line one.\n    local ${readers[kind]} = 5\n`);
      // The block statement, whose head reads the locals declared around
      // it; the statements of its body, which read no local of the name,
      // are served inside it.
      expect(loweredOutside(s)).toEqual([KINDS[kind].head]);
      // The new local's chunk and the block statement's: the statements of
      // its body keep theirs.
      expect(rootChunks(s.root).filter((chunk) => !before.has(chunk)).length).toBeLessThanOrEqual(2);
      sameAsCold(s);
      expect(storyFacts(s.compiler)).toEqual(coldFacts(s.text));
    });

    it(`serves the ${kind} again once the local it read goes`, () => {
      const s = warmed(kindScript(kind));
      s.edit("    Line one.\n", `    Line one.\n    local ${readers[kind]} = 5\n`);
      s.edit(`    local ${readers[kind]} = 5\n`, "");
      s.edit("Line last.", "Line last, edited.");
      expect(loweredOutside(s)).toEqual([]);
      sameAsCold(s);
    });
  }

  it("lowers again a loop with the statement of its body whose lowering reads otherwise, and no other statement", () => {
    try {
      // A field of the context only the image line in the loop's body reads
      // (`probe`, above): the loop is lowered again for it, as the line is.
      probe.value = "one";
      const s = warmed(
        clauseScript(["Line one.", ...FILLER, "while w < 2 do", "  [[show backdrop alley]]", "end", ...FILLER], ["store w = 0", ""]),
      );
      probe.value = "two";
      s.edit("Line one.", "Line one, edited.");
      expect(loweredOutside(s)).toEqual(["[[show backdrop alley]]", "while w < 2 do"]);
      sameAsCold(s);
    } finally {
      probe.value = undefined;
    }
  });
});

describe("a loop or a `choose` block served from its memo, as the rest of the story reads it (#1683)", () => {
  it("declares again the loop's variables and the locals of its body, which stay in its scope", () => {
    const s = warmed(
      clauseScript(
        [
          "Line one.",
          ...FILLER,
          "for i = 1, 2 do",
          "  local x = i",
          "  In the for {x}.",
          "end",
          "for k, v in { a = 1 } do",
          "  In the generic for {k}.",
          "end",
          "Read after the loops {i} {x} {k}.",
          "& i = 3",
          ...FILLER,
        ],
        ["store trust = 0", ""],
      ),
    );
    s.edit("Line one.", "Line one, edited.");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
    expect(storyFacts(s.compiler)).toEqual(coldFacts(s.text));
    // A line after the loops lowered anew reads them as a cold compile
    // does.
    s.edit("Read after the loops {i} {x} {k}.", "Read after the loops, again, {i} {x} {k}.");
    sameAsCold(s);
    expect(storyFacts(s.compiler)).toEqual(coldFacts(s.text));
  });

  it("names the labels of a `choose` block, which a divert written after it reaches and a line reads the count of", () => {
    const s = warmed(
      clauseScript(
        [
          "Line one.",
          ...FILLER,
          "choose",
          "  * (left) [Left]",
          "    You go left.",
          "  + [Right]",
          "    You go right.",
          "then (inner)",
          "  After the inner choice.",
          "end",
          ...FILLER,
          "Line last.",
        ],
      ),
    );
    s.edit("Line one.", "Line one, edited.");
    expect(loweredOutside(s)).toEqual([]);
    s.edit("Line last.", "Seen {left} and {inner}.\n    -> inner");
    sameAsCold(s);
    // A label written again in the clause is reported against the label
    // the block's stand-in names, as a cold compile reports it, and keeps
    // the program from being built, as it keeps a cold compile's.
    s.edit("    Line one, edited.\n", "    Line one, edited.\n    label inner\n");
    const coldProgram = cold({ [MAIN_URI]: s.text });
    expect(diagnostics(s.program)).toEqual(diagnostics(coldProgram));
    expect(diagnostics(s.program).join("\n")).toContain("inner");
    expect(!!s.program.chunks).toBe(!!coldProgram.chunks);
  });

  it("keeps the count symbols of a `choose` block's choices when it is lowered again after it was served", () => {
    const text = clauseScript([
      "Line one.",
      ...FILLER,
      "choose",
      "  * [Left]",
      "    You go left.",
      "  * [Right]",
      "    You go right.",
      "end",
      ...FILLER,
    ]);
    const s = warmed(text);
    const choicesOf = () => {
      const store = s.compiler.chunkStore! as any;
      for (const block of compiledBlocks(s, "LuauSparkdownChooseBlock")) {
        for (const body of block.statement?.bodies ?? []) {
          for (const statement of body.statements) {
            if (statement.node === "LuauSparkdownChooseBlock") {
              const chunk = store.chunkOf(statement.memo ?? statement);
              return store._info.get(chunk)?.choices.map((part: { symbol: number }) => part.symbol);
            }
          }
        }
      }
      return undefined;
    };
    const symbols = choicesOf();
    expect(symbols?.length).toBe(2);
    s.edit("Line one.", "Line one, edited.");
    expect(loweredOutside(s)).toEqual([]);
    expect(choicesOf()).toEqual(symbols);
    // An edit of the block lowers it again, and its choices keep their
    // symbols, as a block lowered again keeps them.
    s.edit("    You go left.", "    You go left, quickly.");
    expect(choicesOf()).toEqual(symbols);
    sameAsCold(s);
  });
});

describe("the names a loop's lowering makes from its place (#1683)", () => {
  /** The labels a loop's lowering made in the story the last compile
   *  resolved, each with the line it stands on, in the story's order. */
  const loopLabels = (compiler: SparkdownCompiler): string[] => {
    const story = (compiler as any)._programResolver._story as ParsedObject;
    const out: string[] = [];
    const visit = (obj: ParsedObject) => {
      const name = (obj as { identifier?: { name?: string } }).identifier?.name;
      if (obj.typeName === "Gather" && name && /^__synth_\d+$/.test(name)) {
        out.push(`${obj.debugMetadata?.startLineNumber}:${name}`);
      }
      parsedChildren(obj).forEach(visit);
    };
    visit(story);
    return out;
  };
  const coldLabels = (text: string) => {
    const c = programCompiler({ [MAIN_URI]: text });
    quietly(() => c.compile());
    return loopLabels(c.compiler as SparkdownCompiler);
  };

  it("are numbered for a loop lowered after served loops as a cold compile numbers them", () => {
    const s = warmed(
      clauseScript(
        [
          "Line one.",
          ...FILLER,
          "while trust < 2 do",
          "  & trust = trust + 1",
          "end",
          "for i = 1, 2 do",
          "  In the for {i}.",
          "end",
          ...FILLER,
          "while trust < 3 do",
          "  In the last loop.",
          "end",
        ],
        ["store trust = 0", ""],
      ),
    );
    // The last loop is lowered, the two above it served.
    s.edit("while trust < 3 do", "while trust < 4 do");
    expect(loweredOutside(s)).toEqual([]);
    expect(s.stats.loweredAt.map((at) => s.text.slice(at, s.text.indexOf("\n", at)).trim())).toContain(
      "while trust < 4 do",
    );
    const incremental = loopLabels(s.compiler);
    const cold = coldLabels(s.text);
    // As many names as a cold compile's, so the lowered loop's are a cold
    // compile's.
    expect(incremental.map((label) => label.split(":")[1]).sort()).toEqual(
      cold.map((label) => label.split(":")[1]).sort(),
    );
    const last = (labels: string[]) => labels.slice(-2);
    expect(last(incremental)).toEqual(last(cold));
    sameAsCold(s);
  });
});
