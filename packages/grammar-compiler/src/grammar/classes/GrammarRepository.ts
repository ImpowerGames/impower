/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NodeID } from "../../core";

import {
  IncludeDefinition,
  MatchRuleDefinition,
  RuleDefinition,
  ScopedRuleDefinition,
  SwitchRuleDefinition,
} from "../types/GrammarDefinition";
import { Rule } from "../types/Rule";
import { isIncludeDefinition } from "../utils/isIncludeDefinition";
import { isMatchRuleDefinition } from "../utils/isMatchRuleDefinition";
import { isScopedRuleDefinition } from "../utils/isScopedRuleDefinition";
import { isSwitchRuleDefinition } from "../utils/isSwitchRuleDefinition";
import type Grammar from "./Grammar";
import GrammarNode from "./GrammarNode";
import MatchRule from "./rules/MatchRule";
import ScopedRule from "./rules/ScopedRule";
import SwitchRule from "./rules/SwitchRule";

/** Holds the rules, states, etc. for a {@link Grammar}. */
export default class GrammarRepository {
  grammar: Grammar;

  /** Map of names to objects stored in this repository. */
  private map = new Map<string, GrammarNode | Rule>();

  /** Current {@link GrammarNode} ID. */
  private curID = NodeID.safe;

  constructor(grammar: Grammar) {
    this.grammar = grammar;
  }

  /** Returns every {@link GrammarNode} in the repository, sorted by type index. */
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

  /** Returns a fresh ID for use by a {@link GrammarNode}. */
  nextTypeIndex() {
    const id = this.curID;
    this.curID++;
    return id;
  }

  /**
   * Adds an object to the repository.
   *
   * @param obj - The object to add.
   * @param id - If `id` not specified, uses this id for the node.
   */
  add(obj: ScopedRuleDefinition, id?: string): ScopedRule;
  add(obj: MatchRuleDefinition, id?: string): MatchRule;
  add(obj: SwitchRuleDefinition, id?: string): SwitchRule;
  add(obj: RuleDefinition, id?: string): GrammarNode;
  add(
    obj: ScopedRuleDefinition | MatchRuleDefinition | RuleDefinition,
    id?: string
  ): GrammarNode | Rule {
    // If no id was explicitly provided by the grammar, use fallback id
    if (!obj.id) {
      obj.id = id;
    }

    // If a node of this type was already added, just return it
    if (obj.id && this.map.get(obj.id)) {
      return this.map.get(obj.id)!;
    }

    // match rule
    if (isMatchRuleDefinition(obj)) {
      const rule = new MatchRule(this, obj);
      this.map.set(rule.id, rule);
      return rule;
    }

    // scoped rule
    if (isScopedRuleDefinition(obj)) {
      const rule = new ScopedRule(this, obj);
      this.map.set(rule.id, rule);
      return rule;
    }

    // switch rule
    if (isSwitchRuleDefinition(obj)) {
      const rule = new SwitchRule(this, obj);
      this.map.set(rule.id, rule);
      return rule;
    }

    // must be a node
    const node = new GrammarNode(
      this.nextTypeIndex(),
      obj,
      this.grammar.declarator
    );
    this.map.set(node.typeId, node);
    return node;
  }

  /**
   * Gets an object from this repository. If it doesn't exist already, the
   * grammar definition will be checked. Returns `undefined` if nothing can
   * be found.
   *
   * @param key - The name of the object to get.
   */
  get(key: string) {
    const result = this.map.get(key);

    if (!result) {
      throw new Error(`${key} not found in repository`);
    }

    return result;
  }

  /**
   * Processes an `include` from the grammar definition, by name.
   *
   * @param str - The name of the `include` to process.
   */
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

  /**
   * Processes an "patterns" list of rules/includes, returning a resolved rules list.
   *
   * @param items - The list of rule/include items to process.
   */
  getRules(items: IncludeDefinition[], idPrefix: string) {
    const rules: Rule[] = [];
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
    return rules;
  }
}
