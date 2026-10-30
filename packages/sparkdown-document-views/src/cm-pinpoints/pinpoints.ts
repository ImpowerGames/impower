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
    (pos) => view.state.doc.lineAt(pos).number,
  );
};

export const pinpointsChanged = (update: ViewUpdate): boolean => {
  return update.transactions.some((t) =>
    t.effects.some((e) => e.is(setPinpointsEffect)),
  );
};

const pinpointClass = "cm-pinpoint";

export const pinpointDeco = Decoration.line({ class: pinpointClass });

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

export const pinpointsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(setPinpointsEffect)) {
        const lineNumbers = effect.value;
        decorations = RangeSet.empty;
        decorations = decorations.update({
          add: lineNumbers
            .filter(
              (lineNumber) =>
                typeof lineNumber === "number" &&
                lineNumber <= tr.state.doc.lines,
            )
            .map((lineNumber) =>
              pinpointDeco.range(tr.state.doc.line(lineNumber).from),
            ),
          sort: true,
        });
      }
    }

    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function pinpoints(): Extension {
  return [pinpointsField, pinpointsTheme];
}
