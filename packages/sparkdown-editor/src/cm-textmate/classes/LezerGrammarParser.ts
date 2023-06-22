/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Input, NodeSet, NodeType, Parser, TreeFragment } from "@lezer/common";

import {
  Grammar,
  GrammarDefinition,
  RuleDefinition,
} from "../../../../grammar-compiler/src/grammar";

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
    const parser = new LezerGrammarParse(
      this.grammar,
      this.nodeSet,
      input,
      fragments,
      ranges
    );
    return parser;
  }
}
