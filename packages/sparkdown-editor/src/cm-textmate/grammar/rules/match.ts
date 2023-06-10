/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createID } from "../../utils/createID";
import { Matched } from "../matched";
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
export class MatchRule implements Rule {
  name: string;

  node: ParserNode;

  declare matcher: RegExpMatcher;

  declare captures: ParserNode[];

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
          this.captures[idx] = repo.add(value, this.name + "-" + idx);
        }
      }
    }
  }

  match(str: string, pos: number, state: GrammarState) {
    const output = this.matcher.match(str, pos);
    if (output) {
      const matched = new Matched(state, this.node, output.total, pos);
      state.last = output;
      if (this.captures) {
        if (output.captures) {
          const captures: Matched[] = [];
          let capturePos = pos;
          this.captures.forEach((node, i) => {
            const capture = output.captures?.[i] ?? "";
            captures.push(new Matched(state, node, capture, capturePos));
            capturePos += capture.length;
          });
          matched.captures = captures;
        }
      }
      return matched;
    }
    return null;
  }
}
