import { CodeMirrorLanguageData } from "../types/CodeMirrorLanguageData";
import { VSCodeConfigDefinition } from "../types/VSCodeConfigDefinition";

export const convertConfigToLanguageData = (
  config: VSCodeConfigDefinition,
): CodeMirrorLanguageData => {
  const wordChars = config?.wordChars;

  const data: CodeMirrorLanguageData = {};

  if (wordChars) {
    data.wordChars = wordChars;
  }

  return data;
};
