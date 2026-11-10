import { type GrammarDefinition } from "@impower/textmate-grammar-tree/src/grammar/types/GrammarDefinition";
import {
  createLanguageReader,
  type EmbeddedLanguages,
} from "@impower/textmate-grammar-tree/src/tree/utils/createLanguageReader";

import { VSCodeLanguageSupport } from "../classes/VSCodeLanguageSupport";
import { CodeMirrorLanguageData } from "../types/CodeMirrorLanguageData";
import { VSCodeConfigDefinition } from "../types/VSCodeConfigDefinition";
import { convertConfigToLanguageData } from "../utils/convertConfigToLanguageData";
import { convertGrammarToLanguageData } from "../utils/convertGrammarToLanguageData";
import { vscodeBracketMatching } from "./vscodeBracketMatching";
import { vscodeCloseBrackets } from "./vscodeCloseBrackets";
import { vscodeCommentTokens } from "./vscodeCommentTokens";
import { vscodeIndentationRules } from "./vscodeIndentationRules";
import { vscodeOnEnterRules } from "./vscodeOnEnterRules";
import { vscodeSurroundBrackets } from "./vscodeSurroundBrackets";

export interface VSCodeLanguageFeaturesConfig {
  name: string;

  alias?: string[];

  grammar: GrammarDefinition;

  language?: string;

  configs?: Readonly<Record<string, VSCodeConfigDefinition>>;

  embeddedLanguages?: EmbeddedLanguages;
}

export const vscodeLanguage = (options: VSCodeLanguageFeaturesConfig) => {
  const {
    name,
    alias,
    grammar,
    language = name,
    configs = {},
    embeddedLanguages = {},
  } = options;
  const config = configs[language] ?? {};

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

  return new VSCodeLanguageSupport(
    name,
    grammar,
    vscodeLanguageData,
    (grammarTree) => [
      vscodeCommentTokens(
        createLanguageReader(grammarTree, embeddedLanguages),
        language,
        configs,
      ),
      vscodeBracketMatching(config),
      vscodeSurroundBrackets(config),
      vscodeCloseBrackets(config),
      vscodeOnEnterRules(config),
      vscodeIndentationRules(config),
    ],
  );
};
