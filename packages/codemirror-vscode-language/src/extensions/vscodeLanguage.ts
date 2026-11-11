import { GrammarRegistry } from "@impower/textmate-grammar-tree/src/grammar/classes/GrammarRegistry";
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

  grammar: GrammarDefinition | GrammarRegistry;

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
        vscodeSurroundBrackets(reader, language, configs),
        vscodeCloseBrackets(reader, language, configs),
        vscodeOnEnterRules(reader, language, configs),
        vscodeIndentationRules(reader, language, configs),
      ];
    },
  );
};
