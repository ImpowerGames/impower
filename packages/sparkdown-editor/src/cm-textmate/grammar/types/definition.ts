/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type {
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import type { Tag as cmTag, tags as cmTags } from "@lezer/highlight";

/** Filters a record for any properties which are equivalent to a given type. */
type FilterFor<O extends Record<string, any>, T> = {
  [Property in keyof O as O[Property] extends T
    ? Property
    : never]: O[Property];
};

/** Filters out of a record any properties which are equivalent to a given type. */
type FilterOut<O extends Record<string, any>, T> = {
  [Property in keyof O as O[Property] extends T
    ? never
    : Property]: O[Property];
};

export interface GrammarData {
  patterns?: Patterns;

  repository?: Record<string, RepositoryItem>;
}

export interface ConfigData {
  comments?: {
    lineComment?: string;
    blockComment?: string[];
  };
  brackets?: string[][];
  autoClosingPairs?: { open: string; close: string; notIn?: string[] }[];
  autoCloseBefore?: string;
  surroundingPairs?: string[][];
  wordChars?: string;
  wordPattern?: {
    pattern: string;
    flags: string;
  };
  indentationRules?: {
    increaseIndentPattern?: string;
    decreaseIndentPattern?: string;
  };
  folding?: {
    markers?: {
      start?: string;
      end?: string;
    };
  };
}

export interface SnippetData {
  prefix: string;
  body: string;
  description: string;
}

export interface TextmateData {
  config?: ConfigData;
  grammar?: GrammarData;
  snippets?: Record<string, SnippetData>;
}

export interface LanguageData {
  commentTokens?: {
    block?: { open?: string; close?: string };
    line?: string;
  };

  closeBrackets?: {
    brackets?: string[];
    before?: string;
  };

  wordChars?: string;

  indentOnInput?: RegExp;

  autocomplete?: (
    context: CompletionContext
  ) => CompletionResult | Promise<CompletionResult | null> | null;
}

export interface RuleItem {
  type?: string;
  emit?: string | boolean;

  // VSCode properties
  name?: string;

  // CodeMirror properties
  tag?: Tag;
  openedBy?: string | string[];
  closedBy?: string | string[];
  group?: string | string[];
  autocomplete?: string;
  fold?:
    | boolean
    | "inside"
    | "past_first_line"
    | `offset(${number}, ${number})`
    | string;
  indent?:
    | "flat"
    | `delimited(${string})`
    | "continued"
    | `add(${number})`
    | `set(${number})`
    | string;
}

export interface MatchRuleItem extends RuleItem {
  match: string;
  captures?: Record<string, RuleItem | SwitchRuleItem>;
}

export interface SwitchRuleItem extends RuleItem {
  patterns: Patterns;
}

export interface ScopedRuleItem extends RuleItem {
  begin: string;
  end: string;
  beginCaptures?: Record<string, RuleItem>;
  endCaptures?: Record<string, RuleItem>;
  patterns?: Patterns;
}

export type IncludeItem = { include: string };

export type RepositoryItem = MatchRuleItem | SwitchRuleItem | ScopedRuleItem;

export type Patterns = (RepositoryItem | IncludeItem)[];

export type StyleTag = keyof FilterOut<typeof cmTags, (tag: cmTag) => cmTag>;
export type FunctionTag = keyof FilterFor<typeof cmTags, (tag: cmTag) => cmTag>;
export type TagModifier = `(${`${string}/` | "!" | "..."}) ` | "";
export type TagFunction = `${FunctionTag}(${StyleTag})`;
export type Tag = `${TagModifier}${string}`;
