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
  Transaction,
  TransactionSpec,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewUpdate,
  keymap,
} from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPClient, LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";

const foldingTheme = EditorView.baseTheme({
  "&light.cm-editor": {
    "--fold-open-color": "#000000",
    "--fold-closed-color": "#000000",
  },

  "&dark.cm-editor": {
    "--fold-open-color": "#cccccc",
    "--fold-closed-color": "#cccccc",
  },
  "& .cm-foldGutter": {
    width: "16px",
  },
  "& .cm-foldGutter .cm-gutterElement .cm-fold-arrow": {
    fontSize: "0.9em",
    position: "relative",
    top: "-1px",
    textAlign: "center",
  },
  "& .cm-foldGutter .cm-gutterElement .cm-fold-open": {
    color: "var(--fold-open-color)",
    opacity: "0.5",
  },
  "& .cm-foldGutter .cm-gutterElement .cm-fold-closed": {
    color: "var(--fold-closed-color)",
    opacity: "1",
    transform: "translateX(-2px) rotate(-90deg)",
  },
});

const foldableMark = Decoration.mark({ class: "cm-foldable" });

export interface Foldable {
  kind?: string;
  from: number;
  to: number;
}

const updateFoldablesEffect = StateEffect.define<Foldable[]>({
  map: (value, change) =>
    value.map((r) => ({
      kind: r.kind,
      from: change.mapPos(r.from),
      to: change.mapPos(r.to),
    })),
});

export function convertFromFoldingRanges(
  plugin: LSPPlugin,
  ranges: lsp.FoldingRange[],
): Foldable[] {
  const result: Foldable[] = ranges.map(
    (f): Foldable => ({
      kind: f.kind,
      from: plugin.unsyncedChanges.mapPos(
        plugin.fromPosition(
          { line: f.startLine, character: f.startCharacter ?? 0 },
          plugin.syncedDoc,
        ),
      ),
      to: plugin.unsyncedChanges.mapPos(
        plugin.fromPosition(
          { line: f.endLine, character: f.endCharacter ?? 0 },
          plugin.syncedDoc,
        ),
      ),
    }),
  );
  return result
    .filter(({ from, to }) => from != null && to != null && from < to)
    .sort((a, b) => {
      switch (true) {
        case a.from < b.from:
          return -1;
        case a.from > b.from:
          return 1;
      }
      return 0;
    });
}

export function setFoldables(
  state: EditorState,
  foldables: Foldable[],
): TransactionSpec {
  const effects: StateEffect<unknown>[] = [];
  effects.push(updateFoldablesEffect.of(foldables));
  return { effects };
}

const foldableDecorationsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations: DecorationSet, tr: Transaction) {
    for (let e of tr.effects) {
      if (e.is(updateFoldablesEffect)) {
        decorations = Decoration.set(
          e.value.map((r) => foldableMark.range(r.from, r.to)),
        );
        return decorations;
      }
    }
    decorations = decorations.map(tr.changes);
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const foldingRangesService = foldService.of((state, from, to) => {
  const ranges = state.field(foldableDecorationsField, false);
  if (!ranges) {
    return null;
  }
  let result = null;
  const line = state.doc.lineAt(from).number;
  ranges.between(from, to, (f, t) => {
    const startLine = state.doc.lineAt(f).number;
    if (line === startLine) {
      result = { from: to, to: t };
      return false;
    }
    return undefined;
  });
  return result;
});

export function serverFolding(): LSPClientExtension {
  const updateDocumentFolding = (client: LSPClient, uri: string) => {
    let file = client.workspace.getFile(uri);
    if (!file) {
      return;
    }
    const view = file.getView();
    if (!view) {
      return;
    }
    const plugin = LSPPlugin.get(view);
    if (!plugin) {
      return;
    }
    plugin.client
      .request<
        lsp.FoldingRangeParams,
        lsp.FoldingRange[] | null,
        typeof lsp.FoldingRangeRequest.method
      >("textDocument/foldingRange", {
        textDocument: { uri },
      })
      .then((result) => {
        const foldables = convertFromFoldingRanges(plugin, result);
        view.dispatch(setFoldables(view.state, foldables));
      });
  };

  return {
    clientCapabilities: {
      textDocument: {
        foldingRange: {},
      },
    },
    requestHandlers: {
      "workspace/foldingRange/refresh": (client): null => {
        for (const file of client.workspace.files) {
          updateDocumentFolding(client, file.uri);
        }
        return null;
      },
    },
    notificationListeners: {
      "textDocument/didOpen": (
        client,
        params: lsp.DidOpenTextDocumentParams,
      ) => {
        updateDocumentFolding(client, params.textDocument.uri);
      },
    },
    editorExtension: [
      foldingTheme,
      foldableDecorationsField,
      foldingRangesService,
      codeFolding({ placeholderText: "⋯" }),
      foldGutter({
        markerDOM: (open: boolean) => {
          const dom = document.createElement("span");
          dom.className = "cm-fold-arrow";
          dom.textContent = "⌵";
          if (open) {
            dom.classList.add("cm-fold-open");
            dom.classList.remove("cm-fold-closed");
          } else {
            dom.classList.add("cm-fold-closed");
            dom.classList.remove("cm-fold-open");
          }
          return dom;
        },
        foldingChanged: (update: ViewUpdate): boolean => {
          return update.transactions.some((t) =>
            t.effects.some((e) => e.is(updateFoldablesEffect)),
          );
        },
      }),
      keymap.of([...foldKeymap]),
    ],
  };
}
