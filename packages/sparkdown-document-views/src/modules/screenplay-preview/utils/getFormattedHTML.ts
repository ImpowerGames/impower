import { HighlightStyle, Language } from "@codemirror/language";
import { highlightTree } from "@lezer/highlight";
import { MarkupContent } from "../types/MarkupContent";

export const getSyntaxHighlightedHtml = (
  str: string,
  language: Language,
  highlighter: HighlightStyle
) => {
  const tree = language.parser.parse(str);
  let html = "";
  let prev = 0;

  highlightTree(tree, highlighter, (from, to, token) => {
    const diff = from - prev;
    if (diff > 0) {
      const unstyled = str.slice(from - diff, from);
      if (unstyled) {
        html += `<span>${unstyled}</span>`;
      }
    }
    const s = str.slice(from, to);
    html += `<span class="${token}">${s}</span>`;
    prev = to;
  });
  const remainingUnstyled = str.slice(prev);
  if (remainingUnstyled) {
    html += `<span>${remainingUnstyled}</span>`;
  }
  return html;
};

export const getMarkupHtml = (
  m: MarkupContent,
  language?: Language,
  highlighter?: HighlightStyle
) => {
  return m.markdown && language && highlighter
    ? getSyntaxHighlightedHtml(m.value ?? "", language, highlighter)
    : m.value;
};

const getFormattedHTML = (
  lines: MarkupContent[],
  language?: Language,
  highlighter?: HighlightStyle
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
