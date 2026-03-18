import { Action, Diagnostic, setDiagnostics } from "@codemirror/lint";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPClient, LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";

export function convertFromDiagnosticDataToActions(
  data: {
    name: string;
    focus?: { from: number; to: number };
    changes?: { from: number; to?: number; insert?: string }[];
  }[],
): Action[] {
  const actions: Action[] = [];
  if (!data) {
    return actions;
  }
  data.forEach((a) => {
    actions.push({
      name: a.name,
      apply: (view: EditorView) => {
        const doc = view.state.doc.toString();
        if (a.focus) {
          view.dispatch({
            selection: {
              anchor: Math.min(doc.length, Math.max(0, a.focus.from)),
              head: Math.min(doc.length, a.focus.to),
            },
            effects: EditorView.scrollIntoView(
              EditorSelection.range(
                Math.min(doc.length, Math.max(0, a.focus.from)),
                Math.min(doc.length, a.focus.to),
              ),
              { y: "center" },
            ),
          });
          view.focus();
        }
        if (a.changes && a.changes.length > 0) {
          const lastChange = a.changes[a.changes.length - 1]!;
          const cursor =
            lastChange.insert != null
              ? lastChange.from + lastChange.insert.length
              : lastChange.from;
          view.dispatch({
            changes: a.changes,
            selection: { anchor: cursor, head: cursor },
          });
        }
      },
    });
  });
  return actions;
}

export function convertFromServerDiagnostics(
  plugin: LSPPlugin,
  diagnostics: lsp.Diagnostic[],
): Diagnostic[] {
  const result: Diagnostic[] = diagnostics
    .map(
      (d): Diagnostic => ({
        from: plugin.unsyncedChanges.mapPos(
          plugin.fromPosition(d.range.start, plugin.syncedDoc),
        ),
        to: plugin.unsyncedChanges.mapPos(
          plugin.fromPosition(d.range.end, plugin.syncedDoc),
        ),
        severity: convertFromServerSeverity(d.severity ?? 1),
        message: d.message,
        actions: convertFromDiagnosticDataToActions(d.data),
        renderMessage: () => {
          return renderDiagnosticMessage(plugin, d.message);
        },
      }),
    )
    .filter(({ from, to }) => from != null && to != null && from <= to)
    .sort((a, b) => {
      switch (true) {
        case a.from < b.from:
          return -1;
        case a.from > b.from:
          return 1;
      }
      return 0;
    });
  return result;
}

export function convertFromServerSeverity(sev: lsp.DiagnosticSeverity) {
  return sev == 1 ? "error" : sev == 2 ? "warning" : sev == 3 ? "info" : "hint";
}

export function renderDiagnosticMessage(
  plugin: LSPPlugin,
  doc: string | lsp.MarkupContent,
) {
  let elt = document.createElement("div");
  elt.className = "cm-lsp-documentation cm-lsp-diagnostic-documentation";
  elt.innerHTML = plugin.docToHTML(doc);
  return elt;
}

export function serverDiagnostics(): LSPClientExtension {
  const updateDocumentDiagnostics = (client: LSPClient, uri: string) => {
    client
      .request<
        lsp.DocumentDiagnosticParams,
        lsp.DocumentDiagnosticReport,
        typeof lsp.DocumentDiagnosticRequest.method
      >("textDocument/diagnostic", {
        textDocument: { uri },
      })
      .then((result) => {
        if (result.kind === "full") {
          let file = client.workspace.getFile(uri);
          if (
            !file ||
            (result.resultId != null && result.resultId != `${file.version}`)
          ) {
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
          view.dispatch(
            setDiagnostics(
              view.state,
              convertFromServerDiagnostics(plugin, result.items),
            ),
          );
        }
      });
  };

  return {
    clientCapabilities: {
      textDocument: {
        diagnostic: {
          markupMessageSupport: true,
        } as lsp.ClientCapabilities["textDocument"]["diagnostic"],
        publishDiagnostics: { versionSupport: true },
      },
    },
    requestHandlers: {
      "workspace/diagnostic/refresh": (client): null => {
        for (const file of client.workspace.files) {
          updateDocumentDiagnostics(client, file.uri);
        }
        return null;
      },
    },
    notificationListeners: {
      "textDocument/didOpen": (
        client,
        params: lsp.DidOpenTextDocumentParams,
      ) => {
        updateDocumentDiagnostics(client, params.textDocument.uri);
      },
      "textDocument/publishDiagnostics": (
        client,
        params: lsp.PublishDiagnosticsParams,
      ): boolean => {
        let file = client.workspace.getFile(params.uri);
        if (
          !file ||
          (params.version != null && params.version != file.version)
        ) {
          return false;
        }
        const view = file.getView();
        if (!view) {
          return false;
        }
        const plugin = LSPPlugin.get(view);
        if (!plugin) {
          return false;
        }
        view.dispatch(
          setDiagnostics(
            view.state,
            convertFromServerDiagnostics(plugin, params.diagnostics),
          ),
        );
        return true;
      },
    },
  };
}
