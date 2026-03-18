import { syntaxHighlighting } from "@codemirror/language";
import { Extension, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { vscodeLanguage } from "@impower/codemirror-vscode-language/src";
import {
  contextMenu,
  findReferencesKeymap,
  formatKeymap,
  jumpToDefinitionKeymap,
  LSPClient,
  renameKeymap,
  serverAutoSync,
  serverColorDecorations,
  serverCompletions,
  serverDefinitions,
  serverDiagnostics,
  serverFolding,
  serverFormatting,
  serverHovers,
  serverReferences,
  serverRenaming,
  serverSemanticHighlighting,
  serverSignatureHelp,
  WorkerTransport,
  Workspace,
} from "@impower/codemirror-vscode-lsp-client/src";
import {
  type InitializeParams,
  type InitializeResult,
  type MessageConnection,
} from "vscode-languageserver-protocol";
import CONFIG_DEFINITION from "../../../../../sparkdown/language/sparkdown.language-config.json";
import GRAMMAR_DEFINITION from "../../../../../sparkdown/language/sparkdown.language-grammar.json";
import EDITOR_HIGHLIGHTS from "../constants/EDITOR_HIGHLIGHTS";
import { sparkdownKeymap } from "./sparkdownKeymap";

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
    grammar: GRAMMAR_DEFINITION,
    config: CONFIG_DEFINITION,
  });

  let client = new LSPClient({
    workspace: serverWorkspace,
    extensions: [
      serverCompletions(),
      serverFolding(),
      serverColorDecorations(),
      serverSemanticHighlighting(),
      serverHovers(),
      serverRenaming(),
      serverReferences(),
      serverFormatting(),
      serverDefinitions(),
      serverSignatureHelp(),
      serverDiagnostics(),
      serverAutoSync({ delay: 0 }),
      contextMenu(),
    ],
  }).connect(
    new WorkerTransport(serverWorker, serverConnection),
    serverInitializeParams,
    serverInitializeResult,
  );

  return [
    languageSupport,
    syntaxHighlighting(EDITOR_HIGHLIGHTS),
    client.plugin(textDocument, languageSupport.language.name),
    Prec.highest(keymap.of(sparkdownKeymap)),
    keymap.of([
      ...formatKeymap,
      ...renameKeymap,
      ...jumpToDefinitionKeymap,
      ...findReferencesKeymap,
    ]),
  ];
};
