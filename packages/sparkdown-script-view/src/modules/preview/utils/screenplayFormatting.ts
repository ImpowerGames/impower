import { syntaxHighlighting } from "@codemirror/language";
import { Extension } from "@codemirror/state";
import grammarDefinition from "../../../../language/sparkdown.language-grammar.json";
import TextmateLanguageSupport from "../../../cm-textmate/classes/TextmateLanguageSupport";
import PREVIEW_HIGHLIGHTS from "../constants/PREVIEW_HIGHLIGHTS";

export const screenplayFormatting = (): Extension => {
  const languageSupport = new TextmateLanguageSupport(
    "sparkdown",
    grammarDefinition
  );
  return [languageSupport, syntaxHighlighting(PREVIEW_HIGHLIGHTS)];
};
