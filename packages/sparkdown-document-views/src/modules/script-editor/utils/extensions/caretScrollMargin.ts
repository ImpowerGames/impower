import { EditorView } from "@codemirror/view";

export const CARET_SCROLL_MARGIN_TOP = 8;
export const CARET_SCROLL_MARGIN_BOTTOM = 12;

export const caretScrollMarginY = CARET_SCROLL_MARGIN_TOP;

const caretBottomInset = CARET_SCROLL_MARGIN_BOTTOM - CARET_SCROLL_MARGIN_TOP;

const caretInsetMargins = new WeakSet<object>();

export const caretBottomInsetOf = (margins: object) =>
  caretInsetMargins.has(margins) ? caretBottomInset : 0;

const bottomPanelsOverlap = (view: EditorView) => {
  const panels = view.dom.querySelector(":scope > .cm-panels-bottom");
  if (!panels) {
    return 0;
  }
  const scrollerBottom = Math.min(
    window.innerHeight,
    view.scrollDOM.getBoundingClientRect().bottom,
  );
  return Math.max(0, scrollerBottom - panels.getBoundingClientRect().top);
};

export const caretScrollMargin = (hostMargin?: {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}) => {
  const margins = (view: EditorView) => ({
    ...hostMargin,
    bottom:
      Math.max(hostMargin?.bottom ?? 0, bottomPanelsOverlap(view)) +
      caretBottomInset,
  });
  caretInsetMargins.add(margins);
  return [
    EditorView.cursorScrollMargin.of({ x: 5, y: caretScrollMarginY }),
    EditorView.scrollMargins.of(margins),
    EditorView.theme({
      "& .cm-content": { paddingBottom: `${CARET_SCROLL_MARGIN_BOTTOM}px` },
    }),
  ];
};

export const scrollCaretIntoView = (view: EditorView) =>
  view.dispatch({
    effects: EditorView.scrollIntoView(view.state.selection.main, {
      y: "nearest",
      yMargin: caretScrollMarginY,
    }),
  });
