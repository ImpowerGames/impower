import {
  Language,
  LanguageSupport,
  defineLanguageFacet,
  languageDataProp,
} from "@codemirror/language";
import { Extension } from "@codemirror/state";
import { NodeType } from "@lezer/common";

import { NodeID } from "@impower/textmate-grammar-tree/src/core/enums/NodeID";
import { type GrammarDefinition } from "@impower/textmate-grammar-tree/src/grammar/types/GrammarDefinition";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";

import { CodeMirrorLanguageData } from "../types/CodeMirrorLanguageData";
import { defineNodeTypeWithLanguageNodeProps } from "../utils/defineNodeTypeWithLanguageNodeProps";

export class VSCodeLanguageSupport extends LanguageSupport {
  constructor(
    name: string,
    grammarDefinition: GrammarDefinition,
    languageData?: CodeMirrorLanguageData,
    support?: Extension[]
  ) {
    const facet = defineLanguageFacet(languageData);
    const topNodeType = NodeType.define({
      id: NodeID.top,
      name: name,
      top: true,
      props: [[languageDataProp, facet]],
    });
    const parser = new TextmateGrammarParser(
      grammarDefinition,
      topNodeType,
      defineNodeTypeWithLanguageNodeProps
    );
    const language = new Language(facet, parser, support, name);
    super(language, support);
  }
}
