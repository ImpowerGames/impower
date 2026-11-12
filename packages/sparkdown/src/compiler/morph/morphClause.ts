import type { Tree } from "@lezer/common";
import { ASSET_VALUE_CLAUSE_WORDS } from "../utils/assetClauseWords";

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
  after?: ClauseSpan;
  word: boolean;
}

export interface ImageClauses {
  directive: { from: number; to: number };
  morph?: MorphClause;
  stray: StrayClauseText[];
}

const VALUE_NODES = new Set(["NameValue", "TimeValue", "NumberValue"]);

const TAKES_VALUE: ReadonlySet<string> = new Set(ASSET_VALUE_CLAUSE_WORDS);

export function readImageClauses(tree: Tree, read: (from: number, to: number) => string): ImageClauses[] {
  const directives: { directive: { from: number; to: number }; end: number; tokens: (ClauseSpan & { keyword: boolean })[]; skipped: { from: number; to: number }[] }[] = [];
  let current: (typeof directives)[number] | undefined;
  tree.iterate({
    enter: (ref) => {
      if (ref.name === "ImageCommand") {
        current = { directive: { from: ref.from, to: ref.to }, end: ref.to, tokens: [], skipped: [] };
        directives.push(current);
        return undefined;
      }
      if (!current || ref.from >= current.directive.to) return undefined;
      if (ref.name === "ImageEndMark") {
        current.end = ref.from;
        return false;
      }
      if (ref.name === "Tags") {
        current.skipped.push({ from: ref.from, to: ref.to });
        return false;
      }
      if (ref.name === "AssetCommandClauseKeyword" || VALUE_NODES.has(ref.name)) {
        current.tokens.push({ from: ref.from, to: ref.to, text: read(ref.from, ref.to), keyword: ref.name === "AssetCommandClauseKeyword" });
        return false;
      }
      return undefined;
    },
  });
  return directives.map(({ directive, end, tokens, skipped }) => {
    const clauses: ImageClauses = { directive, stray: [] };
    const first = tokens.find((token) => token.keyword);
    if (!first) return clauses;
    const covered = [...tokens.filter((token) => token.from >= first.from), ...skipped].sort((a, b) => a.from - b.from);
    let open: ClauseSpan | undefined;
    let last: ClauseSpan | undefined;
    let at = first.from;
    const gap = (to: number) => {
      const text = read(at, to);
      const start = text.search(/\S/);
      if (start >= 0) {
        const trimmed = text.trim();
        const from = at + start;
        clauses.stray.push({ from, to: from + trimmed.length, text: trimmed, word: false, ...(last ? { after: last } : {}) });
      }
    };
    for (const span of covered) {
      if (span.from > at) gap(span.from);
      at = Math.max(at, span.to);
      if (!("keyword" in span)) continue;
      const token = span as ClauseSpan & { keyword: boolean };
      if (open) {
        if (open.text === "morph" && clauses.morph) clauses.morph.value = { from: token.from, to: token.to, text: token.text };
        open = undefined;
      } else if (token.keyword) {
        if (token.text === "morph") clauses.morph = { directive, keyword: { from: token.from, to: token.to } };
        open = TAKES_VALUE.has(token.text) ? token : undefined;
        last = token;
      } else {
        clauses.stray.push({ ...token, word: true, ...(last ? { after: last } : {}) });
      }
    }
    if (end > at) gap(end);
    return clauses;
  });
}
