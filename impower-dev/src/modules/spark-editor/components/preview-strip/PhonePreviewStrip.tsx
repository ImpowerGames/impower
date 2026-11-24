import {
  DetourIcon,
  ErrorIcon,
  InfoIcon,
  PreviewStrip,
  WarningIcon,
  type PreviewStripSize,
  type PreviewStripStatus,
} from "@impower/impower-ui/components";
import { routeIcon } from "@impower/spark-web-player/src/route/routeView";
import problems from "../../workspace/problems/ProblemsStore";
import {
  playRefusalLink,
  playRefusalTarget,
  playRefusalText,
} from "../../workspace/playRefusal";
import route from "../../workspace/route/RouteStore";
import { storyScriptOf } from "../../workspace/useActiveEditor";
import workspace from "../../workspace/WorkspaceStore";
import Preview from "../preview/Preview";
import { FORCED_TEXT, stripCopy, worstProblemOn } from "./stripCopy";

const SEVERITY_ICONS = {
  error: <ErrorIcon />,
  warning: <WarningIcon />,
  info: <InfoIcon />,
} as const;

const withWorkspace = async (
  act: (win: (typeof import("../../workspace/Workspace"))["Workspace"]["window"]) => unknown,
) => {
  const { Workspace } = await import("../../workspace/Workspace");
  await act(Workspace.window);
};

export default function PhonePreviewStrip({
  size = "phone",
  docked = false,
}: {
  size?: PreviewStripSize;
  docked?: boolean;
}) {
  const snapshot = workspace.previewLine.value;
  const game = workspace.state.value.preview?.modes?.game;
  const startRefused =
    !game?.running && !game?.starting && !!game?.startRefusal;
  const copy = stripCopy(snapshot?.preview, startRefused);
  const expanded = !!workspace.state.value.preview?.revealed;
  const problem = snapshot
    ? worstProblemOn(problems.problems.value, snapshot.uri, snapshot.line)
    : undefined;
  const view = route.view.value;
  const forced = !!view && routeIcon(view) === "forced";

  const refusal =
    game?.running || game?.starting ? undefined : game?.playRefusal;
  const statuses: PreviewStripStatus[] = [];
  if (refusal) {
    const text = playRefusalText(refusal);
    statuses.push({
      key: "refusal",
      tone: "error",
      icon: SEVERITY_ICONS.error,
      text,
      label: `${text}. ${playRefusalLink(playRefusalTarget(problems.problems.value, refusal))}`,
      onPress: () => void withWorkspace((win) => win.revealPlayRefusal()),
    });
  }
  if (problem && problem.title !== refusal) {
    const tone = problem.severity === "error" ? "error" : problem.severity === "warning" ? "warning" : "info";
    statuses.push({
      key: "problem",
      tone,
      icon: SEVERITY_ICONS[tone],
      text: problem.title,
      onPress: () => {
        const script = storyScriptOf();
        if (script) {
          void withWorkspace((win) => win.executeEditorCommand(script, "problems"));
        }
      },
    });
  }
  if (forced) {
    statuses.push({
      key: "forced",
      tone: "warning",
      icon: <DetourIcon data-icon="detour" />,
      text: FORCED_TEXT,
      onPress: () => route.show(),
    });
  }

  return (
    <PreviewStrip
      label={copy.label}
      words={copy.words}
      symbol={copy.symbol}
      statuses={statuses}
      playDisabled={!copy.playable}
      size={size}
      docked={docked}
      expanded={expanded}
      onPlay={() => void withWorkspace((win) => win.playInFullView())}
      onOpen={() => void withWorkspace((win) => win.openFullView())}
      onCollapse={() => void withWorkspace((win) => win.collapsePreviewPane())}
      onCollapsed={() => void withWorkspace((win) => win.finishPreviewCollapse())}
      picture={typeof window === "undefined" ? null : <Preview />}
    />
  );
}
