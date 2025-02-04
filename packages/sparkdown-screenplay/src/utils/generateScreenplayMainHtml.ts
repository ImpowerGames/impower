import { DocumentSpan } from "../types/DocumentSpan";
import { getStyledHtml } from "./getStyledHtml";

export const generateScreenplayMainHtml = (
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
      if (span.tag === "meta") {
      } else if (span.tag === "split") {
        html.push(`<div class="dual">`);
        html.push(`  <div>`);
        if (span.positions.l) {
          span.positions.l.forEach((leftSpan) => {
            html.push(getStyledHtml(leftSpan.content, leftSpan.tag));
          });
        }
        html.push(`  </div>`);
        html.push(`  <div>`);
        if (span.positions.r) {
          span.positions.r.forEach((rightSpan) => {
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
