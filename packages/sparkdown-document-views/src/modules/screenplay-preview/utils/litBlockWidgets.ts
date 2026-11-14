import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

export const LIT_CLASS = "sp-lit";

const BLOCK_WIDGETS = ":scope > div:not(.cm-line):not(.cm-gap)";

const readLit = (view: EditorView) => {
  const head = view.state.selection.main.head;
  return Array.from(
    view.contentDOM.querySelectorAll<HTMLElement>(BLOCK_WIDGETS),
    (element) => {
      const block = view.lineBlockAt(view.posAtDOM(element));
      return { element, lit: head >= block.from && head <= block.to };
    },
  );
};

const writeLit = (widgets: { element: HTMLElement; lit: boolean }[]) => {
  widgets.forEach(({ element, lit }) => {
    if (element.classList.contains(LIT_CLASS) !== lit) {
      element.classList.toggle(LIT_CLASS, lit);
    }
  });
};

export const litBlockWidgets = ViewPlugin.fromClass(
  class {
    readonly measure = { key: this, read: readLit, write: writeLit };

    constructor(view: EditorView) {
      view.requestMeasure(this.measure);
    }

    update(update: ViewUpdate) {
      if (
        update.selectionSet ||
        update.docChanged ||
        update.viewportChanged ||
        update.geometryChanged
      ) {
        update.view.requestMeasure(this.measure);
      }
    }
  },
);
