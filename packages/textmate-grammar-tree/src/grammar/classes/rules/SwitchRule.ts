/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Wrapping } from "../../enums/Wrapping";
import type {
IncludeDefinition,
SwitchRuleDefinition,
} from "../../types/GrammarDefinition";
import type { Rule } from "../../types/Rule";
import { createID } from "../../utils/createID";
import { GrammarNode } from "../GrammarNode";
import type { GrammarRepository } from "../GrammarRepository";
import { GrammarState } from "../GrammarState";

export class SwitchRule implements Rule {
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
      repo.grammar.declarator,
    );

    this.emit = def.emit;

    this.patterns = def.patterns;
  }

  match(state: GrammarState, from: number) {
    return this.pattern(state, from);
  }

  resolve() {
    if (!this.rules) {
      this.rules = this.patterns
        ? this.repo.getRules(this.patterns, this.id)
        : [];
    }
  }

  pattern(state: GrammarState, from: number) {
    if (state.possibleStackOverflow(this.id, from)) {
      return null;
    }
    state.enter(this.id, from);
    this.resolve();
    for (let i = 0; i < this.rules!.length; i++) {
      const rule = this.rules![i];
      const patternMatched = rule?.match(state, from);
      if (patternMatched) {
        if (this.emit) {
          state.exit(this.id, from);
          return patternMatched.wrap(this.node, Wrapping.FULL);
        }
        state.exit(this.id, from);
        return patternMatched;
      }
    }
    state.exit(this.id, from);
    return null;
  }
}
