/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

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
import type { GrammarState } from "../GrammarState";
import type { Matched } from "../Matched";
import type { MatchRule } from "./MatchRule";
import type { SwitchRule } from "./SwitchRule";

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
      repo.declarator,
    );

    const beginId = this.id + "_begin";
    const endId = this.id + "_end";
    const contentId = this.id + "_content";

    const beginRuleItem: MatchRuleDefinition = {
      id: beginId,
      match: def.begin,
      captures: def.beginCaptures ?? def.captures,
      closedBy: (def.closedBy ?? def.brackets) ? repo.local(endId) : undefined,
    };
    this.beginRule = repo.add(beginRuleItem, beginId);

    const endRuleItem: MatchRuleDefinition = {
      id: endId,
      match: def.end,
      captures: def.endCaptures ?? def.captures,
      openedBy: (def.openedBy ?? def.brackets) ? repo.local(beginId) : undefined,
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

  begin(state: GrammarState, from: number) {
    const begun = this.beginRule.matchGroups(state, from);
    if (!begun) {
      return null;
    }
    const captures = begun.groups.map((group) => group ?? "");
    const beginMatched = begun.matched.wrap(this.node, Wrapping.BEGIN);
    this.contentRule.resolve();
    state.pushScope(this.node, captures, from, from + beginMatched.length);
    return beginMatched;
  }

  matchEnd(state: GrammarState, from: number) {
    const beginCaptures = state.stack.at(-1)?.beginCaptures;
    if (beginCaptures) {
      this.endRule.matcher.backReferences = beginCaptures;
    }
    return this.endRule.match(state, from);
  }

  endsAt(state: GrammarState, from: number) {
    return this.matchEnd(state, from) != null;
  }

  close(state: GrammarState, from: number, endMatched: Matched) {
    state.popScope(from);
    return endMatched.wrap(this.node, Wrapping.END);
  }

  get skipped() {
    return this.contentRule.skipped;
  }
}
