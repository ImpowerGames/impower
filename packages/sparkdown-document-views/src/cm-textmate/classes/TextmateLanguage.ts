/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  closeBrackets,
  closeBracketsKeymap,
  insertBracket,
} from "@codemirror/autocomplete";
import {
  Language,
  LanguageDescription,
  LanguageSupport,
  bracketMatching,
  getIndentUnit,
  indentService,
  syntaxTree,
} from "@codemirror/language";
import {
  Prec,
  codePointAt,
  codePointSize,
  type Extension,
  type Facet,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { Parser } from "@lezer/common";

import { GrammarDefinition } from "../../../../grammar-compiler/src";

import { ConfigDefinition } from "../types/ConfigDefinition";
import { LanguageData } from "../types/LanguageData";
import { SnippetDefinition } from "../types/SnippetDefinition";
import { convertConfigToLanguageData } from "../utils/convertConfigToLanguageData";
import { onEnterRules } from "../utils/onEnterRules";
import { removeUndefined } from "../utils/removeUndefined";
import { surroundBrackets } from "../utils/surroundBrackets";
import { TextmateLanguageSupport } from "./TextmateLanguageSupport";

const INDENT_REGEX = /([ \t]*)/;

const android =
  typeof navigator == "object" && /Android\b/.test(navigator.userAgent);

/**
 * Use the `load` method to get the extension needed to
 * load the language into CodeMirror. If you need a `LanguageDescription`,
 * the `description` property will hold one.
 */
export class TextmateLanguage {
  /** Language grammar. */
  declare grammarDefinition: GrammarDefinition;

  /** Language config. */
  declare configDefinition?: ConfigDefinition;

  /** Language snippets. */
  declare snippetsDefinition?: Record<string, SnippetDefinition>;

  /** Language data. */
  declare languageData: LanguageData;

  /** List of extensions to load with the language. */
  declare extensions: Extension[];

  /** `LanguageDescription` instance for the language. */
  declare description: LanguageDescription;

  /**
   * Languages that are supported for nesting. Can also be a facet that
   * provides the list.
   */
  declare nestLanguages: LanguageDescription[] | Facet<LanguageDescription>;

  // only shows up after loading

  /**
   * `LanguageSupport` instance for the language.
   */
  declare support?: LanguageSupport;

  /**
   * CodeMirror `language` instance for the language.
   */
  declare language?: Language;

  /**
   * The parser created for this grammar.
   */
  declare parser?: Parser;

  /** Will be true if the language has been loaded at least once. */
  loaded = false;

  constructor(config: {
    /**
     * The name of the language. This property is important for CodeMirror,
     * so make sure it's reasonable.
     */
    name: string;
    /** A list of aliases for the name of the language. (e.g. 'go' - `['golang']`) */
    alias?: string[];
    /**
     * The grammar definition for this language
     */
    grammarDefinition: GrammarDefinition;
    /**
     * The config definition for this language
     */
    configDefinition?: ConfigDefinition;
    /**
     * The config definition for this language
     */
    snippetsDefinition?: Record<string, SnippetDefinition>;
    /**
     * The 'languageData' field inherit to the {@link Language}. CodeMirror
     * plugins are defined by, or use, the data in this field. e.g.
     * indentation, autocomplete, etc.
     */
    languageData?: LanguageData;
    /**
     * A list (or facet) of `LanguageDescription` objects that will be used
     * when the parser nests in a language.
     */
    nestLanguages?: LanguageDescription[] | Facet<LanguageDescription>;
    /** A list of file extensions. (e.g. `['.ts']`) */
    extensions?: string[];
    /** Extra extensions to be loaded. */
    supportExtensions?: Extension[];
  }) {
    const {
      name,
      alias,
      grammarDefinition,
      configDefinition,
      snippetsDefinition,
      languageData = {},
      nestLanguages = [],
      extensions,
      supportExtensions = [],
    } = config;
    const dataDescription = removeUndefined({ name, alias, extensions });

    this.grammarDefinition = grammarDefinition;
    this.configDefinition = configDefinition;
    this.snippetsDefinition = snippetsDefinition;
    this.languageData = {
      ...dataDescription,
      ...convertConfigToLanguageData(configDefinition || {}),
      ...languageData,
    };
    const closeBracketsState = (closeBrackets() as Extension[])[1]!;
    const languageExtensions = [
      bracketMatching(),
      surroundBrackets(),
      closeBracketsState,
      // Support closeBrackets `notIn` check
      EditorView.inputHandler.of((view, from, to, insert) => {
        if (
          (android ? view.composing : view.compositionStarted) ||
          view.state.readOnly
        ) {
          return false;
        }
        let sel = view.state.selection.main;
        if (
          insert.length > 2 ||
          (insert.length == 2 && codePointSize(codePointAt(insert, 0)) == 1) ||
          from != sel.from ||
          to != sel.to
        ) {
          return false;
        }
        const pos = view.state.selection.main.head;
        const autoClosingPairRule = configDefinition?.autoClosingPairs?.find(
          (v) => v.open === insert
        );
        if (autoClosingPairRule) {
          let nodes = syntaxTree(view.state).resolveStack(pos);
          for (let cur: typeof nodes | null = nodes; cur; cur = cur.next) {
            let { node } = cur;
            if (autoClosingPairRule?.notIn?.includes(node.type.name)) {
              return false;
            }
          }
        }
        let tr = insertBracket(view.state, insert);
        if (!tr) {
          return false;
        }
        view.dispatch(tr);
        return true;
      }),
      // Support onEnterRules
      Prec.high(
        keymap.of([
          {
            key: "Enter",
            run: onEnterRules(configDefinition?.onEnterRules),
          },
          ...closeBracketsKeymap,
        ])
      ),
      // Support indentationRules
      indentService.of((context, pos) => {
        const beforeLine =
          pos > 0 ? context.state.doc.lineAt(pos - 1) : undefined;
        const beforeLineText = beforeLine?.text || "";
        const beforeIndentSize =
          beforeLineText.match(INDENT_REGEX)?.[0].length ?? 0;
        const indentationRules = configDefinition?.indentationRules;
        const decreaseIndentPattern = indentationRules?.decreaseIndentPattern;
        const decreasedIndentSize =
          beforeIndentSize - getIndentUnit(context.state);
        const increasedIndentSize =
          beforeIndentSize + getIndentUnit(context.state);
        if (
          decreaseIndentPattern &&
          beforeLineText.match(decreaseIndentPattern)
        ) {
          return decreasedIndentSize;
        }
        const increaseIndentPattern = indentationRules?.increaseIndentPattern;
        if (
          increaseIndentPattern &&
          beforeLineText.match(increaseIndentPattern)
        ) {
          return increasedIndentSize;
        }
        return null;
      }),
    ];
    this.nestLanguages = nestLanguages;
    this.extensions = [...languageExtensions, ...supportExtensions];

    this.description = LanguageDescription.of({
      ...dataDescription,
      load: async () => this.load(),
    });
  }

  /**
   * Loads and processes the language. Calling this function repeatedly
   * will just return the previously loaded language.
   */
  load(): TextmateLanguageSupport {
    if (this.description?.support) {
      return this.description.support;
    }
    this.support = new TextmateLanguageSupport(
      this.description.name,
      this.grammarDefinition,
      this.languageData,
      this.extensions
    );
    this.description.support = this.support;
    this.loaded = true;
    return this.support;
  }
}
