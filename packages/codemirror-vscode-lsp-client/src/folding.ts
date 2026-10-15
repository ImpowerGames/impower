import {
  codeFolding,
  foldGutter,
  foldKeymap,
  foldService,
} from "@codemirror/language";
import {
  ChangeDesc,
  EditorState,
  StateEffect,
  StateField,
  TransactionSpec,
} from "@codemirror/state";
import { EditorView, ViewUpdate, keymap } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { pullInBackground } from "./backgroundPull";
import { LSPClient, LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";
import { coalesceRequest } from "./requestCoalescer";

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
  _prepared: boolean,
) {
  const { ranges } = view.state.field(foldingRangeField);
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
  _state: EditorState,
  foldables: DocumentFoldingRange[],
): TransactionSpec {
  const effects: StateEffect<unknown>[] = [];
  effects.push(setFoldingRanges.of(foldables));
  return { effects };
}

interface FoldingRangeSet {
  /** Sorted by `from`; mapping through a change keeps that order, so the
   * per-line foldService query is a binary search and an edit only maps the
   * ranges instead of re-indexing them by line (#1815). */
  ranges: DocumentFoldingRange[];
}

const sortFoldingRanges = (
  ranges: DocumentFoldingRange[],
): DocumentFoldingRange[] => {
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i]!.from < ranges[i - 1]!.from) {
      return [...ranges].sort((a, b) => a.from - b.from);
    }
  }
  return ranges;
};

/** Maps folds through an edit, dropping any the edit erased: a fold whose
 * whole range was deleted maps to an empty range, which would otherwise be
 * the first range on its line and shadow the fold that now starts there. */
const mapFoldingRanges = (
  ranges: readonly DocumentFoldingRange[],
  changes: ChangeDesc,
): DocumentFoldingRange[] => {
  const mapped: DocumentFoldingRange[] = [];
  for (const range of ranges) {
    const from = changes.mapPos(range.from);
    const to = changes.mapPos(range.to);
    if (from < to) mapped.push({ ...range, from, to });
  }
  return mapped;
};

/** The first range (in order) whose `from` lies in `[lineFrom, lineTo]`. */
const findFoldingRange = (
  ranges: readonly DocumentFoldingRange[],
  lineFrom: number,
  lineTo: number,
): DocumentFoldingRange | null => {
  let lo = 0;
  let hi = ranges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ranges[mid]!.from < lineFrom) lo = mid + 1;
    else hi = mid;
  }
  const range = ranges[lo];
  return range && range.from <= lineTo ? range : null;
};

const foldingRangeField = StateField.define<FoldingRangeSet>({
  create() {
    return { ranges: [] };
  },
  update(value, tr) {
    for (let e of tr.effects) {
      if (e.is(setFoldingRanges)) return { ranges: sortFoldingRanges(e.value) };
    }

    if (tr.docChanged && value.ranges.length > 0) {
      return { ranges: mapFoldingRanges(value.ranges, tr.changes) };
    }

    return value;
  },
});

const foldingRangesService = foldService.of((state, lineStart, lineEnd) => {
  const { ranges } = state.field(foldingRangeField);
  const range = findFoldingRange(ranges, lineStart, lineEnd);
  if (range) {
    return { from: range.from, to: range.to };
  }
  return null;
});

/** Whether `next` holds the same folds, in the same order, as `prev`. */
const sameFoldingRanges = (
  prev: readonly DocumentFoldingRange[],
  next: readonly DocumentFoldingRange[],
): boolean => {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i]!;
    const b = next[i]!;
    if (
      a.from !== b.from ||
      a.to !== b.to ||
      a.kind !== b.kind ||
      a.collapsedText !== b.collapsedText
    ) {
      return false;
    }
  }
  return true;
};

/** The folding ranges the editor currently holds. */
const documentFoldingRanges = (
  state: EditorState,
): readonly DocumentFoldingRange[] =>
  state.field(foldingRangeField, false)?.ranges ?? [];

export function convertFromServerFoldingRanges(
  plugin: LSPPlugin,
  ranges: lsp.FoldingRange[],
): DocumentFoldingRange[] {
  const doc = plugin.syncedDoc;
  // An LSP line out of the document's bounds clamps to the nearest line, as
  // `convertFromPosition` does.
  const lineEnd = (line: number) =>
    doc.line(Math.min(Math.max(line + 1, 1), doc.lines)).to;
  const result: DocumentFoldingRange[] = [];
  for (const r of ranges) {
    // CodeMirror folding ranges start at the END of the first line, so the
    // first line stays visible while the rest is collapsed, and end at the end
    // of the final line. Only the lines matter, so the characters are not
    // converted.
    const from = lineEnd(r.startLine);
    const to = lineEnd(r.endLine);
    if (from < to) {
      result.push({
        kind: r.kind,
        from,
        to,
        collapsedText: r.collapsedText,
      });
    }
  }
  return sortFoldingRanges(result);
}

export async function updateDocumentFoldingRanges(
  client: LSPClient,
  uri: string,
) {
  return coalesceRequest(client, `foldingRange:${uri}`, async () => {
    let file = client.workspace.getFile(uri);
    if (!file) return;
    const view = file.getView();
    if (!view) return;
    const plugin = LSPPlugin.get(view);
    if (!plugin) return;
    const version = file.version;
    const result = await plugin.client.request<
      lsp.FoldingRangeParams,
      lsp.FoldingRange[] | null,
      typeof lsp.FoldingRangeRequest.method
    >("textDocument/foldingRange", {
      textDocument: { uri },
    });
    // A result for a version the editor has already moved past is dropped:
    // its lines would be read against the newer synced document. The change
    // that moved the version past it asked for folding ranges again, and the
    // coalescer runs that pull once this one settles.
    if (client.workspace.getFile(uri)?.version !== version) return;
    if (LSPPlugin.get(view) !== plugin) return;
    let foldables = convertFromServerFoldingRanges(plugin, result ?? []);
    const unsynced = plugin.unsyncedChanges;
    if (!unsynced.empty) {
      // Edits made since the last sync: carry the folds into the editor's
      // document, as diagnostics are.
      foldables = mapFoldingRanges(foldables, unsynced);
    }
    // Most pulls while typing return the folds the editor already holds,
    // mapped through the edit; dispatching those again would only redraw.
    if (sameFoldingRanges(documentFoldingRanges(view.state), foldables)) return;
    view.dispatch(setDocumentFoldingRanges(view.state, foldables));
  });
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
          pullInBackground(client, file.uri, () =>
            updateDocumentFoldingRanges(client, file.uri),
          );
        }
        return null;
      },
    },
    notificationListeners: {
      "textDocument/didOpen": (
        client,
        params: lsp.DidOpenTextDocumentParams,
      ) => {
        pullInBackground(client, params.textDocument.uri, () =>
          updateDocumentFoldingRanges(client, params.textDocument.uri),
        );
      },
      "textDocument/didChange": (
        client,
        params: lsp.DidChangeTextDocumentParams,
      ) => {
        pullInBackground(client, params.textDocument.uri, () =>
          updateDocumentFoldingRanges(client, params.textDocument.uri),
        );
      },
      "textDocument/publishDiagnostics": (
        client,
        params: lsp.PublishDiagnosticsParams,
      ) => {
        pullInBackground(client, params.uri, () =>
          updateDocumentFoldingRanges(client, params.uri),
        );
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
