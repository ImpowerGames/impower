// A statement keeps its chunk across compiles by the identity rule of the
// design of record (docs/engine/binary-program.md, section 1, Identity): its
// syntax is what the incremental parse kept, every lowering input it recorded
// reads the same, and every fact its reference table records is unchanged.
// These tests count the chunks a compile emits and compare every other chunk
// by identity (#694).
import "../../inkjs/engine/Container";
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
import {
  describeRoot,
  programCompiler,
  rootChunks,
  storyBeats,
} from "./programHarness";

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
    programChunks: true,
    seedBuiltinsIntoStory: true,
  });
  let text = texts[MAIN]!;
  let version = 1;
  let root = c.compile().program.chunks!;
  return {
    get root() {
      return root;
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
      const program = c.compile().program;
      expect(program.fallback).toBeUndefined();
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
      { programChunks: true, seedBuiltinsIntoStory: true },
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
      { programChunks: true, seedBuiltinsIntoStory: true },
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

  for (const programChunks of [false, true]) {
    it(`is not lowered again by an edit below it, with statement chunks ${programChunks ? "on" : "off"}`, () => {
      const c = programCompiler({ [MAIN]: text }, { programChunks });
      c.compile();
      const before = blockLines(c.compiler);
      expect(blockAt(c.compiler, "if x then").reads !== undefined).toBe(programChunks);
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
  }
});

// Statements lowered with statement chunks off hold no reads, so turning them
// on lowers every statement again, and the next compile builds the root a
// cold compile builds.
describe("statement chunks turned on after a compile", () => {
  it("lower every statement again, with its reads", () => {
    const text = [
      "HERO: Wait ..",
      "// a comment between",
      ".. right there. > And then more.",
      "After.",
      "",
    ].join("\n");
    const c = programCompiler({ [MAIN]: text }, { programChunks: false });
    c.compile();
    expect(blockAt(c.compiler, ".. right there.").reads).toBeUndefined();
    c.compiler.configure({ programChunks: true });
    const { program } = c.compile();
    expect(blockAt(c.compiler, ".. right there.").reads).toHaveLength(1);
    const cold = programCompiler({ [MAIN]: text }, { programChunks: true })
      .compile().program;
    expect(program.fallback).toBeUndefined();
    expect(cold.fallback).toBeUndefined();
    expect(describeRoot(program.chunks!)).toEqual(describeRoot(cold.chunks!));
  });
});

// A test statement whose code refers to a symbol, as a divert will: its chunk
// records the facts about that symbol, and is kept only while they hold.
class RefersTo extends ParsedObject {
  constructor(public symbol: number) {
    super();
  }
  public readonly GenerateRuntimeObject = () => null;
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
      { programChunks: true, seedBuiltinsIntoStory: true },
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
describe("a name a chunk reads", () => {
  it("emits the chunk again when the name resolves to something else", () => {
    const filler = Array.from({ length: 8 }, (_, i) => `Filler line ${i}.`);
    const text = [...filler, "Seen {extra}.", ...filler, ""].join("\n");
    const c = programCompiler({ [MAIN]: text }, { programChunks: true });
    expect(c.compile().program.fallback).toBeUndefined();
    const added = "scene extra\n  Inside.\nend\n";
    c.compiler.updateDocument({
      textDocument: { uri: MAIN, version: 2 },
      contentChanges: [
        { range: { start: posAt(text, text.length), end: posAt(text, text.length) }, text: added },
      ],
    });
    const { program } = c.compile();
    const cold = programCompiler({ [MAIN]: text + added }, { programChunks: true }).compile().program;
    expect(cold.fallback?.construct).toBe("read count");
    expect(program.fallback).toEqual(cold.fallback);
  });
});
