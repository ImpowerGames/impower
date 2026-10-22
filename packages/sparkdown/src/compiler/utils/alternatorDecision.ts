import type { SyntaxNode } from "@lezer/common";
import { explicitRuleNames } from "./explicitRuleNames";

// Whether a structural word (`queue`, `cycle`, `chain`, `shuffle`, `match`,
// `plural`) in Luau code opens an alternator or names a value is decided
// here, once, from the tree (I-1310). The grammar opens a candidate at the
// word (one of these rules) and its arms (`LuauAlternatorArms`) at a `|` at
// the word's own level. A `|` there is never valid Luau, which has `|` only
// in a type, and the grammar reads a type, a string, a comment and a bracket
// whole, so a candidate that holds arms is an alternator and one that holds
// none is Luau whatever the scope: `match(1)` is a call of `match`. The
// converter, the lowerers, the annotators and the lints all ask this.

/** The rules a structural word opens in Luau code, each an alternator only when it holds its arms. */
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

/** A candidate's arms, or null when it holds none. */
export function alternatorArms(node: SyntaxNode): SyntaxNode | null {
  const content = node.getChild(`${node.name}_content`);
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (ARMS.has(child.name)) return child;
  }
  return null;
}

/**
 * The separator of a candidate's first arm where its head took it, or null.
 * A head whose last text is an `end` against the `|` (an alternator in the
 * condition, `match match(x) | a = 1 end| b = 2 end`) ends with the `|` and
 * the arm's key, and the arms open after them (I-1408).
 */
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

/**
 * What a candidate's head holds before its arms: the nodes between its word
 * and its first `|` (a `match`'s condition, or what a sequential
 * alternator holds there), none when it has no head.
 */
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

/**
 * Whether a node opens an alternator: a candidate that holds its arms, or
 * any other node (a story alternator, which its word always opens).
 */
export function opensAlternator(node: SyntaxNode): boolean {
  return !ALTERNATOR_CANDIDATES.has(node.name) || alternatorArms(node) !== null;
}

/** The candidate a structural word's keyword node begins, or null for any other keyword. */
export function candidateOfWord(keyword: SyntaxNode): SyntaxNode | null {
  let begin: SyntaxNode | null = keyword.parent;
  while (begin && /_begin_c\d+$/.test(begin.name)) begin = begin.parent;
  const rule = begin?.name.endsWith("_begin") ? begin.parent : null;
  return rule && ALTERNATOR_CANDIDATES.has(rule.name) ? rule : null;
}

/** Whether a keyword node is a structural word that names a value: its candidate holds no arms. */
export function namesValue(keyword: SyntaxNode): boolean {
  const candidate = candidateOfWord(keyword);
  return !!candidate && !opensAlternator(candidate);
}
