import type {
  EditorChoiceMark,
  SetEditorRouteMarksParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorRouteMarksMessage";
import type { EditorChoiceMarkAction } from "@impower/spark-editor-protocol/src/protocols/editor/PressedEditorChoiceMarkMessage";
import type { PreviewRouteDecision } from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import { expandLineRanges } from "@impower/spark-engine/src/game/core/utils/executedLineRanges";
import {
  choiceSentence,
  isPinned,
  ordinal,
  pinChange,
  stopIsPinned,
  unpinChange,
} from "@impower/spark-web-player/src/route/routeView";
import type {
  HostedRouteView,
  RouteViewAction,
} from "@impower/spark-web-player/src/route/routeViewMessages";

const NO_MARKS: SetEditorRouteMarksParams = { choices: [], forced: [] };

const choicesOf = (view: HostedRouteView): PreviewRouteDecision[] => {
  const seen = new Set<string>();
  return (view.route?.decisions ?? []).filter((decision) => {
    if (!decision.options) {
      return false;
    }
    const at = `${decision.location.uri}:${decision.location.range.start.line}`;
    if (seen.has(at)) {
      return false;
    }
    seen.add(at);
    return true;
  });
};

const choiceTitle = (decision: PreviewRouteDecision) => {
  const line = `Choice · line ${decision.location.range.start.line + 1}`;
  return decision.meeting && decision.meeting > 1
    ? `${line} · ${ordinal(decision.meeting)} time`
    : line;
};

export const routeMarks = (
  view: HostedRouteView | null,
): SetEditorRouteMarksParams => {
  const route = view?.route;
  if (!view || !route) {
    return NO_MARKS;
  }
  const choices: EditorChoiceMark[] = choicesOf(view).map((decision) => ({
    uri: decision.location.uri,
    line: decision.location.range.start.line,
    icon: decision.kind === "pinned" ? "pinned" : "auto",
    title: choiceTitle(decision),
    text: choiceSentence(decision, route.target),
    options: (decision.options ?? []).map((option) => ({
      text: option.text,
      taken:
        option.location.uri === decision.location.uri &&
        option.location.range.start.line === decision.location.range.start.line,
      pinned: isPinned(view.pins, option),
    })),
    unpin: stopIsPinned(view.pins, decision),
    ...(view.pinNote ? { note: view.pinNote } : {}),
  }));
  const forced = Object.entries(route.forcedLines ?? {}).map(
    ([uri, ranges]) => ({ uri, lines: expandLineRanges(ranges) }),
  );
  return { choices, forced };
};

export const choiceMarkAction = (
  view: HostedRouteView | null,
  uri: string,
  line: number,
  action: EditorChoiceMarkAction,
): RouteViewAction | "route" | null => {
  if (action.kind === "route") {
    return "route";
  }
  const decision = view
    ? choicesOf(view).find(
        (d) =>
          d.location.uri === uri && d.location.range.start.line === line,
      )
    : undefined;
  if (!view || !decision) {
    return null;
  }
  if (action.kind === "unpin") {
    return { kind: "changePins", change: unpinChange(view.pins, decision) };
  }
  const option = decision.options?.[action.option];
  return option
    ? { kind: "changePins", change: pinChange(view.pins, decision, option) }
    : null;
};
