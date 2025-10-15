import { GrammarDefinition } from "@impower/textmate-grammar-tree/src/grammar";
import { CodeMirrorLanguageData } from "../types/CodeMirrorLanguageData";

export const convertGrammarToLanguageData = (
  grammar: GrammarDefinition
): CodeMirrorLanguageData => {
  const fileTypes = grammar?.fileTypes;

  const data: CodeMirrorLanguageData = {};

  if (fileTypes) {
    data.extensions = fileTypes;
  }

  return data;
};
