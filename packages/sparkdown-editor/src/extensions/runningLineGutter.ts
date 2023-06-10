import {
  Extension,
  RangeSet,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { EditorView, GutterMarker, gutter } from "@codemirror/view";
import SPARKDOWN_COLORS from "../constants/SPARKDOWN_COLORS";
import { GhostLineGutterMarker } from "./GhostLineGutterMarker";
import { RunningLineGutterMarker } from "./RunningLineGutterMarker";

export const setRunningLinePosition = StateEffect.define<{ from: number }>();

const ghostLineGutterMarker = new GhostLineGutterMarker();

const runningLineGutterMarker = new RunningLineGutterMarker();

const runningLineField = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(set, transaction) {
    set = set.map(transaction.changes);
    transaction.effects.forEach((e) => {
      if (e.is(setRunningLinePosition)) {
        if (e.value?.from >= 0) {
          set = set.update({
            add: [
              ghostLineGutterMarker.range(e.value?.from),
              runningLineGutterMarker.range(e.value?.from),
            ],
            filter: (from, to, mark) =>
              mark instanceof GhostLineGutterMarker && from !== e.value?.from,
          });
        } else {
          set = RangeSet.empty;
        }
      }
    });
    return set;
  },
});

const runningLineGutterPlugin = gutter({
  class: "cm-runningGutter",
  markers: (v) => v.state.field(runningLineField),
  initialSpacer: () => runningLineGutterMarker,
});

const runningLineGutterBaseTheme = EditorView.baseTheme({
  ".cm-runningGutter .cm-gutterElement": {
    color: SPARKDOWN_COLORS.lineMark,
  },
});

/// Returns an extension that adds a `cm-runningGutter` class to
/// all gutter elements on the [running
/// line](#view.highlightRunningLine).
export const highlightRunningLineGutter = (): Extension => {
  return [
    runningLineField,
    runningLineGutterPlugin,
    runningLineGutterBaseTheme,
  ];
};
