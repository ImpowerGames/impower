import { Action, Diagnostic, setDiagnostics } from "@codemirror/lint";
import { Facet } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { pullInBackground } from "./backgroundPull";
import { LSPClient, LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";

export interface DiagnosticFixAction {
  name: string;
  done: string;
  expect?: string;
  kind?: "name" | "note";
  changes: { from: number; to: number; insert: string }[];
}

export interface DiagnosticFix {
  uri: string;
  version: number;
  range: lsp.Range;
  action: DiagnosticFixAction;
}

export type DiagnosticFixHandler = (fix: DiagnosticFix) => void;

export const diagnosticFixHandler = Facet.define<
  DiagnosticFixHandler,
  DiagnosticFixHandler | null
>({
  combine: (values) => values.at(-1) ?? null,
});

export const fixActionsOf = (data: unknown): DiagnosticFixAction[] =>
  Array.isArray(data)
    ? data.filter(
        (action): action is DiagnosticFixAction =>
          typeof action?.name === "string" &&
          typeof action?.done === "string" &&
          Array.isArray(action?.changes) &&
          action.changes.length > 0,
      )
    : [];

export function convertFromDiagnosticDataToActions(
  plugin: LSPPlugin,
  range: lsp.Range,
  data: unknown,
): Action[] {
  const version = plugin.client.workspace.getFile(plugin.uri)?.version;
  return fixActionsOf(data).map((action) => ({
    name: action.name,
    apply: (view: EditorView) => {
      if (version != null) {
        view.state.facet(diagnosticFixHandler)?.({
          uri: plugin.uri,
          version,
          range,
          action,
        });
      }
    },
  }));
}

interface ServerDiagnostic extends Omit<lsp.Diagnostic, "message"> {
  message: string | lsp.MarkupContent;
}

export function convertFromServerDiagnostics(
  plugin: LSPPlugin,
  diagnostics: ServerDiagnostic[],
): Diagnostic[] {
  const result: Diagnostic[] = diagnostics
    .map(
      (d): Diagnostic => ({
        from: plugin.unsyncedChanges.mapPos(
          plugin.fromPosition(d["range"].start, plugin.syncedDoc),
        ),
        to: plugin.unsyncedChanges.mapPos(
          plugin.fromPosition(d["range"].end, plugin.syncedDoc),
        ),
        severity: convertFromServerSeverity(d["severity"] ?? 1),
        message:
          typeof d.message === "object" && "value" in d.message
            ? d.message.value
            : d.message,
        actions: convertFromDiagnosticDataToActions(plugin, d.range, d.data),
        renderMessage: () => {
          return renderDiagnosticMessage(plugin, d.message);
        },
      }),
    )
    .filter(({ from, to }) => from != null && to != null && from <= to)
    .sort((a, b) => a.from - b.from);
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

export async function updateDocumentDiagnostics(
  client: LSPClient,
  uri: string,
) {
  const result = await client.request<
    lsp.DocumentDiagnosticParams,
    lsp.DocumentDiagnosticReport,
    typeof lsp.DocumentDiagnosticRequest.method
  >("textDocument/diagnostic", {
    textDocument: { uri },
  });
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
}

export function serverDiagnostics(): LSPClientExtension {
  return {
    clientCapabilities: {
      textDocument: {
        diagnostic: {
          markupMessageSupport: true,
        } as NonNullable<lsp.ClientCapabilities["textDocument"]>["diagnostic"],
        publishDiagnostics: { versionSupport: true },
      },
    },
    requestHandlers: {
      "workspace/diagnostic/refresh": (client): null => {
        for (const file of client.workspace.files) {
          pullInBackground(client, file.uri, () =>
            updateDocumentDiagnostics(client, file.uri),
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
          updateDocumentDiagnostics(client, params.textDocument.uri),
        );
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
