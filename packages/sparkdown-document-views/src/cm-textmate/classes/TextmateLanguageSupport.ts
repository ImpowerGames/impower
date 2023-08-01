import {
  Language,
  LanguageSupport,
  defineLanguageFacet,
  languageDataProp,
} from "@codemirror/language";
import { Extension } from "@codemirror/state";
import { NodeType } from "@lezer/common";
import { LanguageData } from "../types/LanguageData";

import { GrammarDefinition, NodeID } from "../../../../grammar-compiler/src";

import LezerGrammarParser from "./LezerGrammarParser";

export default class TextmateLanguageSupport extends LanguageSupport {
  constructor(
    name: string,
    grammarDefinition: GrammarDefinition,
    languageData?: LanguageData,
    support?: Extension[]
  ) {
    const facet = defineLanguageFacet(languageData);
    const topNodeType = NodeType.define({
      id: NodeID.TOP,
      name: name,
      top: true,
      props: [[languageDataProp, facet]],
    });
    const parser = new LezerGrammarParser(grammarDefinition, topNodeType);
    const language = new Language(facet, parser, support, name);
    super(language, support);
  }
}
