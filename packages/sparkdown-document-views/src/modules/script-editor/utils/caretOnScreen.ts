import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

const EDGE_TOLERANCE = 1;

const scrollMargins = (view: EditorView) => {
  let top = 0;
  let bottom = 0;
  for (const margins of view.state.facet(EditorView.scrollMargins)) {
    const rect = margins(view);
    top = Math.max(top, rect?.top ?? 0);
    bottom = Math.max(bottom, rect?.bottom ?? 0);
  }
  return { top, bottom };
};

const visibleBand = (view: EditorView) => {
  const scroller = view.scrollDOM.getBoundingClientRect();
  const margins = scrollMargins(view);
  const viewport = window.visualViewport;
  const screenBottom = viewport
    ? viewport.offsetTop + viewport.height
    : window.innerHeight;
  return {
    top: Math.max(scroller.top, 0) + margins.top,
    bottom: Math.min(scroller.bottom, screenBottom) - margins.bottom,
  };
};

export const isCaretOnScreen = (view: EditorView): boolean => {
  const { top, bottom } = visibleBand(view);
  const caret = view.coordsAtPos(view.state.selection.main.head);
  return (
    caret != null &&
    caret.top >= top - EDGE_TOLERANCE &&
    caret.bottom <= bottom + EDGE_TOLERANCE
  );
};

export const firstLineOnScreen = (view: EditorView): number => {
  const { top, bottom } = visibleBand(view);
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
  const left = view.contentDOM.getBoundingClientRect().left;
  const pos = view.posAtCoords({ x: left, y: top + EDGE_TOLERANCE }, false);
  return view.moveToLineBoundary(EditorSelection.cursor(pos), false, true).head;
};

export const focusOnScreen = (view: EditorView) => {
  if (!isCaretOnScreen(view)) {
    view.dispatch({
      selection: EditorSelection.cursor(firstLineOnScreen(view)),
      userEvent: "select",
    });
  }
  view.focus();
};
