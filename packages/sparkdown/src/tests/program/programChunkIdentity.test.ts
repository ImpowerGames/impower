// A statement keeps its chunk across compiles by the identity rule of the
// design of record (docs/engine/binary-program.md, section 1, Identity): its
// syntax is what the incremental parse kept, every lowering input it recorded
// reads the same, and every fact its reference table records is unchanged.
// These tests count the chunks a compile emits and compare every other chunk
// by identity (#694).
import { describe, expect, it } from "vitest";
import { buildBeatsFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import type { CompiledBlock } from "../../compiler/classes/annotators/CompilationAnnotator";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { ChunkStore, type FlowSource } from "../../program/ChunkStore";
import type { ProgramEmitter } from "../../program/ProgramEmitter";
import { Op } from "../../program/ProgramInstructions";
import type { ProgramRoot } from "../../program/ProgramRoot";
import {
  internSymbol,
  SymbolKind,
  type SymbolKindValue,
} from "../../program/ProgramSymbols";
import { ProgramStory } from "../../program/ProgramStory";
import { cumulativeEdits } from "./cumulativeEdits";
import { FUNCTION_INSERTS, functionScreenplay } from "./functionScreenplay";
import {
  describeRoot,
  programCompiler,
  rootChunks,
  storyBeats,
} from "./programHarness";
import {
  programStatements,
  uniqueKeys,
  untouchedChunks,
} from "./programStatements";

const MAIN = "inmemory:///main.sd";
const CHARACTERS = "inmemory:///scripts/characters.sd";

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

/** A compiler over `texts` with statement chunks on, and an editor of its
 *  main script that compiles after each edit. */
function session(texts: Record<string, string>) {
  const c = programCompiler(texts, {
    seedBuiltinsIntoStory: true,
  });
  let text = texts[MAIN]!;
  let version = 1;
  let program = c.compile().program;
  let root = program.chunks!;
  return {
    get root() {
      return root;
    },
    /** The program of the last compile. */
    get program() {
      return program;
    },
    get store() {
      return c.compiler.chunkStore!;
    },
    compiler: c.compiler,
    /** Replaces the first `find` with `replace` as one minimal edit. */
    edit(find: string, replace: string) {
      const offset = text.indexOf(find);
      expect(offset, `"${find}" is in the script`).toBeGreaterThanOrEqual(0);
      version += 1;
      c.compiler.updateDocument({
        textDocument: { uri: MAIN, version },
        contentChanges: [
          {
            range: {
              start: posAt(text, offset),
              end: posAt(text, offset + find.length),
            },
            text: replace,
          },
        ],
      });
      text = text.slice(0, offset) + replace + text.slice(offset + find.length);
      program = c.compile().program;
      expect(program.chunks).toBeDefined();
      root = program.chunks!;
      return root;
    },
  };
}

/** The chunks of `after` that `before` does not hold. */
const newChunks = (before: ProgramRoot, after: ProgramRoot) => {
  const held = new Set(rootChunks(before));
  return rootChunks(after).filter((chunk) => !held.has(chunk));
};

const beats = () => {
  const { files } = buildBeatsFixture({ lines: 400 });
  return {
    [MAIN]: files.get("main.sd")!,
    [CHARACTERS]: files.get("scripts/characters.sd")!,
  };
};

describe("an edit inside one beat of the beats fixture", () => {
  it("re-emits exactly one chunk and keeps every other", () => {
    const s = session(beats());
    const lines = beats()[MAIN]!.split("\n");
    // Every beat of the fixture's scene is a statement with a chunk of its own.
    expect(s.root.flowNamed("MAIN")!.arrays.chunks.length).toBeGreaterThan(100);
    // The first edit after a cold compile, then edits further down, each in
    // a line of dialogue or action.
    for (const line of [lines[7]!, lines[20]!, lines[3]!, lines[40]!]) {
      const before = s.root;
      const after = s.edit(line, `${line} Still.`);
      expect(s.store.emittedLastBuild).toBe(1);
      expect(newChunks(before, after)).toHaveLength(1);
      expect(rootChunks(after)).toHaveLength(rootChunks(before).length);
    }
  });

  it("runs the edited beat as a cold compile of the text runs it", () => {
    const s = session(beats());
    s.edit("Then stop smiling like that.", "Then stop smiling like that, now.");
    const incremental = storyBeats(new ProgramStory(s.root), "MAIN");
    const text = beats()[MAIN]!.replace(
      "Then stop smiling like that.",
      "Then stop smiling like that, now.",
    );
    const cold = programCompiler(
      { ...beats(), [MAIN]: text },
      { seedBuiltinsIntoStory: true },
    ).compile().program.chunks!;
    expect(incremental).toEqual(storyBeats(new ProgramStory(cold), "MAIN"));
    expect(incremental.beats.some((b) => b.text.includes("like that, now."))).toBe(true);
  });
});

// A glued continuation's beats after a `>` break take the routing of the line
// it continues, which its lowering reads outside its own syntax and records.
// Changing that line's cue changes the continuation's recorded input, and
// the store emits the continuation again although its own text is the same.
describe("a recorded lowering input", () => {
  const filler = Array.from({ length: 8 }, (_, i) => `Filler line ${i}.`);
  const text = [
    ...filler,
    "HERO: Wait ..",
    "// a comment between",
    ".. right there. > And then more.",
    "After.",
    ...filler,
    "",
  ].join("\n");

  it("re-emits the statement that read it and no other", () => {
    const s = session({ [MAIN]: text });
    s.edit("Filler line 0.", "Filler line 0!");
    const before = s.root;
    const after = s.edit("HERO: Wait", "RIVAL: Wait");
    const flow = after.flowNamed("")!.arrays.chunks;
    const beforeFlow = before.flowNamed("")!.arrays.chunks;
    const reemitted = flow
      .map((chunk, entry) => (chunk === beforeFlow[entry] ? null : entry))
      .filter((entry) => entry !== null);
    // The edited line (entry 8) and the continuation (entry 9), whose text is
    // unchanged; the lines around them keep their chunks.
    expect(reemitted).toEqual([8, 9]);
    expect(s.store.emittedLastBuild).toBe(2);
    const { beats: shown } = storyBeats(new ProgramStory(after));
    const continued = shown.find((b) => b.text.includes("And then more."))!;
    expect(continued.tables[0]).toEqual(
      expect.arrayContaining([["target", "dialogue"], ["character", "RIVAL"]]),
    );
  });
});

// A `done` raises a hint over the statements after it in its scope, which its
// lowering finds outside its own syntax and records. An edit far enough below
// it that the reparse leaves it carried, but that changes those statements,
// lowers it again although its own text is the same. The hint is not its
// code, so the store keeps its chunk and emits only the statement added.
describe("the statements a `done` leaves unreachable", () => {
  const filler = Array.from({ length: 6 }, (_, i) => `Filler line ${i}.`);
  const text = [
    ...filler,
    "scene intro",
    "  Hello.",
    "  done",
    "  Never.",
    "  Line 2.",
    "  Line 3.",
    "  Also never.",
    "end",
    ...filler,
    "",
  ].join("\n");
  const hints = (program: { diagnostics?: Record<string, unknown[]> }) =>
    ((program.diagnostics?.[MAIN] ?? []) as any[])
      .filter((d) => String(d.message?.value ?? d.message).startsWith("Unreachable"))
      .map(
        (d) =>
          `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character}`,
      );

  const edits: [string, string, string][] = [
    ["one added after them", "  Also never.\n", "  Also never.\n  Still never.\n"],
    ["one added among them", "  Line 3.\n", "  Line 3.\n  Line 3b.\n"],
  ];
  for (const [edit, find, replace] of edits) {
    it(`are hinted as a cold compile hints them after an edit below the \`done\`: ${edit}`, () => {
      const s = session({ [MAIN]: text });
      s.edit("Filler line 0.", "Filler line 0!");
      expect(hints(s.program)).toEqual(["9:0-12:13"]);
      const after = s.edit(find, replace);
      expect(s.store.emittedLastBuild).toBe(1);
      const edited = text.replace("Filler line 0.", "Filler line 0!").replace(find, replace);
      const cold = programCompiler(
        { [MAIN]: edited },
        { seedBuiltinsIntoStory: true },
      ).compile().program;
      expect(hints(s.program)).toEqual(hints(cold));
      expect(describeRoot(after)).toEqual(describeRoot(cold.chunks!));
    });
  }
});

// Tags written right after the inline text of a line are a statement of their
// own. Shortening the text before them moves them along the line, and their
// chunk's line rows hold columns, so it is emitted again with the new ones.
describe("a statement that shares its first line with another", () => {
  const filler = Array.from({ length: 6 }, (_, i) => `Filler line ${i}.`);
  const text = [
    ...filler,
    "You see a ..",
    ".. door in the hall# t",
    "After.",
    ...filler,
    "",
  ].join("\n");

  it("is emitted again when the statement before it on its line changes length", () => {
    const s = session({ [MAIN]: text });
    s.edit("Filler line 0.", "Filler line 0!");
    const after = s.edit("door in the hall", "door in hall");
    // The edited text and the tags after it.
    expect(s.store.emittedLastBuild).toBe(2);
    const cold = programCompiler(
      {
        [MAIN]: text
          .replace("Filler line 0.", "Filler line 0!")
          .replace("door in the hall", "door in hall"),
      },
      { seedBuiltinsIntoStory: true },
    ).compile().program.chunks!;
    expect(describeRoot(after)).toEqual(describeRoot(cold));
  });
});

// The main script's compiled blocks, each with its first line.
const blockLines = (compiler: SparkdownCompiler) => {
  const document = compiler.documents.get(MAIN)!;
  const lines = new Map<CompiledBlock, number>();
  const cur = compiler.documents.annotations(MAIN).compilations.iter();
  while (cur.value) {
    lines.set(cur.value.type as CompiledBlock, document.positionAt(cur.from).line);
    cur.next();
  }
  return lines;
};

// The compiled block that covers the first `find` of the main script.
const blockAt = (compiler: SparkdownCompiler, find: string) => {
  const at = compiler.documents.get(MAIN)!.getText().indexOf(find);
  const cur = compiler.documents.annotations(MAIN).compilations.iter();
  while (cur.value) {
    if (cur.from <= at && at < cur.to) {
      return cur.value.type as CompiledBlock;
    }
    cur.next();
  }
  throw new Error(`no compiled block covers "${find}"`);
};

// A continuation's routing read is asked of the continuation's own node, which
// can stand inside a block statement, below its chunk's top-level node. An
// edit re-annotates the document from the edit onward, so an edit below the
// block leaves the block as it was lowered, with statement chunks on or off;
// the reads are kept only when they are on.
describe("a continuation inside a block", () => {
  const filler = Array.from({ length: 8 }, (_, i) => `Filler line ${i}.`);
  const text = [
    "store x = 1",
    "if x then",
    "  You see a ..",
    "  .. door. > It opens.",
    "end",
    ...filler,
    "",
  ].join("\n");
  const BLOCK_LINE = 1;
  const EDITED_LINE = 12;

  it("is not lowered again by an edit below it", () => {
    const c = programCompiler({ [MAIN]: text });
    c.compile();
    const before = blockLines(c.compiler);
    expect(blockAt(c.compiler, "if x then").reads).toBeDefined();
    const find = "Filler line 7.";
    const offset = text.indexOf(find);
    c.compiler.updateDocument({
      textDocument: { uri: MAIN, version: 2 },
      contentChanges: [
        {
          range: {
            start: posAt(text, offset),
            end: posAt(text, offset + find.length),
          },
          text: "Filler line 7!",
        },
      ],
    });
    c.compile();
    // The first lines of the blocks the edit lowered again. The lines are
    // compared rather than the blocks, whose difference is too large to
    // print.
    const lowered = [...blockLines(c.compiler)]
      .filter(([block]) => !before.has(block))
      .map(([, line]) => line);
    expect(lowered).toContain(EDITED_LINE);
    expect(lowered).not.toContain(BLOCK_LINE);
  });
});

// A test statement whose code refers to a symbol, as a divert will: its chunk
// records the facts about that symbol, and is kept only while they hold.
class RefersTo extends ParsedObject {
  constructor(public symbol: number) {
    super();
  }
  public override EmitProgram(emitter: ProgramEmitter): void {
    emitter.reference(this.symbol);
    emitter.emit(Op.Done);
  }
}

describe("a reference table", () => {
  // A store whose top level holds one statement that refers to TARGET, and
  // the flows of a program that defines TARGET as `kind`, or not at all.
  const refersToTarget = () => {
    const store = new ChunkStore();
    const target = internSymbol(store.table, "TARGET");
    const statement = {
      block: {},
      objects: [new RefersTo(target)],
      range: null,
      firstLine: 0,
      source: () => "-> TARGET",
      syntax: () => "Divert\u0000-> TARGET",
      reads: "[]",
    };
    const flows = (kind: SymbolKindValue | null): FlowSource[] => [
      { name: "", kind: SymbolKind.Root, uri: MAIN, firstLine: 0, span: 1, statements: [statement] },
      ...(kind !== null
        ? [{ name: "TARGET", kind, uri: MAIN, firstLine: 2, span: 1, statements: [] }]
        : []),
    ];
    const chunk = (root: ProgramRoot) => root.flowNamed("")!.arrays.chunks[0];
    return { store, flows, chunk };
  };

  it("keeps a chunk while the facts about its symbols hold", () => {
    const { store, flows, chunk } = refersToTarget();
    const first = store.build(flows(SymbolKind.Scene), true).root!;
    const same = store.build(flows(SymbolKind.Scene), true).root!;
    expect(store.emittedLastBuild).toBe(0);
    expect(chunk(same)).toBe(chunk(first));
    // The program no longer defines the symbol, and nothing else changed.
    const without = store.build(flows(null), true).root!;
    expect(store.emittedLastBuild).toBe(1);
    expect(chunk(without)).not.toBe(chunk(first));
  });

  // A name's kind is what the program being built defines it as, as when an
  // edit turns a scene into a branch of the same name.
  it("emits a chunk again when a symbol it refers to is defined as another kind", () => {
    const { store, flows, chunk } = refersToTarget();
    const scene = store.build(flows(SymbolKind.Scene), true).root!;
    const branch = store.build(flows(SymbolKind.Branch), true).root!;
    expect(store.emittedLastBuild).toBe(1);
    expect(chunk(branch)).not.toBe(chunk(scene));
    const again = store.build(flows(SymbolKind.Branch), true).root!;
    expect(store.emittedLastBuild).toBe(0);
    expect(chunk(again)).toBe(chunk(branch));
  });
});

describe("a flow's kind", () => {
  const text = "Intro.\nscene SAME\n  One.\nend\n";
  // Whether a root's description gives the flow SAME the kind.
  const describesSameAs = (root: ProgramRoot, kind: SymbolKindValue) =>
    describeRoot(root).some((line) => line.startsWith(`flow "SAME" kind ${kind} `));

  it("is the kind a cold compile gives after an edit turns a scene into a branch", () => {
    const s = session({ [MAIN]: text });
    s.edit("Intro.", "Intro!");
    const after = s.edit("scene SAME", "branch SAME");
    const cold = programCompiler(
      {
        [MAIN]: text.replace("Intro.", "Intro!").replace("scene SAME", "branch SAME"),
      },
      { seedBuiltinsIntoStory: true },
    ).compile().program.chunks!;
    expect(describeRoot(after)).toEqual(describeRoot(cold));
    expect(describesSameAs(after, SymbolKind.Branch)).toBe(true);
  });

  // Every root reads one table, so the kind is each root's own: a preview that
  // turns the scene into a branch, and then the edit itself, leave a root
  // built before them as it was.
  it("stays as a root built before an edit to it gave it", () => {
    const s = session({ [MAIN]: text });
    const held = s.root;
    const described = describeRoot(held);
    expect(describesSameAs(held, SymbolKind.Scene)).toBe(true);
    const offset = text.indexOf("scene SAME");
    const preview = s.compiler.previewCompile({
      textDocument: { uri: MAIN, version: 1 },
      contentChanges: [
        {
          range: {
            start: posAt(text, offset),
            end: posAt(text, offset + "scene".length),
          },
          text: "branch",
        },
      ],
      root: { uri: MAIN },
      startFrom: { file: MAIN, line: 0 },
    });
    expect(describesSameAs(preview.program!.chunks!, SymbolKind.Branch)).toBe(true);
    expect(describeRoot(held)).toEqual(described);
    const after = s.edit("scene SAME", "branch SAME");
    expect(describesSameAs(after, SymbolKind.Branch)).toBe(true);
    expect(describeRoot(held)).toEqual(described);
  });
});

describe("a preview compile", () => {
  it("leaves the chunk store as it was", () => {
    const s = session(beats());
    s.edit("The rain has not let up since noon.", "The rain has not let up.");
    const current = s.store.current!;
    const held = rootChunks(current);
    const line = "The window rattles in its frame.";
    const text = beats()[MAIN]!.replace(
      "The rain has not let up since noon.",
      "The rain has not let up.",
    );
    const offset = text.indexOf(line) + line.length;
    const preview = s.compiler.previewCompile({
      textDocument: { uri: MAIN, version: 2 },
      contentChanges: [
        { range: { start: posAt(text, offset), end: posAt(text, offset) }, text: " Loudly." },
      ],
      root: { uri: MAIN },
      startFrom: { file: MAIN, line: 0 },
    });
    // The preview built a root of its own, holding the edited statement.
    const previewRoot = preview.program!.chunks!;
    expect(previewRoot).not.toBe(current);
    expect(newChunks(current, previewRoot)).toHaveLength(1);
    // The store's root, and every chunk it holds, are as they were.
    expect(s.store.current).toBe(current);
    const after = rootChunks(s.store.current!);
    expect(after).toHaveLength(held.length);
    expect(after.every((chunk, i) => chunk === held[i])).toBe(true);
  });
});

// An `if` and each loop is one chunk whose bodies are blocks (#695): the
// owner's chunk names each body's sequence, and the statements of a body have
// chunks of their own.
describe("a block statement", () => {
  const text = [
    "store n = 0",
    "scene MAIN",
    "  Before.",
    "  if n == 0 then",
    "    In the if.",
    "  else",
    "    In the else.",
    "  end",
    "  while n < 2 do",
    "    n = n + 1",
    "    if n == 1 then",
    "      In the nested if.",
    "    end",
    "    In the while.",
    "  end",
    "  for i = 1, 2 do",
    "    In the for {i}.",
    "  end",
    "  for k, v in { a = 1 } do",
    "    In the generic for {v}.",
    "  end",
    "  repeat",
    "    In the repeat.",
    "    n = n - 1",
    "  until n <= 0",
    "  do",
    "    In the do.",
    "  end",
    "  After.",
    "end",
    "",
  ].join("\n");

  // The chunks of every sequence of a root, by the sequence's id, so that a
  // test can say which sequence a new chunk stands in.
  const sequencesOf = (root: ProgramRoot) =>
    new Map([...root.sequences()].map((row) => [row.id, row.arrays.chunks]));

  for (const [where, line] of [
    ["an `if` branch", "In the if."],
    ["an `else` branch", "In the else."],
    ["a `while` body", "In the while."],
    ["an `if` inside a `while` body", "In the nested if."],
    ["a `for` body", "In the for {i}."],
    ["a generic `for` body", "In the generic for {v}."],
    ["a `repeat` body", "In the repeat."],
    ["a `do` body", "In the do."],
  ] as const) {
    it(`re-emits only the statement edited in ${where}, and keeps its owners' chunks`, () => {
      const s = session({ [MAIN]: text });
      s.edit("Before.", "Before!");
      const before = s.root;
      const scene = before.flowNamed("MAIN")!.arrays.chunks;
      const after = s.edit(line, line.replace(".", ", edited."));
      expect(s.store.emittedLastBuild).toBe(1);
      const added = newChunks(before, after);
      expect(added).toHaveLength(1);
      // Every statement of the scene, each owner included, is the chunk it
      // was, so every body keeps the sequence id its owner names.
      const sceneAfter = after.flowNamed("MAIN")!.arrays.chunks;
      expect(sceneAfter).toHaveLength(scene.length);
      expect(sceneAfter.every((chunk, i) => chunk === scene[i])).toBe(true);
      // The new chunk stands in a body sequence, not in the scene's.
      const sequence = [...sequencesOf(after)].find(([, chunks]) => chunks.includes(added[0]!));
      expect(sequence![0]).not.toBe(after.flowNamed("MAIN")!.id);
      expect(sequencesOf(before).has(sequence![0])).toBe(true);
    });
  }

  // The line of the owner's `else` is its own, indentation included, since
  // its row holds the column the `else` starts at.
  it("is emitted again when its `else` moves along its line, as a cold compile emits it", () => {
    const s = session({ [MAIN]: text });
    s.edit("Before.", "Before!");
    const edited = s.edit("  else\n", "   else\n");
    const cold = programCompiler(
      { [MAIN]: text.replace("Before.", "Before!").replace("  else\n", "   else\n") },
      { seedBuiltinsIntoStory: true },
    ).compile().program;
    expect(cold.chunks).toBeDefined();
    expect(describeRoot(edited)).toEqual(describeRoot(cold.chunks!));
  });

  // The owner's own line changed: its chunk is emitted again, and its bodies
  // keep their sequences and their statements' chunks.
  it("re-emits only the owner when its own line is edited", () => {
    const s = session({ [MAIN]: text });
    s.edit("Before.", "Before!");
    const before = s.root;
    // The `while` loop, after `Before.` and the `if`.
    const owner = before.flowNamed("MAIN")!.arrays.chunks[2]!;
    const body = before.body(owner, 0)!;
    const after = s.edit("while n < 2 do", "while n < 3 do");
    expect(s.store.emittedLastBuild).toBe(1);
    const ownerAfter = after.flowNamed("MAIN")!.arrays.chunks[2]!;
    expect(ownerAfter).not.toBe(owner);
    expect(newChunks(before, after)).toEqual([ownerAfter]);
    const bodyAfter = after.body(ownerAfter, 0)!;
    expect(bodyAfter.id).toBe(body.id);
    expect(bodyAfter.arrays.chunks).toHaveLength(body.arrays.chunks.length);
    expect(bodyAfter.arrays.chunks.every((chunk, i) => chunk === body.arrays.chunks[i])).toBe(true);
  });
});

// A chunk records how each name its code reads resolved. An edit elsewhere
// can change that without touching the statement: a scene added below makes
// a name that read nothing read the scene's count, which the writer does not
// emit, so the program falls back as a cold compile of the text does.
// A block statement's own text leaves out the lines its bodies hold alone, so
// that an edit inside a body keeps the owner's chunk. A line that holds a
// part of the owner is the owner's, with what a body writes on it: the
// owner's rows hold the columns of its parts, so an edit to the condition, or
// to a body beside it, emits the owner again.
describe("a block statement written on one line", () => {
  const scene = (statement: string) =>
    ["store n = 0", "scene MAIN", "  Before!", `  ${statement}`, "  Result {n}.", "end", ""].join("\n");

  for (const [part, before, after] of [
    ["an `if` condition", "if 1 == 1 then n = 1 end", "if 1 == 2 then n = 1 end"],
    ["an `if` condition with its `else` on the line", "if n == 0 then n = 5 else n = 7 end", "if n == 1 then n = 5 else n = 7 end"],
    ["a `while` loop's test", "while n < 2 do n = n + 1 end", "while n < 3 do n = n + 1 end"],
    ["a `for` loop's range", "for i = 1, 2 do n = n + i end", "for i = 1, 3 do n = n + i end"],
    ["an `if` body", "if 1 == 1 then n = 1 end", "if 1 == 1 then n = 100 end"],
    ["a body before an `elseif` on its line", "if false then n = 1 elseif true then n = 2 end", "if false then n = 10 elseif true then n = 2 end"],
    ["a `while` body", "while n < 2 do n = n + 1 end", "while n < 2 do n = n + 10 end"],
  ] as const) {
    it(`is emitted again when ${part} is edited, as a cold compile of the text emits it`, () => {
      const s = session({ [MAIN]: scene(before).replace("Before!", "Before.") });
      s.edit("Before.", "Before!");
      const edited = s.edit(before, after);
      const cold = programCompiler(
        { [MAIN]: scene(after) },
        { seedBuiltinsIntoStory: true },
      ).compile().program;
      expect(cold.chunks).toBeDefined();
      expect(storyBeats(new ProgramStory(edited), "MAIN")).toEqual(
        storyBeats(new ProgramStory(cold.chunks!), "MAIN"),
      );
      expect(describeRoot(edited)).toEqual(describeRoot(cold.chunks!));
    });
  }
});

describe("a name a chunk reads", () => {
  it("emits the chunk again when the name resolves to something else", () => {
    const filler = Array.from({ length: 8 }, (_, i) => `Filler line ${i}.`);
    const text = [...filler, "Seen {extra}.", ...filler, ""].join("\n");
    const c = programCompiler({ [MAIN]: text });
    expect(c.compile().program.chunks).toBeDefined();
    const added = "scene extra\n  Inside.\nend\n";
    c.compiler.updateDocument({
      textDocument: { uri: MAIN, version: 2 },
      contentChanges: [
        { range: { start: posAt(text, text.length), end: posAt(text, text.length) }, text: added },
      ],
    });
    const before = c.compiler.chunkStore!.current!;
    const { program } = c.compile();
    const cold = programCompiler({ [MAIN]: text + added }).compile().program;
    // The name now reads the scene's count (#696).
    expect(cold.chunks).toBeDefined();
    expect(program.chunks).toBeDefined();
    expect(describeRoot(program.chunks!)).toEqual(describeRoot(cold.chunks!));
    const reads = (root: ProgramRoot) =>
      describeRoot(root).filter((line) => /GetCount|GetVar extra/.test(line));
    expect(reads(before).join("\n")).toMatch(/GetVar extra/);
    expect(reads(program.chunks!).join("\n")).toMatch(/GetCount "extra"/);
  });
});

// The root of a cold compile of `source`, and what the program engine shows
// running a root.
const coldRoot = (source: string) =>
  programCompiler(
    { [MAIN]: source },
    { seedBuiltinsIntoStory: true },
  ).compile().program.chunks!;
const shows = (root: ProgramRoot) =>
  storyBeats(new ProgramStory(root)).beats.map((beat) => beat.text.trim());

// A function a statement writes captures the names its body reads: the
// statement's code passes them and binds them at the function's entry, as a
// call of a variadic function passes them. The body's lines are not the
// statement's syntax, so its lowering records them, and the store emits the
// statement again when an edit to the body changes them, and only then.
describe("a statement that writes a function", () => {
  const demo = (fn: string[]) =>
    [
      "function demo()",
      "  local a = 1",
      "  local b = 2",
      ...fn.map((l) => `  ${l}`),
      "  return f()",
      "end",
      "Got {tostring(demo())}.",
      "",
    ].join("\n");
  it.each([
    ["a closure", ["local f = function()", "  return a", "end"], "return b", "Got 2."],
    ["a local function", ["local function f()", "  return a", "end"], "return b", "Got 2."],
    ["a function declared with `...`, and the call to it", ["function f(...)", "  return a", "end"], "return b", "Got 2."],
    ["a closure whose body reads one more name", ["local f = function()", "  return a", "end"], "return a + b", "Got 3."],
  ])("is emitted again when an edit to the body of %s changes the names it captures", (_name, fn, replace, line) => {
    const text = demo(fn);
    const s = session({ [MAIN]: text });
    expect(shows(s.root)).toEqual(["Got 1."]);
    const edited = s.edit("return a", replace);
    expect(describeRoot(edited)).toEqual(
      describeRoot(coldRoot(text.replace("return a", replace))),
    );
    expect(shows(edited)).toEqual([line]);
  });

  // A method's `self` is its first parameter, not a capture: the method
  // captures the other names its body reads.
  const method = [
    "function run()",
    "  local a = 1",
    "  local b = 5",
    "  local t = { x = 2 }",
    "  function t:m()",
    "    return self.x + a",
    "  end",
    "  return t:m()",
    "end",
    "Got {run()}.",
    "",
  ].join("\n");
  const methodChunk = (s: ReturnType<typeof session>) =>
    programStatements(s.compiler).find(
      (statement) => statement.from === method.indexOf("  function t:m()"),
    )!.chunk;

  it("is emitted again when an edit to a method's body changes the names it captures", () => {
    const s = session({ [MAIN]: method });
    expect(shows(s.root)).toEqual(["Got 3."]);
    const owner = methodChunk(s);
    const edited = s.edit("self.x + a", "self.x + b");
    expect(methodChunk(s)).not.toBe(owner);
    expect(describeRoot(edited)).toEqual(
      describeRoot(coldRoot(method.replace("self.x + a", "self.x + b"))),
    );
    expect(shows(edited)).toEqual(["Got 7."]);
  });

  // An edit that moves the body's read of `self` before a captured local
  // changes none of the statement's code.
  it("keeps its chunk when an edit to a method's body changes no name it captures", () => {
    const s = session({ [MAIN]: method });
    expect(shows(s.root)).toEqual(["Got 3."]);
    const before = s.root;
    const owner = methodChunk(s);
    const edited = s.edit("self.x + a", "a + self.x");
    expect(methodChunk(s)).toBe(owner);
    // Only the body's `return` is emitted again.
    expect(newChunks(before, edited)).toHaveLength(1);
    expect(describeRoot(edited)).toEqual(
      describeRoot(coldRoot(method.replace("self.x + a", "a + self.x"))),
    );
    expect(shows(edited)).toEqual(["Got 3."]);
  });

  // A closure calls a function declared with `...` in the same function by
  // name and does not capture it, so an edit that swaps its calls of two
  // such functions changes none of the statement's code.
  it("keeps its chunk when an edit to a closure's body swaps its calls of two functions it does not capture", () => {
    const text = [
      "function run()",
      "  function foo(...) return 1 end",
      "  function bar(...) return 2 end",
      "  local f = function()",
      "    return foo() * 10 + bar()",
      "  end",
      "  return f()",
      "end",
      "Got {run()}.",
      "",
    ].join("\n");
    const s = session({ [MAIN]: text });
    expect(shows(s.root)).toEqual(["Got 12."]);
    const closure = () =>
      programStatements(s.compiler).find(
        (statement) => statement.from === text.indexOf("  local f = function()"),
      )!.chunk;
    const before = s.root;
    const owner = closure();
    const edited = s.edit("foo() * 10 + bar()", "bar() * 10 + foo()");
    expect(closure()).toBe(owner);
    expect(newChunks(before, edited)).toHaveLength(1);
    expect(describeRoot(edited)).toEqual(
      describeRoot(
        coldRoot(text.replace("foo() * 10 + bar()", "bar() * 10 + foo()")),
      ),
    );
    expect(shows(edited)).toEqual(["Got 21."]);
  });

  // A function defined in an `if` block runs in place, where it stands: its
  // statement's code binds the parameters and declares the hoisted locals,
  // and the functions its body declares, with the closures they create, are
  // other chunks' code. Its chunk refers to none of those closures, so it
  // holds while they keep their symbols (the cumulative fuzz of the function
  // screenplay, seed 2029, after an edit broke a scene's `end`).
  it("keeps its chunk across an edit elsewhere when it runs in place and a function in its body creates a closure", () => {
    const text = [
      "if true then",
      "  function outer()",
      "    function inner()",
      "      local by = function(a, b) return a > b end",
      "      return by(2, 1)",
      "    end",
      "    result = inner()",
      "  end",
      "end",
      "Got {result}.",
      "More text.",
      "",
    ].join("\n");
    const s = session({ [MAIN]: text });
    expect(shows(s.root)).toEqual(["Got true.", "More text."]);
    const outer = () =>
      programStatements(s.compiler).find(
        (statement) => statement.from === text.indexOf("  function outer()"),
      )!.chunk;
    const before = s.root;
    const owner = outer();
    const edited = s.edit("More text.", "More words.");
    expect(outer()).toBe(owner);
    // Only the edited line is emitted again.
    expect(newChunks(before, edited)).toHaveLength(1);
    expect(describeRoot(edited)).toEqual(
      describeRoot(coldRoot(text.replace("More text.", "More words."))),
    );
    expect(shows(edited)).toEqual(["Got true.", "More words."]);
  });

  // The same function's entry declares the locals its body's functions,
  // declared without `local`, hoist there, in their order, so an edit that
  // swaps two of them emits it again, though its own syntax is unchanged.
  it("is emitted again when it runs in place and an edit swaps two functions its body declares", () => {
    const text = [
      "if true then",
      "  function outer()",
      "    function a() return 1 end",
      "    function b() return 2 end",
      "    result = a() + b() * 10",
      "  end",
      "end",
      "Got {result}.",
      "",
    ].join("\n");
    const swapped = text.replace(
      "    function a() return 1 end\n    function b() return 2 end",
      "    function b() return 2 end\n    function a() return 1 end",
    );
    const s = session({ [MAIN]: text });
    expect(shows(s.root)).toEqual(["Got 21."]);
    const edited = s.edit(
      "    function a() return 1 end\n    function b() return 2 end",
      "    function b() return 2 end\n    function a() return 1 end",
    );
    expect(describeRoot(edited)).toEqual(describeRoot(coldRoot(swapped)));
    expect(shows(edited)).toEqual(["Got 21."]);
  });

  // A `define` written in a `do` block is a global declaration placed with
  // the block: the declaration's chunk builds the table and writes its
  // methods, and the `define`'s own statement emits nothing where it is
  // written. Its chunk refers to none of the methods' symbols, which the
  // declaration gives them (the cumulative fuzz of the function screenplay,
  // seed 2027, after an edit broke a `do` block's `end` above a `define`).
  it("keeps the chunk of a `define` written in a `do` block across an edit elsewhere", () => {
    const text = [
      "do",
      "  define Point with",
      "    x = 2",
      "    function get()",
      "      return self.x",
      "    end",
      "  end",
      "end",
      "Got {new Point():get()}.",
      "More text.",
      "",
    ].join("\n");
    const s = session({ [MAIN]: text });
    expect(shows(s.root)).toEqual(["Got 2.", "More text."]);
    const define = () =>
      programStatements(s.compiler).find(
        (statement) => statement.from === text.indexOf("  define Point with"),
      )!.chunk;
    const before = s.root;
    const owner = define();
    const edited = s.edit("More text.", "More words.");
    expect(define()).toBe(owner);
    // Only the edited line is emitted again.
    expect(newChunks(before, edited)).toHaveLength(1);
    expect(describeRoot(edited)).toEqual(
      describeRoot(coldRoot(text.replace("More text.", "More words."))),
    );
    expect(shows(edited)).toEqual(["Got 2.", "More words."]);
  });

  // A function definition whose header the parser cannot read takes the
  // parameters of the first parameter list in its body, which its syntax
  // leaves out, so an edit to that list changes what the definition's entry
  // binds without changing the statement's syntax (the cumulative fuzz of
  // the capture screenplay, seed 3002).
  it("is emitted again when an edit inside its body changes the parameters its header could not give it", () => {
    const text = [
      "function f + g(n)",
      "  local h = function(",
      "    a",
      "  )",
      "    return 1",
      "  end",
      "  return 2",
      "end",
      "Got it.",
      "",
    ].join("\n");
    const s = session({ [MAIN]: text });
    const edited = s.edit("    a\n", "    a, b\n");
    expect(describeRoot(edited)).toEqual(
      describeRoot(coldRoot(text.replace("    a\n", "    a, b\n"))),
    );
    expect(shows(edited)).toEqual(["Got it."]);
  });
});

// A `local` hides a variadic function of its name for the rest of its block,
// and a closure written after it in the block captures the local where it
// called the function before (`shadowSiblingSubFlow`). The closure's own
// statement is unchanged by an edit that names the local after the function,
// so its lowering records what it found the name to be, and the store emits
// it again when that changes.
describe("a statement whose meaning a block's local changes", () => {
  const text = [
    "function run()",
    "  function foo(...) return 10 end",
    "  do",
    "    local zoo = function() return 5 end",
    "    local bar = function()",
    "      return foo()",
    "    end",
    "    return bar()",
    "  end",
    "end",
    "Got {run()}.",
    "",
  ].join("\n");
  const cold = coldRoot;

  it("is emitted again when an edit names the local after the function, and when it names it back", () => {
    const s = session({ [MAIN]: text });
    expect(shows(s.root)).toEqual(["Got 10."]);
    const shadowed = s.edit("local zoo", "local foo");
    expect(describeRoot(shadowed)).toEqual(
      describeRoot(cold(text.replace("local zoo", "local foo"))),
    );
    expect(shows(shadowed)).toEqual(["Got 5."]);
    const restored = s.edit("local foo", "local zoo");
    expect(describeRoot(restored)).toEqual(describeRoot(cold(text)));
    expect(shows(restored)).toEqual(["Got 10."]);
  });
});

describe("a statement an edit moves past the statements that keep their chunks", () => {
  // The cumulative fuzz of the function screenplay (programDifferential)
  // replayed through the edits after which its seeds 12345 and 99991 found
  // untouched statements emitted again (#1221): a scene header broken by a
  // function inserted into it, which moves the scene's statements into the
  // flow above past statements that keep their chunks; a function defined
  // twice; a function in a `do` block; an `end` inserted above a closure's
  // statement; and a scene's `if` block, a line and `done` after an edit to
  // the scene.
  it.each([
    [12345, 104],
    [99991, 77],
  ])("keeps its chunk through the cumulative fuzz's edits with seed %i", (seed, count) => {
    const { warn, error } = console;
    console.warn = console.error = () => {};
    try {
      let text = functionScreenplay(3);
      const c = programCompiler({ [MAIN]: text });
      c.compile();
      let keysBefore = uniqueKeys(programStatements(c.compiler));
      const edits = cumulativeEdits(seed, FUNCTION_INSERTS);
      const emittedAgain: string[] = [];
      // Whether the compile before the edit built chunks, so that its root is
      // the one the edit's untouched statements keep their chunks from.
      let previousChunked = true;
      for (let n = 0; n < count; n++) {
        const { offset, end, insert } = edits.next(text);
        const before = new Set(rootChunks(c.compiler.chunkStore!.current!));
        c.compiler.updateDocument({
          textDocument: { uri: MAIN, version: n + 2 },
          contentChanges: [
            { range: { start: posAt(text, offset), end: posAt(text, end) }, text: insert },
          ],
        });
        text = text.slice(0, offset) + insert + text.slice(end);
        const { program } = c.compile();
        const untouched = program.chunks
          ? untouchedChunks(c.compiler, offset, offset + insert.length, keysBefore)
          : [];
        keysBefore = uniqueKeys(programStatements(c.compiler));
        if (program.chunks && previousChunked) {
          const held = new Set(rootChunks(program.chunks));
          const again = untouched.filter((chunk) => held.has(chunk) && !before.has(chunk));
          if (again.length) {
            emittedAgain.push(`#${n}: ${again.length}`);
          }
        }
        previousChunked = !!program.chunks;
        edits.built(!!program.chunks);
      }
      expect(emittedAgain).toEqual([]);
    } finally {
      console.warn = warn;
      console.error = error;
    }
  });
});
