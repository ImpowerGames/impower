import { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { type SyntaxNodeRef } from "@lezer/common";
import { type SparkdownNodeName } from "./SparkdownNodeName";

export type SparkdownSyntaxNodeRef = SyntaxNodeRef & {
  name: SparkdownNodeName;
  node: GrammarSyntaxNode<SparkdownNodeName>;
};
