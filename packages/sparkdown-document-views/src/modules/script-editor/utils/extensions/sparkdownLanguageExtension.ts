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
    // Background sync (which drives diagnostics / semantic tokens / codelens /
    // folding refreshes) is debounced via the serverAutoSync already bundled in
    // languageServerExtensions() (500ms default).
    //
    // Do NOT re-add `serverAutoSync({ delay: 0 })` here. At delay 0 the whole
    // document is pushed to the server on every keystroke, and the main thread
    // then deserializes + applies whole-document results (semantic tokens /
    // codelens / diagnostics) each time — profiled at ~2s of main-thread jank
    // per few keystrokes on the ~8k-line project (dominated by
    // WorkerTransport.onmessage). Debouncing defers that flood to when typing
    // pauses. Interactive requests (completion, hover, signature, definition,
    // formatting, rename) call client.sync() themselves before requesting, so
    // they always see up-to-date text regardless of this debounce.
    extensions: [...languageServerExtensions()],
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
