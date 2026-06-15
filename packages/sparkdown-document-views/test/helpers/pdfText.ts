// Reduce the PDF export to a normalized "visible text" string.
// Each non-empty line of rendered text becomes one output line, in order.
// Title-page positions are listed first under a TITLE PAGE heading.
//
// We don't model page breaks here (DocumentSpan emits them, but they're
// invisible to the reader of the rendered text). Block "kind" is included
// as a prefix so the diff against the preview is informative.

import ScreenplayParser from "../../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { generateScreenplayPrintData } from "../../../sparkdown-screenplay/src/utils/generateScreenplayPrintData";
import type { DocumentSpan } from "../../../sparkdown-screenplay/src/types/DocumentSpan";
import type { ScreenplayConfig } from "../../../sparkdown-screenplay/src/types/ScreenplayConfig";

const lineText = (content: { text: string }[]): string =>
  content.map((c) => c.text).join("");

const tagLabel = (tag: string): string => {
  switch (tag) {
    case "heading":
      return "scene_heading";
    case "transitional":
      return "transitional";
    case "action":
      return "action";
    case "dialogue_character":
      return "character";
    case "dialogue_parenthetical":
      return "parenthetical";
    case "dialogue_content":
      return "dialogue";
    case "choice":
      return "choice";
    case "title":
      return "centered_title";
    case "scene":
    case "function":
    case "knot":
    case "stitch":
    case "branch":
      return tag;
    default:
      return tag;
  }
};

export const extractPdfText = (
  source: string,
  config?: ScreenplayConfig,
): string => {
  const tokens = new ScreenplayParser().parse(source);
  const data = generateScreenplayPrintData(tokens, config);
  return spansToText(data.spans);
};

const spansToText = (spans: DocumentSpan[]): string => {
  const out: string[] = [];
  for (const span of spans) {
    switch (span.tag) {
      case "meta": {
        const entries: string[] = [];
        for (const [pos, lines] of Object.entries(span.positions)) {
          if (!lines) continue;
          for (const l of lines) {
            const text = lineText(l.content);
            if (!text.trim()) continue;
            const tag =
              typeof l.tag === "string" && l.tag.startsWith("meta:")
                ? l.tag.slice("meta:".length)
                : "";
            entries.push(`[${pos}] ${tag}: ${text}`);
          }
        }
        if (entries.length > 0) {
          out.push("=== TITLE PAGE ===");
          out.push(...entries);
          out.push("=== BODY ===");
        }
        break;
      }
      case "page_break":
        // Page breaks don't show as text content in the reader's eye.
        // Tracked separately if/when we test the page-break toggle.
        break;
      case "separator":
        out.push("");
        break;
      case "dual":
        for (const side of ["l", "r"] as const) {
          const lines = span.positions[side];
          if (!lines) continue;
          for (const l of lines) {
            const text = lineText(l.content);
            if (!text) continue;
            out.push(`<${tagLabel(l.tag)} dual=${side}> ${text}`);
          }
        }
        break;
      default: {
        for (const l of span.lines) {
          const text = lineText(l.content);
          if (!text) continue;
          out.push(`<${tagLabel(l.tag)}> ${text}`);
        }
        break;
      }
    }
  }
  // Collapse multiple consecutive blank separator lines.
  const collapsed: string[] = [];
  for (const line of out) {
    if (line === "" && collapsed[collapsed.length - 1] === "") continue;
    collapsed.push(line);
  }
  while (collapsed.length > 0 && collapsed[0] === "") collapsed.shift();
  while (
    collapsed.length > 0 &&
    collapsed[collapsed.length - 1] === ""
  )
    collapsed.pop();
  return collapsed.join("\n");
};
