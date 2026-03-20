import {
  codeFolding,
  foldGutter,
  foldKeymap,
  foldService,
} from "@codemirror/language";
import {
  EditorState,
  StateEffect,
  StateField,
  TransactionSpec,
} from "@codemirror/state";
import { EditorView, ViewUpdate, keymap } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPClient, LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";

const CHEVRON_SVG_URL = `url('data:image/svg+xml;utf8,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="black"><path d="M7.97612 10.0719L12.3334 5.7146L12.9521 6.33332L8.28548 11L7.66676 11L3.0001 6.33332L3.61882 5.7146L7.97612 10.0719Z"/></svg>')`;

const foldingTheme = EditorView.baseTheme({
  "&light.cm-editor": {
    "--fold-open-color": "#000000",
    "--fold-closed-color": "#000000",
  },

  "&dark.cm-editor": {
    "--fold-open-color": "#ffffff",
    "--fold-closed-color": "#ffffff",
  },
  "& .cm-foldGutter": {
    width: "16px",
    alignItems: "flex-end",
  },
  "& .cm-foldGutter .cm-fold-arrow": {
    position: "relative",
    width: "1em",
    height: "1em",
    display: "inline-block",
    backgroundColor: "currentColor",
    maskImage: CHEVRON_SVG_URL,
    webkitMaskImage: CHEVRON_SVG_URL,
    maskRepeat: "no-repeat",
    webkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    webkitMaskPosition: "center",
  },
  "& .cm-foldGutter .cm-fold-open": {
    color: "var(--fold-open-color)",
    opacity: "0.5",
  },
  "& .cm-foldGutter .cm-fold-closed": {
    color: "var(--fold-closed-color)",
    opacity: "1",
    transform: "rotate(-90deg)",
  },
});

export interface DocumentFoldingRange {
  kind?: string;
  from: number;
  to: number;
  collapsedText?: string;
}

const setFoldingRanges = StateEffect.define<DocumentFoldingRange[]>();

export function foldingPlaceholderDOM(
  view: EditorView,
  onclick: (this: GlobalEventHandlers, ev: PointerEvent) => any,
  prepared: boolean,
) {
  const ranges = view.state.field(foldingRangeField);
  // prepared is usually the placeholder text if default logic is used
  // but we fetch our specific match from state
  const match =
    ranges.find((r) => {
      try {
        // We find the range that corresponds to the visible fold location
        return (
          r.from ===
          view.posAtDOM(
            view.contentDOM.querySelector(".cm-foldPlaceholder")
              ?.parentElement || view.contentDOM,
          )
        );
      } catch {
        return false;
      }
    }) ||
    ranges.find(
      (r) =>
        view.state.doc.lineAt(r.from).from ===
        view.state.doc.lineAt(view.posAtDOM(view.contentDOM)).from,
    );

  const dom = document.createElement("span");
  dom.textContent = match?.collapsedText || "⋯";
  dom.className = "cm-foldPlaceholder";
  dom.onclick = onclick;
  return dom;
}

export function foldingMarkerDOM(open: boolean) {
  const dom = document.createElement("span");
  dom.className = "cm-fold-arrow";
  if (open) {
    dom.classList.add("cm-fold-open");
  } else {
    dom.classList.add("cm-fold-closed");
  }
  return dom;
}

export function foldingChanged(update: ViewUpdate): boolean {
  return update.transactions.some((t) =>
    t.effects.some((e) => e.is(setFoldingRanges)),
  );
}

export function setDocumentFoldingRanges(
  state: EditorState,
  foldables: DocumentFoldingRange[],
): TransactionSpec {
  const effects: StateEffect<unknown>[] = [];
  effects.push(setFoldingRanges.of(foldables));
  return { effects };
}

const foldingRangeField = StateField.define<DocumentFoldingRange[]>({
  create() {
    return [];
  },
  update(ranges, tr) {
    for (let e of tr.effects) {
      if (e.is(setFoldingRanges)) return e.value;
    }

    if (tr.docChanged) {
      return ranges.map((range) => ({
        ...range,
        from: tr.changes.mapPos(range.from),
        to: tr.changes.mapPos(range.to),
      }));
    }

    return ranges;
  },
});

