import { GrammarRegistry } from "@impower/textmate-grammar-tree/src/grammar/classes/GrammarRegistry";
import { type GrammarDefinition } from "@impower/textmate-grammar-tree/src/grammar/types/GrammarDefinition";

import { VSCodeLanguageSupport } from "../classes/VSCodeLanguageSupport";
import { CodeMirrorLanguageData } from "../types/CodeMirrorLanguageData";
import { VSCodeConfigDefinition } from "../types/VSCodeConfigDefinition";
import { convertConfigToLanguageData } from "../utils/convertConfigToLanguageData";
import { convertGrammarToLanguageData } from "../utils/convertGrammarToLanguageData";
import { vscodeBracketMatching } from "./vscodeBracketMatching";
import { vscodeCloseBrackets } from "./vscodeCloseBrackets";
import { vscodeIndentationRules } from "./vscodeIndentationRules";
import { vscodeOnEnterRules } from "./vscodeOnEnterRules";
import { vscodeSurroundBrackets } from "./vscodeSurroundBrackets";

export interface VSCodeLanguageFeaturesConfig {
  name: string;

  alias?: string[];

  grammar: GrammarDefinition | GrammarRegistry;

  config?: VSCodeConfigDefinition;
}

export const vscodeLanguage = (options: VSCodeLanguageFeaturesConfig) => {
  const { name, alias, grammar, config = {} } = options;
  const start = grammar instanceof GrammarRegistry ? grammar.start : grammar;

  const dataDescription: {
    name: string;
    alias?: string[];
    extensions?: string[];
  } = { name };
  if (alias) {
    dataDescription.alias = alias;
  }
  if (start.fileTypes) {
    dataDescription.extensions = start.fileTypes;
  }

  const vscodeLanguageData: CodeMirrorLanguageData = {
    ...dataDescription,
    ...convertConfigToLanguageData(config),
    ...convertGrammarToLanguageData(start),
  };

  return new VSCodeLanguageSupport(name, grammar, vscodeLanguageData, [
    vscodeBracketMatching(config),
    vscodeSurroundBrackets(config),
    vscodeCloseBrackets(config),
    vscodeOnEnterRules(config),
    vscodeIndentationRules(config),
  ]);
};
