import { Input, NodeSet, NodeType, Parser, TreeFragment } from "@lezer/common";
import { NodeID } from "../../core/enums/NodeID";
import { Grammar } from "../../grammar/classes/Grammar";
import {
  GrammarDefinition,
  RuleDefinition,
} from "../../grammar/types/GrammarDefinition";
import { defineNodeType } from "../utils/defineNodeType";
import { TextmateGrammarParse } from "./TextmateGrammarParse";

export class TextmateGrammarParser extends Parser {
  /** The resolved grammar. */
  declare grammar: Grammar;

  /** The set of CodeMirror NodeTypes in the grammar. */
  declare nodeSet: NodeSet;

  constructor(
    grammarDefinition: GrammarDefinition,
    rootNodeType?: NodeType,
    getNodeType?: (
      topNode: NodeType,
      typeIndex: number,
      typeId: string,
      def: RuleDefinition
    ) => NodeType
  ) {
    super();
    const nodeTypeProp = "nodeType";
    const validRootNodeType =
      rootNodeType ??
      NodeType.define({
        id: NodeID.top,
        name: grammarDefinition.name?.toLowerCase(),
        top: true,
      });
    const validGetNodeType = getNodeType ?? defineNodeType;
    const declarator = (
      typeIndex: number,
      typeId: string,
      data: RuleDefinition
    ) => ({
      [nodeTypeProp]: validGetNodeType(
        validRootNodeType,
        typeIndex,
        typeId,
        data
      ),
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
    const parse = new TextmateGrammarParse(
      this.grammar,
      this.nodeSet,
      input,
      fragments,
      ranges
    );
    return parse;
  }
}
