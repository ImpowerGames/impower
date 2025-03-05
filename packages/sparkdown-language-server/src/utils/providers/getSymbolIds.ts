import { SparkdownNodeName } from "@impower/sparkdown/src/types/SparkdownNodeName";
import { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";

export const getSymbolIds = (
  annotations: SparkdownAnnotations,
  symbol: GrammarSyntaxNode<SparkdownNodeName>,
  includeInterdependent: boolean
): string[] => {
  const r = annotations.references.iter();
  while (r.value) {
    if (r.from === symbol.from && r.to === symbol.to) {
      const ids = [];
      if (r.value.type.symbolIds) {
        ids.push(...r.value.type.symbolIds);
      }
      if (includeInterdependent) {
        if (r.value.type.interdependentIds) {
          ids.push(...r.value.type.interdependentIds);
        }
      }
      return ids;
    }
    r.next();
  }
  return [];
};
