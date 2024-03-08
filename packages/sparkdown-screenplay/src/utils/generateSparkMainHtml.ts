import { DocumentSpan } from "../types/DocumentSpan";
import { getStyledHtml } from "./getStyledHtml";

export const generateSparkMainHtml = (
  bodySpans: DocumentSpan[],
  indent = ""
): string => {
  const html: string[] = [];
  bodySpans.forEach((span) => {
    if (span.tag === "page_break") {
      html.push("<hr>");
    } else if (span.tag === "separator") {
      html.push("<br>");
    } else {
      if (span.leftColumn || span.rightColumn) {
        html.push(`<div class="dual">`);
        html.push(`  <div>`);
        if (span.leftColumn) {
          span.leftColumn.forEach((leftSpan) => {
            html.push(getStyledHtml(leftSpan.content, leftSpan.tag));
          });
        }
        html.push(`  </div>`);
        html.push(`  <div>`);
        if (span.rightColumn) {
          span.rightColumn.forEach((rightSpan) => {
            html.push(getStyledHtml(rightSpan.content, rightSpan.tag));
          });
        }
        html.push(`  </div>`);
        html.push(`</div>`);
      } else {
        html.push(getStyledHtml(span.content, span.tag));
      }
    }
  });
  return html.join(`\n${indent}`).trim();
};
