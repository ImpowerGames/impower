import { DocumentSpan } from "../types/DocumentSpan";
import { PagePosition } from "../types/PagePosition";
import { getStyledHtml } from "./getStyledHtml";

export const generateScreenplayTitleHtml = (
  spans: DocumentSpan[],
  indent = ""
): string => {
  const metaSpan = spans[0];
  if (!metaSpan || metaSpan.tag !== "meta") {
    return "";
  }
  const populatedTokenKeys = Object.keys(metaSpan.positions);
  if (populatedTokenKeys.length === 0) {
    return "";
  }

  const html: string[] = [];
  const cellOrder: PagePosition[] = ["tl", "tc", "tr", "cc", "bl", "br"];
  cellOrder.forEach((cell) => {
    html.push(`<div class="title-${cell}">`);
    const span = metaSpan.positions[cell];
    if (span) {
      const text = span.flatMap((l) => [...l.content, { text: "\n" }]) || [];
      html.push("  " + getStyledHtml(text, "info", indent + "  "));
    }
    html.push(`</div>`);
  });
  return html.join(`\n${indent}`).trim();
};
