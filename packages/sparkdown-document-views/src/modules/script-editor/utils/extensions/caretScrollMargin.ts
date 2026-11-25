import { EditorView, ViewPlugin } from "@codemirror/view";

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

const writeCoveredBottom = (view: EditorView, covered: number) => {
  const padding =
    covered > 0 ? `${CARET_SCROLL_MARGIN_BOTTOM + covered}px` : "";
  if (view.contentDOM.style.paddingBottom !== padding) {
    view.contentDOM.style.paddingBottom = padding;
    view.requestMeasure();
  }
};

const coveredBottomPlugin = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {}

    update() {
      this.view.requestMeasure({
        key: this,
        read: bottomPanelsOverlap,
        write: (covered, view) => writeCoveredBottom(view, covered),
      });
    }

    destroy() {
      this.view.contentDOM.style.paddingBottom = "";
    }
  },
);

export const fitCoveredBottom = (view: EditorView) => {
  if (view.plugin(coveredBottomPlugin)) {
    writeCoveredBottom(view, bottomPanelsOverlap(view));
  }
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
    coveredBottomPlugin,
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
