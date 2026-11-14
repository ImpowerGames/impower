import * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/browser";
import { DidLoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/DidLoadEditorMessage";
import { ReadEditorMessage, type ReadEditorResult } from "@impower/spark-editor-protocol/src/protocols/editor/ReadEditorMessage";
import { SelectEditorMessage, type SelectEditorParams } from "@impower/spark-editor-protocol/src/protocols/editor/SelectEditorMessage";
import { DiagnosticsSettledMessage, DidSettleDiagnosticsMessage, type DiagnosticsSettledResult } from "@impower/spark-editor-protocol/src/protocols/textDocument/DiagnosticsSettledMessage";
import { DocumentDiagnosticMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DocumentDiagnosticMessage";
import { HoverMessage, type HoverResult } from "@impower/spark-editor-protocol/src/protocols/textDocument/HoverMessage";
import type { DocumentDiagnosticReport, Position } from "@impower/spark-editor-protocol/src/types";

type Params = {
  textDocument?: { uri?: string };
  position?: Position;
  range?: SelectEditorParams["range"];
  scrollIntoView?: SelectEditorParams["scrollIntoView"];
  takeFocus?: boolean;
};
type Command = {
  id: number;
  method: string;
  params?: Params;
  version?: number;
  notification?: boolean;
};
type Incoming = Command | { cancel: number };
type Outgoing =
  | { id: number; result: ReadEditorResult | DiagnosticsSettledResult | HoverResult | null }
  | { id: number; error: string }
  | { method: string; params: unknown };

const workerEndpoint = ".drive-vscode-editor-protocol";

function position(document: vscode.TextDocument, value?: Position) {
  if (!value || !Number.isSafeInteger(value.line) || !Number.isSafeInteger(value.character) ||
    value.line < 0 || value.character < 0) {
    throw new Error("editor protocol position is invalid");
  }
  const requested = new vscode.Position(value.line, value.character);
  if (!document.validatePosition(requested).isEqual(requested)) {
    throw new Error("editor protocol position is outside the document");
  }
  return requested;
}

const asPosition = (value: vscode.Position): Position => ({ line: value.line, character: value.character });

export function createDriveEditorProtocol(
  clientReady: Promise<LanguageClient>,
  send: (message: Outgoing) => void,
) {
  let epoch = 0;
  let disposed = false;
  const running = new Map<number, vscode.CancellationTokenSource>();

  function didLoad(editor: vscode.TextEditor | undefined) {
    const document = editor?.document;
    send({
      method: DidLoadEditorMessage.method,
      params: document ? { textDocument: { uri: document.uri.toString(), version: document.version } } : null,
    });
  }

  const changes = vscode.window.onDidChangeActiveTextEditor((editor) => {
    epoch++;
    didLoad(editor);
  });

  function active(command: Command) {
    const editor = vscode.window.activeTextEditor;
    const uri = editor?.document.uri.toString();
    if (!editor || (command.params?.textDocument && command.params.textDocument.uri !== uri)) {
      throw new Error("editor protocol active document changed");
    }
    if ((command.method !== ReadEditorMessage.method || command.version != null) &&
      command.version !== editor.document.version) {
      throw new Error("editor protocol active document version changed");
    }
    return editor;
  }

  async function execute(command: Command, cancellation: vscode.CancellationToken) {
    const { method, params } = command;
    if (
      (method === SelectEditorMessage.method) !== (command.notification === true) ||
      (method !== ReadEditorMessage.method && method !== SelectEditorMessage.method &&
        method !== DiagnosticsSettledMessage.method && method !== HoverMessage.method)
    ) {
      throw new Error("unsupported editor protocol method");
    }
    if (method !== ReadEditorMessage.method && typeof params?.textDocument?.uri !== "string") {
      throw new Error("editor protocol requires a document URI");
    }
    const editor = active(command);
    const document = editor.document;
    const uri = document.uri.toString();
    const version = document.version;
    const startedEpoch = epoch;
    function revalidate() {
      if (disposed || cancellation.isCancellationRequested) throw new Error("editor protocol operation cancelled");
      if (epoch !== startedEpoch || vscode.window.activeTextEditor !== editor || document.version !== version) {
        throw new Error("editor protocol active document changed during request");
      }
    }

    if (method === ReadEditorMessage.method) {
      return {
        textDocument: { uri, version, text: document.getText() },
        selection: { start: asPosition(editor.selection.start), end: asPosition(editor.selection.end) },
        coordinates: null,
      } satisfies ReadEditorResult;
    }
    if (method === SelectEditorMessage.method) {
      const start = position(document, params?.range?.start);
      const end = position(document, params?.range?.end);
      const range = new vscode.Range(start, end);
      if (params?.takeFocus) {
        await vscode.window.showTextDocument(document, { viewColumn: editor.viewColumn, preserveFocus: false });
        revalidate();
      }
      editor.selection = new vscode.Selection(start, end);
      const scroll = params?.scrollIntoView;
      if (scroll !== false) {
        const reveal = scroll === "center" ? vscode.TextEditorRevealType.InCenter :
          scroll === "start" ? vscode.TextEditorRevealType.AtTop : vscode.TextEditorRevealType.Default;
        editor.revealRange(range, reveal);
      }
      return null;
    }

    const client = await clientReady;
    revalidate();
    if (!client.isRunning()) throw new Error("Sparkdown language server is not running");
    const textDocument = { uri: client.code2ProtocolConverter.asUri(document.uri) };
    if (method === DiagnosticsSettledMessage.method) {
      const report = await client.sendRequest<DocumentDiagnosticReport>(DocumentDiagnosticMessage.method, { textDocument }, cancellation);
      revalidate();
      if (report.kind !== "full" || report.resultId !== String(version) || !Array.isArray(report.items)) {
        throw new Error(`language server did not return full diagnostics for version ${version}`);
      }
      const result = { uri, version, diagnostics: report.items } satisfies DiagnosticsSettledResult;
      send({ method: DidSettleDiagnosticsMessage.method, params: result });
      return result;
    }
    const hover = await client.sendRequest<HoverResult | null>(
      HoverMessage.method, { textDocument, position: asPosition(position(document, params?.position)) }, cancellation,
    );
    revalidate();
    return hover;
  }

  didLoad(vscode.window.activeTextEditor);
  return {
    async receive(command: Incoming) {
      if (!command || typeof command !== "object" || disposed) return;
      if ("cancel" in command) {
        running.get(command.cancel)?.cancel();
        return;
      }
      if (!Number.isSafeInteger(command.id) || running.has(command.id)) return;
      const token = new vscode.CancellationTokenSource();
      running.set(command.id, token);
      try {
        const result = await execute(command, token.token);
        if (!token.token.isCancellationRequested) send({ id: command.id, result });
      } catch (error) {
        if (!token.token.isCancellationRequested) {
          send({ id: command.id, error: error instanceof Error ? error.message : String(error) });
        }
      } finally {
        token.dispose();
        running.delete(command.id);
      }
    },
    dispose() {
      disposed = true;
      changes.dispose();
      for (const token of running.values()) token.cancel();
    },
  };
}

export async function attachDriveEditorProtocol(context: vscode.ExtensionContext, clientReady: Promise<LanguageClient>) {
  if (context.extensionMode !== vscode.ExtensionMode.Development || context.extensionUri.scheme !== "http") return;
  const extensionUrl = new URL(context.extensionUri.toString(true));
  if (extensionUrl.hostname !== "localhost") return;
  const endpoint = vscode.Uri.joinPath(context.extensionUri, "out", workerEndpoint).toString(true);
  const lifetime = new AbortController();
  const lifetimeSubscription = { dispose: () => lifetime.abort() };
  context.subscriptions.push(lifetimeSubscription);
  const exchange = (body: object) => fetch(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
    credentials: "omit",
    cache: "no-store",
    signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(20_000)]),
  });

  let adapter: ReturnType<typeof createDriveEditorProtocol> | undefined;
  try {
    const hello = await exchange({ hello: true });
    if (!hello.ok) return;
    const { token, generation } = await hello.json() as { token?: string; generation?: number };
    if (typeof token !== "string" || !Number.isSafeInteger(generation)) return;
    const messages: Outgoing[] = [];
    adapter = createDriveEditorProtocol(clientReady, (message) => messages.push(message));
    while (!lifetime.signal.aborted) {
      const response = await exchange({ token, generation, messages: messages.splice(0, 256) });
      if (!response.ok) return;
      const batch = await response.json() as { messages?: Incoming[] };
      if (!Array.isArray(batch.messages)) return;
      for (const command of batch.messages) void adapter.receive(command);
    }
  } catch {
    return;
  } finally {
    adapter?.dispose();
    const index = context.subscriptions.indexOf(lifetimeSubscription);
    if (index >= 0) context.subscriptions.splice(index, 1);
  }
}
