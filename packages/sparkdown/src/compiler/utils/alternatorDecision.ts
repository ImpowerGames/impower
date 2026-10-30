import type { SyntaxNode } from "@lezer/common";
import { explicitRuleNames } from "./explicitRuleNames";

export const ALTERNATOR_CANDIDATES: ReadonlySet<string> = new Set(
  [
    "LuauConditionalAlternatorBlock",
    "LuauSequentialAlternatorBlock",
    "LuauConditionalAlternatorLineStart",
    "LuauSequentialAlternatorLineStart",
  ].flatMap(explicitRuleNames),
);

const ARMS: ReadonlySet<string> = new Set(
  explicitRuleNames("LuauAlternatorArms"),
);

const HEADS: ReadonlySet<string> = new Set(
  ["LuauAlternatorHead", "LuauAlternatorLineStartHead"].flatMap(explicitRuleNames),
);

export function alternatorArms(node: SyntaxNode): SyntaxNode | null {
  const content = node.getChild(`${node.name}_content`);
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (ARMS.has(child.name)) return child;
  }
  return null;
}

export function headSeparator(node: SyntaxNode): SyntaxNode | null {
  const content = node.getChild(`${node.name}_content`);
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (!HEADS.has(child.name)) continue;
    const end = child.getChild(`${child.name}_end`);
    for (let part = end?.firstChild ?? null; part; part = part.nextSibling) {
      const separator = part.getChild("LuauAlternatorSeparator");
      if (separator) return separator;
    }
  }
  return null;
}

export function alternatorHeadNodes(node: SyntaxNode): SyntaxNode[] {
  const nodes: SyntaxNode[] = [];
  const content = node.getChild(`${node.name}_content`);
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (!HEADS.has(child.name)) continue;
    const head = child.getChild(`${child.name}_content`);
    for (let part = head?.firstChild ?? null; part; part = part.nextSibling) nodes.push(part);
  }
  return nodes;
}

export function opensAlternator(node: SyntaxNode): boolean {
  return !ALTERNATOR_CANDIDATES.has(node.name) || alternatorArms(node) !== null || headSeparator(node) !== null;
}

export function candidateOfWord(keyword: SyntaxNode): SyntaxNode | null {
  let begin: SyntaxNode | null = keyword.parent;
  while (begin && /_begin_c\d+$/.test(begin.name)) begin = begin.parent;
  const rule = begin?.name.endsWith("_begin") ? begin.parent : null;
  return rule && ALTERNATOR_CANDIDATES.has(rule.name) ? rule : null;
}

export function namesValue(keyword: SyntaxNode): boolean {
  const candidate = candidateOfWord(keyword);
  return !!candidate && !opensAlternator(candidate);
}
