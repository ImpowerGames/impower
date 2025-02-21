import {
  Language,
  LanguageSupport,
  defineLanguageFacet,
  languageDataProp,
} from "@codemirror/language";
import { Extension } from "@codemirror/state";
import { NodeType } from "@lezer/common";

import { GrammarDefinition } from "../../../../grammar-compiler/src/grammar/types/GrammarDefinition";
import { NodeID } from "../../../../grammar-compiler/src/core/enums/NodeID";

import { LanguageData } from "../types/LanguageData";
import { TextmateGrammarParser } from "./TextmateGrammarParser";
import { getNodeTypeWithLanguageNodeProps } from "../utils/getNodeTypeWithLanguageNodeProps";

export class TextmateLanguageSupport extends LanguageSupport {
  constructor(
    name: string,
    grammarDefinition: GrammarDefinition,
    languageData?: LanguageData,
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
      getNodeTypeWithLanguageNodeProps
    );
    const language = new Language(facet, parser, support, name);
    super(language, support);
  }
}
