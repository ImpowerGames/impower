// Statements whose order an edit swaps in the program's statement list keep
// their chunks (#1496). Turning the text after an earlier `end` into `return `
// moves `function bump(by)` into an earlier body, so it now comes before
// `function twice(n`, which the edit did not touch. The script is a reduction
// of a case from the cumulative fuzz in programChunkIdentity.test.ts. The
// other cases hold the alignment to its rule when statements cross: a
// statement keeps the old chunk it can keep where that leaves nothing
// behind, a statement edited in place keeps the parts of its old self, and
// the work stays linear in the number of statements.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { bodyOfBlock } from "../../compiler/lower/utils/statementShape";
import { wrapInScope } from "../../compiler/lower/utils/wrapInScope";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Text } from "../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import {
  ChunkStore,
  type DeclarationSource,
  type StatementSource,
} from "../../program/ChunkStore";
import type { ProgramEmitter } from "../../program/ProgramEmitter";
import { Op } from "../../program/ProgramInstructions";
import { ProgramStory } from "../../program/ProgramStory";
import { internSymbol, SymbolKind } from "../../program/ProgramSymbols";
import {
  BLOCK_ROW_WORDS,
  B_SEQUENCE,
  blockField,
  exportSymbol,
  HEADER_WORDS,
  H_BLOCK_ROWS,
} from "../../program/StatementChunk";
import { describeRoot, MAIN_URI, programCompiler, rootChunks } from "./programHarness";
import { programStatements, uniqueKeys, untouchedChunks } from "./programStatements";

const SCRIPT = [
  "do",
  "  function inner()",
  "do",
  "  function inner()",
  "    return 2end",
  "  end",
  "end",
  "l}nd",
  "end",
  "  function bump(by)",
  "  end",
  "end",
  "do",
  "  function twice(n",
  "Before any return {describe(1)} {twice(2)}.",
  "scene",
  "  local make = function(n) return functio",
  "  + 1return n * 4 end end",
  "l} twice {twice(2)}.",
  "  iflocal  < 0 then",
].join("\n");

describe("statements an edit swaps in the statement list", () => {
  it("keep the chunks of those the edit did not touch", () => {
    const c = programCompiler({ [MAIN_URI]: SCRIPT });
    c.compile();
    const keysBefore = uniqueKeys(programStatements(c.compiler));
    const before = new Set(rootChunks(c.compiler.chunkStore!.current!));
    const range = { start: { line: 7, character: 2 }, end: { line: 8, character: 0 } };
    const insert = "return ";
    const lines = SCRIPT.split("\n");
    const offset = lines.slice(0, 7).join("\n").length + 1 + 2;
    c.compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [{ range, text: insert }],
    });
    const { program } = c.compile();
    expect(program.chunks).toBeDefined();
    const held = new Set(rootChunks(program.chunks!));
    const again = untouchedChunks(c.compiler, offset, offset + insert.length, keysBefore).filter(
      (chunk) => held.has(chunk) && !before.has(chunk),
    );
    expect(again.length).toBe(0);
  });
});

describe("a function an edit changes, beside a lookalike the edit deletes", () => {
  // The first assignment's function gains `g` and returns 2, which makes it
  // read as the second's, and the edit deletes the second. The first is
  // edited in place and keeps its function's symbol, so a closure saved
  // before the edit still calls it; it does not take the deleted one's chunk.
  const other = "f = function()\n  function g() return 7 end\n  return 2\nend\n";
  const text = [
    "store f = nil",
    "store keep = nil",
    "f = function()",
    "  return 1",
    "end",
    "keep = f",
    other.trimEnd(),
    "done",
    "function call_keep()",
    "  return keep()",
    "end",
    "",
  ].join("\n");

  it("keeps the edited function's symbol for a saved closure", () => {
    const c = programCompiler({ [MAIN_URI]: text });
    const before = c.compile().program;
    expect(before.chunks).toBeDefined();
    const first = before.chunks!.flowNamed("")!.arrays.chunks[0]!;
    const story = new ProgramStory(before.chunks!);
    while (story.canContinue) {
      story.Continue();
    }
    const saved = story.variablesState.GetVariableWithName("keep");
    expect(story.EvaluateFunction("call_keep")).toBe(1);
    const document = c.compiler.documents.get(MAIN_URI)!;
    const from = text.indexOf("  return 1\n");
    const to = text.indexOf(other) + other.length;
    c.compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [
        {
          range: { start: document.positionAt(from), end: document.positionAt(to) },
          text: "  function g() return 7 end\n  return 2\nend\nkeep = f\n",
        },
      ],
    });
    const after = c.compile().program;
    expect(after.chunks).toBeDefined();
    const edited = after.chunks!.flowNamed("")!.arrays.chunks[0]!;
    expect(exportSymbol(edited, 0)).toBe(exportSymbol(first, 0));
    const resumed = new ProgramStory(after.chunks!);
    resumed.variablesState.SetGlobal("keep", saved as never);
    expect(resumed.EvaluateFunction("call_keep")).toBe(2);
  });
});

