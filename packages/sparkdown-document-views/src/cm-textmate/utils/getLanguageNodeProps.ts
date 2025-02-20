import { NodeProp, NodePropSource } from "@lezer/common";
import { styleTags } from "@lezer/highlight";

import { RuleDefinition } from "../../../../grammar-compiler/src";
import { parseTag } from "./parseTag";

export const getLanguageNodeProps = (
  typeId: string,
  def: RuleDefinition
): NodePropSource[] => {
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
  return props;
};
