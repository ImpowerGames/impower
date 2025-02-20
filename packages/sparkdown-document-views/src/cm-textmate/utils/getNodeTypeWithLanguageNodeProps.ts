import { NodeType } from "@lezer/common";

import { RuleDefinition } from "../../../../grammar-compiler/src";
import { getNodeType } from "./getNodeType";
import { getLanguageNodeProps } from "./getLanguageNodeProps";

export const getNodeTypeWithLanguageNodeProps = (
  topNode: NodeType,
  typeIndex: number,
  typeId: string,
  def: RuleDefinition
): NodeType => {
  return getNodeType(
    topNode,
    typeIndex,
    typeId,
    def,
    getLanguageNodeProps(typeId, def)
  );
};