describe("statements whose recorded facts an edit invalidates", () => {
  // A statement that refers to a symbol, as a divert does.
  class RefersTo extends ParsedObject {
    constructor(readonly symbol: number) {
      super();
    }
    public readonly GenerateRuntimeObject = () => null;
    public override EmitProgram(emitter: ProgramEmitter): void {
      emitter.reference(this.symbol);
      emitter.emit(Op.Done);
    }
  }
  class CountingStore extends ChunkStore {
    lookups = 0;
    constructor() {
      super();
      const get = this._info.get.bind(this._info);
      this._info.get = (chunk) => {
        this.lookups += 1;
        return get(chunk);
      };
    }
  }

  it("are emitted again in lookups linear in their number", () => {
    const n = 256;
    const store = new CountingStore();
    const target = internSymbol(store.table, "TARGET");
    const statement = (): StatementSource => ({
      block: {},
      objects: [new RefersTo(target)],
      range: null,
      firstLine: 0,
      source: () => "-> TARGET",
      syntax: () => "Divert TARGET",
      reads: "[]",
    });
    const flows = (kind: typeof SymbolKind.Scene | typeof SymbolKind.Branch) => [
      {
        name: "",
        kind: SymbolKind.Root,
        uri: MAIN_URI,
        firstLine: 0,
        span: n,
        statements: Array.from({ length: n }, statement),
      },
      { name: "TARGET", kind, uri: MAIN_URI, firstLine: n, span: 1, statements: [] },
    ];
    store.build(flows(SymbolKind.Scene), true);
    store.lookups = 0;
    store.build(flows(SymbolKind.Branch), true);
    expect(store.emittedLastBuild).toBe(n);
    expect(store.lookups).toBeLessThan(20 * n);
  });

  it("are emitted again in lookups linear in their number after an edit to their callee", () => {
    const n = 128;
    const text = [
      "store r = 0",
      ...Array(n).fill("r = first(1)"),
      "done",
      "function first(a, ...)",
      "  return a * 10",
      "end",
      "",
    ].join("\n");
    const c = programCompiler({ [MAIN_URI]: text });
    expect(c.compile().program.fallback).toBeUndefined();
    const store = c.compiler.chunkStore!;
    const info = (store as unknown as { _info: WeakMap<object, unknown> })._info;
    const get = info.get.bind(info);
    let lookups = 0;
    info.get = (chunk) => {
      lookups += 1;
      return get(chunk);
    };
    c.compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [
        {
          range: { start: { line: n + 2, character: 0 }, end: { line: n + 2, character: 22 } },
          text: "function first(a)",
        },
      ],
    });
    const after = c.compile().program;
    expect(after.chunks).toBeDefined();
    expect(store.emittedLastBuild).toBe(n + 1);
    expect(lookups).toBeLessThan(20 * n);
  });
});

