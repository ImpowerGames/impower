import {
  Facet,
  RangeSet,
  StateEffect,
  StateField,
  combineConfig,
} from "@codemirror/state";
import {
  EditorView,
  GutterMarker,
  ViewUpdate,
  gutter,
  lineNumbers,
} from "@codemirror/view";

export interface BreakpointsConfiguration {}

export const breakpointsConfig = Facet.define<
  BreakpointsConfiguration,
  Required<BreakpointsConfiguration>
>({
  combine(configs) {
    return combineConfig(configs, {});
  },
});

const breakpointMarker = new (class extends GutterMarker {
  override toDOM() {
    return document.createTextNode("◈");
  }
})();

const clearBreakpointsEffect = StateEffect.define<{}>({});

const setBreakpointEffect = StateEffect.define<{ pos: number; on: boolean }>({
  map: (val, mapping) => ({ pos: mapping.mapPos(val.pos), on: val.on }),
});

const breakpointState = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(set, transaction) {
    set = set.map(transaction.changes);
    for (let e of transaction.effects) {
      if (e.is(clearBreakpointsEffect)) {
        set = RangeSet.empty;
      }
      if (e.is(setBreakpointEffect)) {
        if (e.value.on) {
          set = set.update({ add: [breakpointMarker.range(e.value.pos)] });
        } else {
          set = set.update({ filter: (from) => from != e.value.pos });
        }
      }
    }
    return set;
  },
});

export const getBreakpointLines = (view: EditorView) => {
  let rangeSet = view.state.field(breakpointState);
  const breakpoints: number[] = [];
  const iter = rangeSet.iter(0);
  let from = iter.from;
  while (iter.value) {
    const line = view.state.doc.lineAt(from).number - 1;
    breakpoints.push(line);
    from = iter.from;
    iter.next();
  }
  return breakpoints;
};

export const toggleBreakpoint = (view: EditorView, pos: number) => {
  let rangeSet = view.state.field(breakpointState);
  let hasBreakpoint = false;
  rangeSet.between(pos, pos, () => {
    hasBreakpoint = true;
  });
  const effects: StateEffect<any>[] = [];
  effects.push(setBreakpointEffect.of({ pos, on: !hasBreakpoint }));
  view.dispatch({ effects });
};

export const breakpointsChanged = (update: ViewUpdate): boolean => {
  return update.transactions.some((t) =>
    t.effects.some(
      (e) => e.is(clearBreakpointsEffect) || e.is(setBreakpointEffect)
    )
  );
};

export const breakpoints = (config: BreakpointsConfiguration = {}) => [
  breakpointsConfig.of(config),
  breakpointState,
  gutter({
    class: "cm-breakpoint-gutter",
    markers: (v) => v.state.field(breakpointState),
    initialSpacer: () => breakpointMarker,
    domEventHandlers: {
      mousedown(view, line) {
        toggleBreakpoint(view, line.from);
        return true;
      },
    },
  }),
  lineNumbers({
    domEventHandlers: {
      mousedown: (view, line) => {
        toggleBreakpoint(view, line.from);
        return true;
      },
    },
  }),
  EditorView.baseTheme({
    ".cm-breakpoint-gutter .cm-gutterElement": {
      paddingLeft: "2px",
      color: "#3abff8",
      cursor: "default",
    },
  }),
];
