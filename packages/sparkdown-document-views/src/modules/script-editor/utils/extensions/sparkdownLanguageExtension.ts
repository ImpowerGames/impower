import { syntaxHighlighting } from "@codemirror/language";
import { Extension } from "@codemirror/state";
import { vscodeLanguage } from "@impower/codemirror-vscode-language/src";
import {
  languageServerExtensions,
  LSPClient,
  serverAutoSync,
  WorkerTransport,
  Workspace,
} from "@impower/codemirror-vscode-lsp-client/src";
import { sparkdownGrammarFor } from "@impower/sparkdown/src/compiler/utils/sparkdownGrammarFor";
import {
  SPARKDOWN_EMBEDDED_LANGUAGES,
  SPARKDOWN_LANGUAGE_CONFIGS,
  SPARKDOWN_LANGUAGE_SNIPPETS,
  sparkdownLanguageFor,
} from "@impower/sparkdown/src/compiler/utils/sparkdownLanguageFor";
import {
  type InitializeParams,
  type InitializeResult,
  type MessageConnection,
} from "vscode-languageserver-protocol";
import EDITOR_HIGHLIGHTS from "../../constants/EDITOR_HIGHLIGHTS";
import EDITOR_LSP_ICONS from "../../constants/EDITOR_LSP_ICONS";
import { foldMarkerDOM } from "../../../../cm-fold-marks/foldMarks";

export const sparkdownLanguageExtension = (config: {
  textDocument: { uri: string; version: number };
  serverWorker: Worker;
  serverConnection: MessageConnection;
  serverInitializeParams: InitializeParams;
  serverInitializeResult: InitializeResult;
  serverWorkspace: (client: LSPClient) => Workspace;
}): Extension => {
  const textDocument = config.textDocument;
  const serverWorker = config.serverWorker;
  const serverConnection = config.serverConnection;
  const serverInitializeParams = config.serverInitializeParams;
  const serverInitializeResult = config.serverInitializeResult;
  const serverWorkspace = config.serverWorkspace;

  const languageSupport = vscodeLanguage({
    name: "sparkdown",
    grammar: sparkdownGrammarFor(textDocument.uri),
    language: sparkdownLanguageFor(textDocument.uri),
    configs: SPARKDOWN_LANGUAGE_CONFIGS,
    embeddedLanguages: SPARKDOWN_EMBEDDED_LANGUAGES,
    snippets: SPARKDOWN_LANGUAGE_SNIPPETS,
  });

  let client = new LSPClient({
    workspace: serverWorkspace,
    extensions: [
      ...languageServerExtensions({ folding: { markerDOM: foldMarkerDOM } }),
      serverAutoSync({ delay: 0 }),
    ],
    icons: EDITOR_LSP_ICONS,
  }).connect(
    new WorkerTransport(serverWorker, serverConnection),
    serverInitializeParams,
    serverInitializeResult,
  );

  return [
    languageSupport,
    syntaxHighlighting(EDITOR_HIGHLIGHTS),
    client.plugin(textDocument, languageSupport.language.name),
  ];
};
