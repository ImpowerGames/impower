import type { SparkdownNodeName } from "../../../sparkdown/src/types/SparkdownNodeName";
import type {
  SyntaxNode,
  NodeType,
} from "../../../grammar-compiler/src/compiler/classes/Tree";

export type SparkdownSyntaxNode = SyntaxNode & {
  type: NodeType & { name: SparkdownNodeName };
};
