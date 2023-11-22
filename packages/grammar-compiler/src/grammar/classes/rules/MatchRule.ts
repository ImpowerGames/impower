/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MatchRuleDefinition } from "../../types/GrammarDefinition";
import { Rule } from "../../types/Rule";
import { createID } from "../../utils/createID";
import { isSwitchRuleDefinition } from "../../utils/isSwitchRuleDefinition";
import GrammarNode from "../GrammarNode";
import type GrammarRepository from "../GrammarRepository";
import GrammarState from "../GrammarState";
import Matched from "../Matched";
import RegExpMatcher from "../RegExpMatcher";
import SwitchRule from "./SwitchRule";

/**
 * A {@link Rule} subclass that uses {@link RegExpMatcher} or
 * {@link StringMatcher} instances for the underlying pattern.
 */
export default class MatchRule implements Rule {
  repo: GrammarRepository;

  id: string;

  node: GrammarNode;

  declare matcher: RegExpMatcher;

  declare captures: (GrammarNode | SwitchRule)[];

  constructor(repo: GrammarRepository, def: MatchRuleDefinition) {
    this.repo = repo;

    let id = def.id ?? createID();
    this.id = id;
    this.node = new GrammarNode(
      repo.nextTypeIndex(),
      def,
      repo.grammar.declarator
    );

    this.matcher = new RegExpMatcher(def.match, def.flags);

    if (def.captures) {
      this.captures = [];
      for (const key in def.captures) {
        const value = def.captures[key];
        const index = parseInt(key, 10);
        if (value != null) {
          const captureId = this.id + `_c${index}`;
          if (isSwitchRuleDefinition(value)) {
            this.captures[index] = repo.add(value, captureId);
          } else {
            this.captures[index] = repo.add(value, captureId);
          }
        }
      }
    }
  }

  match(str: string, from: number, state: GrammarState) {
    const result = this.matcher.match(str, from);
    if (!result) {
      return null;
    }
    const total = result[0];
    if (total == null) {
      return null;
    }
    const matched = Matched.create(this.node, from, total.length);
    if (this.captures) {
      if (result) {
        let pos = from;
        result.forEach((resultStr, resultIndex) => {
          const capture = this.captures?.[resultIndex];
          if (capture) {
            if (capture instanceof SwitchRule) {
              const children: Matched[] = [];
              let i = 0;
              while (i < resultStr.length) {
                const matched = capture.match(resultStr, i, state, false);
                if (matched) {
                  matched.offset(pos + i);
                  children.push(matched);
                  i += matched.length;
                } else {
                  const noneMatched = Matched.create(
                    GrammarNode.None,
                    pos + i,
                    1
                  );
                  children.push(noneMatched);
                  i += noneMatched.length;
                }
              }
              const captureMatched = Matched.create(
                capture.node,
                pos,
                resultStr.length,
                children.length > 0 ? children : undefined
              );
              matched.children ??= [];
              matched.children.push(captureMatched);
            } else {
              const captureMatched = Matched.create(
                capture,
                pos,
                resultStr.length
              );
              matched.children ??= [];
              matched.children.push(captureMatched);
            }
          }
          if (resultIndex > 0) {
            // First capture is always the total match so it's length shouldn't count
            pos += resultStr.length;
          }
        });
      }
    }

    return matched;
  }
}
