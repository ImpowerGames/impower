import { CodeMirrorLanguageData } from "../types/CodeMirrorLanguageData";
import { VSCodeConfigDefinition } from "../types/VSCodeConfigDefinition";

export const convertConfigToLanguageData = (
  config: VSCodeConfigDefinition,
): CodeMirrorLanguageData => {
  const autoClosingPairs = config?.autoClosingPairs ?? [];
  const surroundingPairs = config?.surroundingPairs ?? [];
  const wordChars = config?.wordChars;
  const decreaseIndentPattern = config?.indentationRules?.decreaseIndentPattern;

  const data: CodeMirrorLanguageData = {};

  if (autoClosingPairs) {
    data.closeBrackets = {
      brackets: autoClosingPairs.map(({ open }) => open),
      before: autoClosingPairs.map(({ close }) => close).join(""),
    };
  }

  if (surroundingPairs) {
    const surroundBrackets = surroundingPairs.filter(
      ([surroundOpen]) =>
        !autoClosingPairs.some(({ open }) => surroundOpen === open),
    );
    data.surroundBrackets = {
      brackets: surroundBrackets.map(([open]) => open!),
      before: surroundBrackets.map(([_, close]) => close!).join(""),
    };
  }

  if (wordChars) {
    data.wordChars = wordChars;
  }

  if (decreaseIndentPattern) {
    data.indentOnInput = new RegExp(decreaseIndentPattern);
  }

  return data;
};
