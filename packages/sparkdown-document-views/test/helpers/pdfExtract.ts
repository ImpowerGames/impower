// Reduce the PDF export pipeline (ScreenplayParser -> generateScreenplayPrintData
// -> DocumentSpan[]) to the normalized LogicalDoc.
//
// This is the *source of truth*: whatever the PDF would render is, by
// definition, correct. The preview is graded against this.
//
// We bypass actual PDFKit rendering — DocumentSpan[] already contains the
// fully-resolved sequence of lines with style runs. Page wrapping is done
// further downstream by ScreenplayPrinter; we ignore it because logical
// equivalence doesn't depend on where the page actually breaks.

import ScreenplayParser from "../../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { generateScreenplayPrintData } from "../../../sparkdown-screenplay/src/utils/generateScreenplayPrintData";
import type {
  BlockLayout,
  DocumentSpan,
  PageLine,
  SplitLayout,
  MetaLayout,
} from "../../../sparkdown-screenplay/src/types/DocumentSpan";
import type { ScreenplayConfig } from "../../../sparkdown-screenplay/src/types/ScreenplayConfig";
import type { FormattedText } from "../../../sparkdown-screenplay/src/types/FormattedText";
import {
  Block,
  BlockKind,
  LogicalDoc,
  Run,
  TitlePageEntry,
  TitlePagePosition,
  emptyDoc,
} from "./LogicalDoc";

// Map the typesetter's tag to our LogicalDoc kind.
const tagToKind = (tag: string): BlockKind | undefined => {
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
    default:
      return undefined;
  }
};

const runsFrom = (content: FormattedText[]): Run[] =>
  content
    .filter((c) => c.text.length > 0)
    .map((c) => {
      const r: Run = { text: c.text };
      if (c.bold) r.bold = true;
      if (c.italic) r.italic = true;
      if (c.underline) r.underline = true;
      if (c.strike) r.strike = true;
      return r;
    });

const TITLE_POSITIONS: TitlePagePosition[] = [
  "tl",
  "tc",
  "tr",
  "cc",
  "bl",
  "bc",
  "br",
];

const isTitlePagePosition = (s: string): s is TitlePagePosition =>
  TITLE_POSITIONS.includes(s as TitlePagePosition);

const lineToBlock = (
  line: PageLine,
  dualPosition?: "l" | "r",
): Block | undefined => {
  const kind = tagToKind(line.tag);
  if (!kind) return undefined;
  const runs = runsFrom(line.content);
  const block: Block = { kind, runs };
  if (dualPosition) block.dualPosition = dualPosition;
  return block;
};

const fromBlockLayout = (span: BlockLayout): Block[] =>
  span.lines.flatMap((l) => {
    const b = lineToBlock(l);
    return b ? [b] : [];
  });

const fromSplitLayout = (span: SplitLayout): Block[] => {
  const out: Block[] = [];
  for (const side of ["l", "r"] as const) {
    const lines = span.positions[side];
    if (!lines) continue;
    for (const l of lines) {
      const b = lineToBlock(l, side);
      if (b) out.push(b);
    }
  }
  return out;
};

const fromMetaLayout = (span: MetaLayout): TitlePageEntry[] => {
  const out: TitlePageEntry[] = [];
  for (const [pos, lines] of Object.entries(span.positions)) {
    if (!isTitlePagePosition(pos) || !lines) continue;
    for (const l of lines) {
      // meta lines carry their key in `tag` like "meta:title"
      const tag = l.tag;
      if (typeof tag !== "string" || !tag.startsWith("meta:")) continue;
      const key = tag.slice("meta:".length);
      const runs = runsFrom(l.content);
      if (runs.length === 0) continue;
      out.push({ position: pos, key, runs });
    }
  }
  return out;
};

export const extractFromPdf = (
  source: string,
  config?: ScreenplayConfig,
): LogicalDoc => {
  const tokens = new ScreenplayParser().parse(source);
  const data = generateScreenplayPrintData(tokens, config);
  return fromSpans(data.spans);
};

const fromSpans = (spans: DocumentSpan[]): LogicalDoc => {
  const doc = emptyDoc();
  for (const span of spans) {
    switch (span.tag) {
      case "meta":
        doc.titlePage.push(...fromMetaLayout(span));
        break;
      case "page_break":
        doc.body.push({ kind: "page_break", runs: [] });
        break;
      case "separator":
        doc.body.push({ kind: "separator", runs: [] });
        break;
      case "dual":
        doc.body.push(...fromSplitLayout(span));
        break;
      default:
        doc.body.push(...fromBlockLayout(span));
        break;
    }
  }
  return doc;
};
