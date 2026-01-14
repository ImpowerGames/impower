/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Wrapping } from "../../enums/Wrapping";
import {
  MatchRuleDefinition,
  ScopedRuleDefinition,
  SwitchRuleDefinition,
} from "../../types/GrammarDefinition";
import { Rule } from "../../types/Rule";
import { createID } from "../../utils/createID";
import { GrammarNode } from "../GrammarNode";
import type { GrammarRepository } from "../GrammarRepository";
import { GrammarState } from "../GrammarState";
import { Matched } from "../Matched";
import { RegExpMatcher } from "../RegExpMatcher";
import type { MatchRule } from "./MatchRule";
import { SwitchRule } from "./SwitchRule";

const EMPTY_MATCH_LIMIT = 10;

/**
 * A {@link Rule} subclass that uses {@link RegExpMatcher} or
 * {@link StringMatcher} instances for the underlying pattern.
 */
export class ScopedRule implements Rule {
  repo: GrammarRepository;

  id: string;

  node: GrammarNode;

  beginRule: MatchRule;

  endRule: MatchRule;

  contentRule: SwitchRule;

  applyEndPatternLast: boolean;

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

    if ("while" in def) {
      throw new Error("while rules are not currently supported");
    }

    // end
    const endRuleItem: MatchRuleDefinition = {
      id: endId,
      match: def.end,
      captures: def.endCaptures,
      openedBy: def.openedBy ?? def.brackets ? beginId : undefined,
    };
    this.endRule = repo.add(endRuleItem, endId);

    // content
    const contentRuleItem: SwitchRuleDefinition = {
      id: contentId,
      patterns: def.patterns ?? [],
    };
    this.contentRule = repo.add(contentRuleItem, contentId);

    this.applyEndPatternLast = def.applyEndPatternLast ?? false;
  }

  /**
   * @param str - The string to match.
   * @param from - The position to start matching at.
   * @param state - The current {@link GrammarState}.
   */
  match(state: GrammarState, from: number) {
    if (state.possibleStackOverflow(this.id, from)) {
      return null; // Detected infinite recursion
    }
    state.enter(this.id, from);
    const wrappedBeginChildren: Matched[] = [];
    let wrappedContentChildren: Matched[] = [];
    const wrappedEndChildren: Matched[] = [];

    let pos = from;
    let totalLength = 0;

    // check begin
    let beginMatched = this.begin(state, pos);
    if (!beginMatched) {
      state.exit(this.id, from);
      return null;
    }
    wrappedBeginChildren.push(beginMatched.children?.[0]!);
    totalLength += beginMatched.length;
    pos += beginMatched.length;
    if (pos >= state.str.length) {
      state.advance();
    }

    const contentChildren: Matched[] = [];
    // check end
    let endMatched = this.applyEndPatternLast ? false : this.end(state, pos);

    let emptyMatchCount = 0;

    while (!endMatched && pos < state.str.length) {
      // check patterns
      const patternMatched = this.content(state, pos);
      if (patternMatched) {
        if (patternMatched.length === 0) {
          emptyMatchCount++;
          if (emptyMatchCount >= EMPTY_MATCH_LIMIT) {
            console.warn(
              `[ScopedRule:${
                this.id
              }] Too many consecutive empty matches at pos=${
                state.absolutePos + pos
              }. Possible infinite loop!`,
              patternMatched
            );
            break;
          }
        } else {
          emptyMatchCount = 0; // reset counter on progress
          pos += patternMatched.length;
          totalLength += patternMatched.length;
        }
        // A pattern matched
        contentChildren.push(patternMatched);
        if (pos >= state.str.length) {
          state.advance();
        }
        if (!this.applyEndPatternLast) {
          // When applyEndPatternLast is false, we should check the end pattern before every iteration
          endMatched = this.end(state, pos);
        }
      } else {
        // None of the patterns matched,
        // so check for end match and forcibly exit scope no matter what
        endMatched = this.end(state, pos);
        break;
      }
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
      wrappedContentChildren = wrapped;
    }

    if (endMatched) {
      wrappedEndChildren.push(endMatched.children?.[0]!);
      totalLength += endMatched.length;
      state.exit(this.id, from);
      return Matched.create(this.node, from, totalLength, [
        ...wrappedBeginChildren,
        ...wrappedContentChildren,
        ...wrappedEndChildren,
      ]);
    } else {
      // No end matched: incomplete scope
      // TODO: Mark node as incomplete?
      const incompleteNode = Matched.create(this.node, from, totalLength, [
        ...wrappedBeginChildren,
        ...wrappedContentChildren,
      ]);
      state.exit(this.id, from);
      return incompleteNode;
    }
  }

  begin(state: GrammarState, from: number) {
    let beginMatched = this.beginRule.match(state, from);
    if (!beginMatched) {
      return null;
    }
    const captures = [""];
    beginMatched.children?.forEach((c) => {
      captures.push(state.str.slice(c.from, c.from + c.length));
    });
    beginMatched = beginMatched.wrap(this.node, Wrapping.BEGIN);
    this.contentRule.resolve();
    state.stack.push(this.node, captures);
    return beginMatched;
  }

  end(state: GrammarState, from: number) {
    const begin = state.stack.at(-1);
    const beginCaptures = begin?.beginCaptures;
    if (beginCaptures) {
      this.endRule.matcher.backReferences = beginCaptures;
    }
    let endMatched = this.endRule.match(state, from);
    if (!endMatched) {
      return null;
    }
    endMatched = endMatched.wrap(this.node, Wrapping.END);
    state.stack.pop();
    return endMatched;
  }

  content(state: GrammarState, from: number) {
    return this.contentRule.match(state, from);
  }
}
