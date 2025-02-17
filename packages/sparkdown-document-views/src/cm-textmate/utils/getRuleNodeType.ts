import { NodeProp, NodeType } from "@lezer/common";
import { styleTags } from "@lezer/highlight";

import { NodeID, RuleDefinition } from "../../../../grammar-compiler/src";
import { parseTag } from "./parseTag";

/**
 * Node emitted when a character doesn't match anything in the grammar,
 * and the parser had to manually advance past it.
 */
export const NODE_ERROR_UNRECOGNIZED = NodeType.define({
  name: "⚠️ ERROR_UNRECOGNIZED",
  id: NodeID.unrecognized,
  error: true,
});

/** Node emitted at the end of incomplete nodes. */
export const NODE_ERROR_INCOMPLETE = NodeType.define({
  name: "⚠️ ERROR_INCOMPLETE",
  id: NodeID.incomplete,
  error: true,
});

export const getRuleNodeType = (
  topNode: NodeType,
  typeIndex: number,
  typeId: string,
  def: RuleDefinition
): NodeType => {
  if (typeIndex === NodeID.none) {
    return NodeType.none;
  }
  if (typeIndex === NodeID.top) {
    return topNode;
  }
  if (typeIndex === NodeID.unrecognized) {
    return NODE_ERROR_UNRECOGNIZED;
  }
  if (typeIndex === NodeID.incomplete) {
    return NODE_ERROR_INCOMPLETE;
  }
  const { tag, openedBy, closedBy, group } = def;
  const props = [];

  if (tag) {
    props.push(styleTags(parseTag(typeId + "/...", tag)));
  }
  if (openedBy) {
    props.push(NodeProp.openedBy.add({ [typeId]: [openedBy].flat() }));
  }
  if (closedBy) {
    props.push(NodeProp.closedBy.add({ [typeId]: [closedBy].flat() }));
  }
  if (group) {
    props.push(NodeProp.group.add({ [typeId]: [group].flat() }));
  }
  // In CodeMirror, `id` is the unique number identifier and `name` is the unique string identifier
  // This is different than the parser node that calls `typeIndex` the unique number identifier and `typeId` the unique string identifier
  return NodeType.define({ id: typeIndex, name: typeId, props });
};
