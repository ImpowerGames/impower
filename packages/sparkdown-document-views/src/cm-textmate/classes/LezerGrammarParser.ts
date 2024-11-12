/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  Input,
  NodeSet,
  NodeType,
  Parser,
  Tree,
  TreeBuffer,
  TreeFragment,
} from "@lezer/common";

import {
  Grammar,
  GrammarDefinition,
  RuleDefinition,
} from "../../../../grammar-compiler/src/grammar";

import { ChunkBuffer } from "../../../../grammar-compiler/src/compiler/classes/ChunkBuffer";
import { Compiler } from "../../../../grammar-compiler/src/compiler/classes/Compiler";
import { NodeID } from "../../../../grammar-compiler/src/core/enums/NodeID";
import getRuleNodeType from "../utils/getRuleNodeType";
import LezerGrammarParse from "./LezerGrammarParse";

export default class LezerGrammarParser extends Parser {
  /** The resolved grammar. */
  declare grammar: Grammar;

  /** The set of CodeMirror NodeTypes in the grammar. */
  declare nodeSet: NodeSet;

  constructor(grammarDefinition: GrammarDefinition, rootNodeType: NodeType) {
    super();
    const nodeTypeProp = "nodeType";
    const declarator = (
      typeIndex: number,
      typeId: string,
      data: RuleDefinition
    ) => ({
      [nodeTypeProp]: getRuleNodeType(rootNodeType, typeIndex, typeId, data),
    });
    this.grammar = new Grammar(grammarDefinition, declarator);
    const nodeTypes = this.grammar.nodes.map((n) => n.props[nodeTypeProp]);
    this.nodeSet = new NodeSet(nodeTypes);
  }

  createParse(
    input: Input,
    fragments: readonly TreeFragment[],
    ranges: { from: number; to: number }[]
  ) {
    const parse = new LezerGrammarParse(
      this.grammar,
      this.nodeSet,
      input,
      fragments,
      ranges
    );
    return parse;
  }

  override parse(
    input: string | Input,
    fragments?: readonly TreeFragment[] | undefined,
    ranges?: readonly { from: number; to: number }[] | undefined
  ): Tree {
    if (!fragments && !ranges) {
      const script =
        typeof input === "string" ? input : input.read(0, input.length);
      let paddedScript = script + "\n";
      const buffer = new ChunkBuffer([]);
      const compiler = new Compiler(this.grammar, this.nodeSet, buffer);
      const result = compiler.compile(paddedScript);
      if (result) {
        const topID = NodeID.top;
        const tree = Tree.build({
          topID,
          buffer: result.cursor,
          nodeSet: this.nodeSet,
          reused: result.reused.map(
            (b) => new TreeBuffer(b.buffer, b.length, this.nodeSet)
          ) as unknown as readonly Tree[],
          start: 0,
          length: script.length,
        });
        return tree;
      }
    }
    return super.parse(input, fragments, ranges);
  }
}
