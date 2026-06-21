// PREREQUISITE SPIKE — "valid suffix buffer -> detached tree" (isolated).
//
// See docs/REDESIGN_KICKOFF.md and docs/PHASE_C_INCREMENTAL_DESIGN.md.
//
// The headline goal (reparse only the edited line inside a big block) requires
// splitting a block across MANY chunks — one per line — instead of the single
// whole-block chunk production emits today. A prior attempt did exactly that,
// got the matcher correct, produced per-chunk suffix buffers that validated
// cleanly, and STILL assembled a tree whose block children were detached. That
// defect was never isolated. This spike isolates it, with NO real grammar and NO
// real parse: it hand-crafts the per-line token sequence for a `for...do...end`
// and a `function...end` block, feeds it through the REAL `Compiler` +
// `Tree.build`, reproduces the detachment, and shows the one assembly-level fix
// that makes the per-line tree byte-identical to the whole-block tree.
//
// WHY IT DETACHES (the mechanism, confirmed in source):
//   * A scope's PARENT node is emitted only when it CLOSES, with a baked
//     `size = children*4 + 4` (Chunk.add close branch).
//   * `children` is counted by `CompileStack.increment()`, which bumps every
//     OPEN frame once per emitted node — but each Chunk owns a FRESH stack.
//   * The Compiler concatenates each chunk's suffix buffer verbatim
//     (Compiler.step) into one global buffer for Tree.build.
//   * So when a scope opens in chunk A and closes in chunk D, chunk D's stack
//     either (a) doesn't know the scope is open -> `stack.last(c)` is null ->
//     the parent is NEVER emitted (fully flat tree), or (b) knows it but counts
//     only chunk D's OWN children -> `size` too small -> the body nodes emitted
//     in the earlier chunks fall OUTSIDE the parent's span -> detached.
//
// THE FIX (proven below): carry the open scope frames across the chunk boundary
// with their ABSOLUTE open-position AND their ACCUMULATED child-count, so the
// closing chunk emits each spanning parent with a `size` that spans every child
// across every chunk. Absolute positions round-trip through the
// `Compiler.step` `chunk.from + relative` recombination; accumulated counts make
// the spanning `size` correct. TreeBuffer conversion is disabled throughout
// (every per-line chunk is marked `isSplitPoint`), proving the defect is in the
// node-by-node global assembly, NOT in `copyToTreeBuffer`.

import { Chunk } from "@impower/textmate-grammar-tree/src/compiler/classes/Chunk";
import { Compiler } from "@impower/textmate-grammar-tree/src/compiler/classes/Compiler";
import { Packet } from "@impower/textmate-grammar-tree/src/compiler/classes/Packet";
import { NodeID } from "@impower/textmate-grammar-tree/src/core/enums/NodeID";
import { type GrammarToken } from "@impower/textmate-grammar-tree/src/core/types/GrammarToken";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { NodeSet, NodeType, Tree, TreeBuffer } from "@lezer/common";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Minimal synthetic node set (ids must match array index for Tree.build).
// ---------------------------------------------------------------------------

const N = {
  ForLoop: NodeID.safe + 0, // 4
  DoBlock: NodeID.safe + 1, // 5
  FunctionDefinition: NodeID.safe + 2, // 6
  FunctionBody: NodeID.safe + 3, // 7
  Keyword: NodeID.safe + 4, // 8
  Variable: NodeID.safe + 5, // 9
  Content: NodeID.safe + 6, // 10
  Newline: NodeID.safe + 7, // 11
} as const;

const nodeSet = new NodeSet([
  NodeType.none, // 0
  NodeType.define({ id: NodeID.top, name: "Top", top: true }), // 1
  NodeType.define({ id: NodeID.unrecognized, name: "Unrecognized" }), // 2
  NodeType.define({ id: NodeID.incomplete, name: "Incomplete" }), // 3
  NodeType.define({ id: N.ForLoop, name: "ForLoop" }),
  NodeType.define({ id: N.DoBlock, name: "DoBlock" }),
  NodeType.define({ id: N.FunctionDefinition, name: "FunctionDefinition" }),
  NodeType.define({ id: N.FunctionBody, name: "FunctionBody" }),
  NodeType.define({ id: N.Keyword, name: "Keyword" }),
  NodeType.define({ id: N.Variable, name: "Variable" }),
  NodeType.define({ id: N.Content, name: "Content" }),
  NodeType.define({ id: N.Newline, name: "Newline" }),
]);

// ---------------------------------------------------------------------------
// Token builder: emit/skip over a source string so every token's [from,to] is
// exact and printTree shows real text.
// ---------------------------------------------------------------------------

class TokenStream {
  pos = 0;
  tokens: GrammarToken[] = [];
  constructor(readonly src: string) {}

  /** Emit a token for the next `len` chars (must match `expect`). */
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

