/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NodeID } from "../../core";

import type {
IncludeDefinition,
MatchRuleDefinition,
RuleDefinition,
ScopedRuleDefinition,
SwitchRuleDefinition,
} from "../types/GrammarDefinition";
import type { Rule } from "../types/Rule";
import { isIncludeDefinition } from "../utils/isIncludeDefinition";
import { isMatchRuleDefinition } from "../utils/isMatchRuleDefinition";
import { isScopedRuleDefinition } from "../utils/isScopedRuleDefinition";
import { isSwitchRuleDefinition } from "../utils/isSwitchRuleDefinition";
import type { Grammar } from "./Grammar";
import { GrammarNode } from "./GrammarNode";
import { MatchRule } from "./rules/MatchRule";
import { ScopedRule } from "./rules/ScopedRule";
import { SwitchRule } from "./rules/SwitchRule";

export class GrammarRepository {
  grammar: Grammar;

  private map = new Map<string, GrammarNode | Rule>();

  private curID = NodeID.safe;

  constructor(grammar: Grammar) {
    this.grammar = grammar;
  }

  nodes() {
    const nodes = new Set<GrammarNode>();

    for (const obj of this.map.values()) {
      if (obj instanceof GrammarNode) {
        nodes.add(obj);
      } else {
        nodes.add(obj.node);
      }
    }

    return Array.from(nodes)
      .filter((v) => v.typeIndex >= 0)
      .sort((a, b) => a.typeIndex - b.typeIndex);
  }

  resolveAll() {
    for (const obj of this.map.values()) {
      if (obj instanceof SwitchRule) {
        try {
          obj.resolve();
        } catch {
        }
      }
    }
  }

  nextTypeIndex() {
    const id = this.curID;
    this.curID++;
    return id;
  }

  add(
    obj: ScopedRuleDefinition,
    id?: string,
    isRepositoryRule?: boolean,
  ): ScopedRule;
  add(
    obj: MatchRuleDefinition,
    id?: string,
    isRepositoryRule?: boolean,
  ): MatchRule;
  add(
    obj: SwitchRuleDefinition,
    id?: string,
    isRepositoryRule?: boolean,
  ): SwitchRule;
  add(
    obj: RuleDefinition,
    id?: string,
    isRepositoryRule?: boolean,
  ): GrammarNode;
  add(
    obj: ScopedRuleDefinition | MatchRuleDefinition | RuleDefinition,
    id?: string,
    isRepositoryRule?: boolean,
  ): GrammarNode | Rule {
    if (!obj.id) {
      obj.id = id;
    }

    if (obj.id && this.map.get(obj.id)) {
      return this.map.get(obj.id)!;
    }

    if (isMatchRuleDefinition(obj)) {
      const rule = new MatchRule(this, obj);
      this.map.set(rule.id, rule);
      return rule;
    }

    if (isScopedRuleDefinition(obj)) {
      const rule = new ScopedRule(this, obj);
      this.map.set(rule.id, rule);
      return rule;
    }

    if (isSwitchRuleDefinition(obj)) {
      const rule = new SwitchRule(this, obj);
      this.map.set(rule.id, rule);
      return rule;
    }

    if (id && isRepositoryRule) {
      const matchDef = { match: "(.+)", ...(obj as any) };
      const rule = new MatchRule(this, matchDef);
      this.map.set(rule.id, rule);
      return rule;
    }

    const node = new GrammarNode(
      this.nextTypeIndex(),
      obj,
      this.grammar.declarator,
    );
    this.map.set(node.typeId, node);
    return node;
  }

  get(key: string) {
    const result = this.map.get(key);

    if (!result) {
      throw new Error(`${key} not found in repository`);
    }

    return result;
  }

  include(str: string): Rule[] {
    if (!this.grammar.definition?.repository) {
      throw new Error("no includes defined");
    }
    const name = str[0] === "#" ? str.slice(1) : str;
    const includedRule = this.get(name);
    if (!includedRule) {
      throw new Error(`include ${name} not found`);
    }
    if (
      includedRule instanceof MatchRule ||
      includedRule instanceof ScopedRule ||
      includedRule instanceof SwitchRule
    ) {
      return [includedRule];
    }
    return [];
  }

  getRules(items: IncludeDefinition[], idPrefix: string) {
    const rules: Rule[] = [];
    if (items) {
      items.forEach((item, i) => {
        const patternId = idPrefix + `-p${i}`;
        if (isIncludeDefinition(item)) {
          rules.push(...this.include(item.include));
        } else if (isMatchRuleDefinition(item)) {
          rules.push(this.add(item, patternId));
        } else if (isScopedRuleDefinition(item)) {
          rules.push(this.add(item, patternId));
        } else if (isSwitchRuleDefinition(item)) {
          rules.push(this.add(item, patternId));
        }
      });
    }
    return rules;
  }
}
