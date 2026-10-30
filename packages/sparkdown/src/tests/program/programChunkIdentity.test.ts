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
    get program() {
      return program;
    },
    get store() {
      return c.compiler.chunkStore!;
    },
    compiler: c.compiler,
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
    expect(s.root.flowNamed("MAIN")!.arrays.chunks.length).toBeGreaterThan(100);
    for (const line of [lines[5]!, lines[18]!, lines[1]!, lines[38]!]) {
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

describe("a recorded lowering input", () => {
  const filler = Array.from({ length: 8 }, (_, i) => `  Filler line ${i}.`);
  const text = [
    "scene start",
    ...filler,
    "  HERO: Wait ..",
    "  // a comment between",
    "  .. right there. > And then more.",
    "  After.",
    ...filler,
    "end",
    "",
  ].join("\n");

  it("re-emits the statement that read it and no other", () => {
    const s = session({ [MAIN]: text });
    s.edit("Filler line 0.", "Filler line 0!");
    const before = s.root;
    const after = s.edit("HERO: Wait", "RIVAL: Wait");
    const flow = after.flowNamed("start")!.arrays.chunks;
    const beforeFlow = before.flowNamed("start")!.arrays.chunks;
    const reemitted = flow
      .map((chunk, entry) => (chunk === beforeFlow[entry] ? null : entry))
      .filter((entry) => entry !== null);
    expect(reemitted).toEqual([8, 9]);
    expect(s.store.emittedLastBuild).toBe(2);
    const { beats: shown } = storyBeats(new ProgramStory(after));
    const continued = shown.find((b) => b.text.includes("And then more."))!;
    expect(continued.tables[0]).toEqual(
      expect.arrayContaining([["target", "dialogue"], ["character", "RIVAL"]]),
    );
  });
});

describe("the statements a `done` leaves unreachable", () => {
  const filler = Array.from({ length: 6 }, (_, i) => `  Filler line ${i}.`);
  const text = [
    "scene start",
    ...filler,
    "end",
    "scene intro",
    "  Hello.",
    "  done",
    "  Never.",
    "  Line 2.",
    "  Line 3.",
    "  Also never.",
    "end",
    "scene tail",
    ...filler,
    "end",
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
      expect(hints(s.program)).toEqual(["11:0-14:13"]);
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

describe("a statement that shares its first line with another", () => {
  const filler = Array.from({ length: 6 }, (_, i) => `  Filler line ${i}.`);
  const text = [
    "scene start",
    ...filler,
    "  You see a door.",
    "  label door_in_the_hall # t",
    "  After.",
    ...filler,
    "end",
    "",
  ].join("\n");

  it("is emitted again when the statement before it on its line changes length", () => {
    const s = session({ [MAIN]: text });
    s.edit("Filler line 0.", "Filler line 0!");
    const after = s.edit("door_in_the_hall", "door_in_hall");
    expect(s.store.emittedLastBuild).toBe(2);
    const cold = programCompiler(
      {
        [MAIN]: text
          .replace("Filler line 0.", "Filler line 0!")
          .replace("door_in_the_hall", "door_in_hall"),
      },
      { seedBuiltinsIntoStory: true },
    ).compile().program.chunks!;
    expect(describeRoot(after)).toEqual(describeRoot(cold));
  });
});

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

describe("a continuation inside a block", () => {
  const filler = Array.from({ length: 8 }, (_, i) => `  Filler line ${i}.`);
  const text = [
    "store x = 1",
    "scene start",
    "  if x then",
    "    You see a ..",
    "    .. door. > It opens.",
    "  end",
    ...filler,
    "end",
    "",
  ].join("\n");
  const BLOCK_LINE = 2;
  const EDITED_LINE = 13;

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
    const lowered = [...blockLines(c.compiler)]
      .filter(([block]) => !before.has(block))
      .map(([, line]) => line);
    expect(lowered).toContain(EDITED_LINE);
    expect(lowered).not.toContain(BLOCK_LINE);
  });
});

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
      { name: "start", kind: SymbolKind.Scene, uri: MAIN, firstLine: 0, span: 1, statements: [statement] },
      ...(kind !== null
        ? [{ name: "TARGET", kind, uri: MAIN, firstLine: 2, span: 1, statements: [] }]
        : []),
    ];
    const chunk = (root: ProgramRoot) => root.flowNamed("start")!.arrays.chunks[0];
    return { store, flows, chunk };
  };

  it("keeps a chunk while the facts about its symbols hold", () => {
    const { store, flows, chunk } = refersToTarget();
    const first = store.build(flows(SymbolKind.Scene), true).root!;
    const same = store.build(flows(SymbolKind.Scene), true).root!;
    expect(store.emittedLastBuild).toBe(0);
    expect(chunk(same)).toBe(chunk(first));
    const without = store.build(flows(null), true).root!;
    expect(store.emittedLastBuild).toBe(1);
    expect(chunk(without)).not.toBe(chunk(first));
  });

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
  const text = "scene start\n  Intro.\nend\nscene SAME\n  One.\nend\n";
  const describesSameAs = (root: ProgramRoot, kind: SymbolKindValue) =>
    describeRoot(root).some(
      (line) =>
        line.startsWith(`flow "SAME" kind ${kind} `) ||
        line.startsWith(`flow "start.SAME" kind ${kind} `),
    );

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
    const previewRoot = preview.program!.chunks!;
    expect(previewRoot).not.toBe(current);
    expect(newChunks(current, previewRoot)).toHaveLength(1);
    expect(s.store.current).toBe(current);
    const after = rootChunks(s.store.current!);
    expect(after).toHaveLength(held.length);
    expect(after.every((chunk, i) => chunk === held[i])).toBe(true);
  });
});

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
      const sceneAfter = after.flowNamed("MAIN")!.arrays.chunks;
      expect(sceneAfter).toHaveLength(scene.length);
      expect(sceneAfter.every((chunk, i) => chunk === scene[i])).toBe(true);
      const sequence = [...sequencesOf(after)].find(([, chunks]) => chunks.includes(added[0]!));
      expect(sequence![0]).not.toBe(after.flowNamed("MAIN")!.id);
      expect(sequencesOf(before).has(sequence![0])).toBe(true);
    });
  }

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

  it("re-emits only the owner when its own line is edited", () => {
    const s = session({ [MAIN]: text });
    s.edit("Before.", "Before!");
    const before = s.root;
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
    const filler = Array.from({ length: 8 }, (_, i) => `  Filler line ${i}.`);
    const text = ["scene start", ...filler, "  Seen {extra}.", ...filler, "end", ""].join("\n");
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
    expect(cold.chunks).toBeDefined();
    expect(program.chunks).toBeDefined();
    expect(describeRoot(program.chunks!)).toEqual(describeRoot(cold.chunks!));
    const reads = (root: ProgramRoot) =>
      describeRoot(root).filter((line) => /GetCount|GetVar extra/.test(line));
    expect(reads(before).join("\n")).toMatch(/GetVar extra/);
    expect(reads(program.chunks!).join("\n")).toMatch(/GetCount "extra"/);
  });
});

