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
export const setPinpointsEffect = StateEffect.define<number[]>();

export const setPinpoints = (view: EditorView, lineNumbers: number[]) => {
  view.dispatch({
    effects: setPinpointsEffect.of(lineNumbers),
  });
};

export const getPinpointPositions = (view: EditorView) => {
  let rangeSet = view.state.field(pinpointsField);
  const pinpointPositions: number[] = [];
  const iter = rangeSet.iter(0);
  while (iter.value) {
    const from = iter.from;
    iter.next();
    pinpointPositions.push(from);
  }
  return pinpointPositions;
};

export const getPinpointLineNumbers = (view: EditorView) => {
  return getPinpointPositions(view).map(
    (pos) => view.state.doc.lineAt(pos).number
  );
};

export const pinpointsChanged = (update: ViewUpdate): boolean => {
  return update.transactions.some((t) =>
    t.effects.some((e) => e.is(setPinpointsEffect))
  );
};

// Define CSS classes for styling the decorated line.
const pinpointClass = "cm-pinpoint";

// Create the line decorations that apply our CSS classes.
export const pinpointDeco = Decoration.line({ class: pinpointClass });

/**
 * A CodeMirror theme to style the highlighted line.
 */
const pinpointsTheme = EditorView.baseTheme({
  [`.cm-line.${pinpointClass}`]: {
    position: "relative",
  },
  [`&light .cm-line.${pinpointClass}::before`]: {
    content: "''",
    position: "absolute",
    inset: "0",
    borderTopWidth: "2px",
    borderTopStyle: "solid",
    borderTopColor: "#66baff",
  },
  [`&dark .cm-line.${pinpointClass}::before`]: {
    content: "''",
    position: "absolute",
    inset: "0",
    borderTopWidth: "2px",
    borderTopStyle: "solid",
    borderTopColor: "rgba(102, 186, 255, 1)",
  },
  [`&light .pinpointError .cm-line.${pinpointClass}::before`]: {
    borderTopColor: "#f14c4c",
  },
  [`&dark .pinpointError .cm-line.${pinpointClass}::before`]: {
    borderTopColor: "#f14c4c",
  },
});

/**
 * The StateField that manages the DecorationSet for the highlighted line.
 * It listens for `setLineHighlightEffect` to update its state.
 */
export const pinpointsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    // Automatically adjust decoration positions when the document changes.
    decorations = decorations.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(setPinpointsEffect)) {
        const lineNumbers = effect.value;
        decorations = RangeSet.empty;
        decorations = decorations.update({
          add: lineNumbers
            .filter((lineNumber) => lineNumber <= tr.state.doc.lines)
            .map((lineNumber) =>
              pinpointDeco.range(tr.state.doc.line(lineNumber).from)
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
export function pinpoints(): Extension {
  return [pinpointsField, pinpointsTheme];
}
