import { RangeSet, StateEffect, StateField, type Range } from "@codemirror/state";
import {
  type BlockInfo,
  EditorView,
  GutterMarker,
  ViewUpdate,
  gutter,
} from "@codemirror/view";
import { coarsePointer } from "@impower/codemirror-vscode-lsp-client/src";
import { scriptModeField } from "../modules/script-editor/utils/extensions/scriptMode";

export interface BreakpointState {
  line: number;
  verified: boolean;
}

const UNPLACEABLE_TITLE = "No statement to stop at here.";

class BreakpointMarker extends GutterMarker {
  constructor(readonly verified: boolean) {
    super();
  }

  override eq(other: GutterMarker) {
    return other instanceof BreakpointMarker && other.verified === this.verified;
  }

  override toDOM() {
    const dot = document.createElement("span");
    dot.className = this.verified
      ? "cm-breakpoint"
      : "cm-breakpoint cm-breakpoint-unverified";
    if (!this.verified) {
      dot.title = UNPLACEABLE_TITLE;
    }
    return dot;
  }
}

export const breakpointMarker = new BreakpointMarker(true);
const unverifiedBreakpointMarker = new BreakpointMarker(false);

const setBreakpointEffect = StateEffect.define<{ pos: number; on: boolean }>({
  map: (val, mapping) => ({ pos: mapping.mapPos(val.pos), on: val.on }),
});

const setBreakpointStatesEffect = StateEffect.define<BreakpointState[]>();

export const breakpointsField = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(set, transaction) {
    set = set.map(transaction.changes);
    for (const e of transaction.effects) {
      if (e.is(setBreakpointStatesEffect)) {
        const doc = transaction.state.doc;
        const ranges: Range<GutterMarker>[] = [];
        for (const { line, verified } of e.value) {
          if (line >= 1 && line <= doc.lines) {
            ranges.push(
              (verified ? breakpointMarker : unverifiedBreakpointMarker).range(
                doc.line(line).from,
              ),
            );
          }
        }
        set = RangeSet.of(ranges, true);
      }
      if (e.is(setBreakpointEffect)) {
        set = set.update({ filter: (from) => from != e.value.pos });
        if (e.value.on) {
          set = set.update({ add: [breakpointMarker.range(e.value.pos)] });
        }
      }
    }
    return set;
  },
});

export const getBreakpointPositions = (view: EditorView) => {
  const positions: number[] = [];
  const iter = view.state.field(breakpointsField).iter(0);
  while (iter.value) {
    if (positions.at(-1) !== iter.from) {
      positions.push(iter.from);
    }
    iter.next();
  }
  return positions;
};

export const getBreakpointLineNumbers = (view: EditorView) => {
  return getBreakpointPositions(view).map(
    (pos) => view.state.doc.lineAt(pos).number,
  );
};

export const toggleBreakpoint = (view: EditorView, pos: number) => {
  let hasBreakpoint = false;
  view.state.field(breakpointsField).between(pos, pos, () => {
    hasBreakpoint = true;
  });
  view.dispatch({ effects: setBreakpointEffect.of({ pos, on: !hasBreakpoint }) });
};

export const setBreakpointStates = (
  view: EditorView,
  states: BreakpointState[],
) => {
  view.dispatch({ effects: setBreakpointStatesEffect.of(states) });
};

export const breakpointsChanged = (update: ViewUpdate): boolean => {
  return update.transactions.some((t) =>
    t.effects.some((e) => e.is(setBreakpointEffect)),
  );
};

export const breakpointStatesSet = (update: ViewUpdate): boolean => {
  return update.transactions.some((t) =>
    t.effects.some((e) => e.is(setBreakpointStatesEffect)),
  );
};

const takesPress = (view: EditorView) =>
  view.state.field(scriptModeField, false) !== "reading";

const keepsTouch = (view: EditorView, _line: BlockInfo, event: Event) => {
  if (view.state.facet(coarsePointer) && takesPress(view)) {
    event.stopPropagation();
  }
  return false;
};

const breakpointAttributes = EditorView.editorAttributes.compute(
  [breakpointsField, coarsePointer],
  (state) => {
    const classes: string[] = [];
    if (state.field(breakpointsField).size > 0) {
      classes.push("cm-has-breakpoints");
    }
    if (state.facet(coarsePointer)) {
      classes.push("cm-breakpoints-coarse");
    }
    return { class: classes.join(" ") };
  },
);

const breakpointTheme = EditorView.baseTheme({
  ".cm-breakpoint-gutter": {
    width: "0",
    overflow: "hidden",
  },
  "&.cm-line-numbers .cm-breakpoint-gutter, &.cm-has-breakpoints .cm-breakpoint-gutter":
    {
      width: "14px",
    },
  "&.cm-breakpoints-coarse.cm-line-numbers .cm-breakpoint-gutter, &.cm-breakpoints-coarse.cm-has-breakpoints .cm-breakpoint-gutter":
    {
      width: "44px",
    },
  ".cm-breakpoint-gutter .cm-gutterElement": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  ".cm-breakpoint": {
    display: "block",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    boxSizing: "border-box",
    border: "1.5px solid var(--editor-breakpoint)",
    backgroundColor: "var(--editor-breakpoint)",
  },
  ".cm-breakpoint.cm-breakpoint-unverified": {
    backgroundColor: "transparent",
  },
});

export const breakpoints = () => [
  breakpointsField,
  breakpointAttributes,
  breakpointTheme,
  gutter({
    class: "cm-breakpoint-gutter",
    markers: (v) => v.state.field(breakpointsField),
    renderEmptyElements: true,
    domEventHandlers: {
      mousedown(view, line) {
        if (takesPress(view)) {
          toggleBreakpoint(view, line.from);
        }
        return true;
      },
      touchstart: keepsTouch,
      touchmove: keepsTouch,
      touchend: keepsTouch,
      touchcancel: keepsTouch,
    },
  }),
];
