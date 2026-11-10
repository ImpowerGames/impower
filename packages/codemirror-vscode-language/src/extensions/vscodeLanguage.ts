import { type GrammarDefinition } from "@impower/textmate-grammar-tree/src/grammar/types/GrammarDefinition";
import {
  createLanguageReader,
  type EmbeddedLanguages,
} from "@impower/textmate-grammar-tree/src/tree/utils/createLanguageReader";

import { VSCodeLanguageSupport } from "../classes/VSCodeLanguageSupport";
import { CodeMirrorLanguageData } from "../types/CodeMirrorLanguageData";
import { VSCodeConfigDefinition } from "../types/VSCodeConfigDefinition";
import { type VSCodeSnippetsDefinition } from "../types/VSCodeSnippetDefinition";
import { convertConfigToLanguageData } from "../utils/convertConfigToLanguageData";
import { convertGrammarToLanguageData } from "../utils/convertGrammarToLanguageData";
import { vscodeBracketMatching } from "./vscodeBracketMatching";
import { vscodeCloseBrackets } from "./vscodeCloseBrackets";
import { vscodeCommentTokens } from "./vscodeCommentTokens";
import { vscodeIndentationRules } from "./vscodeIndentationRules";
import { vscodeOnEnterRules } from "./vscodeOnEnterRules";
import { vscodeSnippets } from "./vscodeSnippets";
import { vscodeSurroundBrackets } from "./vscodeSurroundBrackets";

export interface VSCodeLanguageFeaturesConfig {
  name: string;

  alias?: string[];

  grammar: GrammarDefinition;

  language?: string;

  configs?: Readonly<Record<string, VSCodeConfigDefinition>>;

  embeddedLanguages?: EmbeddedLanguages;

  snippets?: Readonly<Record<string, VSCodeSnippetsDefinition>>;
}

export const vscodeLanguage = (options: VSCodeLanguageFeaturesConfig) => {
  const {
    name,
    alias,
    grammar,
    language = name,
    configs = {},
    embeddedLanguages = {},
    snippets = {},
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
    (grammarTree) => {
      const reader = createLanguageReader(grammarTree, embeddedLanguages);
      return [
        vscodeCommentTokens(reader, language, configs),
        vscodeSnippets(reader, language, snippets),
        vscodeBracketMatching(config),
        vscodeSurroundBrackets(config),
        vscodeCloseBrackets(config),
        vscodeOnEnterRules(config),
        vscodeIndentationRules(config),
      ];
    },
  );
};
