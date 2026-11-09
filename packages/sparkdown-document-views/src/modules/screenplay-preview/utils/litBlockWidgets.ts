import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

export const LIT_CLASS = "sp-lit";

const BLOCK_WIDGETS = ":scope > div:not(.cm-line):not(.cm-gap)";

const light = (view: EditorView) => {
  const head = view.state.selection.main.head;
  view.contentDOM
    .querySelectorAll<HTMLElement>(BLOCK_WIDGETS)
    .forEach((element) => {
      const block = view.lineBlockAt(view.posAtDOM(element));
      const lit = head >= block.from && head <= block.to;
      if (element.classList.contains(LIT_CLASS) !== lit) {
        element.classList.toggle(LIT_CLASS, lit);
      }
    });
};

export const litBlockWidgets = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      light(view);
    }

    update(update: ViewUpdate) {
      if (
        update.selectionSet ||
        update.docChanged ||
        update.viewportChanged ||
        update.geometryChanged
      ) {
        light(update.view);
      }
    }
  },
);
