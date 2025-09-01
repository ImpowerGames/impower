import {
  Extension,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";

/**
 * A StateEffect used to dispatch updates to the line highlights.
 * Your application logic will use this to send new highlight data to the editor.
 */
export const setHighlightedLinesEffect = StateEffect.define<Set<number>>();

export const setHighlightedLines = (view: EditorView, lines: Set<number>) => {
  view.dispatch({
    effects: setHighlightedLinesEffect.of(lines),
  });
};

// Define CSS classes for styling the decorated lines.
const highlightedLineClass = "cm-highlightedLine";

// Create the line decorations that apply our CSS classes.
const highlightedLineDeco = Decoration.line({ class: highlightedLineClass });

/**
 * A CodeMirror theme to style the highlighted lines.
 */
const highlightLinesTheme = EditorView.baseTheme({
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
const highlightLinesStateField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    // Automatically adjust decoration positions when the document changes.
    decorations = decorations.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(setHighlightedLinesEffect)) {
        const lines = effect.value;
        const builder = new RangeSetBuilder<Decoration>();

        // Add decorations for currently highlighted lines
        for (const lineNumber of lines) {
          if (lineNumber <= tr.state.doc.lines) {
            const line = tr.state.doc.line(lineNumber);
            builder.add(line.from, line.from, highlightedLineDeco);
          }
        }

        decorations = builder.finish();
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
  return [highlightLinesStateField, highlightLinesTheme];
}
