import { bracketMatching } from "@codemirror/language";

import { type GrammarDefinition } from "@impower/textmate-grammar-tree/src/grammar/types/GrammarDefinition";

import { VSCodeLanguageSupport } from "../classes/VSCodeLanguageSupport";
import { CodeMirrorLanguageData } from "../types/CodeMirrorLanguageData";
import { VSCodeConfigDefinition } from "../types/VSCodeConfigDefinition";
import { convertConfigToLanguageData } from "../utils/convertConfigToLanguageData";
import { convertGrammarToLanguageData } from "../utils/convertGrammarToLanguageData";
import { vscodeCloseBrackets } from "./vscodeCloseBrackets";
import { vscodeIndentationRules } from "./vscodeIndentationRules";
import { vscodeOnEnterRules } from "./vscodeOnEnterRules";
import { vscodeSurroundBrackets } from "./vscodeSurroundBrackets";

export interface VSCodeLanguageFeaturesConfig {
  /**
    The name of this language.
    */
  name: string;

  /**
    Alternative names for the language (lowercased).
    */
  alias?: string[];

  /**
   * The grammar definition for this language
   */
  grammar: GrammarDefinition;

  /**
   * The config definition for this language
   */
  config?: VSCodeConfigDefinition;
}

export const vscodeLanguage = (options: VSCodeLanguageFeaturesConfig) => {
  const { name, alias, grammar, config = {} } = options;

  const dataDescription: {
    name: string;
    alias?: string[];
    extensions?: string[];
  } = { name };
  if (alias) {
    dataDescription.alias = alias;
  }
  if (grammar.fileTypes) {
    dataDescription.extensions = grammar.fileTypes;
  }

  const vscodeLanguageData: CodeMirrorLanguageData = {
    ...dataDescription,
    ...convertConfigToLanguageData(config),
    ...convertGrammarToLanguageData(grammar),
  };

  return new VSCodeLanguageSupport(name, grammar, vscodeLanguageData, [
    bracketMatching(),
    vscodeSurroundBrackets(),
    vscodeCloseBrackets(config),
    vscodeOnEnterRules(config),
    vscodeIndentationRules(config),
  ]);
};
