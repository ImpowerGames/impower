import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { type SyntaxNode } from "@lezer/common";
import { isExplicitRuleName } from "./explicitRuleNames";

export interface ChoiceText {
  start: { node: SyntaxNode; to: number }[];
  only: SyntaxNode | null;
  inner: SyntaxNode | null;
}

export function readChoiceText(choiceNode: SyntaxNode): ChoiceText {
  const start: ChoiceText["start"] = [];
  const startText = getDescendent("ChoiceStartText", choiceNode);
  if (startText) start.push({ node: startText, to: startText.to });
  const suppression = getDescendent("ChoiceSuppression", choiceNode);
  if (!suppression) return { start, only: null, inner: null };
  const only = getDescendent("ChoiceOnlyText", suppression) ?? null;
  const inner = getDescendent("ChoiceInnerText", suppression) ?? null;
  if (!inner) {
    start.push({ node: suppression, to: only?.to ?? suppression.from + 1 });
    return { start, only: null, inner: null };
  }
  return { start, only, inner };
}

export interface ChoiceTextMarker {
  kind: "tag" | "expr" | "comment";
  node: SyntaxNode;
}

export function choiceTextMarkerKind(node: SyntaxNode): ChoiceTextMarker["kind"] | null {
  if (isExplicitRuleName(node.name, "SparkdownInlineComment") || isExplicitRuleName(node.name, "SparkdownBlockComment")) {
    return "comment";
  }
  if (isExplicitRuleName(node.name, "Tag")) return "tag";
  if (
    isExplicitRuleName(node.name, "LuauInterpolatedStringExpression") ||
    isExplicitRuleName(node.name, "LuauFunctionCallShorthand")
  ) {
    return "expr";
  }
  return null;
}

export function choiceTextMarkers(captureNode: SyntaxNode, to: number = captureNode.to): ChoiceTextMarker[] {
  const markers: ChoiceTextMarker[] = [];
  const walk = (node: SyntaxNode): void => {
    const kind = choiceTextMarkerKind(node);
    if (kind) {
      markers.push({ kind, node });
      return;
    }
    let child = node.firstChild;
    while (child) {
      walk(child);
      child = child.nextSibling;
    }
  };
  walk(captureNode);
  return markers.filter((m) => m.node.from < to).sort((a, b) => a.node.from - b.node.from);
}
