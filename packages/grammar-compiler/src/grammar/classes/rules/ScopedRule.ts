/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Wrapping } from "../../enums/Wrapping";
import {
  IncludeDefinition,
  MatchRuleDefinition,
  ScopedRuleDefinition,
  SwitchRuleDefinition,
} from "../../types/GrammarDefinition";
import { Rule } from "../../types/Rule";
import { createID } from "../../utils/createID";
import GrammarNode from "../GrammarNode";
import type GrammarRepository from "../GrammarRepository";
import GrammarState from "../GrammarState";
import Matched from "../Matched";
import RegExpMatcher from "../RegExpMatcher";
import type MatchRule from "./MatchRule";
import SwitchRule from "./SwitchRule";

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

  contentRule: SwitchRule;

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
    const contentId = this.id + "_content";

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
    const contentRuleItem: SwitchRuleDefinition = {
      id: contentId,
      patterns: def.patterns ?? [],
    };
    this.contentRule = repo.add(contentRuleItem, contentId);
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

    const wrappedBeginChildren: Matched[] = [];
    let wrappedContentChildren: Matched[] = [];
    const wrappedEndChildren: Matched[] = [];

    let pos = from;
    let totalLength = 0;

    // check begin
    let beginMatched = this.begin(str, pos, state);
    if (!beginMatched) {
      return null;
    }
    wrappedBeginChildren.push(beginMatched.children?.[0]!);
    totalLength += beginMatched.length;
    pos += beginMatched.length;

    const contentChildren: Matched[] = [];
    const contentFrom = pos;
    let contentLength = 0;
    // check end
    let endMatched = this.end(str, pos, state);
    while (!endMatched && pos < str.length) {
      // check patterns
      const patternMatched = this.content(str, pos, state, possiblyIncomplete);
      if (patternMatched) {
        contentChildren.push(patternMatched);
        const matchLength = patternMatched.length;
        totalLength += matchLength;
        contentLength += matchLength;
        pos += matchLength;
      } else {
        const noneMatched = Matched.create(GrammarNode.None, pos, 1);
        contentChildren.push(noneMatched);
        const matchLength = noneMatched.length;
        totalLength += matchLength;
        contentLength += matchLength;
        pos += matchLength;
      }
      // check end
      endMatched = this.end(str, pos, state);
    }
    if (contentChildren.length === 1) {
      const wrapped = contentChildren[0]!.wrap(
        this.contentRule.node,
        Wrapping.FULL
      );
      wrappedContentChildren = [wrapped];
    } else if (contentChildren.length > 1) {
      const wrapped: Matched[] = [];
      for (let i = 0; i < contentChildren.length; i++) {
        const contentChild = contentChildren[i];
        if (contentChild) {
          if (i === 0) {
            // first child
            wrapped.push(
              contentChild.wrap(this.contentRule.node, Wrapping.BEGIN)
            );
          } else if (i === contentChildren.length - 1) {
            // last child
            wrapped.push(
              contentChild.wrap(this.contentRule.node, Wrapping.END)
            );
          } else {
            wrapped.push(contentChild);
          }
        }
      }
      wrappedContentChildren = [
        Matched.create(
          this.contentRule.node,
          contentFrom,
          contentLength,
          wrapped
        ),
      ];
    }

    if (endMatched) {
      wrappedEndChildren.push(endMatched.children?.[0]!);
      totalLength += endMatched.length;
    }

    return Matched.create(this.node, from, totalLength, [
      ...wrappedBeginChildren,
      ...wrappedContentChildren,
      ...wrappedEndChildren,
    ]);
  }

  begin(str: string, from: number, state: GrammarState) {
    let beginMatched = this.beginRule.match(str, from, state);
    if (!beginMatched) {
      return null;
    }
    const captures = [""];
    beginMatched.children?.forEach((c) => {
      captures.push(str.slice(c.from, c.from + c.length));
    });
    beginMatched = beginMatched.wrap(this.node, Wrapping.BEGIN);
    this.contentRule.resolve();
    state.stack.push(this.node, this.contentRule.rules!, this, captures);
    return beginMatched;
  }

  end(str: string, from: number, state: GrammarState) {
    const begin = state.stack.at(-1);
    const beginCaptures = begin?.beginCaptures;
    if (beginCaptures) {
      this.endRule.matcher.backReferences = beginCaptures;
    }
    let endMatched = this.endRule.match(str, from, state);
    if (!endMatched) {
      return null;
    }
    endMatched = endMatched.wrap(this.node, Wrapping.END);
    state.stack.pop();
    return endMatched;
  }

  content(
    str: string,
    from: number,
    state: GrammarState,
    possiblyIncomplete?: boolean
  ) {
    return this.contentRule.match(str, from, state, possiblyIncomplete);
  }
}
