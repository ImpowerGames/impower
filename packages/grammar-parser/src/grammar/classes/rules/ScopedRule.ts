/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Wrapping } from "../../enums/Wrapping";
import {
  IncludeDefinition,
  MatchRuleDefinition,
  ScopedRuleDefinition,
} from "../../types/GrammarDefinition";
import { Rule } from "../../types/Rule";
import { createID } from "../../utils/createID";
import GrammarNode from "../GrammarNode";
import type GrammarRepository from "../GrammarRepository";
import GrammarState from "../GrammarState";
import RegExpMatcher from "../RegExpMatcher";
import type MatchRule from "./MatchRule";

/**
 * A {@link Rule} subclass that uses {@link RegExpMatcher} or
 * {@link StringMatcher} instances for the underlying pattern.
 */
export default class ScopedRule implements Rule {
  repo: GrammarRepository;

  id: string;

  node: GrammarNode;

  beginRule: MatchRule;

  endRule: MatchRule;

  patterns?: IncludeDefinition[];

  rules?: Rule[];

  constructor(repo: GrammarRepository, def: ScopedRuleDefinition) {
    this.repo = repo;

    let id = def.id ?? createID();
    let emit = def.id || def.autocomplete;
    this.id = id;
    this.node = !emit
      ? GrammarNode.None
      : new GrammarNode(repo.nextTypeIndex(), def, repo.grammar.declarator);

    const beginId = this.id + "_begin";
    const endId = this.id + "_end";

    // begin
    const beginRuleItem: MatchRuleDefinition = {
      id: beginId,
      match: def.begin,
      captures: def.beginCaptures,
      closedBy: def.closedBy ?? def.brackets ? endId : undefined,
    };
    this.beginRule = repo.add(beginRuleItem, beginId);

    // end
    const endRuleItem: MatchRuleDefinition = {
      id: endId,
      match: def.end,
      captures: def.endCaptures,
      openedBy: def.openedBy ?? def.brackets ? beginId : undefined,
    };
    this.endRule = repo.add(endRuleItem, endId);

    // patterns
    this.patterns = def.patterns;
  }

  /**
   * @param str - The string to match.
   * @param pos - The position to start matching at.
   * @param state - The current {@link GrammarState}.
   */
  match(str: string, pos: number, state: GrammarState) {
    if (!this.rules) {
      this.rules = this.patterns
        ? this.repo.getRules(this.patterns, this.id)
        : [];
    }
    let matched = this.beginRule.match(str, pos, state);
    if (!matched) {
      return null;
    }
    matched = matched.wrap(this.node, Wrapping.BEGIN);
    state.stack.push(this.node, this.rules, this);
    return matched;
  }

  /**
   * @param str - The string to match.
   * @param pos - The position to start matching at.
   * @param state - The current {@link GrammarState}.
   */
  close(str: string, pos: number, state: GrammarState) {
    let matched = this.endRule.match(str, pos, state);
    if (!matched) {
      return null;
    }
    matched = matched.wrap(this.node, Wrapping.END);
    matched.state.stack.pop();
    return matched;
  }
}
