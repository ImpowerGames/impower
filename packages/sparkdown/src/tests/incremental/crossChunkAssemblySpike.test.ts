import { Chunk } from "@impower/textmate-grammar-tree/src/compiler/classes/Chunk";
import { Compiler } from "@impower/textmate-grammar-tree/src/compiler/classes/Compiler";
import { Packet } from "@impower/textmate-grammar-tree/src/compiler/classes/Packet";
import { NodeID } from "@impower/textmate-grammar-tree/src/core/enums/NodeID";
import { type GrammarToken } from "@impower/textmate-grammar-tree/src/core/types/GrammarToken";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { NodeSet, NodeType, Tree, TreeBuffer } from "@lezer/common";
import { describe, expect, it } from "vitest";

const N = {
  ForLoop: NodeID.safe + 0,
  DoBlock: NodeID.safe + 1,
  FunctionDefinition: NodeID.safe + 2,
  FunctionBody: NodeID.safe + 3,
  Keyword: NodeID.safe + 4,
  Variable: NodeID.safe + 5,
  Content: NodeID.safe + 6,
  Newline: NodeID.safe + 7,
} as const;

const nodeSet = new NodeSet([
  NodeType.none,
  NodeType.define({ id: NodeID.top, name: "Top", top: true }),
  NodeType.define({ id: NodeID.unrecognized, name: "Unrecognized" }),
  NodeType.define({ id: NodeID.incomplete, name: "Incomplete" }),
  NodeType.define({ id: N.ForLoop, name: "ForLoop" }),
  NodeType.define({ id: N.DoBlock, name: "DoBlock" }),
  NodeType.define({ id: N.FunctionDefinition, name: "FunctionDefinition" }),
  NodeType.define({ id: N.FunctionBody, name: "FunctionBody" }),
  NodeType.define({ id: N.Keyword, name: "Keyword" }),
  NodeType.define({ id: N.Variable, name: "Variable" }),
  NodeType.define({ id: N.Content, name: "Content" }),
  NodeType.define({ id: N.Newline, name: "Newline" }),
]);

class TokenStream {
  pos = 0;
  tokens: GrammarToken[] = [];
  constructor(readonly src: string) {}

  emit(
    id: number,
    expect: string,
    open?: number[],
    close?: number[],
  ): this {
    const from = this.pos;
    const to = from + expect.length;
    const got = this.src.slice(from, to);
    if (got !== expect) {
      throw new Error(
        `token mismatch at ${from}: expected ${JSON.stringify(
          expect,
        )} got ${JSON.stringify(got)}`,
      );
    }
    this.tokens.push([id, from, to, open, close]);
    this.pos = to;
    return this;
  }

  skip(expect: string): this {
    const got = this.src.slice(this.pos, this.pos + expect.length);
    if (got !== expect) {
      throw new Error(
        `skip mismatch at ${this.pos}: expected ${JSON.stringify(
          expect,
        )} got ${JSON.stringify(got)}`,
      );
    }
    this.pos += expect.length;
    return this;
  }
}

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(ESC + "\\[\\d+(?:;\\d+)*m", "g");
const strip = (s: string) => s.replace(ANSI, "");

function buildTree(
  result: { cursor: any; reused: any[]; maxBufferLength: number },
  length: number,
): Tree {
  return Tree.build({
    topID: NodeID.top,
    buffer: result.cursor,
    nodeSet,
    reused: result.reused.map(
      (b) => new TreeBuffer(b.buffer, b.length, nodeSet),
    ) as unknown as readonly Tree[],
    start: 0,
    length,
    maxBufferLength: result.maxBufferLength,
  });
}

function wholeBlockTree(tokens: GrammarToken[], source: string): Tree {
  const compiler = new Compiler({} as any);
  for (const t of tokens) compiler.add(t);
  const result = compiler.finish(source.length)!;
  return buildTree(result, source.length);
}

interface OpenFrame {
  id: number;
  absOpen: number;
  children: number;
}

interface PerLineOpts {
  inheritScopes: boolean;
  inheritCounts: boolean;
}

function perLineTree(
  tokens: GrammarToken[],
  source: string,
  opts: PerLineOpts,
): Tree {
  const lineOf = (pos: number) => {
    let line = 0;
    for (let i = 0; i < pos; i++) if (source[i] === "\n") line++;
    return line;
  };

  const groups = new Map<number, GrammarToken[]>();
  for (const t of tokens) {
    const ln = lineOf(t[1]);
    (groups.get(ln) ?? groups.set(ln, []).get(ln)!).push(t);
  }

  const packet = new Packet([]);
  let residual: OpenFrame[] = [];

  for (const ln of [...groups.keys()].sort((a, b) => a - b)) {
    const group = groups.get(ln)!;
    const chunkFrom = group[0]![1];
    const chunk = new Chunk(chunkFrom, true);

    if (opts.inheritScopes) {
      for (const f of residual) {
        chunk.stack.push(
          f.id,
          f.absOpen - chunk.from,
          opts.inheritCounts ? f.children : 0,
        );
        (chunk.scopes ??= []).push(f.id);
      }
    }

    for (const t of group) chunk.add(t);

    residual = [];
    for (let i = 0; i < chunk.stack.length; i++) {
      residual.push({
        id: chunk.stack.ids[i]!,
        absOpen: chunk.from + chunk.stack.positions[i]!,
        children: chunk.stack.children[i]!,
      });
    }

    packet.chunks.push(chunk);
  }

  const compiler = new Compiler({} as any, packet);
  const result = compiler.finish(source.length)!;
  return buildTree(result, source.length);
}

