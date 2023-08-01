import { Language } from "@codemirror/language";
import { NodeType } from "@lezer/common";
import { Tag, highlightTree } from "@lezer/highlight";
import { MarkupBlock } from "../types/MarkupBlock";

export const getSyntaxHighlightedHtml = (
  str: string,
  language: Language,
  highlighter: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  }
) => {
  const tree = language.parser.parse(str);
  let html = "";
  let prev = 0;
  highlightTree(tree, highlighter, (from, to, token) => {
    const s = str.slice(from, to);
    const diff = from - prev;
    if (diff > 0) {
      html += `<span>${str.slice(from - diff, from)}</span>`;
    }
    html += `<span class="${token}">${s}</span>`;
    prev = to;
  });
  html += `<span>${str.slice(prev)}</span>`;
  return html;
};

export const getMarkupHtml = (
  m: MarkupBlock,
  language?: Language,
  highlighter?: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  }
) => {
  return m.markdown && language && highlighter
    ? getSyntaxHighlightedHtml(m.value ?? "", language, highlighter)
    : m.value;
};

const getFormattedHTML = (
  lines: MarkupBlock[],
  language?: Language,
  highlighter?: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  }
) => {
  return lines
    .map((m) => {
      const content = getMarkupHtml(m, language, highlighter);
      const style = m.attributes?.style
        ? ` style="${m.attributes?.style}"`
        : "";
      return `<div${style}>${content}</div>`;
    })
    .join("");
};

export default getFormattedHTML;
