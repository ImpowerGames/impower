import {
  Action,
  Diagnostic,
  setDiagnostics,
  setDiagnosticsEffect,
} from "@codemirror/lint";
import {
  ChangeDesc,
  EditorSelection,
  EditorState,
  Extension,
  StateEffect,
  StateField,
  Transaction,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { pullInBackground } from "./backgroundPull";
import { LSPClient, LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";
import { convertToPosition } from "./pos";
import { isWithheldDiagnostic } from "./withheldDiagnostic";

export interface WithheldRange {
  from: number;
  to: number;
}

export const withholdDiagnostic = StateEffect.define<WithheldRange>();

const nextWithheld = (
  value: WithheldRange | null,
  tr: Transaction,
): WithheldRange | null => {
  for (const effect of tr.effects) {
    if (effect.is(withholdDiagnostic)) {
      return effect.value;
    }
  }
  if (!value || tr.changes.touchesRange(value.from, value.to)) {
    return null;
  }
  const from = tr.changes.mapPos(value.from);
  const to = tr.changes.mapPos(value.to);
  const { ranges, main } = tr.newSelection;
  if (ranges.length !== 1 || main.from !== from || main.to !== to) {
    return null;
  }
  return from === value.from && to === value.to ? value : { from, to };
};

export const withheldDiagnosticField = StateField.define<WithheldRange | null>(
  {
    create: () => null,
    update: nextWithheld,
  },
);

const receivedDiagnostics = StateEffect.define<readonly Diagnostic[]>();

const mapReceived = (
  diagnostics: readonly Diagnostic[],
  changes: ChangeDesc,
): readonly Diagnostic[] =>
  changes.empty
    ? diagnostics
    : diagnostics
        .filter(({ from, to }) => !changes.touchesRange(from, to))
        .map((d) => ({
          ...d,
          from: changes.mapPos(d.from),
          to: changes.mapPos(d.to),
        }));

const receivedDiagnosticsField = StateField.define<readonly Diagnostic[]>({
  create: () => [],
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(receivedDiagnostics)) {
        return effect.value;
      }
    }
    return mapReceived(value, tr.changes);
  },
});

const showReleasedDiagnostics = EditorState.transactionExtender.of((tr) => {
  const withheld = tr.startState.field(withheldDiagnosticField, false);
  if (
    !withheld ||
    nextWithheld(withheld, tr) ||
    tr.effects.some((effect) => effect.is(setDiagnosticsEffect))
  ) {
    return null;
  }
  return {
    effects: setDiagnosticsEffect.of(
      mapReceived(tr.startState.field(receivedDiagnosticsField), tr.changes),
    ),
  };
});

const withheldDiagnostics = (): Extension => [
  withheldDiagnosticField,
  receivedDiagnosticsField,
  showReleasedDiagnostics,
];

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

interface ServerDiagnostic extends Omit<lsp.Diagnostic, "message"> {
  message: string | lsp.MarkupContent;
}

const convertServerDiagnostics = (
  plugin: LSPPlugin,
  diagnostics: ServerDiagnostic[],
) =>
  diagnostics
    .map((server) => ({
      server,
      diagnostic: {
        from: plugin.unsyncedChanges.mapPos(
          plugin.fromPosition(server.range.start, plugin.syncedDoc),
        ),
        to: plugin.unsyncedChanges.mapPos(
          plugin.fromPosition(server.range.end, plugin.syncedDoc),
        ),
        severity: convertFromServerSeverity(server.severity ?? 1),
        message:
          typeof server.message === "object" && "value" in server.message
            ? server.message.value
            : server.message,
        actions: convertFromDiagnosticDataToActions(server.data),
        renderMessage: () => {
          return renderDiagnosticMessage(plugin, server.message);
        },
      } satisfies Diagnostic,
    }))
    .filter(
      ({ diagnostic: { from, to } }) => from != null && to != null && from <= to,
    )
    .sort((a, b) => a.diagnostic.from - b.diagnostic.from);

function showServerDiagnostics(
  view: EditorView,
  plugin: LSPPlugin,
  diagnostics: ServerDiagnostic[],
) {
  const { state } = view;
  const converted = convertServerDiagnostics(plugin, diagnostics);
  const received = converted.map(({ diagnostic }) => diagnostic);
  const withheld = state.field(withheldDiagnosticField, false);
  const rangeOf = ({ from, to }: WithheldRange): lsp.Range => ({
    start: convertToPosition(state.doc, from),
    end: convertToPosition(state.doc, to),
  });
  const shown = withheld
    ? converted
        .filter(
          ({ server, diagnostic }) =>
            !isWithheldDiagnostic(
              { ...server, range: rangeOf(diagnostic) },
              rangeOf(withheld),
            ),
        )
        .map(({ diagnostic }) => diagnostic)
    : received;
  view.dispatch(setDiagnostics(state, shown), {
    effects: receivedDiagnostics.of(received),
  });
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
    showServerDiagnostics(view, plugin, result.items);
  }
}

export function serverDiagnostics(): LSPClientExtension {
  return {
    editorExtension: withheldDiagnostics(),
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
        showServerDiagnostics(view, plugin, params.diagnostics);
        return true;
      },
    },
  };
}
