/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createID } from "../../utils/createID";
import { isSwitchRuleItem } from "../../utils/isSwitchRuleItem";
import { match } from "../../utils/match";
import { Matched } from "../matched";
import { ParserNode } from "../node";
import { RegExpMatcher } from "../regexp";
import type { Repository } from "../repository";
import { GrammarState } from "../state";
import type * as DF from "../types/definition";
import { Rule } from "../types/rule";
import { SwitchRule } from "./switch";

/**
 * A {@link Rule} subclass that uses {@link RegExpMatcher} or
 * {@link StringMatcher} instances for the underlying pattern.
 */
export class MatchRule implements Rule {
  name: string;

  node: ParserNode;

  declare matcher: RegExpMatcher;

  declare captures: (ParserNode | SwitchRule)[];

  constructor(repo: Repository, item: DF.MatchRuleItem) {
    let type = item.type ?? createID();
    let emit = (item.type && item.emit !== false) || item.autocomplete;
    this.name = type;
    this.node = !emit ? ParserNode.None : new ParserNode(repo.id(), item);

    this.matcher = new RegExpMatcher(item.match, item.flags);

    if (item.captures) {
      this.captures = [];
      for (const key in item.captures) {
        const value = item.captures[key];
        const index = parseInt(key, 10);
        if (value != null) {
          if (isSwitchRuleItem(value)) {
            this.captures[index] = repo.add(value, this.name + "-" + index);
          } else {
            this.captures[index] = repo.add(value, this.name + "-" + index);
          }
        }
      }
    }
  }

  resolve(repo: Repository) {
    // patterns
    this.captures.forEach((capture) => {
      if (capture instanceof SwitchRule) {
        capture.resolve(repo);
      }
    });
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
    state.last = result;
    if (this.captures) {
      if (result) {
        if (!matched.captures) {
          matched.captures = [];
        }
        let from = pos;
        result.forEach((resultStr, resultIndex) => {
          const capture = this.captures?.[resultIndex];
          if (capture) {
            if (capture instanceof SwitchRule) {
              if (!capture.rules) {
                throw new Error("Rules were not resolved prior to matching");
              }
              const captureMatched = new Matched(
                state,
                capture.node,
                resultStr,
                from
              );
              state.stack.push(capture.node, capture.rules, null);
              for (let i = 0; i < resultStr.length; i += 1) {
                const matched = match(state, resultStr, i, from + i);
                if (matched) {
                  captureMatched.captures ??= [];
                  captureMatched.captures.push(matched);
                  i += matched.total.length - 1;
                } else {
                  const unrecognized = new Matched(
                    state,
                    ParserNode.None,
                    resultStr[i] || "",
                    from + i
                  );
                  captureMatched.captures ??= [];
                  captureMatched.captures.push(unrecognized);
                }
              }
              state.stack.pop();
              matched.captures!.push(captureMatched);
            } else {
              matched.captures!.push(
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
