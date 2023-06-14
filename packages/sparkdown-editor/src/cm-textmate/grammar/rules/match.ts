/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createID } from "../../utils/createID";
import { isSwitchRuleItem } from "../../utils/isSwitchRuleItem";
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

    this.matcher = new RegExpMatcher(item.match);

    if (item.captures) {
      this.captures = [];
      for (const key in item.captures) {
        const value = item.captures[key];
        const idx = parseInt(key, 10);
        if (value != null) {
          if (isSwitchRuleItem(value)) {
            this.captures[idx] = repo.add(value, this.name + "-" + idx);
          } else {
            this.captures[idx] = repo.add(value, this.name + "-" + idx);
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
    if (!total) {
      return null;
    }
    const matched = new Matched(state, this.node, total, pos);
    state.last = result;
    if (this.captures) {
      if (result) {
        const captures: Matched[] = [];
        let capturePos = pos;
        result.forEach((capturedStr, i) => {
          const capture = this.captures?.[i];
          if (capture) {
            if (capture instanceof SwitchRule) {
              const truncatedStr = str.slice(
                0,
                capturePos + capturedStr.length
              );
              const switchMatched = capture.match(
                truncatedStr,
                capturePos,
                state
              );
              if (switchMatched) {
                captures.push(switchMatched);
              }
            } else {
              captures.push(
                new Matched(state, capture, capturedStr, capturePos)
              );
            }
          }
          if (i > 0) {
            // First capture is always the total match so it's length shouldn't count
            capturePos += capturedStr.length;
          }
        });
        matched.captures = captures;
      }
    }
    return matched;
  }
}
