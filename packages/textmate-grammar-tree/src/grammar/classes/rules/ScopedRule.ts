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
import {
  expandCaptureReferences,
  hasCaptureReferences,
} from "../../utils/captureReferences";
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

  nameTemplate: string | undefined;

  contentNameTemplate: string | undefined;

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

    const contentId = this.id + "_content";

    const beginRuleItem: MatchRuleDefinition = {
      match: def.begin,
      captures: def.beginCaptures ?? def.captures,
    };
    const endRuleItem: MatchRuleDefinition = {
      match: def.end,
      captures: def.endCaptures ?? def.captures,
    };
    const beginId = repo.claim(beginRuleItem, this.id + "_begin");
    const endId = repo.claim(endRuleItem, this.id + "_end");
    beginRuleItem.id = beginId;
    beginRuleItem.closedBy =
      (def.closedBy ?? def.brackets) ? repo.local(endId) : undefined;
    endRuleItem.id = endId;
    endRuleItem.openedBy =
      (def.openedBy ?? def.brackets) ? repo.local(beginId) : undefined;
    this.beginRule = repo.add(beginRuleItem, beginId);
    this.endRule = repo.add(endRuleItem, endId);

    const contentRuleItem: SwitchRuleDefinition = {
      id: contentId,
      name: def.contentName,
      patterns: def.patterns ?? [],
      tag: def.contentTag,
    };
    this.contentRule = repo.add(contentRuleItem, contentId);

    this.applyEndPatternLast = def.applyEndPatternLast ?? false;

    this.nameTemplate = hasCaptureReferences(def.name) ? def.name : undefined;
    this.contentNameTemplate = hasCaptureReferences(def.contentName)
      ? def.contentName
      : undefined;
  }

  nodeFor(beginCaptures: readonly string[]): GrammarNode {
    return this.nameTemplate === undefined
      ? this.node
      : this.repo.expand(
          this.node,
          expandCaptureReferences(this.nameTemplate, beginCaptures),
        );
  }

  contentNodeFor(beginCaptures: readonly string[]): GrammarNode {
    return this.contentNameTemplate === undefined
      ? this.contentRule.node
      : this.repo.expand(
          this.contentRule.node,
          expandCaptureReferences(this.contentNameTemplate, beginCaptures),
        );
  }

  begin(state: GrammarState, from: number) {
    const begun = this.beginRule.matchGroups(state, from);
    if (!begun) {
      return null;
    }
    const captures = begun.groups.map((group) => group ?? "");
    const beginMatched = begun.matched.wrap(
      this.nodeFor(captures),
      Wrapping.BEGIN,
    );
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
    const popped = state.popScope(from);
    return endMatched.wrap(
      popped ? this.nodeFor(popped.beginCaptures) : this.node,
      Wrapping.END,
    );
  }

  get skipped() {
    return this.contentRule.skipped;
  }
}
