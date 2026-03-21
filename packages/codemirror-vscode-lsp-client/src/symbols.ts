import {
  highlightingFor,
  language as languageFacet,
} from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
  Text,
  TransactionSpec,
} from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { highlightCode } from "@lezer/highlight";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPClient, LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";
import { escHTML } from "./text";

export const stickyScrollTheme = EditorView.theme({
  ".cm-sticky-headers": {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: "inherit",
    boxShadow: "0 2px 4px rgba(0,0,0,0.7)",
    display: "flex",
    flexDirection: "column",
  },
  ".cm-sticky-header-row": {
    display: "flex",
    backgroundColor: "inherit",
    width: "100%",
  },
  ".cm-sticky-header-row .cm-sticky-header-text.cm-line": {
    paddingLeft: 0,
    whiteSpace: "pre",
    flex: 1,
    pointerEvents: "auto", // Enable clicking
    cursor: "pointer",
  },

  "@media (hover: hover) and (pointer: fine)": {
    ".cm-sticky-header-row .cm-sticky-header-text.cm-line:hover": {
      backgroundColor: "rgba(255, 255, 255, 0.06)",
    },
  },
});

export interface DocumentSymbol extends Omit<
  lsp.DocumentSymbol,
  "range" | "selectionRange" | "children"
> {
  from: number;
  to: number;
  selectionFrom: number;
  selectionTo: number;
  children?: DocumentSymbol[];
}

// Effect triggered when new symbols arrive from the LSP server
export const updateDocumentSymbolsEffect =
  StateEffect.define<DocumentSymbol[]>();

// State field holding the hierarchical symbol tree
export const documentSymbolsField = StateField.define<DocumentSymbol[]>({
  create() {
    return [];
  },
  update(symbols, tr) {
    for (const e of tr.effects) {
      if (e.is(updateDocumentSymbolsEffect)) return e.value;
    }
    return symbols;
  },
});

export function setDocumentSymbols(
  _state: EditorState,
  links: DocumentSymbol[],
): TransactionSpec {
  const effects: StateEffect<unknown>[] = [];
  effects.push(updateDocumentSymbolsEffect.of(links));
  return { effects };
}

export function convertFromServerDocumentSymbols(
  plugin: LSPPlugin,
  symbols: lsp.DocumentSymbol[],
): DocumentSymbol[] {
  return symbols.map((s) => ({
    from: plugin.fromPosition(s.range.start, plugin.syncedDoc),
    to: plugin.fromPosition(s.range.end, plugin.syncedDoc),
    selectionFrom: plugin.fromPosition(
      s.selectionRange.start,
      plugin.syncedDoc,
    ),
    selectionTo: plugin.fromPosition(s.selectionRange.end, plugin.syncedDoc),
    name: s.name,
    detail: s.detail,
    kind: s.kind,
    tags: s.tags,
    deprecated: s.deprecated,
    children: s.children
      ? convertFromServerDocumentSymbols(plugin, s.children)
      : undefined,
  }));
}

export async function updateDocumentSymbols(client: LSPClient, uri: string) {
  let file = client.workspace.getFile(uri);
  if (!file) return;
  const view = file.getView();
  if (!view) return;
  const plugin = LSPPlugin.get(view);
  if (!plugin) return;
  const result = await plugin.client.request<
    lsp.DocumentSymbolParams,
    lsp.DocumentSymbol[] | null,
    typeof lsp.DocumentSymbolRequest.method
  >("textDocument/documentSymbol", {
    textDocument: { uri: plugin.uri },
  });
  if (result) {
    view.dispatch(
      setDocumentSymbols(
        view.state,
        convertFromServerDocumentSymbols(plugin, result),
      ),
    );
  }
}

