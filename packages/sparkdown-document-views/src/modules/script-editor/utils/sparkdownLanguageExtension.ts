import { syntaxHighlighting } from "@codemirror/language";
import { Extension, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { vscodeLanguage } from "@impower/codemirror-vscode-language/src";
import {
  MessageConnection,
  ServerCapabilities,
} from "@impower/spark-editor-protocol/src/types";
import CONFIG_DEFINITION from "../../../../../sparkdown/language/sparkdown.language-config.json";
import GRAMMAR_DEFINITION from "../../../../../sparkdown/language/sparkdown.language-grammar.json";
import { languageClient } from "../../../cm-language-client";
import { FileSystemReader } from "../../../cm-language-client/types/FileSystemReader";
import EDITOR_HIGHLIGHTS from "../constants/EDITOR_HIGHLIGHTS";
import { sparkdownKeymap } from "./sparkdownKeymap";

export const sparkdownLanguageExtension = (config: {
  textDocument: { uri: string; version: number };
  serverConnection: MessageConnection;
  serverCapabilities: ServerCapabilities;
  fileSystemReader?: FileSystemReader;
}): Extension => {
  const languageSupport = vscodeLanguage({
    name: "sparkdown",
    grammar: GRAMMAR_DEFINITION,
    config: CONFIG_DEFINITION,
  });
  const textDocument = config.textDocument;
  const serverConnection = config.serverConnection;
  const serverCapabilities = config.serverCapabilities;
  const fileSystemReader = config.fileSystemReader;
  return [
    languageSupport,
    syntaxHighlighting(EDITOR_HIGHLIGHTS),
    languageClient({
      textDocument,
      serverConnection,
      serverCapabilities,
      fileSystemReader,
      language: languageSupport.language,
      highlighter: EDITOR_HIGHLIGHTS,
    }),
    Prec.highest(keymap.of(sparkdownKeymap)),
  ];
};
