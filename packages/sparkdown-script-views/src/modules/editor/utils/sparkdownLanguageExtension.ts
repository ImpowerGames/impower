import { syntaxHighlighting } from "@codemirror/language";
import { Extension } from "@codemirror/state";
import configData from "../../../../language/sparkdown.language-config.json";
import grammarData from "../../../../language/sparkdown.language-grammar.json";
import snippetsData from "../../../../language/sparkdown.language-snippets.json";
import {
  LanguageServerConnection,
  languageClient,
} from "../../../cm-language-client";
import { TextmateLanguage } from "../../../cm-textmate";
import EDITOR_HIGHLIGHTS from "../constants/EDITOR_HIGHLIGHTS";

export const sparkdownLanguageExtension = (config: {
  textDocument: { uri: string; version: number };
  connection: LanguageServerConnection;
}): Extension => {
  const languageSupport = new TextmateLanguage({
    name: "sparkdown",
    configDefinition: configData,
    grammarDefinition: grammarData,
    snippetsDefinition: snippetsData,
  }).load();
  const connection = config.connection;
  const textDocument = config.textDocument;
  return [
    languageSupport,
    syntaxHighlighting(EDITOR_HIGHLIGHTS),
    languageClient({
      connection,
      textDocument,
      language: languageSupport.language,
      highlighter: EDITOR_HIGHLIGHTS,
    }),
  ];
};