const foldingRangesService = foldService.of((state, from, to) => {
  const ranges = state.field(foldingRangeField);
  const line = state.doc.lineAt(from);

  for (const range of ranges) {
    // Check if this range starts on the line currently being queried by the gutter
    const rangeStartLine = state.doc.lineAt(range.from);
    if (rangeStartLine.number === line.number) {
      return { from: range.from, to: range.to };
    }
  }
  return null;
});

export function convertFromServerFoldingRanges(
  plugin: LSPPlugin,
  ranges: lsp.FoldingRange[],
): DocumentFoldingRange[] {
  const result: DocumentFoldingRange[] = ranges.map(
    (r): DocumentFoldingRange => {
      // 1. Get the raw document positions from LSP line/char
      const rawFrom = plugin.fromPosition(
        { line: r.startLine, character: r.startCharacter ?? 0 },
        plugin.syncedDoc,
      );
      const rawTo = plugin.fromPosition(
        { line: r.endLine, character: r.endCharacter ?? 0 },
        plugin.syncedDoc,
      );

      // 2. Adjust for CodeMirror's folding expectations:
      // CodeMirror folding ranges should start at the END of the first line
      // so that the first line remains visible while the rest is collapsed.
      const startLine = plugin.syncedDoc.lineAt(rawFrom);
      const endLine = plugin.syncedDoc.lineAt(rawTo);

      // Use the end of the start line as the 'from' and end of the final line as 'to'
      const adjustedFrom = startLine.to;
      const adjustedTo = endLine.to;

      return {
        kind: r.kind,
        from: adjustedFrom,
        to: adjustedTo,
        collapsedText: r.collapsedText,
      };
    },
  );

  return result
    .filter(({ from, to }) => from != null && to != null && from < to)
    .sort((a, b) => a.from - b.from);
}

export async function updateDocumentFoldingRanges(
  client: LSPClient,
  uri: string,
) {
  let file = client.workspace.getFile(uri);
  if (!file) return;
  const view = file.getView();
  if (!view) return;
  const plugin = LSPPlugin.get(view);
  if (!plugin) return;
  const result = await plugin.client.request<
    lsp.FoldingRangeParams,
    lsp.FoldingRange[] | null,
    typeof lsp.FoldingRangeRequest.method
  >("textDocument/foldingRange", {
    textDocument: { uri },
  });
  const foldables = convertFromServerFoldingRanges(plugin, result);
  view.dispatch(setDocumentFoldingRanges(view.state, foldables));
}

export function serverFolding(): LSPClientExtension {
  return {
    clientCapabilities: {
      textDocument: {
        foldingRange: {
          foldingRange: {
            collapsedText: true,
          },
        },
      },
    },
    requestHandlers: {
      "workspace/foldingRange/refresh": (client): null => {
        for (const file of client.workspace.files) {
          updateDocumentFoldingRanges(client, file.uri);
        }
        return null;
      },
    },
    notificationListeners: {
      "textDocument/didOpen": (
        client,
        params: lsp.DidOpenTextDocumentParams,
      ) => {
        updateDocumentFoldingRanges(client, params.textDocument.uri);
      },
      "textDocument/didChange": (
        client,
        params: lsp.DidChangeTextDocumentParams,
      ) => {
        updateDocumentFoldingRanges(client, params.textDocument.uri);
      },
      "textDocument/publishDiagnostics": (
        client,
        params: lsp.PublishDiagnosticsParams,
      ) => {
        updateDocumentFoldingRanges(client, params.uri);
      },
    },
    editorExtension: [
      foldingTheme,
      foldingRangeField,
      foldingRangesService,
      codeFolding({
        placeholderText: "⋯",
        placeholderDOM: foldingPlaceholderDOM,
      }),
      foldGutter({
        markerDOM: foldingMarkerDOM,
        foldingChanged,
      }),
      keymap.of([...foldKeymap]),
    ],
  };
}
