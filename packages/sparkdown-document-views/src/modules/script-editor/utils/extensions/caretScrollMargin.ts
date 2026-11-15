import { EditorView } from "@codemirror/view";

export const CARET_SCROLL_MARGIN_TOP = 8;
export const CARET_SCROLL_MARGIN_BOTTOM = 12;

export const caretScrollMarginY = CARET_SCROLL_MARGIN_TOP;

const caretBottomInset = CARET_SCROLL_MARGIN_BOTTOM - CARET_SCROLL_MARGIN_TOP;

export const caretScrollMargin = (hostMargin?: {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}) => [
  EditorView.cursorScrollMargin.of({ x: 5, y: caretScrollMarginY }),
  EditorView.scrollMargins.of(() => ({
    ...hostMargin,
    bottom: (hostMargin?.bottom ?? 0) + caretBottomInset,
  })),
  EditorView.theme({
    "& .cm-content": { paddingBottom: `${CARET_SCROLL_MARGIN_BOTTOM}px` },
  }),
];

export const scrollCaretIntoView = (view: EditorView) =>
  view.dispatch({
    effects: EditorView.scrollIntoView(view.state.selection.main, {
      y: "nearest",
      yMargin: caretScrollMarginY,
    }),
  });
