import { type NodePropSource, NodeType } from "@lezer/common";
import { NodeID } from "../../core/enums/NodeID";
import type { RuleDefinition } from "../../grammar/types/GrammarDefinition";

export const UNRECOGNIZED_NODE = NodeType.define({
  name: "ERROR_UNRECOGNIZED",
  id: NodeID.unrecognized,
  error: true,
});

export const INCOMPLETE_NODE = NodeType.define({
  name: "ERROR_INCOMPLETE",
  id: NodeID.incomplete,
  error: true,
});

export const defineNodeType = (
  topNode: NodeType,
  typeIndex: number,
  typeId: string,
  _def?: RuleDefinition,
  props?: NodePropSource[],
): NodeType => {
  if (typeIndex === NodeID.none) {
    return NodeType.none;
  }
  if (typeIndex === NodeID.top) {
    return topNode;
  }
  if (typeIndex === NodeID.unrecognized) {
    return UNRECOGNIZED_NODE;
  }
  if (typeIndex === NodeID.incomplete) {
    return INCOMPLETE_NODE;
  }

  return NodeType.define({ id: typeIndex, name: typeId, props });
};
