/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Wrapping } from "../../enums/Wrapping";
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
   * @param from - The position to start matching at.
   * @param state - The current {@link GrammarState}.
   */
  match(
    str: string,
    from: number,
    state: GrammarState,
    possiblyIncomplete?: boolean
  ) {
    return this.pattern(str, from, state, possiblyIncomplete);
  }

  resolve() {
    if (!this.rules) {
      this.rules = this.patterns
        ? this.repo.getRules(this.patterns, this.id)
        : [];
    }
  }

  pattern(
    str: string,
    from: number,
    state: GrammarState,
    possiblyIncomplete?: boolean
  ) {
    this.resolve();
    for (let i = 0; i < this.rules!.length; i++) {
      const rule = this.rules![i];
      const patternMatched = rule?.match(str, from, state, possiblyIncomplete);
      if (patternMatched) {
        if (this.emit) {
          return patternMatched.wrap(this.node, Wrapping.FULL);
        }
        return patternMatched;
      }
    }
    return null;
  }
}
