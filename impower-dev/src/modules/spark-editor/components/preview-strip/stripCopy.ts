import type { PreviewStripSymbol } from "@impower/impower-ui/components";
import type { Problem } from "../../workspace/problems/problemEntries";
import type { PreviewLineSnapshot } from "../../workspace/WorkspaceStore";

export interface StripCopy {
  label: string;
  words: string;
  symbol?: PreviewStripSymbol;
  playable: boolean;
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

export const stripCopy = (
  preview: PreviewLineSnapshot["preview"] | undefined,
): StripCopy => {
  if (!preview) {
    return { label: "", words: "", playable: true };
  }
  if (preview.kind === "setup") {
    return { label: "STORY SETUP", words: SETUP_WORDS, symbol: "file", playable: false };
  }
  if (preview.kind === "empty") {
    return { label: "YOUR GAME", words: EMPTY_WORDS, symbol: "pencil", playable: false };
  }
  if (preview.options?.length) {
    return {
      label: KIND_LABELS.choice,
      words: preview.words || preview.options.join(" · "),
      playable: true,
    };
  }
  if (preview.kind === "dialogue") {
    return {
      label: (preview.speaker ?? "").toUpperCase(),
      words: preview.words,
      playable: true,
    };
  }
  return {
    label: preview.kind ? KIND_LABELS[preview.kind] : "",
    words: preview.words,
    playable: true,
  };
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
