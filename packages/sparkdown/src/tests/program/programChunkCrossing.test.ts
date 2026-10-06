// Statements whose order an edit swaps in the program's statement list keep
// their chunks (#1496). Turning the text after an earlier `end` into `return `
// moves `function bump(by)` into an earlier body, so it now comes before
// `function twice(n`, which the edit did not touch. The script is a reduction
// of a case from the cumulative fuzz in programChunkIdentity.test.ts. The
// store-level cases below hold the alignment to its identity rule when
// statements cross: a statement keeps only a chunk it could keep in place.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
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
import { exportSymbol } from "../../program/StatementChunk";
import { MAIN_URI, programCompiler, rootChunks } from "./programHarness";
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
    const c = programCompiler({ [MAIN_URI]: SCRIPT }, { programChunks: true });
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
    const c = programCompiler({ [MAIN_URI]: text }, { programChunks: true });
    const before = c.compile().program;
    expect(before.fallback).toBeUndefined();
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
    expect(after.fallback).toBeUndefined();
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
    const c = programCompiler({ [MAIN_URI]: text }, { programChunks: true });
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
    expect(after.fallback).toBeUndefined();
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
});
