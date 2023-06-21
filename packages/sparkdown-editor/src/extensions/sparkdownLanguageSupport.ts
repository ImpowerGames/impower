import { LanguageSupport } from "@codemirror/language";
import { SparkParseResult } from "../../../sparkdown/src/types/SparkParseResult";
import { parseSpark } from "../../../sparkdown/src/utils/parseSpark";
import configData from "../../language/sparkdown.language-config.json";
import grammarData from "../../language/sparkdown.language-grammar.json";
import snippetsData from "../../language/sparkdown.language-snippets.json";
import { TextmateLanguage } from "../cm-textmate";

const sparkdownLanguageSupport = (
  _config: {
    initialDoc: string;
    parse: (script: string) => SparkParseResult;
  } = { parse: parseSpark, initialDoc: "" }
): LanguageSupport => {
  const textmateLanguage = new TextmateLanguage({
    name: "sparkdown",
    configDefinition: configData,
    grammarDefinition: grammarData,
    snippetsDefinition: snippetsData,
  });
  return textmateLanguage.load();
};

export default sparkdownLanguageSupport;
