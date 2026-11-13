import type { PreviewStripSymbol } from "@impower/impower-ui/components";
import type { PreviewLine } from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewLineMessage";
import type { Problem } from "../../workspace/problems/problemEntries";

export interface StripCopy {
  label: string;
  words: string;
  symbol?: PreviewStripSymbol;
  setup?: boolean;
}

const KIND_LABELS = {
  title: "TITLE",
  heading: "HEADING",
  transition: "TRANSITIONAL",
  action: "ACTION",
  choice: "CHOOSE",
} as const;

export const SETUP_WORDS = "This line sets up your story.";

export const EMPTY_WORDS = "Write a line and it appears here.";

export const FORCED_TEXT = "Forced to reach this line";

export const stripCopy = (preview: PreviewLine | undefined): StripCopy => {
  if (!preview) {
    return { label: "", words: "" };
  }
  switch (preview.kind) {
    case "setup":
      return { label: "STORY SETUP", words: SETUP_WORDS, symbol: "file", setup: true };
    case "empty":
      return { label: "YOUR GAME", words: EMPTY_WORDS, symbol: "pencil" };
    case "dialogue":
      return { label: (preview.speaker ?? "").toUpperCase(), words: preview.words };
    default:
      return { label: KIND_LABELS[preview.kind], words: preview.words };
  }
};

const SEVERITY_RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };

export const worstProblemOn = (
  problems: readonly Problem[],
  uri: string,
  line: number,
): Problem | undefined =>
  problems
    .filter((problem) => problem.uri === uri && problem.range.start.line === line)
    .sort(
      (a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3),
    )[0];
