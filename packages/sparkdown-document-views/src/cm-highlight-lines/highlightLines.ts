import {
  Extension,
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

/**
 * A StateEffect used to dispatch updates to the line highlights.
 * Your application logic will use this to send new highlight data to the editor.
 */
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
    (pos) => view.state.doc.lineAt(pos).number
  );
};

export const highlightsChanged = (update: ViewUpdate): boolean => {
  return update.transactions.some((t) =>
    t.effects.some((e) => e.is(setHighlightsEffect))
  );
};

// Define CSS classes for styling the decorated lines.
const highlightedLineClass = "cm-highlightedLine";

// Create the line decorations that apply our CSS classes.
export const highlightDeco = Decoration.line({ class: highlightedLineClass });

/**
 * A CodeMirror theme to style the highlighted lines.
 */
const highlightsTheme = EditorView.baseTheme({
  [`&light .cm-line.${highlightedLineClass}`]: {
    backgroundColor: "rgba(0, 0, 0, 0.04)",
  },
  [`&dark .cm-line.${highlightedLineClass}`]: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
});

/**
 * The StateField that manages the DecorationSet for the highlighted lines.
 * It listens for `setLineHighlightEffect` to update its state.
 */
export const highlightsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    // Automatically adjust decoration positions when the document changes.
    decorations = decorations.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(setHighlightsEffect)) {
        const lineNumbers = effect.value;
        decorations = RangeSet.empty;
        decorations = decorations.update({
          add: lineNumbers
            .filter((lineNumber) => lineNumber <= tr.state.doc.lines)
            .map((lineNumber) =>
              highlightDeco.range(tr.state.doc.line(lineNumber).from)
            ),
          sort: true,
        });
      }
    }

    return decorations;
  },
  // Provide the decorations from this state field to the editor view.
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * The main line highlighting extension.
 * Add this to your CodeMirror editor's configuration to enable the functionality.
 * @returns {Extension} A CodeMirror extension array.
 */
export function highlightLines(): Extension {
  return [highlightsField, highlightsTheme];
}
