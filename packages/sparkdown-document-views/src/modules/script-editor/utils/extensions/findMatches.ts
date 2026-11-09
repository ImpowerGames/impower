import {
  type EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

export interface FindMatchRange {
  from: number;
  to: number;
}

export const setFindMatchesEffect = StateEffect.define<FindMatchRange[]>();

export const findMatchesField = StateField.define<FindMatchRange[]>({
  create: () => [],
  update(value, tr) {
    let next = value;
    if (tr.docChanged && next.length) {
      next = next
        .map(({ from, to }) => ({
          from: tr.changes.mapPos(from, 1),
          to: tr.changes.mapPos(to, -1),
        }))
        .filter(({ from, to }) => to > from);
    }
    for (const effect of tr.effects) {
      if (effect.is(setFindMatchesEffect)) {
        next = [...effect.value]
          .filter(({ from, to }) => to > from)
          .sort((a, b) => a.from - b.from);
      }
    }
    return next;
  },
});

const match = Decoration.mark({ class: "cm-searchMatch" });

const selectedMatch = Decoration.mark({
  class: "cm-searchMatch cm-searchMatch-selected",
});

const buildDecorations = (state: EditorState) => {
  const builder = new RangeSetBuilder<Decoration>();
  const main = state.selection.main;
  for (const { from, to } of state.field(findMatchesField)) {
    if (to > state.doc.length) {
      break;
    }
    builder.add(
      from,
      to,
      main.from === from && main.to === to ? selectedMatch : match,
    );
  }
  return builder.finish();
};

export const findMatches = () => [
  findMatchesField,
  EditorView.decorations.compute([findMatchesField, "selection"], (state) =>
    buildDecorations(state),
  ),
];

