import { syntaxHighlighting } from "@codemirror/language";
import { Extension } from "@codemirror/state";
import configData from "../../../../language/sparkdown.language-config.json";
import grammarData from "../../../../language/sparkdown.language-grammar.json";
import snippetsData from "../../../../language/sparkdown.language-snippets.json";
import {
  LanguageServerConnection,
  languageClient,
} from "../../../cm-language-client";
import { FileSystemReader } from "../../../cm-language-client/types/FileSystemReader";
import { TextmateLanguage } from "../../../cm-textmate";
import EDITOR_HIGHLIGHTS from "../constants/EDITOR_HIGHLIGHTS";

export const sparkdownLanguageExtension = (config: {
  textDocument: { uri: string; version: number };
  connection: LanguageServerConnection;
  fileSystemReader?: FileSystemReader;
}): Extension => {
  const languageSupport = new TextmateLanguage({
    name: "sparkdown",
    configDefinition: configData,
    grammarDefinition: grammarData,
    snippetsDefinition: snippetsData,
  }).load();
  const textDocument = config.textDocument;
  const connection = config.connection;
  const fileSystemReader = config.fileSystemReader;
  return [
    languageSupport,
    syntaxHighlighting(EDITOR_HIGHLIGHTS),
    languageClient({
      textDocument,
      connection,
      fileSystemReader,
      language: languageSupport.language,
      highlighter: EDITOR_HIGHLIGHTS,
    }),
  ];
};