  /** Advance past untokenized whitespace (allowed: validator permits gaps). */
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

// ---------------------------------------------------------------------------
// Assembly: whole-block (single chunk, production path) vs per-line (the goal).
// ---------------------------------------------------------------------------

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

/** Reference: feed every token to one Compiler (production whole-block path). */
function wholeBlockTree(tokens: GrammarToken[], source: string): Tree {
  const compiler = new Compiler({} as any);
  for (const t of tokens) compiler.add(t);
  const result = compiler.finish(source.length)!;
  return buildTree(result, source.length);
}

interface OpenFrame {
  id: number;
  absOpen: number; // absolute document position the scope opened at
  children: number; // accumulated child count across all chunks so far
}

interface PerLineOpts {
  /** Seed each chunk's stack from the previous chunk's residual open frames. */
  inheritScopes: boolean;
  /** Carry the ACCUMULATED child counts (vs resetting them to 0 per chunk). */
  inheritCounts: boolean;
}

/**
 * Split the same token list into one chunk PER SOURCE LINE and assemble. This
 * is the per-line shape the redesign needs; `opts` selects the failure modes vs
 * the fix.
 */
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

  // group tokens by the line their `from` falls on
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
    // isSplitPoint=true marks the chunk non-self-contained -> Tree-buffer
    // conversion is disabled (canConvertToTreeBuffer returns false), forcing
    // node-by-node emission. This proves the defect is in global assembly.
    const chunk = new Chunk(chunkFrom, true);

    if (opts.inheritScopes) {
      for (const f of residual) {
        // Store the open-position RELATIVE to THIS chunk's `from`, so the
        // Compiler.step `chunk.from + relative` recombination recovers the
        // original absolute position (it may be negative — that's fine).
        chunk.stack.push(
          f.id,
          f.absOpen - chunk.from,
          opts.inheritCounts ? f.children : 0,
        );
        (chunk.scopes ??= []).push(f.id);
      }
    }

    for (const t of group) chunk.add(t);

    // residual open frames left on the stack after this line
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** `for i in items do  /  print(i)  /  log(x)  /  end` */
function forDoFixture() {
  const src = "for i in items do\n  print(i)\n  log(x)\nend\n";
  const s = new TokenStream(src);
  // line 0
  s.emit(N.Keyword, "for", [N.ForLoop])
    .skip(" ")
    .emit(N.Variable, "i")
    .skip(" in ")
    .emit(N.Variable, "items")
    .skip(" ")
    .emit(N.Keyword, "do", [N.DoBlock])
    .emit(N.Newline, "\n");
  // line 1
  s.skip("  ").emit(N.Content, "print(i)").emit(N.Newline, "\n");
  // line 2
  s.skip("  ").emit(N.Content, "log(x)").emit(N.Newline, "\n");
  // line 3 — one physical `end` closes DoBlock then ForLoop
  s.emit(N.Keyword, "end", undefined, [N.DoBlock, N.ForLoop]).emit(
    N.Newline,
    "\n",
  );
  return { src, tokens: s.tokens };
}

/** `function greet(name)  /  say(name)  /  end` */
function functionFixture() {
  const src = "function greet(name)\n  say(name)\nend\n";
  const s = new TokenStream(src);
  // line 0 — FunctionDefinition opens at `function`, FunctionBody at the newline
  s.emit(N.Keyword, "function", [N.FunctionDefinition])
    .skip(" ")
    .emit(N.Variable, "greet")
    .emit(N.Content, "(name)")
    .emit(N.Newline, "\n", [N.FunctionBody]);
  // line 1
  s.skip("  ").emit(N.Content, "say(name)").emit(N.Newline, "\n");
  // line 2 — `end` closes FunctionBody then FunctionDefinition
  s.emit(N.Keyword, "end", undefined, [
    N.FunctionBody,
    N.FunctionDefinition,
  ]).emit(N.Newline, "\n");
  return { src, tokens: s.tokens };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cross-chunk assembly spike (for...do...end)", () => {
  const { src, tokens } = forDoFixture();
  const reference = dump(wholeBlockTree(tokens, src), src);

  it("whole-block reference nests correctly (sanity)", () => {
    // ForLoop contains DoBlock contains the body content.
    expect(reference).toContain("ForLoop");
    expect(reference).toContain("DoBlock");
    // structural sanity: DoBlock line is indented deeper than ForLoop line
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
    // The ForLoop / DoBlock parent nodes are never emitted at all.
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
    // Parents ARE emitted now (suffix buffer validates) ...
    expect(detached).toContain("ForLoop");
    expect(detached).toContain("DoBlock");
    // ... but their span is too small, so the body content is NOT under them.
    // The tree differs from the reference: this is the exact "valid suffix
    // buffer -> detached tree" defect.
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
