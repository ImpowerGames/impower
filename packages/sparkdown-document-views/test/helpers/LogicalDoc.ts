// A normalized representation of "what the screenplay looks like" that both
// the PDF export pipeline and the CodeMirror preview pipeline can be reduced
// to. Equivalence tests compare these structures, not pixels.
//
// Design notes:
//
// - We intentionally do NOT model exact line wrapping or page boundaries.
//   The PDF rewraps to page width using pdfkit font metrics; the preview
//   wraps via CSS using the editor container width. Pixel-perfect parity
//   would require running CodeMirror in a real browser AND extracting text
//   from the PDF — well beyond the scope of "logical equivalence".
//
// - We DO model: block kind, alignment, dual-dialogue side, character cues,
//   parentheticals, inline emphasis runs, scene-heading prefix, choice
//   markers, title-page positions. These are the things a reader sees and
//   would notice as "wrong".

export type Emphasis = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
};

export type Run = Emphasis & { text: string };

export type BlockKind =
  | "scene_heading"
  | "transitional"
  | "action"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "choice"
  | "centered_title"
  | "centered"
  | "page_break"
  | "separator";

export type Block = {
  kind: BlockKind;
  runs: Run[]; // empty for separator / page_break
  // Dual-dialogue position. For non-dialogue blocks (or single dialogue) this
  // is undefined. For dual dialogue: "l" or "r".
  dualPosition?: "l" | "r";
};

export type TitlePagePosition =
  | "tl"
  | "tc"
  | "tr"
  | "cc"
  | "bl"
  | "bc"
  | "br";

export type TitlePageEntry = {
  position: TitlePagePosition;
  key: string;
  runs: Run[];
};

export type LogicalDoc = {
  titlePage: TitlePageEntry[];
  body: Block[];
};

export const emptyDoc = (): LogicalDoc => ({ titlePage: [], body: [] });

// Stable textual representation used for diffs in test failures. Multi-line
// dialogue gets one Block per line of source-broken text — we collapse those
// into "one block per kind boundary" before formatting so noisy single-line
// splits don't dominate the diff.
export const formatDoc = (doc: LogicalDoc): string => {
  const lines: string[] = [];
  if (doc.titlePage.length > 0) {
    lines.push("=== TITLE PAGE ===");
    for (const e of doc.titlePage) {
      lines.push(`[${e.position}] ${e.key}: ${formatRuns(e.runs)}`);
    }
    lines.push("=== BODY ===");
  }
  for (const b of doc.body) {
    const dual = b.dualPosition ? `[${b.dualPosition}]` : "";
    if (b.kind === "page_break") {
      lines.push("--- page break ---");
    } else if (b.kind === "separator") {
      lines.push("");
    } else {
      lines.push(`<${b.kind}${dual}> ${formatRuns(b.runs)}`);
    }
  }
  return lines.join("\n");
};

const formatRuns = (runs: Run[]): string =>
  runs
    .map((r) => {
      let s = r.text;
      if (r.bold) s = `**${s}**`;
      if (r.italic) s = `*${s}*`;
      if (r.underline) s = `_${s}_`;
      if (r.strike) s = `~~${s}~~`;
      return s;
    })
    .join("");
