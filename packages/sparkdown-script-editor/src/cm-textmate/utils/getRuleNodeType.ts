import { foldNodeProp, indentNodeProp } from "@codemirror/language";
import { NodeProp, NodeType } from "@lezer/common";
import { styleTags } from "@lezer/highlight";

import { NodeID, RuleDefinition } from "../../../../grammar-compiler/src";
import parseFold from "./parseFold";
import parseIndent from "./parseIndent";
import parseTag from "./parseTag";

/**
 * Node emitted when the parser reached a newline and had to manually advance.
 */
export const NODE_NEWLINE = NodeType.define({
  name: "newline",
  id: NodeID.NEWLINE,
});

/**
 * Node emitted when a character doesn't match anything in the grammar,
 * and the parser had to manually advance past it.
 */
export const NODE_ERROR_UNRECOGNIZED = NodeType.define({
  name: "⚠️ ERROR_UNRECOGNIZED",
  id: NodeID.ERROR_UNRECOGNIZED,
  error: true,
});

/** Node emitted at the end of incomplete nodes. */
export const NODE_ERROR_INCOMPLETE = NodeType.define({
  name: "⚠️ ERROR_INCOMPLETE",
  id: NodeID.ERROR_INCOMPLETE,
  error: true,
});

/** A `NodeProp` that points to the original grammar `Node` for the `NodeType`. */
export const NODE_TYPE_PROP = new NodeProp();

const getRuleNodeType = (
  topNode: NodeType,
  typeIndex: number,
  typeId: string,
  def: RuleDefinition
): NodeType => {
  if (typeIndex === NodeID.NONE) {
    return NodeType.none;
  }
  if (typeIndex === NodeID.TOP) {
    return topNode;
  }
  if (typeIndex === NodeID.NEWLINE) {
    return NODE_NEWLINE;
  }
  if (typeIndex === NodeID.ERROR_UNRECOGNIZED) {
    return NODE_ERROR_UNRECOGNIZED;
  }
  if (typeIndex === NodeID.ERROR_INCOMPLETE) {
    return NODE_ERROR_INCOMPLETE;
  }
  const { tag, fold, indent, openedBy, closedBy, group } = def;
  const props = [];

  props.push(NODE_TYPE_PROP.add({ [typeId]: this }));

  if (tag) {
    props.push(styleTags(parseTag(typeId + "/...", tag)));
  }
  if (fold) {
    props.push(foldNodeProp.add({ [typeId]: parseFold(fold) }));
  }
  if (indent) {
    props.push(indentNodeProp.add({ [typeId]: parseIndent(indent) }));
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

export default getRuleNodeType;
