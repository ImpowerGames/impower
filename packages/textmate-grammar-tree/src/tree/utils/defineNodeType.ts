import { NodePropSource, NodeType } from "@lezer/common";
import { NodeID } from "../../core/enums/NodeID";
import { RuleDefinition } from "../../grammar/types/GrammarDefinition";

/**
 * Node emitted when a character doesn't match anything in the grammar,
 * and the parser had to manually advance past it.
 */
export const UNRECOGNIZED_NODE = NodeType.define({
  name: "ERROR_UNRECOGNIZED",
  id: NodeID.unrecognized,
  error: true,
});

/** Node emitted at the end of incomplete nodes. */
export const INCOMPLETE_NODE = NodeType.define({
  name: "ERROR_INCOMPLETE",
  id: NodeID.incomplete,
  error: true,
});

export const defineNodeType = (
  topNode: NodeType,
  typeIndex: number,
  typeId: string,
  def?: RuleDefinition,
  props?: NodePropSource[]
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

  // In CodeMirror, `id` is the unique number identifier and `name` is the unique string identifier
  // This is different than the parser node that calls `typeIndex` the unique number identifier and `typeId` the unique string identifier
  return NodeType.define({ id: typeIndex, name: typeId, props });
};
