/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  IncludeDefinition,
  SwitchRuleDefinition,
} from "../../types/GrammarDefinition";
import { Rule } from "../../types/Rule";
import { createID } from "../../utils/createID";
import GrammarNode from "../GrammarNode";
import type GrammarRepository from "../GrammarRepository";
import GrammarState from "../GrammarState";
import RegExpMatcher from "../RegExpMatcher";

/**
 * A {@link Rule} subclass that uses {@link RegExpMatcher} or
 * {@link StringMatcher} instances for the underlying pattern.
 */
export default class SwitchRule implements Rule {
  repo: GrammarRepository;

  id: string;

  node: GrammarNode;

  patterns?: IncludeDefinition[];

  rules?: Rule[];

  emit?: boolean;

  constructor(repo: GrammarRepository, def: SwitchRuleDefinition) {
    this.repo = repo;

    let id = def.id ?? createID();
    this.id = id;
    this.node = new GrammarNode(
      repo.nextTypeIndex(),
      def,
      repo.grammar.declarator
    );

    this.emit = def.emit;

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
    for (let i = 0; i < this.rules.length; i += 1) {
      const rule = this.rules[i];
      if (rule) {
        const output = rule.match(str, pos, state);
        if (output) {
          if (this.emit) {
            return output.wrap(this.node);
          } else {
            return output;
          }
        }
      }
    }
    return null;
  }
}
