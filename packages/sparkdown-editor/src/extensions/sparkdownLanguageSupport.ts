import { LanguageSupport } from "@codemirror/language";
import { SparkParseResult } from "../../../sparkdown/src/types/SparkParseResult";
import { parseSpark } from "../../../sparkdown/src/utils/parseSpark";
import config from "../../language/sparkdown.language-config.json";
import grammar from "../../language/sparkdown.language-grammar.json";
import TextmateLanguage from "../cm-textmate/core/language";

const sparkdownLanguageSupport = (
  _config: {
    initialDoc: string;
    parse: (script: string) => SparkParseResult;
  } = { parse: parseSpark, initialDoc: "" }
): LanguageSupport => {
  const textmateLanguage = new TextmateLanguage({
    name: "sparkdown",
    textmateData: { config, grammar },
  });
  return textmateLanguage.load();
};

export default sparkdownLanguageSupport;
