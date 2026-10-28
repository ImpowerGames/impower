import { StateEffect, StateField, type Text } from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";

/*
 * Lines a host keeps something on by line number, which must stay on the
 * same line of text as edits move it: the Game Preview's starting values of
 * once-only options and alternators, which have no name to be kept by. Each
 * anchor spans its line's text, so lines inserted or deleted above move it,
 * Enter at its line's start moves it down with its text, and deleting its
 * line's text deletes it. Every edit reports the lines it moved, from the
 * line each anchor was on to the line it is on now, or to null for a line
 * the edit deleted.
 */

interface LineAnchor {
  /** The line it is on, counting from 0, as last reported. */
  line: number;
  from: number;
  to: number;
}

interface LineAnchors {
  anchors: LineAnchor[];
  /** What the last transaction moved: each line an anchor was on before it
   *  and the line it is on after it, or null for a deleted one. */
  moves: [from: number, to: number | null][];
}

/** Replaces every anchor with one on each of the lines given, counting from
 *  0. */
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
          // Its line's text is gone.
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

/** The field, with an anchor on each of `lines`, counting from 0. */
export const lineAnchors = (doc: Text, lines: readonly number[] = []) =>
  lineAnchorsField.init(() => ({ anchors: anchorsOn(doc, lines), moves: [] }));

export const setLineAnchors = (view: EditorView, lines: number[]) => {
  view.dispatch({ effects: setLineAnchorsEffect.of(lines) });
};

/** The lines anchored now, counting from 0. */
export const getLineAnchors = (view: EditorView): number[] =>
  view.state.field(lineAnchorsField, false)?.anchors.map((a) => a.line) ?? [];

/** What the update's edits moved, in the order its transactions moved them. */
export const lineAnchorMoves = (
  update: ViewUpdate,
): [number, number | null][] => {
  if (!update.docChanged) {
    return [];
  }
  // Each transaction's moves are relative to the one before it, so the
  // update's are the last transaction's when it has one; an update of
  // several transactions composes them.
  const moves = new Map<number, number | null>();
  const starts = update.startState.field(lineAnchorsField, false)?.anchors ?? [];
  const ends = update.state.field(lineAnchorsField, false)?.anchors ?? [];
  if (update.transactions.length === 1) {
    return update.state.field(lineAnchorsField, false)?.moves ?? [];
  }
  // Several transactions: compare where each anchor started and ended by
  // following the map of the whole update.
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
