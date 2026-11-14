import {
  type EditorState,
  RangeSet,
  StateEffect,
  StateField,
  type Range,
  type Transaction,
} from "@codemirror/state";
import {
  type BlockInfo,
  EditorView,
  GutterMarker,
  ViewUpdate,
  gutter,
} from "@codemirror/view";
import { coarsePointer } from "@impower/codemirror-vscode-lsp-client/src";
import { scriptModeField } from "../modules/script-editor/utils/extensions/scriptMode";
import {
  createGutterButton,
  gutterButtons,
  MARK_COLUMN_RANK,
  markColumnClaims,
} from "../cm-gutter-button/gutterButton";

export interface BreakpointState {
  line: number;
  verified: boolean;
  message?: string;
}

const UNPLACED_FALLBACK_TITLE = "Breakpoint not placed.";

const dotMask = (circle: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${circle}</svg>`,
  )}")`;

const BREAKPOINT_MASK = dotMask(`<circle cx="12" cy="12" r="6" fill="black"/>`);

const UNVERIFIED_BREAKPOINT_MASK = dotMask(
  `<circle cx="12" cy="12" r="4.875" fill="none" stroke="black" stroke-width="2.25"/>`,
);

class BreakpointMarker extends GutterMarker {
  constructor(
    readonly verified: boolean,
    readonly message?: string,
  ) {
    super();
  }

  override eq(other: GutterMarker) {
    return (
      other instanceof BreakpointMarker &&
      other.verified === this.verified &&
      other.message === this.message
    );
  }

  override toDOM() {
    const button = createGutterButton({
      icon: this.verified ? BREAKPOINT_MASK : UNVERIFIED_BREAKPOINT_MASK,
      color: "var(--editor-breakpoint)",
      label: this.verified
        ? "Remove breakpoint"
        : `Remove breakpoint. ${this.message ?? UNPLACED_FALLBACK_TITLE}`,
      className: this.verified
        ? "cm-breakpoint"
        : "cm-breakpoint cm-breakpoint-unverified",
    });
    if (!this.verified) {
      button.title = this.message ?? UNPLACED_FALLBACK_TITLE;
    }
    return button;
  }
}

export const breakpointMarker = new BreakpointMarker(true);

const setBreakpointEffect = StateEffect.define<{ pos: number; on: boolean }>({
  map: (val, mapping) => ({ pos: mapping.mapPos(val.pos), on: val.on }),
});

const setBreakpointStatesEffect = StateEffect.define<BreakpointState[]>();

const mapWithLines = (set: RangeSet<GutterMarker>, transaction: Transaction) => {
  const before = transaction.startState.doc;
  const after = transaction.state.doc;
  const ranges: Range<GutterMarker>[] = [];
  const iter = set.iter(0);
  while (iter.value) {
    const line = before.lineAt(iter.from);
    const spanFrom = line.from > 0 ? line.from - 1 : line.from;
    const spanTo = line.to < before.length ? line.to + 1 : line.to;
    let removed = false;
    transaction.changes.iterChangedRanges((fromA, toA) => {
      if (
        (fromA <= spanFrom && toA >= line.to && spanFrom < line.from) ||
        (fromA <= line.from && toA >= spanTo && spanTo > line.to)
      ) {
        removed = true;
      }
    });
    if (!removed) {
      const end = transaction.changes.mapPos(line.to, -1);
      const from = after.lineAt(end).from;
      if (ranges.at(-1)?.from !== from) {
        ranges.push(iter.value.range(from));
      }
    }
    iter.next();
  }
  return RangeSet.of(ranges, true);
};

export const breakpointsField = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(set, transaction) {
    if (transaction.docChanged) {
      set = mapWithLines(set, transaction);
    }
    for (const e of transaction.effects) {
      if (e.is(setBreakpointStatesEffect)) {
        const doc = transaction.state.doc;
        const ranges: Range<GutterMarker>[] = [];
        for (const { line, verified, message } of e.value) {
          if (line >= 1 && line <= doc.lines) {
            ranges.push(
              (verified
                ? breakpointMarker
                : new BreakpointMarker(false, message)
              ).range(doc.line(line).from),
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

export const hasBreakpointAt = (state: EditorState, pos: number) => {
  let found = false;
  state.field(breakpointsField).between(pos, pos, () => {
    found = true;
  });
  return found;
};

export const toggleBreakpoint = (view: EditorView, pos: number) => {
  view.dispatch({
    effects: setBreakpointEffect.of({ pos, on: !hasBreakpointAt(view.state, pos) }),
  });
};

export const toggleBreakpointAtCaret = (view: EditorView) => {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  toggleBreakpoint(view, line.from);
  return line.number;
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

const breakpointLines = (state: EditorState): number[] => {
  const lines: number[] = [];
  const iter = state.field(breakpointsField).iter(0);
  while (iter.value) {
    lines.push(state.doc.lineAt(iter.from).number);
    iter.next();
  }
  return lines;
};

const breakpointClaim = markColumnClaims.of({
  rank: MARK_COLUMN_RANK.breakpoint,
  lines: breakpointLines,
});

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
    position: "relative",
    zIndex: "1",
    width: "14px",
    overflow: "hidden",
  },
  "&.cm-breakpoints-coarse .cm-breakpoint-gutter": {
    width: "0",
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
  "&:not(.cm-breakpoints-coarse) .cm-breakpoint-gutter .cm-gutterElement:not(:has(.cm-breakpoint)):hover::after":
    {
      content: '""',
      display: "block",
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      backgroundColor: "var(--editor-breakpoint)",
      opacity: "0.4",
    },
});

export const breakpoints = () => [
  breakpointsField,
  breakpointAttributes,
  breakpointTheme,
  breakpointClaim,
  gutterButtons(),
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
      click(view, line, event) {
        if ((event as MouseEvent).detail === 0 && takesPress(view)) {
          toggleBreakpoint(view, line.from);
          return true;
        }
        return false;
      },
      touchstart: keepsTouch,
      touchmove: keepsTouch,
      touchend: keepsTouch,
      touchcancel: keepsTouch,
    },
  }),
];