// The same alignment, through the store directly, for the statements of a
// flow and for the declarations, which the store aligns separately. Each
// statement is a line of text whose syntax and recorded reads are given; a
// statement re-lowered by a compile has a new block, and the anchor keeps
// its block, so it keeps its chunk first.
describe.each([
  ["flow statements", false],
  ["declarations", true],
])("the %s an edit swaps", (_, declarations) => {
  const statement = (syntax: string, reads = "[]"): StatementSource => ({
    block: {},
    objects: [new Text(syntax)],
    range: null,
    firstLine: 0,
    source: () => syntax,
    syntax: () => syntax,
    reads,
  });
  const builder = () => {
    const store = new ChunkStore();
    return {
      store,
      build(statements: StatementSource[]) {
        const root = store.build(
          declarations
            ? {
                flows: [],
                declarations: statements.map(
                  (s) => ({ ...s, uri: MAIN_URI, globals: [] }) as DeclarationSource,
                ),
              }
            : [
                {
                  name: "",
                  kind: SymbolKind.Root,
                  uri: MAIN_URI,
                  firstLine: 0,
                  span: 1,
                  statements,
                },
              ],
          true,
        ).root!;
        return declarations ? root.initialization : root.flowNamed("")!.arrays.chunks;
      },
    };
  };

  it("keep their chunks when they cross", () => {
    const { store, build } = builder();
    const anchor = statement("anchor");
    const before = build([anchor, statement("x"), statement("y")]);
    const after = build([anchor, statement("y"), statement("x")]);
    expect(store.emittedLastBuild).toBe(0);
    expect(after[1] === before[2]).toBe(true);
    expect(after[2] === before[1]).toBe(true);
  });

  it("keep their own chunks when two of one syntax differ by their reads", () => {
    const { store, build } = builder();
    const anchor = statement("anchor");
    const before = build([
      statement("b", "read-one"),
      anchor,
      statement("b", "read-two"),
      statement("c"),
    ]);
    const after = build([
      anchor,
      statement("c"),
      statement("b", "read-one"),
      statement("b", "read-two"),
    ]);
    expect(store.emittedLastBuild).toBe(0);
    expect(after[0] === before[1]).toBe(true);
    expect(after[1] === before[3]).toBe(true);
    expect(after[2] === before[0]).toBe(true);
    expect(after[3] === before[2]).toBe(true);
  });

  it("keep their own chunks when one of one syntax would match the other's from the back", () => {
    const { store, build } = builder();
    const anchor = statement("anchor");
    const before = build([
      anchor,
      statement("x", "read-one"),
      statement("y"),
      statement("x", "read-two"),
      statement("z"),
    ]);
    const after = build([
      anchor,
      statement("y"),
      statement("x", "read-two"),
      statement("x", "read-one"),
      statement("z"),
    ]);
    expect(store.emittedLastBuild).toBe(0);
    expect(after[1] === before[2]).toBe(true);
    expect(after[2] === before[3]).toBe(true);
    expect(after[3] === before[1]).toBe(true);
    expect(after[4] === before[4]).toBe(true);
  });

  // What the store looks up per statement stays bounded however the
  // statements of a long run are reordered or changed: a lookup count, not a
  // time, so the bound holds on any machine.
  it.each([
    ["reversed", (n: number) => [...Array(n).keys()].reverse().map((k) => statement(`s${k}`))],
    ["swapped in pairs", (n: number) => [...Array(n).keys()].map((k) => statement(`s${k ^ 1}`))],
    ["of one syntax with reads reversed", (n: number) => [...Array(n).keys()].reverse().map((k) => statement("x", `r${k}`))],
    ["of one syntax with reads changed", (n: number) => [...Array(n).keys()].map((k) => statement("x", `changed${k}`))],
  ])("align a long run %s in lookups linear in its length", (shape, after) => {
    const n = 2000;
    class CountingStore extends ChunkStore {
      lookups = 0;
      constructor() {
        super();
        const get = this._info.get.bind(this._info);
        this._info.get = (chunk) => {
          this.lookups += 1;
          return get(chunk);
        };
      }
    }
    const store = new CountingStore();
    const anchor = statement("anchor");
    const source = (statements: StatementSource[]) =>
      declarations
        ? {
            flows: [],
            declarations: statements.map(
              (s) => ({ ...s, uri: MAIN_URI, globals: [] }) as DeclarationSource,
            ),
          }
        : [{ name: "", kind: SymbolKind.Root, uri: MAIN_URI, firstLine: 0, span: 1, statements }];
    const before = [...Array(n).keys()].map((k) =>
      shape.startsWith("of one syntax") ? statement("x", `r${k}`) : statement(`s${k}`),
    );
    store.build(source([anchor, ...before]), true);
    store.lookups = 0;
    store.build(source([anchor, ...after(n)]), true);
    expect(store.emittedLastBuild).toBe(shape.endsWith("changed") ? n : 0);
    expect(store.lookups).toBeLessThan(20 * n);
  });

  it("emit again the one whose reads changed", () => {
    const { store, build } = builder();
    const anchor = statement("anchor");
    const before = build([anchor, statement("x", "read-one"), statement("y")]);
    const after = build([anchor, statement("y"), statement("x", "read-two")]);
    expect(store.emittedLastBuild).toBe(1);
    expect(after[1] === before[2]).toBe(true);
    expect(before.includes(after[2]!)).toBe(false);
  });

  it("keep the chunk of the one whose own it is when the other one changed", () => {
    const { store, build } = builder();
    const before = build([statement("x", "read-a"), statement("x", "read-b")]);
    const after = build([statement("x", "read-c"), statement("x", "read-a")]);
    expect(store.emittedLastBuild).toBe(1);
    expect(after[1] === before[0]).toBe(true);
    expect(new Set(after).size).toBe(after.length);
  });

  it("keep the chunk of the unchanged one when its neighbor moves and changes its reads", () => {
    const { store, build } = builder();
    const anchor = statement("anchor");
    const before = build([anchor, statement("x", "read-1"), statement("x", "read-2")]);
    const after = build([anchor, statement("x", "read-2"), statement("x", "read-3")]);
    expect(store.emittedLastBuild).toBe(1);
    expect(after[1] === before[2]).toBe(true);
  });

  it("keep the chunks of a long run of one syntax whose ends an edit changed", () => {
    const n = 2000;
    const { store, build } = builder();
    const middle = (k: number) => statement(`x${k % 2}`);
    const before = build([statement("a"), ...[...Array(n).keys()].map(middle), statement("b")]);
    const after = build([statement("c"), ...[...Array(n).keys()].map(middle), statement("d")]);
    expect(store.emittedLastBuild).toBe(2);
    expect(after.slice(1, -1).every((chunk, k) => chunk === before[k + 1])).toBe(true);
  });

  it("align a long run whose recorded values all changed in lookups linear in its length", () => {
    const n = 512;
    class CountingStore extends ChunkStore {
      lookups = 0;
      constructor() {
        super();
        const get = this._info.get.bind(this._info);
        this._info.get = (chunk) => {
          this.lookups += 1;
          return get(chunk);
        };
      }
    }
    const store = new CountingStore();
    const defining = (defines: string): StatementSource => ({ ...statement("x"), defines });
    const source = (statements: StatementSource[]) =>
      declarations
        ? {
            flows: [],
            declarations: statements.map(
              (s) => ({ ...s, uri: MAIN_URI, globals: [] }) as DeclarationSource,
            ),
          }
        : [{ name: "", kind: SymbolKind.Root, uri: MAIN_URI, firstLine: 0, span: 1, statements }];
    store.build(source(Array.from({ length: n }, () => defining("before"))), true);
    store.lookups = 0;
    store.build(source(Array.from({ length: n }, () => defining("after"))), true);
    expect(store.emittedLastBuild).toBe(n);
    expect(store.lookups).toBeLessThan(20 * n);
  });
});

