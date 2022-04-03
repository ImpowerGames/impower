import { Extension, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { getQuickSnippetTemplate } from "../utils/quickSnippet";
import { SnippetPreviewWidget } from "./SnippetPreviewWidget";

export const setSnippetPreview = StateEffect.define<string>();

export const snippetPreviewField = StateField.define<string>({
  create() {
    return "";
  },
  update(value, tr) {
    tr.effects.forEach((e) => {
      if (e.is(setSnippetPreview)) {
        value = e.value;
      }
    });
    return value;
  },
});

const snippetPreviewDecorations = (view: EditorView): DecorationSet => {
  const widgets = [];
  const snippetType = view?.state.field(snippetPreviewField, false);
  if (snippetType) {
    const { template, from } = getQuickSnippetTemplate(view, snippetType);
    if (template) {
      const endsWithNewline = template.endsWith("\n${}");
      const text = view?.state?.doc?.lineAt(from)?.text;
      const indentMatch = text.match(/^([ \t]*)/);
      const indentText = indentMatch[0] || "";
      const deco = Decoration.widget({
        widget: new SnippetPreviewWidget(template, indentText),
        side: endsWithNewline ? -1 : 0,
      });
      widgets.push(deco.range(from));
    }
  }
  return Decoration.set(widgets);
};

export const snippetPreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = snippetPreviewDecorations(view);
    }

    update(update: ViewUpdate): void {
      this.decorations = snippetPreviewDecorations(update.view);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

export const snippetPreview = (): Extension => {
  return [snippetPreviewField, snippetPreviewPlugin];
};
