import { NodeType } from "@lezer/common";

import { RuleDefinition } from "@impower/textmate-grammar-tree/src/grammar/types/GrammarDefinition";
import { defineNodeType } from "@impower/textmate-grammar-tree/src/tree/utils/defineNodeType";

import { getLanguageNodeProps } from "./getLanguageNodeProps";

export const defineNodeTypeWithLanguageNodeProps = (
  topNode: NodeType,
  typeIndex: number,
  typeId: string,
  def: RuleDefinition
): NodeType => {
  return defineNodeType(
    topNode,
    typeIndex,
    typeId,
    def,
    getLanguageNodeProps(typeId, def)
  );
};
