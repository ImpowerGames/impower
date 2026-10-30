import {
  combineConfig,
  Extension,
  Facet,
  Range,
  RangeSet,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewUpdate,
} from "@codemirror/view";

export interface HighlightsConfiguration {
  isGap?: (text: string) => boolean;
}

export const highlightsConfig = Facet.define<
  HighlightsConfiguration,
  Required<HighlightsConfiguration>
>({
  combine(configs) {
    return combineConfig(configs, {
      isGap: (text: string) => !text.trim(),
    });
  },
});

export const setHighlightsEffect = StateEffect.define<number[]>();

export const setHighlights = (view: EditorView, lines: number[]) => {
  view.dispatch({
    effects: setHighlightsEffect.of(lines),
  });
};

export const getHighlightPositions = (view: EditorView) => {
  let rangeSet = view.state.field(highlightsField);
  const highlightPositions: number[] = [];
  const iter = rangeSet.iter(0);
  while (iter.value) {
    const from = iter.from;
    iter.next();
    highlightPositions.push(from);
  }
  return highlightPositions;
};

export const getHighlightLineNumbers = (view: EditorView) => {
  return getHighlightPositions(view).map(
    (pos) => view.state.doc.lineAt(pos).number,
  );
};

export const highlightsChanged = (update: ViewUpdate): boolean => {
  return update.transactions.some((t) =>
    t.effects.some((e) => e.is(setHighlightsEffect)),
  );
};

const highlightedLineClass = "cm-highlightedLine";

export const highlightDeco = Decoration.line({ class: highlightedLineClass });

const highlightsTheme = EditorView.baseTheme({
  [`&light .cm-line.${highlightedLineClass}`]: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  [`&dark .cm-line.${highlightedLineClass}`]: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
});

export const highlightsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    const config = tr.state.facet(highlightsConfig);

    decorations = decorations.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(setHighlightsEffect)) {
        const lineNumbers = effect.value;
        decorations = RangeSet.empty;
        const sortedHighlightedLineNumbers = lineNumbers.sort((a, b) => a - b);
        const add: Range<Decoration>[] = [];
        let prevHighlightedLineNumber: number | undefined = undefined;
        for (const highlightedLineNumber of sortedHighlightedLineNumbers) {
          if (
            typeof highlightedLineNumber === "number" &&
            highlightedLineNumber <= tr.state.doc.lines
          ) {
            const consecutiveGapLines: Set<number> = new Set();
            if (prevHighlightedLineNumber != null) {
              for (
                let i = prevHighlightedLineNumber + 1;
                i < highlightedLineNumber;
                i++
              ) {
                if (config.isGap(tr.state.doc.line(i).text)) {
                  consecutiveGapLines.add(i);
                } else {
                  consecutiveGapLines.clear();
                  break;
                }
              }
            }
            for (const i of consecutiveGapLines) {
              add.push(highlightDeco.range(tr.state.doc.line(i).from));
            }
            add.push(
              highlightDeco.range(
                tr.state.doc.line(highlightedLineNumber).from,
              ),
            );
            prevHighlightedLineNumber = highlightedLineNumber;
          }
        }
        decorations = decorations.update({
          add,
          sort: true,
        });
      }
    }

    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function highlightLines(
  config: HighlightsConfiguration = {},
): Extension {
  return [highlightsConfig.of(config), highlightsField, highlightsTheme];
}
