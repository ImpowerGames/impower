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

/**
 * A {@link Rule} subclass that uses {@link RegExpMatcher} or
 * {@link StringMatcher} instances for the underlying pattern.
 */
export class SwitchRule implements Rule {
  name: string;

  node: ParserNode;

  patterns?: DF.Patterns;

  rules?: Rule[];

  constructor(repo: Repository, item: DF.SwitchRuleItem) {
    let type = item.type ?? createID();
    let emit = (item.type && item.emit !== false) || item.autocomplete;
    this.name = type;
    this.node = !emit ? ParserNode.None : new ParserNode(repo.id(), item);

    // patterns
    this.patterns = item.patterns;
  }

  resolve(repo: Repository) {
    // patterns
    this.rules = this.patterns ? repo.patterns(this.patterns) : [];
    this.rules.forEach((rule) => {
      rule.resolve?.(repo);
    });
  }

  /**
   * @param str - The string to match.
   * @param pos - The position to start matching at.
   * @param state - The current {@link GrammarState}.
   */
  match(str: string, pos: number, state: GrammarState) {
    if (!this.rules) {
      throw new Error("Rules were not resolved prior to matching");
    }
    for (let i = 0; i < this.rules.length; i += 1) {
      const rule = this.rules[i];
      if (rule) {
        const output = rule.match(str, pos, state);
        if (output) {
          return output;
        }
      }
    }
    return null;
  }
}
