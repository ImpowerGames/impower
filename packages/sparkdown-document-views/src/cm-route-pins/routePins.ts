import {
  StateEffect,
  StateField,
  type EditorState,
  type Text,
  type Transaction,
} from "@codemirror/state";

/** A pin of the document's: its line, counting from 0, and which time the
 *  Game Preview's route is offered the option on it, from 1. */
export interface DocumentRoutePin {
  line: number;
  offer: number;
}

/** A pin kept on its line: the line's text, from its first character to its
 *  last, and the pin's offer. */
interface RoutePinMark {
  from: number;
  to: number;
  offer: number;
}

/** Replaces the document's pins, as the host keeps them. */
export const setRoutePinsEffect = StateEffect.define<DocumentRoutePin[]>();

const marksOn = (doc: Text, pins: readonly DocumentRoutePin[]): RoutePinMark[] =>
  pins
    .filter(
      (pin) =>
        Number.isInteger(pin.line) && pin.line >= 0 && pin.line < doc.lines,
    )
    .map((pin) => {
      const line = doc.line(pin.line + 1);
      return { from: line.from, to: line.to, offer: pin.offer };
    });

/**
 * The marks moved through an edit, as the breakpoint gutter's markers move:
 * each stays on its line, wherever an edit above it puts that line. A line
 * whose text the edit deleted takes its pins with it: the start of its text
 * mapped forward and the end mapped back meet or cross only when nothing of
 * the text is left.
 */
const mapMarks = (
  marks: readonly RoutePinMark[],
  tr: Transaction,
): RoutePinMark[] => {
  const mapped: RoutePinMark[] = [];
  for (const mark of marks) {
    const from = tr.changes.mapPos(mark.from, 1);
    const to = tr.changes.mapPos(mark.to, -1);
    if (mark.to > mark.from && to <= from) {
      continue;
    }
    const line = tr.newDoc.lineAt(from);
    if (
      !mapped.some((m) => m.from === line.from && m.offer === mark.offer)
    ) {
      mapped.push({ from: line.from, to: line.to, offer: mark.offer });
    }
  }
  return mapped;
};

/** The document's pins, kept on their lines through edits. */
export const routePinsField = StateField.define<readonly RoutePinMark[]>({
  create() {
    return [];
  },
  update(marks, tr) {
    if (tr.docChanged) {
      marks = mapMarks(marks, tr);
    }
    for (const effect of tr.effects) {
      if (effect.is(setRoutePinsEffect)) {
        marks = marksOn(tr.state.doc, effect.value);
      }
    }
    return marks;
  },
});

/** The field, starting with `pins` on the lines of `doc`, the starting
 *  state's document when it is not given. */
export const routePins = (
  pins: readonly DocumentRoutePin[] = [],
  doc?: Text,
) => routePinsField.init((state) => marksOn(doc ?? state.doc, pins));

/** The document's pins where they stand now, in document order. */
export const getRoutePins = (state: EditorState): DocumentRoutePin[] =>
  [...state.field(routePinsField, false) ?? []]
    .sort((a, b) => a.from - b.from || a.offer - b.offer)
    .map((mark) => ({
      line: state.doc.lineAt(mark.from).number - 1,
      offer: mark.offer,
    }));

/** Whether a transaction replaced the pins from the host. */
export const setsRoutePins = (tr: Transaction): boolean =>
  tr.effects.some((effect) => effect.is(setRoutePinsEffect));
