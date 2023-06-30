import { syntaxHighlighting } from "@codemirror/language";
import { Extension } from "@codemirror/state";
import configData from "../../language/sparkdown.language-config.json";
import grammarData from "../../language/sparkdown.language-grammar.json";
import snippetsData from "../../language/sparkdown.language-snippets.json";
import { LanguageServerConnection, languageClient } from "../cm-languageclient";
import { TextmateLanguage } from "../cm-textmate";
import SPARKDOWN_HIGHLIGHTS from "../constants/SPARKDOWN_HIGHLIGHTS";

export const sparkdownLanguageExtension = (config?: {
  connection?: LanguageServerConnection;
}): Extension => {
  const extension: Extension[] = [];
  const languageSupport = new TextmateLanguage({
    name: "sparkdown",
    configDefinition: configData,
    grammarDefinition: grammarData,
    snippetsDefinition: snippetsData,
  }).load();
  extension.push(languageSupport);
  const connection = config?.connection;
  if (connection) {
    extension.push(
      languageClient({
        connection,
        language: languageSupport.language,
        documentUri: "script",
      })
    );
  }
  extension.push(syntaxHighlighting(SPARKDOWN_HIGHLIGHTS));
  return extension;
};
