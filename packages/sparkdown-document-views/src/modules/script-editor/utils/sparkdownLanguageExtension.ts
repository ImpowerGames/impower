import { syntaxHighlighting } from "@codemirror/language";
import { Extension, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import {
  MessageConnection,
  ServerCapabilities,
} from "../../../../../spark-editor-protocol/src/types";
import configData from "../../../../language/sparkdown.language-config.json";
import grammarData from "../../../../language/sparkdown.language-grammar.json";
import snippetsData from "../../../../language/sparkdown.language-snippets.json";
import { languageClient } from "../../../cm-language-client";
import { FileSystemReader } from "../../../cm-language-client/types/FileSystemReader";
import { TextmateLanguage } from "../../../cm-textmate";
import EDITOR_HIGHLIGHTS from "../constants/EDITOR_HIGHLIGHTS";
import { sparkdownKeymap } from "./sparkdownKeymap";

export const sparkdownLanguageExtension = (config: {
  textDocument: { uri: string; version: number };
  serverConnection: MessageConnection;
  serverCapabilities: ServerCapabilities;
  fileSystemReader?: FileSystemReader;
}): Extension => {
  const languageSupport = new TextmateLanguage({
    name: "sparkdown",
    configDefinition: configData,
    grammarDefinition: grammarData,
    snippetsDefinition: snippetsData,
  }).load();
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
