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

export function choiceTextMarkers(captureNode: SyntaxNode, to: number = captureNode.to): ChoiceTextMarker[] {
  const markers: ChoiceTextMarker[] = [];
  const walk = (node: SyntaxNode): void => {
    if (isExplicitRuleName(node.name, "SparkdownInlineComment") || isExplicitRuleName(node.name, "SparkdownBlockComment")) {
      markers.push({ kind: "comment", node });
      return;
    }
    if (isExplicitRuleName(node.name, "Tag")) {
      markers.push({ kind: "tag", node });
      return;
    }
    if (
      isExplicitRuleName(node.name, "LuauInterpolatedStringExpression") ||
      isExplicitRuleName(node.name, "LuauFunctionCallShorthand")
    ) {
      markers.push({ kind: "expr", node });
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

export interface TextRange {
  from: number;
  to: number;
}

interface ChoiceTextPart extends TextRange {
  node: SyntaxNode;
}

export interface ChoiceTextSpans {
  ranges: TextRange[];
  values: TextRange[];
}

export interface ChoiceTextRanges {
  chosen: ChoiceTextSpans;
  offered: ChoiceTextSpans;
}

export function choiceTextRanges(choiceNode: SyntaxNode): ChoiceTextRanges {
  const text = readChoiceText(choiceNode);
  const start = text.start.map((part) => ({ node: part.node, from: part.node.from, to: part.to }));
  const only = text.only ? [{ node: text.only, from: text.only.from, to: text.only.to }] : [];
  const inner = text.inner ? [{ node: text.inner, from: text.inner.from + 1, to: text.inner.to }] : [];
  return { chosen: textSpans([...start, ...inner]), offered: textSpans([...start, ...only]) };
}

function textSpans(parts: readonly ChoiceTextPart[]): ChoiceTextSpans {
  const ranges: TextRange[] = [];
  const values: TextRange[] = [];
  for (const part of parts) {
    let cursor = part.from;
    for (const marker of choiceTextMarkers(part.node, part.to)) {
      if (marker.kind === "expr") {
        values.push({ from: marker.node.from, to: marker.node.to });
        continue;
      }
      if (marker.node.from > cursor) ranges.push({ from: cursor, to: marker.node.from });
      cursor = Math.max(cursor, marker.node.to);
    }
    if (part.to > cursor) ranges.push({ from: cursor, to: part.to });
  }
  return { ranges, values };
}
