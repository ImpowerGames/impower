import { CodeMirrorLanguageData } from "../types/CodeMirrorLanguageData";
import { VSCodeConfigDefinition } from "../types/VSCodeConfigDefinition";

export const convertConfigToLanguageData = (
  config: VSCodeConfigDefinition,
): CodeMirrorLanguageData => {
  const wordChars = config?.wordChars;
  const wordPattern = config?.wordPattern;

  const data: CodeMirrorLanguageData = {};

  if (wordChars) {
    data.wordChars = wordChars;
  }

  if (wordPattern?.pattern) {
    data.wordPattern = new RegExp(wordPattern.pattern, wordPattern.flags ?? "");
  }

  return data;
};
