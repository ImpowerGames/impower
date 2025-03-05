/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export interface RuleDefinition {
  id?: string;

  // VSCode properties
  name?: string;

  // CodeMirror properties
  tag?: string;
  brackets?: boolean;
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

export interface MatchRuleDefinition extends RuleDefinition {
  match: string;
  flags?: string;
  captures?: Record<string, RuleDefinition | SwitchRuleDefinition>;
}

export interface SwitchRuleDefinition extends RuleDefinition {
  emit?: boolean;
  patterns: IncludeDefinition[];
}

export interface ScopedRuleDefinition extends RuleDefinition {
  begin: string;
  end: string;
  beginCaptures?: Record<string, RuleDefinition | SwitchRuleDefinition>;
  endCaptures?: Record<string, RuleDefinition | SwitchRuleDefinition>;
  patterns?: IncludeDefinition[];
}

export type IncludeDefinition = { include: string };

export type RepositoryDefinition =
  | MatchRuleDefinition
  | SwitchRuleDefinition
  | ScopedRuleDefinition;

export interface GrammarDefinition {
  // VSCode properties
  fileTypes?: string[];
  name?: string;
  patterns?: IncludeDefinition[];
  repository?: Record<string, RepositoryDefinition>;
}