function dump(tree: Tree, source: string): string {
  return strip(printTree(tree, source));
}

function forDoFixture() {
  const src = "for i in items do\n  print(i)\n  log(x)\nend\n";
  const s = new TokenStream(src);
  s.emit(N.Keyword, "for", [N.ForLoop])
    .skip(" ")
    .emit(N.Variable, "i")
    .skip(" in ")
    .emit(N.Variable, "items")
    .skip(" ")
    .emit(N.Keyword, "do", [N.DoBlock])
    .emit(N.Newline, "\n");
  s.skip("  ").emit(N.Content, "print(i)").emit(N.Newline, "\n");
  s.skip("  ").emit(N.Content, "log(x)").emit(N.Newline, "\n");
  s.emit(N.Keyword, "end", undefined, [N.DoBlock, N.ForLoop]).emit(
    N.Newline,
    "\n",
  );
  return { src, tokens: s.tokens };
}

function functionFixture() {
  const src = "function greet(name)\n  say(name)\nend\n";
  const s = new TokenStream(src);
  s.emit(N.Keyword, "function", [N.FunctionDefinition])
    .skip(" ")
    .emit(N.Variable, "greet")
    .emit(N.Content, "(name)")
    .emit(N.Newline, "\n", [N.FunctionBody]);
  s.skip("  ").emit(N.Content, "say(name)").emit(N.Newline, "\n");
  s.emit(N.Keyword, "end", undefined, [
    N.FunctionBody,
    N.FunctionDefinition,
  ]).emit(N.Newline, "\n");
  return { src, tokens: s.tokens };
}

describe("cross-chunk assembly spike (for...do...end)", () => {
  const { src, tokens } = forDoFixture();
  const reference = dump(wholeBlockTree(tokens, src), src);

  it("whole-block reference nests correctly (sanity)", () => {
    expect(reference).toContain("ForLoop");
    expect(reference).toContain("DoBlock");
    const lines = reference.split("\n");
    const forIdx = lines.findIndex((l) => l.includes("ForLoop"));
    const doIdx = lines.findIndex((l) => l.includes("DoBlock"));
    expect(forIdx).toBeGreaterThanOrEqual(0);
    expect(doIdx).toBeGreaterThan(forIdx);
    expect(lines[doIdx]!.indexOf("DoBlock")).toBeGreaterThan(
      lines[forIdx]!.indexOf("ForLoop"),
    );
  });

  it("FAILURE A — naive per-line (no inherit): parents vanish, fully flat", () => {
    const flat = dump(
      perLineTree(tokens, src, {
        inheritScopes: false,
        inheritCounts: false,
      }),
      src,
    );
    expect(flat).not.toContain("ForLoop");
    expect(flat).not.toContain("DoBlock");
    expect(flat).not.toBe(reference);
  });

  it("FAILURE B — inherit scopes, reset counts: parents mis-sized, children detached", () => {
    const detached = dump(
      perLineTree(tokens, src, {
        inheritScopes: true,
        inheritCounts: false,
      }),
      src,
    );
    expect(detached).toContain("ForLoop");
    expect(detached).toContain("DoBlock");
    expect(detached).not.toBe(reference);
  });

  it("FIX — inherit scopes + accumulate counts: byte-identical to whole-block", () => {
    const fixed = dump(
      perLineTree(tokens, src, {
        inheritScopes: true,
        inheritCounts: true,
      }),
      src,
    );
    expect(fixed).toBe(reference);
  });
});

describe("cross-chunk assembly spike (function...end)", () => {
  const { src, tokens } = functionFixture();
  const reference = dump(wholeBlockTree(tokens, src), src);

  it("whole-block reference nests correctly (sanity)", () => {
    expect(reference).toContain("FunctionDefinition");
    expect(reference).toContain("FunctionBody");
  });

  it("FAILURE A — naive per-line: parents vanish", () => {
    const flat = dump(
      perLineTree(tokens, src, {
        inheritScopes: false,
        inheritCounts: false,
      }),
      src,
    );
    expect(flat).not.toContain("FunctionDefinition");
    expect(flat).not.toBe(reference);
  });

  it("FAILURE B — inherit scopes, reset counts: detached", () => {
    const detached = dump(
      perLineTree(tokens, src, {
        inheritScopes: true,
        inheritCounts: false,
      }),
      src,
    );
    expect(detached).toContain("FunctionDefinition");
    expect(detached).not.toBe(reference);
  });

  it("FIX — inherit scopes + accumulate counts: byte-identical", () => {
    const fixed = dump(
      perLineTree(tokens, src, {
        inheritScopes: true,
        inheritCounts: true,
      }),
      src,
    );
    expect(fixed).toBe(reference);
  });
});
