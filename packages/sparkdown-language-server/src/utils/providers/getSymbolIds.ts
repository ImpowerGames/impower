import { SparkdownNodeName } from "@impower/sparkdown/src/types/SparkdownNodeName";
import { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";

export const getSymbolIds = (
  annotations: SparkdownAnnotations,
  symbol: GrammarSyntaxNode<SparkdownNodeName>
): { symbolIds?: string[]; interdependentIds?: string[] } => {
  const r = annotations.references.iter();
  while (r.value) {
    if (r.from === symbol.from && r.to === symbol.to) {
      return {
        symbolIds: r.value.type.symbolIds,
        interdependentIds: r.value.type.interdependentIds,
      };
    }
    r.next();
  }
  return {};
};