const coldRoot = (source: string) =>
  programCompiler(
    { [MAIN]: source },
    { seedBuiltinsIntoStory: true },
  ).compile().program.chunks!;
const shows = (root: ProgramRoot) =>
  storyBeats(new ProgramStory(root)).beats.map((beat) => beat.text.trim());

describe("a statement that writes a function", () => {
  const demo = (fn: string[]) =>
    [
      "function demo()",
      "  local a = 1",
      "  local b = 2",
      ...fn.map((l) => `  ${l}`),
      "  return f()",
      "end",
      "scene start",
      "  Got {tostring(demo())}.",
      "end",
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
    "scene start",
    "  Got {run()}.",
    "end",
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

  it("keeps its chunk when an edit to a method's body changes no name it captures", () => {
    const s = session({ [MAIN]: method });
    expect(shows(s.root)).toEqual(["Got 3."]);
    const before = s.root;
    const owner = methodChunk(s);
    const edited = s.edit("self.x + a", "a + self.x");
    expect(methodChunk(s)).toBe(owner);
    expect(newChunks(before, edited)).toHaveLength(1);
    expect(describeRoot(edited)).toEqual(
      describeRoot(coldRoot(method.replace("self.x + a", "a + self.x"))),
    );
    expect(shows(edited)).toEqual(["Got 3."]);
  });

  it("keeps its chunk when an edit to a closure's body swaps its calls of two functions it captures", () => {
    const text = [
      "function run()",
      "  function foo(...) return 1 end",
      "  function bar(...) return 2 end",
      "  local f = function()",
      "    local _ = { foo, bar }",
      "    return foo() * 10 + bar()",
      "  end",
      "  return f()",
      "end",
      "scene start",
      "  Got {run()}.",
      "end",
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

  it("keeps its chunk across an edit elsewhere when a function in its body creates a closure", () => {
    const text = [
      "function outer()",
      "  function inner()",
      "    local by = function(a, b) return a > b end",
      "    return by(2, 1)",
      "  end",
      "  result = inner()",
      "end",
      "scene start",
      "  & outer()",
      "  Got {result}.",
      "  More text.",
      "end",
      "",
    ].join("\n");
    const s = session({ [MAIN]: text });
    expect(shows(s.root)).toEqual(["Got true.", "More text."]);
    const outer = () =>
      programStatements(s.compiler).find(
        (statement) => statement.from === text.indexOf("function outer()"),
      )!.chunk;
    const before = s.root;
    const owner = outer();
    const edited = s.edit("More text.", "More words.");
    expect(outer()).toBe(owner);
    expect(newChunks(before, edited)).toHaveLength(1);
    expect(describeRoot(edited)).toEqual(
      describeRoot(coldRoot(text.replace("More text.", "More words."))),
    );
    expect(shows(edited)).toEqual(["Got true.", "More words."]);
  });

  it("is emitted again when an edit swaps two functions its body declares", () => {
    const text = [
      "function outer()",
      "  function a() return 1 end",
      "  function b() return 2 end",
      "  result = a() + b() * 10",
      "end",
      "scene start",
      "  & outer()",
      "  Got {result}.",
      "end",
      "",
    ].join("\n");
    const swapped = text.replace(
      "  function a() return 1 end\n  function b() return 2 end",
      "  function b() return 2 end\n  function a() return 1 end",
    );
    const s = session({ [MAIN]: text });
    expect(shows(s.root)).toEqual(["Got 21."]);
    const edited = s.edit(
      "  function a() return 1 end\n  function b() return 2 end",
      "  function b() return 2 end\n  function a() return 1 end",
    );
    expect(describeRoot(edited)).toEqual(describeRoot(coldRoot(swapped)));
    expect(shows(edited)).toEqual(["Got 21."]);
  });

  it("keeps the chunk of a `define` across an edit elsewhere", () => {
    const text = [
      "define Point with",
      "  x = 2",
      "  function get()",
      "    return self.x",
      "  end",
      "end",
      "scene start",
      "  Got {new Point():get()}.",
      "  More text.",
      "end",
      "",
    ].join("\n");
    const s = session({ [MAIN]: text });
    expect(shows(s.root)).toEqual(["Got 2.", "More text."]);
    const define = () =>
      programStatements(s.compiler).find(
        (statement) => statement.from === text.indexOf("define Point with"),
      )!.chunk;
    const before = s.root;
    const owner = define();
    const edited = s.edit("More text.", "More words.");
    expect(define()).toBe(owner);
    expect(newChunks(before, edited)).toHaveLength(1);
    expect(describeRoot(edited)).toEqual(
      describeRoot(coldRoot(text.replace("More text.", "More words."))),
    );
    expect(shows(edited)).toEqual(["Got 2.", "More words."]);
  });

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
      "scene start",
      "  Got it.",
      "end",
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
    "scene start",
    "  Got {run()}.",
    "end",
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
