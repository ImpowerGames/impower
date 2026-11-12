import type { SyntaxNode, Tree } from "@lezer/common";
import { clauseKeywordNode, clauseValueNode } from "../utils/assetClauseTree";

export interface ClauseSpan {
  from: number;
  to: number;
  text: string;
}

export interface MorphClause {
  directive: { from: number; to: number };
  keyword: { from: number; to: number };
  value?: ClauseSpan;
}

export interface StrayClauseText extends ClauseSpan {
  after?: ClauseSpan & { takesValue: boolean };
  node?: string;
}

export interface ImageClauses {
  directive: { from: number; to: number };
  control?: string;
  morph?: MorphClause;
  stray: StrayClauseText[];
  groups: string[][];
}

const VALUE_NODES = new Set(["NameValue", "TimeValue", "NumberValue"]);

type Token =
  | { kind: "clause"; from: number; to: number; keyword: ClauseSpan; value?: ClauseSpan }
  | { kind: "value"; from: number; to: number; text: string; node: string }
  | { kind: "skip"; from: number; to: number };

export function readImageClauses(tree: Tree, read: (from: number, to: number) => string): ImageClauses[] {
  const directives: { directive: { from: number; to: number }; end: number; control?: string; tokens: Token[] }[] = [];
  let current: (typeof directives)[number] | undefined;
  const span = (node: SyntaxNode): ClauseSpan => ({ from: node.from, to: node.to, text: read(node.from, node.to) });
  tree.iterate({
    enter: (ref) => {
      if (ref.name === "ImageCommand") {
        current = { directive: { from: ref.from, to: ref.to }, end: ref.to, tokens: [] };
        directives.push(current);
        return undefined;
      }
      if (!current || ref.from >= current.directive.to) return undefined;
      if (ref.name === "ImageEndMark") {
        current.end = ref.from;
        return false;
      }
      if (ref.name === "AssetCommandControl") {
        current.control = read(ref.from, ref.to).trim();
        return false;
      }
      if (ref.name === "Tags") {
        current.tokens.push({ kind: "skip", from: ref.from, to: ref.to });
        return false;
      }
      if (ref.name === "AssetCommandValueClause") {
        const keyword = clauseKeywordNode(ref.node);
        const value = clauseValueNode(ref.node);
        if (keyword) current.tokens.push({ kind: "clause", from: ref.from, to: ref.to, keyword: span(keyword), ...(value ? { value: span(value) } : {}) });
        return false;
      }
      if (ref.name === "AssetCommandClauseKeyword") {
        current.tokens.push({ kind: "clause", from: ref.from, to: ref.to, keyword: span(ref.node) });
        return false;
      }
      if (VALUE_NODES.has(ref.name)) {
        current.tokens.push({ kind: "value", from: ref.from, to: ref.to, text: read(ref.from, ref.to), node: ref.name });
        return false;
      }
      return undefined;
    },
  });
  return directives.map(({ directive, end, control, tokens }) => {
    const clauses: ImageClauses = { directive, stray: [], groups: [], ...(control ? { control } : {}) };
    const first = tokens.find((token) => token.kind === "clause");
    if (!first) return clauses;
    let last: StrayClauseText["after"];
    let at = first.from;
    const gap = (to: number) => {
      const text = read(at, to);
      const start = text.search(/\S/);
      if (start < 0) return;
      const trimmed = text.trim();
      const from = at + start;
      clauses.stray.push({ from, to: from + trimmed.length, text: trimmed, ...(last ? { after: last } : {}) });
      clauses.groups.push(...trimmed.split(/\s+/).map((word) => [word]));
    };
    for (const token of tokens.filter((token) => token.from >= first.from)) {
      if (token.from > at) gap(token.from);
      at = Math.max(at, token.to);
      if (token.kind === "clause") {
        clauses.groups.push([token.keyword.text, ...(token.value ? [token.value.text] : [])]);
        if (token.keyword.text === "morph") {
          clauses.morph = { directive, keyword: { from: token.keyword.from, to: token.keyword.to }, ...(token.value ? { value: token.value } : {}) };
        }
        last = { ...token.keyword, takesValue: token.value !== undefined };
      } else if (token.kind === "value") {
        clauses.groups.push([token.text]);
        clauses.stray.push({ from: token.from, to: token.to, text: token.text, node: token.node, ...(last ? { after: last } : {}) });
      }
    }
    if (end > at) gap(end);
    return clauses;
  });
}
