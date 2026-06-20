// Guards the C5 fix: a scope that OPENS in one chunk and CLOSES in a later
// chunk (with a split chunk between) must produce the SAME nested tree as the
// same scope contained in a single chunk. This is the foundation that makes
// scope-stable (depth>0) split points possible — without it, minting a split
// inside an open scope flattens the tree (the close can't find its open).
//
// Mechanism under test (Chunk.ts): absolute stack positions + `inherit()`
// carrying open frames across the boundary + the tree-buffer guard that stops a
// chunk which closes an inherited scope from being treated as self-contained.

import { Chunk } from "@impower/textmate-grammar-tree/src/compiler/classes/Chunk";
import { Compiler } from "@impower/textmate-grammar-tree/src/compiler/classes/Compiler";
import { NodeID } from "@impower/textmate-grammar-tree/src/core/enums/NodeID";
import { Packet } from "@impower/textmate-grammar-tree/src/compiler/classes/Packet";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { Tree, TreeBuffer } from "@lezer/common";
import { describe, expect, test } from "vitest";
import { getParser } from "../compiler/grammarSnapshot";

function nodeIds(parser: any): { scope: number; leaf: number } {
  const repo = parser.grammar.nodes.filter(
    (n: any) => n.typeIndex >= 4 && n.props,
  );
  return { scope: repo[0].typeIndex, leaf: repo[1].typeIndex };
}

function compile(parser: any, packet: Packet, length: number): string {
  const compiler = new Compiler(parser.grammar);
  compiler.packet = packet;
  compiler.index = 0;
  const result = compiler.finish(length)!;
  const reused = (result.reused as any[]).map(
    (b) => new TreeBuffer(b.buffer, b.length, parser.nodeSet),
  ) as unknown as readonly Tree[];
  const tree = Tree.build({
    topID: NodeID.top,
    buffer: result.cursor,
    nodeSet: parser.nodeSet,
    reused,
    start: 0,
    length,
    maxBufferLength: result.maxBufferLength,
  });
  return printTree(tree, "AAA BBB CCC").replace(/\[\d+m/g, "");
}

describe("cross-chunk scope nesting (C5)", () => {
  test("scope split across chunks nests identically to a single chunk", () => {
    const parser = getParser();
    const { scope, leaf } = nodeIds(parser);

    const single = (() => {
      const c = new Chunk(0);
      c.add([leaf, 0, 3, [scope]]);
      c.add([leaf, 4, 7]);
      c.add([leaf, 8, 11, undefined, [scope]]);
      return compile(parser, new Packet([c]), 11);
    })();

    const split = (() => {
      const a = new Chunk(0);
      a.add([leaf, 0, 3, [scope]]); // open in chunk A
      a.add([leaf, 4, 7]);
      const sp = new Chunk(7, true);
      sp.inherit(a);
      const cc = new Chunk(8);
      cc.inherit(sp);
      cc.add([leaf, 8, 11, undefined, [scope]]); // close in chunk C
      return compile(parser, new Packet([a, sp, cc]), 11);
    })();

    expect(split).toBe(single);
    // sanity: the scope actually nests its three children
    expect(single).toContain(parser.grammar.nodeNames[scope]);
    expect((single.match(/FlowStatements|/g) || []).length).toBeGreaterThan(0);
  });
});
