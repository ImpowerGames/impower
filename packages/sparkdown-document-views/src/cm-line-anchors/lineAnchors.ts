import { StateEffect, StateField, type Text } from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";

interface LineAnchor {
  line: number;
  from: number;
  to: number;
}

interface LineAnchors {
  anchors: LineAnchor[];
  moves: [from: number, to: number | null][];
}

export const setLineAnchorsEffect = StateEffect.define<number[]>();

const anchorsOn = (doc: Text, lines: readonly number[]): LineAnchor[] =>
  lines
    .filter((line) => Number.isInteger(line) && line >= 0 && line < doc.lines)
    .map((line) => {
      const at = doc.line(line + 1);
      return { line, from: at.from, to: at.to };
    });

export const lineAnchorsField = StateField.define<LineAnchors>({
  create: () => ({ anchors: [], moves: [] }),
  update(value, tr) {
    let anchors = value.anchors;
    const moves: [number, number | null][] = [];
    if (tr.docChanged) {
      const kept: LineAnchor[] = [];
      for (const anchor of anchors) {
        const from = tr.changes.mapPos(anchor.from, 1);
        const to = tr.changes.mapPos(anchor.to, -1);
        if (anchor.to > anchor.from && to <= from) {
          moves.push([anchor.line, null]);
          continue;
        }
        const line = tr.state.doc.lineAt(from).number - 1;
        if (line !== anchor.line) {
          moves.push([anchor.line, line]);
        }
        kept.push({ line, from, to: Math.max(from, to) });
      }
      anchors = kept;
    }
    for (const effect of tr.effects) {
      if (effect.is(setLineAnchorsEffect)) {
        anchors = anchorsOn(tr.state.doc, effect.value);
      }
    }
    if (anchors === value.anchors && moves.length === 0 && value.moves.length === 0) {
      return value;
    }
    return { anchors, moves };
  },
});

export const lineAnchors = (doc: Text, lines: readonly number[] = []) =>
  lineAnchorsField.init(() => ({ anchors: anchorsOn(doc, lines), moves: [] }));

export const setLineAnchors = (view: EditorView, lines: number[]) => {
  view.dispatch({ effects: setLineAnchorsEffect.of(lines) });
};

export const getLineAnchors = (view: EditorView): number[] =>
  view.state.field(lineAnchorsField, false)?.anchors.map((a) => a.line) ?? [];

export const lineAnchorMoves = (
  update: ViewUpdate,
): [number, number | null][] => {
  if (!update.docChanged) {
    return [];
  }
  const moves = new Map<number, number | null>();
  const starts = update.startState.field(lineAnchorsField, false)?.anchors ?? [];
  const ends = update.state.field(lineAnchorsField, false)?.anchors ?? [];
  if (update.transactions.length === 1) {
    return update.state.field(lineAnchorsField, false)?.moves ?? [];
  }
  for (const anchor of starts) {
    const from = update.changes.mapPos(anchor.from, 1);
    const to = update.changes.mapPos(anchor.to, -1);
    if (anchor.to > anchor.from && to <= from) {
      moves.set(anchor.line, null);
      continue;
    }
    const end = ends.find((e) => e.from === from);
    const line = end?.line ?? update.state.doc.lineAt(from).number - 1;
    if (line !== anchor.line) {
      moves.set(anchor.line, line);
    }
  }
  return [...moves];
};
