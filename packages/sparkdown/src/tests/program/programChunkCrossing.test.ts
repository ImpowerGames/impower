// Statements whose order an edit swaps in the program's statement list keep
// their chunks (#1496). Turning the text after an earlier `end` into `return `
// moves `function bump(by)` into an earlier body, so it now comes before
// `function twice(n`, which the edit did not touch. The script is a reduction
// of a case from the cumulative fuzz in programChunkIdentity.test.ts. The
// store-level cases below hold the alignment to its identity rule when
// statements cross: a statement keeps only a chunk it could keep in place.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { Text } from "../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import {
  ChunkStore,
  type DeclarationSource,
  type StatementSource,
} from "../../program/ChunkStore";
import { SymbolKind } from "../../program/ProgramSymbols";
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