export const stickyScrollPlugin = ViewPlugin.fromClass(
  class {
    dom: HTMLElement;
    view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      this.dom = document.createElement("div");
      this.dom.className = "cm-sticky-headers";
      this.view.dom.appendChild(this.dom);

      // Listen to native scroll events to handle pixel-perfect removal
      this.view.scrollDOM.addEventListener("scroll", this.onScroll);
    }

    onScroll = () => {
      this.scheduleUpdate();
    };

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.geometryChanged) {
        this.scheduleUpdate();
      }
    }

    scheduleUpdate() {
      this.view.requestMeasure({
        read: (view) => {
          const symbols = view.state.field(documentSymbolsField, false);
          if (!symbols || symbols.length === 0) return null;

          const topPos = view.posAtCoords(
            {
              x: view.scrollDOM.getBoundingClientRect().left + 50,
              y: view.scrollDOM.getBoundingClientRect().top + 1,
            },
            false,
          );

          if (topPos === null) return null;

          const activeSymbols = this.getActiveSymbols(
            symbols,
            topPos,
            view.state.doc,
          );

          const stickySymbols = activeSymbols.filter((sym) => {
            const line = view.state.doc.lineAt(sym.from);
            const lineCoords = view.coordsAtPos(line.from);
            const scrollRect = view.scrollDOM.getBoundingClientRect();

            return lineCoords && lineCoords.top <= scrollRect.top + 1;
          });

          const gutter = view.scrollDOM.querySelector(
            ".cm-gutter.cm-lineNumbers",
          );
          const lineNumbersGutterWidth = gutter
            ? (gutter as HTMLElement).clientWidth
            : 0;
          const contentDOM = view.contentDOM;
          const contentOffsetLeft = contentDOM.offsetLeft;

          return {
            stickySymbols,
            doc: view.state.doc,
            lineNumbersGutterWidth,
            contentOffsetLeft,
          };
        },
        write: (data) => {
          if (!data || data.stickySymbols.length === 0) {
            this.dom.style.display = "none";
            this.dom.innerHTML = "";
            return;
          }

          this.dom.style.display = "block";
          this.renderHeaders(
            data.stickySymbols,
            data.doc,
            data.contentOffsetLeft,
            data.lineNumbersGutterWidth,
          );
        },
      });
    }

    renderCode(code: string) {
      const plugin = LSPPlugin.get(this.view);
      let lang = this.view.state.facet(languageFacet);
      if (!lang || !plugin) return escHTML(code);
      let result = "";
      highlightCode(
        code,
        lang.parser.parse(code),
        { style: (tags) => highlightingFor(this.view.state, tags) },
        (text, cls) => {
          result += cls
            ? `<span class="${cls}">${escHTML(text)}</span>`
            : escHTML(text);
        },
        () => {
          result += "<br>";
        },
      );
      return result;
    }

    renderHeaders(
      stickySymbols: DocumentSymbol[],
      doc: Text,
      contentOffsetLeft: number,
      lineNumbersGutterWidth: number,
    ) {
      this.dom.innerHTML = "";
      for (const sym of stickySymbols) {
        const line = doc.lineAt(sym.from);

        const row = this.dom.appendChild(document.createElement("div"));
        row.className = "cm-sticky-header-row";

        // Gutters Container
        const guttersEl = row.appendChild(document.createElement("div"));
        guttersEl.className = "cm-gutters";
        guttersEl.style.width = `${contentOffsetLeft}px`;

        // Gutter For Line Numbers
        const lineNumbersGutterEl = guttersEl.appendChild(
          document.createElement("div"),
        );
        lineNumbersGutterEl.className = "cm-gutter cm-lineNumbers";
        lineNumbersGutterEl.style.width = `${lineNumbersGutterWidth}px`;

        // Gutter Line Number
        const lineNumberEl = lineNumbersGutterEl.appendChild(
          document.createElement("div"),
        );
        lineNumberEl.className = "cm-gutterElement";
        lineNumberEl.textContent = line.number.toString();

        // Code
        const textEl = row.appendChild(document.createElement("div"));
        textEl.className = "cm-sticky-header-text cm-line";
        textEl.innerHTML = this.renderCode(line.text);
        // Navigation Click Handler
        textEl.onclick = (e) => {
          e.preventDefault();
          const stickyHeight = this.dom.offsetHeight;
          this.view.dispatch({
            selection: EditorSelection.cursor(sym.selectionFrom),
            scrollIntoView: true,
            effects: EditorView.scrollIntoView(sym.selectionFrom, {
              y: "start",
              yMargin: stickyHeight,
            }),
          });
          this.view.focus();
        };
      }
    }

    getActiveSymbols(
      symbols: DocumentSymbol[],
      offset: number,
      doc: Text,
      active: DocumentSymbol[] = [],
    ): DocumentSymbol[] {
      for (const sym of symbols) {
        if (offset >= sym.from && offset <= sym.to) {
          active.push(sym);
          if (sym.children) {
            this.getActiveSymbols(sym.children, offset, doc, active);
          }
          break;
        }
      }
      return active;
    }

    destroy() {
      this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
      this.dom.remove();
    }
  },
);

export function serverDocumentSymbols(): LSPClientExtension {
  return {
    clientCapabilities: {
      textDocument: {
        documentSymbol: {
          hierarchicalDocumentSymbolSupport: true,
        },
      },
    },
    notificationListeners: {
      "textDocument/didOpen": (
        client,
        params: lsp.DidOpenTextDocumentParams,
      ) => {
        updateDocumentSymbols(client, params.textDocument.uri);
      },
      "textDocument/didChange": (
        client,
        params: lsp.DidChangeTextDocumentParams,
      ) => {
        updateDocumentSymbols(client, params.textDocument.uri);
      },
      "textDocument/publishDiagnostics": (
        client,
        params: lsp.PublishDiagnosticsParams,
      ) => {
        updateDocumentSymbols(client, params.uri);
      },
    },
    editorExtension: [
      documentSymbolsField,
      stickyScrollPlugin,
      stickyScrollTheme,
    ],
  };
}
