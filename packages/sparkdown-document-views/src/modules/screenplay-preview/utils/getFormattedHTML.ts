import { MarkupContent } from "../types/MarkupContent";

export const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const getFormattedHTML = (lines: MarkupContent[]) => {
  return lines
    .map((m) => {
      const style = m.attributes?.style
        ? ` style="${m.attributes?.style}"`
        : "";
      return `<div${style}>${m.value ?? ""}</div>`;
    })
    .join("");
};

export default getFormattedHTML;
