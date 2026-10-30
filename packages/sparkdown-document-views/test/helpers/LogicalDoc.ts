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
  runs: Run[];
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
