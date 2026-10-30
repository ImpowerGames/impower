import {
  StateEffect,
  StateField,
  type EditorState,
  type Text,
  type Transaction,
} from "@codemirror/state";

export interface DocumentRoutePin {
  line: number;
  offer: number;
}

interface RoutePinMark {
  from: number;
  to: number;
  offer: number;
}

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

export const routePins = (
  pins: readonly DocumentRoutePin[] = [],
  doc?: Text,
) => routePinsField.init((state) => marksOn(doc ?? state.doc, pins));

export const getRoutePins = (state: EditorState): DocumentRoutePin[] =>
  [...state.field(routePinsField, false) ?? []]
    .sort((a, b) => a.from - b.from || a.offer - b.offer)
    .map((mark) => ({
      line: state.doc.lineAt(mark.from).number - 1,
      offer: mark.offer,
    }));

export const setsRoutePins = (tr: Transaction): boolean =>
  tr.effects.some((effect) => effect.is(setRoutePinsEffect));
