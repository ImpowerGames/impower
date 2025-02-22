import { type SyntaxNode, type NodeType } from "../classes/Tree";

export type GrammarSyntaxNode<T extends string> = SyntaxNode & {
  type: NodeType & { name: T };
};
