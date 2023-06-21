/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MatchRuleDefinition } from "../../types/GrammarDefinition";
import { Rule } from "../../types/Rule";
import { createID } from "../../utils/createID";
import { isSwitchRuleData } from "../../utils/isSwitchRuleData";
import { tryMatch } from "../../utils/tryMatch";
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
    let emit = def.id || def.autocomplete;
    this.id = id;
    this.node = !emit
      ? GrammarNode.None
      : new GrammarNode(repo.nextTypeIndex(), def, repo.grammar.declarator);

    this.matcher = new RegExpMatcher(def.match, def.flags);

    if (def.captures) {
      this.captures = [];
      for (const key in def.captures) {
        const value = def.captures[key];
        const index = parseInt(key, 10);
        if (value != null) {
          const captureId = this.id + `-c${index}`;
          if (isSwitchRuleData(value)) {
            this.captures[index] = repo.add(value, captureId);
          } else {
            this.captures[index] = repo.add(value, captureId);
          }
        }
      }
    }
  }

  match(str: string, pos: number, state: GrammarState) {
    const result = this.matcher.match(str, pos);
    if (!result) {
      return null;
    }
    const total = result[0];
    if (total == null) {
      return null;
    }
    const matched = new Matched(state, this.node, total, pos);
    if (this.captures) {
      if (result) {
        let from = pos;
        result.forEach((resultStr, resultIndex) => {
          const capture = this.captures?.[resultIndex];
          if (capture) {
            if (capture instanceof SwitchRule) {
              if (!capture.rules) {
                capture.rules = capture.patterns
                  ? this.repo.getRules(capture.patterns, this.id)
                  : [];
              }
              const nestedCaptures: Matched[] = [];
              state.stack.push(capture.node, capture.rules, null);
              for (let i = 0; i < resultStr.length; i += 1) {
                const matched = tryMatch(state, resultStr, i, from + i);
                if (matched) {
                  nestedCaptures.push(matched);
                  i += matched.total.length - 1;
                } else {
                  // Reserve space for unrecognized tokens
                  nestedCaptures.push(
                    new Matched(
                      state,
                      GrammarNode.None,
                      resultStr[i]!,
                      from + i
                    )
                  );
                }
              }
              state.stack.pop();
              if (nestedCaptures.length > 0) {
                const captureMatched = new Matched(
                  state,
                  capture.node,
                  resultStr,
                  nestedCaptures[0]?.from ?? from,
                  nestedCaptures
                );
                matched.captures ??= [];
                matched.captures.push(captureMatched);
              }
            } else {
              matched.captures ??= [];
              matched.captures.push(
                new Matched(state, capture, resultStr, from)
              );
            }
          }
          if (resultIndex > 0) {
            // First capture is always the total match so it's length shouldn't count
            from += resultStr.length;
          }
        });
      }
    }
    return matched;
  }
}