describe("an edited function beside an inserted copy of its old version", () => {
  // The edit gives the function `g` and a new return value, and inserts a
  // copy of the function as it was after `keep = f`. The edited function is
  // edited in place and keeps its symbol, so a closure saved before the edit
  // calls its new code; the copy, which could keep the old chunk, takes a new
  // one.
  it("keeps the edited function's symbol for a saved closure", () => {
    const text = [
      "f = function()",
      "  return 1",
      "end",
      "keep = f",
      "done",
      "function call_keep()",
      "  return keep()",
      "end",
      "",
    ].join("\n");
    const c = programCompiler({ [MAIN_URI]: text });
    const before = c.compile().program;
    expect(before.chunks).toBeDefined();
    const first = before.chunks!.flowNamed("")!.arrays.chunks[0]!;
    const story = new ProgramStory(before.chunks!);
    while (story.canContinue) {
      story.Continue();
    }
    const saved = story.variablesState.GetVariableWithName("keep");
    expect(story.EvaluateFunction("call_keep")).toBe(1);
    c.compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [
        {
          range: { start: { line: 1, character: 0 }, end: { line: 4, character: 0 } },
          text: "  function g() return 7 end\n  return 2\nend\nkeep = f\nf = function()\n  return 1\nend\n",
        },
      ],
    });
    const after = c.compile().program;
    expect(after.chunks).toBeDefined();
    const edited = after.chunks!.flowNamed("")!.arrays.chunks[0]!;
    expect(exportSymbol(edited, 0)).toBe(exportSymbol(first, 0));
    const resumed = new ProgramStory(after.chunks!);
    resumed.variablesState.SetGlobal("keep", saved as never);
    expect(resumed.EvaluateFunction("call_keep")).toBe(2);
  });
});

describe("a block statement that can keep an old chunk another one was paired with", () => {
  // Old `[x, anchor, y]` becomes `[z, anchor, x]`, each but the anchor a
  // block statement with one body. By position `z` is edited in place from
  // `x` and the new `x` from `y`; the new `x` keeps its own old chunk by
  // exchange, `z` is edited in place from `y`, and no old chunk or body
  // sequence is left behind.
  it("keeps every old body sequence and leaves no old chunk unused", () => {
    const store = new ChunkStore();
    const owner = (syntax: string, reads: string): StatementSource => {
      const objects = wrapInScope([]);
      const shape = { statements: [], headEnd: 0, nextStart: 0 };
      bodyOfBlock.set(objects[0]!, shape as never);
      return {
        block: {},
        objects,
        range: null,
        firstLine: 0,
        source: () => syntax,
        syntax: () => syntax,
        reads,
        bodies: [{ shape, statements: [], firstLine: 0, span: 1, headLines: 0 }],
      } as unknown as StatementSource;
    };
    const anchor: StatementSource = {
      block: {},
      objects: [new Text("anchor")],
      range: null,
      firstLine: 0,
      source: () => "anchor",
      syntax: () => "anchor",
      reads: "[]",
    };
    const flow = (statements: StatementSource[]) => [
      { name: "", kind: SymbolKind.Root, uri: MAIN_URI, firstLine: 0, span: 1, statements },
    ];
    const old = store
      .build(flow([owner("x", "r0"), anchor, owner("y", "r0")]), true)
      .root!.flowNamed("")!.arrays.chunks;
    const now = store
      .build(flow([owner("z", "r1"), anchor, owner("x", "r0")]), true)
      .root!.flowNamed("")!.arrays.chunks;
    expect(store.emittedLastBuild).toBe(1);
    expect(now[2] === old[0]).toBe(true);
    const sequences = (chunks: readonly Int32Array[]) =>
      [chunks[0]!, chunks[2]!].map((chunk) => blockField(chunk, 0, B_SEQUENCE));
    expect(new Set(sequences(now))).toEqual(new Set(sequences(old)));
    expect(blockField(now[0]!, 0, B_SEQUENCE)).toBe(blockField(old[2]!, 0, B_SEQUENCE));
  });
});

