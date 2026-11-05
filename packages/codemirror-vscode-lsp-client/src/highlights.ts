import { Facet, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";

export const documentHighlights = Facet.define<boolean, boolean>({
  combine: (values) => values.at(-1) ?? true,
});

const DOCUMENT_HIGHLIGHT_CLASS_NAME = "cm-symbol-highlight";

const DOCUMENT_HIGHLIGHT_DELAY = 150;

const highlightMark = Decoration.mark({ class: DOCUMENT_HIGHLIGHT_CLASS_NAME });

const setDocumentHighlights =
  StateEffect.define<{ from: number; to: number }[]>();

const documentHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDocumentHighlights)) {
        return Decoration.set(
          effect.value
            .filter(({ from, to }) => from < to)
            .map(({ from, to }) => highlightMark.range(from, to)),
          true,
        );
      }
    }
    if (tr.docChanged) {
      return Decoration.none;
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function requestDocumentHighlights(plugin: LSPPlugin, pos: number) {
  if (plugin.client.hasCapability("documentHighlightProvider") === false) {
    return Promise.resolve(null);
  }
  plugin.client.sync();
  return plugin.client.request<
    lsp.DocumentHighlightParams,
    lsp.DocumentHighlight[] | null,
    typeof lsp.DocumentHighlightRequest.method
  >("textDocument/documentHighlight", {
    position: plugin.toPosition(pos),
    textDocument: { uri: plugin.uri },
  });
}

const documentHighlightPlugin = ViewPlugin.fromClass(
  class {
    timer = 0;

    request = 0;

    constructor(readonly view: EditorView) {
      this.schedule();
    }

    update(update: ViewUpdate) {
      if (
        update.selectionSet ||
        update.docChanged ||
        update.startState.facet(documentHighlights) !==
          update.state.facet(documentHighlights)
      ) {
        this.schedule();
      }
    }

    schedule() {
      clearTimeout(this.timer);
      this.request++;
      this.timer = window.setTimeout(
        () => this.run(),
        DOCUMENT_HIGHLIGHT_DELAY,
      );
    }

    clear() {
      if (this.view.state.field(documentHighlightField).size > 0) {
        this.view.dispatch({ effects: setDocumentHighlights.of([]) });
      }
    }

    async run() {
      const { state } = this.view;
      const selection = state.selection.main;
      const plugin = LSPPlugin.get(this.view);
      if (!state.facet(documentHighlights) || !selection.empty || !plugin) {
        this.clear();
        return;
      }
      const request = this.request;
      const doc = state.doc;
      let result: lsp.DocumentHighlight[] | null = null;
      try {
        result = await requestDocumentHighlights(plugin, selection.head);
      } catch {
        result = null;
      }
      if (request !== this.request || this.view.state.doc !== doc) {
        return;
      }
      if (!result || result.length < 2) {
        this.clear();
        return;
      }
      this.view.dispatch({
        effects: setDocumentHighlights.of(
          result.map((h) => ({
            from: plugin.fromPosition(h.range.start, doc),
            to: plugin.fromPosition(h.range.end, doc),
          })),
        ),
      });
    }

    destroy() {
      clearTimeout(this.timer);
    }
  },
);

export function serverDocumentHighlights(): LSPClientExtension {
  return {
    clientCapabilities: {
      textDocument: {
        documentHighlight: {},
      },
    },
    editorExtension: [documentHighlightField, documentHighlightPlugin],
  };
}
