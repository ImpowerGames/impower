import { syntaxHighlighting } from "@codemirror/language";
import { Extension, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { vscodeLanguage } from "@impower/codemirror-vscode-language/src";
import {
  findReferencesKeymap,
  formatDocument,
  formatKeymap,
  jumpToDefinitionKeymap,
  languageServerExtensions,
  LSPClient,
  renameKeymap,
  serverAutoSync,
  WorkerTransport,
  Workspace,
} from "@impower/codemirror-vscode-lsp-client/src";
import CONFIG_DEFINITION from "@impower/sparkdown/language/sparkdown.language-config.json";
import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import {
  type InitializeParams,
  type InitializeResult,
  type MessageConnection,
} from "vscode-languageserver-protocol";
import EDITOR_HIGHLIGHTS from "../../constants/EDITOR_HIGHLIGHTS";

const sparkdownKeymap = [
  {
    key: "PageUp",
    run: () => true, // Used by preview
  },
  {
    key: "PageDown",
    run: () => true, // Used by preview
  },
  { key: "Mod-s", run: formatDocument, preventDefault: true },
] as const;

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
    extensions: [...languageServerExtensions(), serverAutoSync({ delay: 0 })],
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
