import type { GameSize, WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import type { ProjectSettings } from "../../workspace/settings/settingsSchema";

export type AspectRatioChoice = ProjectSettings["previewAspectRatio"];

export const ASPECT_RATIO_ROWS: readonly {
  value: AspectRatioChoice;
  name: string;
  hint: string;
}[] = [
  { value: "auto", name: "Auto", hint: "fill pane" },
  { value: "16:9", name: "16:9", hint: "Landscape" },
  { value: "4:3", name: "4:3", hint: "Landscape" },
  { value: "1:1", name: "1:1", hint: "Square" },
  { value: "3:4", name: "3:4", hint: "Portrait" },
  { value: "9:16", name: "9:16", hint: "Portrait" },
];

export const aspectRatioLabel = (
  choice: AspectRatioChoice,
  size: GameSize | undefined,
): string => {
  const name = choice === "auto" ? "Auto" : choice;
  return size && size.width > 0 && size.height > 0
    ? `${name} · ${Math.round(size.width)}×${Math.round(size.height)}`
    : name;
};

export const PAPER_SIZE_LABELS: Record<
  ProjectSettings["screenplayPaperSize"],
  string
> = {
  usletter: "US Letter",
  a4: "A4",
};

export interface BarPosition {
  label: string;
  title: string;
  uri?: string;
  line: number;
}

const scriptName = (path: string) => {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
};

const at = (path: string, line: number, playing: boolean): BarPosition => {
  const script = scriptName(path);
  return {
    label: `${script} : ${line + 1}`,
    title: `${playing ? "Playing" : "Caret on"} line ${line + 1} of ${script}`,
    line,
  };
};

export const barPosition = (state: WorkspaceCache): BarPosition | null => {
  const game = state.preview?.modes?.game;
  if (game?.running && game.position) {
    const { uri, line } = game.position;
    return { ...at(uri, line, true), uri };
  }
  const logic = state.panes?.logic;
  const current = logic?.panels?.[logic.panel];
  const panel = current?.activeEditor?.open
    ? current
    : Object.values(logic?.panels ?? {}).find((p) => p?.activeEditor?.open);
  const editor = panel?.activeEditor;
  if (!editor?.open || !editor.filename) {
    return null;
  }
  return at(editor.filename, editor.selectedRange?.start.line ?? 0, false);
};
