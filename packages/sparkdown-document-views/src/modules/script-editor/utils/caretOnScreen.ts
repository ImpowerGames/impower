import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  caretBottomInsetOf,
  caretScrollMarginY,
} from "./extensions/caretScrollMargin";

const EDGE_TOLERANCE = 1;
const MAX_ROW_STEPS = 4;

const scrollMargins = (view: EditorView, withCaretInset: boolean) => {
  let top = 0;
  let bottom = 0;
  for (const margins of view.state.facet(EditorView.scrollMargins)) {
    const rect = margins(view);
    const inset = withCaretInset ? 0 : caretBottomInsetOf(margins);
    top = Math.max(top, rect?.top ?? 0);
    bottom = Math.max(bottom, (rect?.bottom ?? 0) - inset);
  }
  return { top, bottom };
};

const visibleBand = (view: EditorView, clearance: number) => {
  const scroller = view.scrollDOM.getBoundingClientRect();
  const covered = scrollMargins(view, false);
  const inset =
    clearance > 0 ? scrollMargins(view, true).bottom - covered.bottom : 0;
  const viewport = window.visualViewport;
  const screenBottom = viewport
    ? viewport.offsetTop + viewport.height
    : window.innerHeight;
  return {
    top: Math.max(scroller.top, 0) + covered.top + clearance,
    bottom:
      Math.min(scroller.bottom - covered.bottom, screenBottom) -
      inset -
      clearance,
  };
};

export const isCaretOnScreen = (view: EditorView): boolean => {
  const { top, bottom } = visibleBand(view, 0);
  const { head, assoc } = view.state.selection.main;
  const caret = view.coordsAtPos(head, assoc || 1);
  return (
    caret != null &&
    caret.top >= top - EDGE_TOLERANCE &&
    caret.bottom <= bottom + EDGE_TOLERANCE
  );
};

const firstRowOnScreen = (view: EditorView, top: number): number => {
  const left = view.contentDOM.getBoundingClientRect().left;
  const pos = view.posAtCoords({ x: left, y: top + EDGE_TOLERANCE }, false);
  let row = view.moveToLineBoundary(EditorSelection.cursor(pos, 1), false, true);
  for (let step = 0; step < MAX_ROW_STEPS; step += 1) {
    const rect = view.coordsAtPos(row.head, 1);
    if (!rect || rect.top >= top - EDGE_TOLERANCE) {
      break;
    }
    row = view.moveToLineBoundary(view.moveVertically(row, true), false, true);
  }
  return row.head;
};

export const firstLineOnScreen = (view: EditorView): number => {
  const { top, bottom } = visibleBand(view, caretScrollMarginY);
  const { doc } = view.state;
  const block = view.lineBlockAtHeight(top - view.documentTop);
  const blockTop = (b: { top: number }) => view.documentTop + b.top;
  if (blockTop(block) >= top - EDGE_TOLERANCE) {
    return doc.lineAt(block.from).from;
  }
  if (block.to < doc.length) {
    const next = view.lineBlockAt(block.to + 1);
    if (blockTop(next) + next.height <= bottom + EDGE_TOLERANCE) {
      return doc.lineAt(next.from).from;
    }
  }
  return firstRowOnScreen(view, top);
};

export const raiseCaretOnScreen = (view: EditorView) => {
  const { head, assoc } = view.state.selection.main;
  const caret = view.coordsAtPos(head, assoc || 1);
  if (!caret) {
    return;
  }
  const { bottom } = visibleBand(view, caretScrollMarginY);
  if (caret.bottom > bottom + EDGE_TOLERANCE) {
    view.scrollDOM.scrollTop += caret.bottom - bottom;
  }
};

export const focusOnScreen = (view: EditorView) => {
  if (!isCaretOnScreen(view)) {
    view.dispatch({
      selection: EditorSelection.cursor(firstLineOnScreen(view), 1),
      userEvent: "select",
    });
  }
  view.focus();
};
