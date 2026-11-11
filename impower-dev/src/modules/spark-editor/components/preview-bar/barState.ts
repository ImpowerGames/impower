import type { Layout } from "@impower/impower-ui/layout";
import type { GameSize, WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import {
  routeIcon,
  routeLabelParts,
  routeTitle,
  type RouteIcon,
  type RouteViewState,
} from "@impower/spark-web-player/src/route/routeView";
import type { HostedRouteView } from "@impower/spark-web-player/src/route/routeViewMessages";
import { routeScriptName } from "../../workspace/route/RouteStore";
import type { DebugSessionState } from "../../workspace/WorkspaceStore";
import {
  fillsPane,
  type PreviewMode,
  type ProjectSettings,
} from "../../workspace/settings/settingsSchema";

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

export const ASPECT_RATIO_LABEL_RESERVES = [
  "Auto · 0000×0000",
  "16:9 · 0000×0000",
] as const;

export type SizeControl = "paper" | "aspectRatio" | "pageFillsPane";

export const sizeControl = (mode: PreviewMode): SizeControl =>
  mode === "screenplay"
    ? "paper"
    : fillsPane(mode)
      ? "pageFillsPane"
      : "aspectRatio";

export const PAGE_FILLS_PANE = "The page fills the pane in Interactive Fiction";

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

export type ReadoutIcon = RouteIcon | "stopped";

export interface BarReadout {
  name: string;
  lines: string;
  icon: ReadoutIcon;
  title: string;
  failed: boolean;
  stopped: boolean;
  opensRoute: boolean;
  uri?: string;
  line: number;
}

const positionReadout = (position: BarPosition): BarReadout => ({
  name: position.label,
  lines: "",
  icon: null,
  title: position.title,
  failed: false,
  stopped: false,
  opensRoute: false,
  uri: position.uri,
  line: position.line,
});

const stoppedBeforeFrame = (session: DebugSessionState) => {
  const frame = session.stackTrace?.stackFrames[0];
  return session.stopped?.beat === "none" && frame ? frame : null;
};

const stopSentence = (line: number) =>
  `Stopped before line ${line + 1}. It has not run yet.`;

const stoppedReadout = (session: DebugSessionState): BarReadout | null => {
  const frame = stoppedBeforeFrame(session);
  const uri = frame?.source?.path;
  if (!frame || !uri) {
    return null;
  }
  return {
    name: `Stopped before ${scriptName(uri)} : ${frame.line + 1}`,
    lines: "",
    icon: "stopped",
    title: stopSentence(frame.line),
    failed: false,
    stopped: true,
    opensRoute: false,
    uri,
    line: frame.line,
  };
};

export const barReadout = (
  state: WorkspaceCache,
  view: HostedRouteView | null,
  session: DebugSessionState,
  layout: Layout,
): BarReadout | null => {
  const stopped = layout === "phone" ? stoppedReadout(session) : null;
  if (stopped) {
    return stopped;
  }
  const position = barPosition(state);
  if (state.preview?.modes?.game?.running && position) {
    return positionReadout(position);
  }
  if (view) {
    const route: RouteViewState = { ...view, tab: "route" };
    const parts = routeLabelParts(route, routeScriptName);
    const target = view.route?.target ?? view.failure?.target;
    if (parts) {
      return {
        name: parts.name,
        lines: parts.lines,
        icon: routeIcon(route),
        title: routeTitle(route, routeScriptName),
        failed: !!view.failure,
        stopped: false,
        opensRoute: true,
        uri: target?.uri,
        line: target?.range.start.line ?? 0,
      };
    }
  }
  return position && positionReadout(position);
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

export const stopNote = (session: DebugSessionState): string | null => {
  const frame = stoppedBeforeFrame(session);
  return frame ? stopSentence(frame.line) : null;
};