describe("statements whose recorded values an edit changes", () => {
  const counted = (c: ReturnType<typeof programCompiler>) => {
    const info = (c.compiler.chunkStore as unknown as { _info: WeakMap<object, unknown> })._info;
    const get = info.get.bind(info);
    const count = { lookups: 0 };
    info.get = (chunk) => {
      count.lookups += 1;
      return get(chunk);
    };
    return count;
  };

  it("are emitted again in lookups linear in their number when a scene changes what a name reads", () => {
    const n = 256;
    const text = [...Array(n).fill("Seen {extra}."), ""].join("\n");
    const c = programCompiler({ [MAIN_URI]: text });
    expect(c.compile().program.fallback).toBeUndefined();
    const count = counted(c);
    const added = "scene extra\n  Inside.\nend\n";
    c.compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [
        { range: { start: { line: n, character: 0 }, end: { line: n, character: 0 } }, text: added },
      ],
    });
    const after = c.compile().program;
    expect(after.chunks).toBeDefined();
    expect(c.compiler.chunkStore!.emittedLastBuild).toBe(n + 1);
    expect(count.lookups).toBeLessThan(20 * n);
    const cold = programCompiler({ [MAIN_URI]: text + added });
    expect(describeRoot(after.chunks!)).toEqual(describeRoot(cold.compile().program.chunks!));
  });

  it("build no identity during alignment for an inserted statement no old chunk reads as", () => {
    // `Anchor.` keeps its chunk, and the inserted assignment reads `n`
    // names, which building its identity would sort; no old chunk has its
    // syntax, so alignment builds none.
    const n = 512;
    const text = "Anchor.\n";
    const c = programCompiler({ [MAIN_URI]: text });
    expect(c.compile().program.fallback).toBeUndefined();
    const names = Array.from({ length: n }, (_, k) => `v${String((k * 7919) % n).padStart(6, "0")}`);
    const prototype = ChunkStore.prototype as unknown as {
      align: (...args: unknown[]) => unknown;
      statementValues: (...args: unknown[]) => unknown;
    };
    const { align, statementValues } = prototype;
    let aligning = false;
    let built = 0;
    prototype.align = function (this: unknown, ...args: unknown[]) {
      aligning = true;
      try {
        return align.apply(this, args);
      } finally {
        aligning = false;
      }
    };
    prototype.statementValues = function (this: unknown, ...args: unknown[]) {
      if (aligning && (args[0] as StatementSource).syntax().includes("items")) {
        built += 1;
      }
      return statementValues.apply(this, args);
    };
    try {
      c.compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version: 2 },
        contentChanges: [
          {
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
            text: `items = {${names.join(", ")}}\n`,
          },
        ],
      });
      expect(c.compile().program.fallback).toBeUndefined();
    } finally {
      prototype.align = align;
      prototype.statementValues = statementValues;
    }
    expect(c.compiler.chunkStore!.emittedLastBuild).toBe(1);
    expect(built).toBe(0);
  });

  it("are emitted again in lookups linear in their number when their functions' hoisted locals change", () => {
    // The lookups of the whole compile, at n and 2n assignments: doubling
    // the assignments at most doubles them, with room for constant work.
    const lookupsFor = (n: number) => {
      const section = (name: string) =>
        ["f = function()", `  function ${name}() return 7 end`, "  return 2", "end"].join("\n");
      const text = ["store f = nil", ...Array(n).fill(section("g")), "done", ""].join("\n");
      const c = programCompiler({ [MAIN_URI]: text });
      expect(c.compile().program.fallback).toBeUndefined();
      const count = counted(c);
      const document = c.compiler.documents.get(MAIN_URI)!;
      c.compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version: 2 },
        contentChanges: [
          {
            range: {
              start: document.positionAt(text.indexOf("f = function()")),
              end: document.positionAt(text.lastIndexOf("done")),
            },
            text: Array(n).fill(section("h")).join("\n") + "\n",
          },
        ],
      });
      expect(c.compile().program.fallback).toBeUndefined();
      return count.lookups;
    };
    const small = lookupsFor(64);
    const large = lookupsFor(128);
    expect(large).toBeLessThan(2.5 * small);
  });
});

