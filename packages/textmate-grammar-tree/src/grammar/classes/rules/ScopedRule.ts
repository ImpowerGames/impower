/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NodeID } from "../../../core/enums/NodeID";
import { Wrapping } from "../../enums/Wrapping";
import type {
MatchRuleDefinition,
ScopedRuleDefinition,
SwitchRuleDefinition,
} from "../../types/GrammarDefinition";
import type { Rule } from "../../types/Rule";
import { createID } from "../../utils/createID";
import { GrammarNode } from "../GrammarNode";
import type { GrammarRepository } from "../GrammarRepository";
import { GrammarState } from "../GrammarState";
import { Matched } from "../Matched";
import type { MatchRule } from "./MatchRule";
import { SwitchRule } from "./SwitchRule";

const EMPTY_MATCH_LIMIT = 10;

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

    if ("while" in def) {
      throw new Error("while rules are not currently supported");
    }

    let id = def.id ?? createID();
    this.id = id;
    this.node = new GrammarNode(
      repo.nextTypeIndex(),
      def,
      repo.grammar.declarator,
    );

    const beginId = this.id + "_begin";
    const endId = this.id + "_end";
    const contentId = this.id + "_content";

    const beginRuleItem: MatchRuleDefinition = {
      id: beginId,
      match: def.begin,
      captures: def.beginCaptures ?? def.captures,
      closedBy: (def.closedBy ?? def.brackets) ? endId : undefined,
    };
    this.beginRule = repo.add(beginRuleItem, beginId);

    const endRuleItem: MatchRuleDefinition = {
      id: endId,
      match: def.end,
      captures: def.endCaptures ?? def.captures,
      openedBy: (def.openedBy ?? def.brackets) ? beginId : undefined,
    };
    this.endRule = repo.add(endRuleItem, endId);

    const contentRuleItem: SwitchRuleDefinition = {
      id: contentId,
      patterns: def.patterns ?? [],
      tag: def.contentTag,
    };
    this.contentRule = repo.add(contentRuleItem, contentId);

    this.applyEndPatternLast = def.applyEndPatternLast ?? false;
  }

  match(state: GrammarState, from: number) {
    if (state.possibleStackOverflow(this.id, from)) {
      return null;
    }
    state.enter(this.id, from);
    const wrappedBeginChildren: Matched[] = [];
    let wrappedContentChildren: Matched[] = [];
    const wrappedEndChildren: Matched[] = [];

    let pos = from;
    let totalLength = 0;

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
    let endMatched = this.applyEndPatternLast ? false : this.end(state, pos);

    let emptyMatchCount = 0;

    while (!endMatched && pos < state.str.length) {
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
              patternMatched,
            );
            break;
          }
        } else {
          emptyMatchCount = 0;
          pos += patternMatched.length;
          totalLength += patternMatched.length;
        }
        contentChildren.push(patternMatched);
        if (pos >= state.str.length) {
          state.advance();
        }
        if (!this.applyEndPatternLast) {
          endMatched = this.end(state, pos);
        }
      } else {
        endMatched = this.end(state, pos);
        break;
      }
    }
    if (!endMatched && pos >= state.str.length) {
      endMatched = this.end(state, pos);
    }
    const closedAtEof = !endMatched && pos >= state.str.length;
    if (contentChildren.length === 1) {
      const wrapped = contentChildren[0]!.wrap(
        this.contentRule.node,
        Wrapping.FULL,
      );
      wrappedContentChildren = [wrapped];
    } else if (contentChildren.length > 1) {
      const wrapped: Matched[] = [];
      for (let i = 0; i < contentChildren.length; i++) {
        const contentChild = contentChildren[i];
        if (contentChild) {
          if (i === 0) {
            wrapped.push(
              contentChild.wrap(this.contentRule.node, Wrapping.BEGIN),
            );
          } else if (i === contentChildren.length - 1) {
            wrapped.push(
              contentChild.wrap(this.contentRule.node, Wrapping.END),
            );
          } else {
            wrapped.push(contentChild);
          }
        }
      }
      wrappedContentChildren = wrapped;
    }

    if (endMatched || closedAtEof) {
      if (endMatched) {
        wrappedEndChildren.push(endMatched.children?.[0]!);
        totalLength += endMatched.length;
      }
      state.exit(this.id, from);
      return Matched.create(this.node, from, totalLength, [
        ...wrappedBeginChildren,
        ...wrappedContentChildren,
        ...wrappedEndChildren,
      ]);
    } else {
      const incompleteMarker = Matched.create(
        this.repo.grammar.nodes[NodeID.incomplete]!,
        from + totalLength,
        0,
      );

      const incompleteNode = Matched.create(this.node, from, totalLength, [
        ...wrappedBeginChildren,
        ...wrappedContentChildren,
        incompleteMarker,
      ]);
      state.exit(this.id, from);
      return incompleteNode;
    }
  }

  begin(state: GrammarState, from: number) {
    const begun = this.beginRule.matchGroups(state, from);
    if (!begun) {
      return null;
    }
    const captures = begun.groups.map((group) => group ?? "");
    const beginMatched = begun.matched.wrap(this.node, Wrapping.BEGIN);
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
