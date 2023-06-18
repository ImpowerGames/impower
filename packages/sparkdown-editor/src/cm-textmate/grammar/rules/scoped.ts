/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createID } from "../../utils/createID";
import { ParserNode } from "../node";
import { RegExpMatcher } from "../regexp";
import type { Repository } from "../repository";
import { GrammarState } from "../state";
import type * as DF from "../types/definition";
import { Rule } from "../types/rule";
import { Wrapping } from "../types/wrapping";
import type { MatchRule } from "./match";

/**
 * A {@link Rule} subclass that uses {@link RegExpMatcher} or
 * {@link StringMatcher} instances for the underlying pattern.
 */
export class ScopedRule implements Rule {
  repo: Repository;

  name: string;

  node: ParserNode;

  beginRule: MatchRule;

  endRule: MatchRule;

  patterns?: DF.IncludeItem[];

  rules?: Rule[];

  constructor(repo: Repository, item: DF.ScopedRuleItem) {
    this.repo = repo;

    let type = item.type ?? createID();
    let emit = (item.type && item.emit !== false) || item.autocomplete;
    this.name = type;
    this.node = !emit ? ParserNode.None : new ParserNode(repo.id(), item);

    const beginName = this.name + "_begin";
    const endName = this.name + "_end";

    // begin
    const beginRuleItem: DF.MatchRuleItem = {
      type: beginName,
      match: item.begin,
      captures: item.beginCaptures,
      closedBy: item.closedBy ?? item.brackets ? endName : undefined,
    };
    this.beginRule = repo.add(beginRuleItem, beginName);

    // end
    const endRuleItem: DF.MatchRuleItem = {
      type: endName,
      match: item.end,
      captures: item.endCaptures,
      openedBy: item.openedBy ?? item.brackets ? beginName : undefined,
    };
    this.endRule = repo.add(endRuleItem, endName);

    // patterns
    this.patterns = item.patterns;
  }

  /**
   * @param str - The string to match.
   * @param pos - The position to start matching at.
   * @param state - The current {@link GrammarState}.
   */
  match(str: string, pos: number, state: GrammarState) {
    if (!this.rules) {
      this.rules = this.patterns
        ? this.repo.patterns(this.patterns, this.name)
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
