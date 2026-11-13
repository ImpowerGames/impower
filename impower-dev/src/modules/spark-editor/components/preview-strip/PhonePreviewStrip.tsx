import {
  DetourIcon,
  ErrorIcon,
  InfoIcon,
  PreviewStrip,
  WarningIcon,
  type PreviewStripStatus,
} from "@impower/impower-ui/components";
import { routeIcon } from "@impower/spark-web-player/src/route/routeView";
import problems from "../../workspace/problems/ProblemsStore";
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

export default function PhonePreviewStrip() {
  const snapshot = workspace.previewLine.value;
  const copy = stripCopy(snapshot?.preview);
  const expanded = !!workspace.state.value.preview?.revealed;
  const problem = snapshot
    ? worstProblemOn(problems.problems.value, snapshot.uri, snapshot.line)
    : undefined;
  const view = route.view.value;
  const forced = !!view && routeIcon(view) === "forced";

  const statuses: PreviewStripStatus[] = [];
  if (problem) {
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
      expanded={expanded}
      onPlay={() => void withWorkspace((win) => win.playInFullView())}
      onCollapse={() => void withWorkspace((win) => win.collapsePreviewPane())}
      picture={typeof window === "undefined" ? null : <Preview />}
    />
  );
}
