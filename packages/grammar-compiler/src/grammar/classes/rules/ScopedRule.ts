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
import Matched from "../Matched";
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
    this.id = id;
    this.node = new GrammarNode(
      repo.nextTypeIndex(),
      def,
      repo.grammar.declarator
    );

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
   * @param from - The position to start matching at.
   * @param state - The current {@link GrammarState}.
   */
  match(
    str: string,
    from: number,
    state: GrammarState,
    possiblyIncomplete?: boolean
  ) {
    if (possiblyIncomplete) {
      // If possibly incomplete, only return begin match
      let beginMatched = this.begin(str, from, state);
      if (!beginMatched) {
        return null;
      }
      return beginMatched;
    }

    const children: Matched[] = [];
    let pos = from;
    let matchLength = 0;

    // check begin
    let beginMatched = this.begin(str, pos, state);
    if (!beginMatched) {
      return null;
    }

    children.push(beginMatched.children?.[0]!);
    matchLength += beginMatched.length;
    pos += beginMatched.length;

    // check end
    let endMatched = this.end(str, pos, state);
    while (!endMatched && pos < str.length) {
      // check patterns
      const patternMatched = this.pattern(str, pos, state, possiblyIncomplete);
      if (patternMatched) {
        children.push(patternMatched);
        matchLength += patternMatched.length;
        pos += patternMatched.length;
      } else {
        const noneMatched = Matched.create(state, GrammarNode.None, pos, 1);
        children.push(noneMatched);
        matchLength += noneMatched.length;
        pos += noneMatched.length;
      }
      // check end
      endMatched = this.end(str, pos, state);
    }

    if (endMatched) {
      children.push(endMatched.children?.[0]!);
      matchLength += endMatched.length;
    }

    return Matched.create(state, this.node, from, matchLength, children);
  }

  begin(str: string, from: number, state: GrammarState) {
    if (!this.rules) {
      this.rules = this.patterns
        ? this.repo.getRules(this.patterns, this.id)
        : [];
    }
    let beginMatched = this.beginRule.match(str, from, state);
    if (!beginMatched) {
      return null;
    }
    beginMatched = beginMatched.wrap(this.node, Wrapping.BEGIN);
    state.stack.push(this.node, this.rules, this);
    return beginMatched;
  }

  end(str: string, from: number, state: GrammarState) {
    let endMatched = this.endRule.match(str, from, state);
    if (!endMatched) {
      return null;
    }
    endMatched = endMatched.wrap(this.node, Wrapping.END);
    state.stack.pop();
    return endMatched;
  }

  pattern(
    str: string,
    from: number,
    state: GrammarState,
    possiblyIncomplete?: boolean
  ) {
    if (!this.rules) {
      this.rules = this.patterns
        ? this.repo.getRules(this.patterns, this.id)
        : [];
    }
    for (let i = 0; i < this.rules.length; i++) {
      const rule = this.rules[i];
      const patternMatched = rule?.match(str, from, state, possiblyIncomplete);
      if (patternMatched) {
        return patternMatched;
      }
    }
    return null;
  }
}
