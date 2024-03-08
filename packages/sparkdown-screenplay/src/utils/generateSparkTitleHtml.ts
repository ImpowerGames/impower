import { DocumentSpan } from "../types/DocumentSpan";
import { getStyledHtml } from "./getStyledHtml";

export const generateSparkTitleHtml = (
  frontMatterSpans: Record<string, DocumentSpan>,
  indent = ""
): string => {
  if (!frontMatterSpans) {
    return "";
  }

  const populatedTokenKeys = Object.keys(frontMatterSpans);
  if (populatedTokenKeys.length === 0) {
    return "";
  }

  const html: string[] = [];
  const cellOrder = ["tl", "tc", "tr", "cc", "bl", "br"];
  cellOrder.forEach((cell) => {
    html.push(`<div class="title-${cell}">`);
    const span = frontMatterSpans[cell];
    if (span) {
      html.push("  " + getStyledHtml(span.content, "info", indent + "  "));
    }
    html.push(`</div>`);
  });
  return html.join(`\n${indent}`).trim();
};
