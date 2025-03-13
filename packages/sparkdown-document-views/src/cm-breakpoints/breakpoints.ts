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

export interface BreakpointsConfiguration {
  /**
   * Only allow one breakpoint
   */
  singular?: boolean;
}

export const breakpointsConfig = Facet.define<
  BreakpointsConfiguration,
  Required<BreakpointsConfiguration>
>({
  combine(configs) {
    return combineConfig(configs, {
      singular: false,
    });
  },
});

export const breakpointMarker = new (class extends GutterMarker {
  override toDOM() {
    return document.createTextNode("●");
  }
})();

const clearBreakpointsEffect = StateEffect.define<{}>({});

const setBreakpointEffect = StateEffect.define<{ pos: number; on: boolean }>({
  map: (val, mapping) => ({ pos: mapping.mapPos(val.pos), on: val.on }),
});

export const breakpointsField = StateField.define<RangeSet<GutterMarker>>({
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

export const getBreakpointPositions = (view: EditorView) => {
  let rangeSet = view.state.field(breakpointsField);
  const breakpointPositions: number[] = [];
  const iter = rangeSet.iter(0);
  while (iter.value) {
    const from = iter.from;
    iter.next();
    breakpointPositions.push(from);
  }
  return breakpointPositions;
};

export const getBreakpointLineNumbers = (view: EditorView) => {
  return getBreakpointPositions(view).map(
    (pos) => view.state.doc.lineAt(pos).number
  );
};

export const toggleBreakpoint = (view: EditorView, pos: number) => {
  const config = view.state.facet(breakpointsConfig);
  let rangeSet = view.state.field(breakpointsField);
  let hasBreakpoint = false;
  rangeSet.between(pos, pos, () => {
    hasBreakpoint = true;
  });
  const effects: StateEffect<any>[] = [];
  if (!hasBreakpoint && config.singular) {
    effects.push(clearBreakpointsEffect.of({}));
  }
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
  breakpointsField,
  gutter({
    class: "cm-breakpoint-gutter",
    markers: (v) => v.state.field(breakpointsField),
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