describe("block statements an edit reorders", () => {
  const plain = (syntax: string, reads = "[]"): StatementSource => ({
    block: {},
    objects: [new Text(syntax)],
    range: null,
    firstLine: 0,
    source: () => syntax,
    syntax: () => syntax,
    reads,
  });
  const owner = (syntax: string, reads = "[]"): StatementSource => {
    const objects = wrapInScope([]);
    const shape = { statements: [], headEnd: 0, nextStart: 0 };
    bodyOfBlock.set(objects[0]!, shape as never);
    return {
      ...plain(syntax, reads),
      objects,
      bodies: [{ shape, statements: [], firstLine: 0, span: 1, headLines: 0 }],
    } as unknown as StatementSource;
  };
  const flow = (statements: StatementSource[]) => [
    { name: "", kind: SymbolKind.Root, uri: MAIN_URI, firstLine: 0, span: 1, statements },
  ];
  class CountingStore extends ChunkStore {
    lookups = 0;
    constructor() {
      super();
      const get = this._info.get.bind(this._info);
      this._info.get = (chunk) => {
        this.lookups += 1;
        return get(chunk);
      };
    }
  }

  it("keep their chunks and body sequences through a three-way rotation", () => {
    const store = new ChunkStore();
    const build = (reads: string[]) =>
      store.build(flow(reads.map((r) => owner("x", r))), true).root!.flowNamed("")!.arrays.chunks;
    const before = build(["a", "b", "c"]);
    const after = build(["b", "c", "a"]);
    expect(store.emittedLastBuild).toBe(0);
    expect(after.every((chunk, k) => chunk === before[(k + 1) % 3])).toBe(true);
  });

  it("read a large owner's body a bounded number of times when it is exchanged repeatedly", () => {
    // Old `[x0, anchor0, …, xN, anchorN]` becomes `[changed, anchor0, x0,
    // anchor1, …]`: the changed owner, which holds N body statements, is
    // paired with each old `xK` in turn as every requester keeps its own by
    // exchange. Its body is read a bounded number of times, not once per
    // exchange.
    const n = 128;
    let aligning = false;
    let reads = 0;
    class Measured extends ChunkStore {
      protected override align(...args: Parameters<ChunkStore["align"]>) {
        aligning = true;
        try {
          return super.align(...args);
        } finally {
          aligning = false;
        }
      }
    }
    const store = new Measured();
    const anchors = Array.from({ length: n + 1 }, (_, k) => plain(`anchor${k}`));
    const ownerOf = (syntax: string, children: StatementSource[]): StatementSource => {
      const objects = wrapInScope(children.flatMap((s) => [...s.objects]));
      const shape = { statements: [], headEnd: 0, nextStart: 0 };
      bodyOfBlock.set(objects[0]!, shape as never);
      return {
        ...plain(syntax),
        objects,
        bodies: [{ shape, statements: children, firstLine: 0, span: 1, headLines: 0 }],
      } as unknown as StatementSource;
    };
    const old: StatementSource[] = [];
    for (let k = 0; k <= n; k += 1) {
      old.push(ownerOf(`x${k}`, []), anchors[k]!);
    }
    store.build(flow(old), true);
    const children = Array.from({ length: n }, (_, k) => {
      const child = plain(`child${k}`);
      const objects = child.objects;
      Object.defineProperty(child, "objects", {
        get() {
          if (aligning) {
            reads += 1;
          }
          return objects;
        },
      });
      return child;
    });
    const now: StatementSource[] = [ownerOf("changed", children), anchors[0]!];
    for (let k = 0; k < n; k += 1) {
      now.push(ownerOf(`x${k}`, []), anchors[k + 1]!);
    }
    const built = store.build(flow(now), true);
    expect(built.chunks).toBeDefined();
    const chunks = built.root!.flowNamed("")!.arrays.chunks;
    expect(new Set(chunks).size).toBe(chunks.length);
    expect(reads).toBeLessThan(20 * n);
  });

  it("build a repeatedly exchanged owner's identity once", () => {
    // Old `[x0, anchor0, …, xN, anchorN, big]` becomes `[big, anchor0, x0,
    // anchor1, …]`, where `big` owns N bodies: the new `big` is paired with
    // each old `xK` in turn and visited again after every exchange, beside a
    // free old `big` it reads as but does not take. Its identity, whose
    // length grows with its bodies, is built once, so each visit is
    // constant work; `reads` is read when the identity is built.
    const n = 128;
    const store = new ChunkStore();
    const anchors = Array.from({ length: n + 1 }, (_, k) => plain(`anchor${k}`));
    const big = (counted: boolean): StatementSource => {
      const objects: ParsedObject[] = [];
      const bodies = Array.from({ length: n }, () => {
        const shape = { statements: [], headEnd: 0, nextStart: 0 };
        const scope = wrapInScope([]);
        bodyOfBlock.set(scope[0]!, shape as never);
        objects.push(...scope);
        return { shape, statements: [], firstLine: 0, span: 1, headLines: 0 };
      });
      const statement = { ...plain("big"), objects, bodies } as unknown as StatementSource;
      if (counted) {
        Object.defineProperty(statement, "reads", {
          get() {
            identityReads += 1;
            return "[]";
          },
        });
      }
      return statement;
    };
    let identityReads = 0;
    const old: StatementSource[] = [];
    for (let k = 0; k <= n; k += 1) {
      old.push(owner(`x${k}`), anchors[k]!);
    }
    old.push(big(false));
    store.build(flow(old), true);
    const now: StatementSource[] = [big(true), anchors[0]!];
    for (let k = 0; k < n; k += 1) {
      now.push(owner(`x${k}`), anchors[k + 1]!);
    }
    identityReads = 0;
    expect(store.build(flow(now), true).fallback).toBeUndefined();
    expect(identityReads).toBeLessThan(20);
  });

  it("screen a repeatedly exchanged owner that keeps no old chunk once", () => {
    // As above, but the free old `big` owns one body fewer, so it reads as
    // the new `big` in its syntax and reads but not in its identity, which
    // has no old chunk. The new `big` is visited again after every
    // exchange; it is screened and its identity looked up once, and
    // `reads`, which the screen reads, is read a bounded number of times.
    const n = 128;
    const store = new ChunkStore();
    const anchors = Array.from({ length: n + 1 }, (_, k) => plain(`anchor${k}`));
    let screens = 0;
    const big = (bodyCount: number, counted: boolean): StatementSource => {
      const objects: ParsedObject[] = [];
      const bodies = Array.from({ length: bodyCount }, () => {
        const shape = { statements: [], headEnd: 0, nextStart: 0 };
        const scope = wrapInScope([]);
        bodyOfBlock.set(scope[0]!, shape as never);
        objects.push(...scope);
        return { shape, statements: [], firstLine: 0, span: 1, headLines: 0 };
      });
      const statement = { ...plain("big"), objects, bodies } as unknown as StatementSource;
      if (counted) {
        Object.defineProperty(statement, "reads", {
          get() {
            screens += 1;
            return "[]";
          },
        });
      }
      return statement;
    };
    const old: StatementSource[] = [];
    for (let k = 0; k <= n; k += 1) {
      old.push(owner(`x${k}`), anchors[k]!);
    }
    old.push(big(n - 1, false));
    const before = store.build(flow(old), true).root!.flowNamed("")!.arrays.chunks;
    const now: StatementSource[] = [big(n, true), anchors[0]!];
    for (let k = 0; k < n; k += 1) {
      now.push(owner(`x${k}`), anchors[k + 1]!);
    }
    screens = 0;
    const built = store.build(flow(now), true);
    expect(built.chunks).toBeDefined();
    const after = built.root!.flowNamed("")!.arrays.chunks;
    for (let k = 0; k < n; k += 1) {
      expect(after[2 + 2 * k] === before[2 * k]).toBe(true);
    }
    expect(screens).toBeLessThan(20);
  });

  it.each([1, 2])(
    "classify the ancestry of changed leaves under nested kept owners in owner queries linear in their number (%i per owner)",
    (perOwner) => {
      // Old `[o0, a0…, o1, a1…, …]`, where each `oK` owns the next owner and
      // its own leaves, becomes the same owners with every leaf changed: the
      // owners keep their chunks, so each run between two of them holds the
      // owner's changed leaves, each of whose owner chain is N deep. Which
      // of the leaves a run leaves contain one another is found in owner
      // queries linear in N, not once per leaf per owner above it.
      const n = 256;
      class Measured extends ChunkStore {
        make(syntax: string) {
          const chunk = new Int32Array(HEADER_WORDS);
          this._info.set(chunk, {
            syntax,
            reads: "[]",
            emitReads: [],
            resolutions: [],
            parts: [],
            alternators: [],
            anonymousReferences: [],
            hoisted: "",
            params: "",
            choices: [],
            heads: [],
            facts: new Map(),
            placement: "sequence",
            generation: this.table.generation,
          });
          return chunk;
        }
        run(
          statements: StatementSource[],
          old: Int32Array[],
          kept: (Int32Array | undefined)[],
          nesting: Parameters<ChunkStore["align"]>[3],
        ) {
          this._used = new Set(kept.filter((chunk): chunk is Int32Array => !!chunk));
          this._inherit = new Map();
          return this.align(statements, old, kept, nesting);
        }
      }
      const store = new Measured();
      const now: StatementSource[] = [];
      const old: Int32Array[] = [];
      const kept: (Int32Array | undefined)[] = [];
      const owners = new Map<StatementSource, StatementSource>();
      const oldOwners = new Map<Int32Array, Int32Array>();
      let ownerNow: StatementSource | undefined;
      let ownerOld: Int32Array | undefined;
      for (let k = 0; k < n; k += 1) {
        const o = plain(`o${k}`);
        const chunk = store.make(`o${k}`);
        if (ownerNow && ownerOld) {
          owners.set(o, ownerNow);
          oldOwners.set(chunk, ownerOld);
        }
        now.push(o);
        old.push(chunk);
        kept.push(chunk);
        for (let j = 0; j < perOwner; j += 1) {
          const leaf = plain(`New${j}.`);
          const oldLeaf = store.make(`Old${j}.`);
          owners.set(leaf, o);
          oldOwners.set(oldLeaf, chunk);
          now.push(leaf);
          old.push(oldLeaf);
          kept.push(undefined);
        }
        ownerNow = o;
        ownerOld = chunk;
      }
      let queries = 0;
      const result = store.run(now, old, kept, {
        owner(statement) {
          queries += 1;
          return owners.get(statement);
        },
        oldOwner(chunk) {
          queries += 1;
          return oldOwners.get(chunk);
        },
      });
      expect(now.every((_, i) => (kept[i] ? result[i] === kept[i] : !result[i]))).toBe(true);
      expect(queries).toBeLessThan(8 * n * (perOwner + 1));
    },
  );

  it("look up a large old chunk's identity once while exchanges pass it on", () => {
    // Old `[big, anchor0, x0, anchor1, …, x(N-1), anchorN, bigCopy]` and new
    // `[x0, anchor0, x1, …, changed, anchorN]`, aligned directly: `big`, whose
    // N bodies make its identity long, is paired with `x0` by position and
    // passed on by each exchange in which a requester keeps its own `xK`.
    // The identity of `big` is looked up once, not once per exchange.
    const n = 1024;
    class Measured extends ChunkStore {
      longKeys = 0;
      make(syntax: string, bodies: number) {
        const chunk = new Int32Array(HEADER_WORDS + bodies * BLOCK_ROW_WORDS);
        chunk[H_BLOCK_ROWS] = bodies;
        this._info.set(chunk, {
          syntax,
          reads: "[]",
          emitReads: [],
          resolutions: [],
          parts: [],
          alternators: [],
          anonymousReferences: [],
          hoisted: "",
          params: "",
          choices: [],
          heads: [],
          facts: new Map(),
          placement: "sequence",
          generation: this.table.generation,
        });
        return chunk;
      }
      run(
        statements: StatementSource[],
        old: Int32Array[],
        kept: (Int32Array | undefined)[],
      ) {
        this._used = new Set(kept.filter((chunk): chunk is Int32Array => !!chunk));
        this._inherit = new Map();
        const get = Map.prototype.get;
        const self = this;
        Map.prototype.get = function (this: Map<unknown, unknown>, key: unknown) {
          if (typeof key === "string" && key.length > 5 * n) {
            self.longKeys += 1;
          }
          return get.call(this, key);
        };
        try {
          return this.align(statements, old, kept);
        } finally {
          Map.prototype.get = get;
        }
      }
    }
    const source = (syntax: string, bodies: number): StatementSource => ({
      block: {},
      objects: [],
      range: null,
      firstLine: 0,
      source: () => syntax,
      syntax: () => syntax,
      reads: "[]",
      bodies: Array.from({ length: bodies }, () => ({
        shape: {},
        statements: [],
        firstLine: 0,
        span: 1,
        headLines: 0,
      })),
    }) as unknown as StatementSource;
    const store = new Measured();
    const old: Int32Array[] = [store.make("big", n)];
    const now: StatementSource[] = [];
    const kept: (Int32Array | undefined)[] = [];
    const xs: Int32Array[] = [];
    for (let k = 0; k <= n; k += 1) {
      now.push(source(k < n ? `x${k}` : "changed", 1), source(`anchor${k}`, 0));
      const anchor = store.make(`anchor${k}`, 0);
      old.push(anchor);
      kept.push(undefined, anchor);
      if (k < n) {
        const x = store.make(`x${k}`, 1);
        xs.push(x);
        old.push(x);
      }
    }
    old.push(store.make("big", n));
    const result = store.run(now, old, kept);
    expect(xs.every((x, k) => result[2 * k] === x)).toBe(true);
    expect(store.longKeys).toBeLessThan(5);
  });

  it("are aligned in lookups linear in their number when no exchange can be made", () => {
    // N plain statements take the syntax of N old block statements, and N
    // block statements of that syntax, each alone between two anchors, are
    // paired with other old blocks; every one of them can keep an old `x`
    // block, but its plain holder cannot take the block it would leave.
    const n = 128;
    const store = new CountingStore();
    const anchors = Array.from({ length: n + 1 }, (_, k) => plain(`anchor${k}`));
    const old: StatementSource[] = Array.from({ length: n }, () => owner("x"));
    const now: StatementSource[] = Array.from({ length: n }, () => plain("x", "changed"));
    for (let k = 0; k < n; k += 1) {
      old.push(anchors[k]!, owner(`q${k}`));
      now.push(anchors[k]!, owner("x"));
    }
    old.push(anchors[n]!);
    now.push(anchors[n]!);
    store.build(flow(old), true);
    store.lookups = 0;
    expect(store.build(flow(now), true).fallback).toBeUndefined();
    expect(store.lookups).toBeLessThan(20 * (3 * n + 1));
  });
});
