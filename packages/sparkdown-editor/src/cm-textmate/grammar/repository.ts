/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NodeID } from "../core/id";
import { isIncludeItem } from "../utils/isIncludeItem";
import { isMatchRuleItem } from "../utils/isMatchRuleItem";
import { isScopedRuleItem } from "../utils/isScopedRuleItem";
import { isSwitchRuleItem } from "../utils/isSwitchRuleItem";
import type { Grammar } from "./grammar";
import { ParserNode } from "./node";
import { MatchRule } from "./rules/match";
import { ScopedRule } from "./rules/scoped";
import { SwitchRule } from "./rules/switch";
import type * as DF from "./types/definition";
import { Rule } from "./types/rule";

/** Holds the rules, states, etc. for a {@link Grammar}. */
export class Repository {
  /** Map of names to objects stored in this repository. */
  private map = new Map<string, ParserNode | Rule>();

  /** Current {@link ParserNode} ID. */
  private curID = NodeID.SAFE;

  constructor(public grammar: Grammar) {}

  /** Returns every {@link ParserNode} in the repository, sorted by ID. */
  nodes() {
    const nodes = new Set<ParserNode>();

    for (const obj of this.map.values()) {
      if (obj instanceof ParserNode) {
        nodes.add(obj);
      } else {
        nodes.add(obj.node);
      }
    }

    return Array.from(nodes)
      .filter((v) => v !== ParserNode.None)
      .sort((a, b) => a.id - b.id);
  }

  /** Returns a fresh ID for use by a {@link ParserNode}. */
  id() {
    const id = this.curID;
    this.curID++;
    return id;
  }

  /**
   * Adds an object to the repository.
   *
   * @param obj - The object to add.
   * @param fallbackType - If `type` not specified, uses this type for the node.
   */
  add(obj: DF.ScopedRuleItem, fallbackType?: string): ScopedRule;
  add(obj: DF.MatchRuleItem, fallbackType?: string): MatchRule;
  add(obj: DF.SwitchRuleItem, fallbackType?: string): SwitchRule;
  add(obj: DF.RuleItem, fallbackType?: string): ParserNode;
  add(
    obj: DF.ScopedRuleItem | DF.MatchRuleItem | DF.RuleItem,
    fallbackType?: string
  ): ParserNode | Rule {
    // If no type was explicitly provided by the grammar, use fallbackType
    if (!obj.type) {
      obj.type = fallbackType;
    }

    // If a node of this type was already added, just return it
    if (obj.type && this.map.get(obj.type)) {
      return this.map.get(obj.type)!;
    }

    // match rule
    if (isMatchRuleItem(obj)) {
      if (!obj.captures) {
        // If no captures were explicitly specified,
        // the entire match should be captured
        obj.captures = {
          0: {
            tag: obj.tag,
            name: obj.name,
          },
        };
        delete obj.tag;
        delete obj.name;
      }
      const rule = new MatchRule(this, obj);
      this.map.set(rule.name, rule);
      return rule;
    }

    // scoped rule
    if (isScopedRuleItem(obj)) {
      const rule = new ScopedRule(this, obj);
      this.map.set(rule.name, rule);
      return rule;
    }

    // switch rule
    if (isSwitchRuleItem(obj)) {
      const rule = new SwitchRule(this, obj);
      this.map.set(rule.name, rule);
      return rule;
    }

    // must be a node
    const node = new ParserNode(this.id(), obj);
    this.map.set(node.key, node);
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
    if (!this.grammar.data?.repository) {
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
  patterns(items: DF.Patterns) {
    const rules: Rule[] = [];
    for (const item of items) {
      if (isIncludeItem(item)) {
        rules.push(...this.include(item.include));
      } else if (isMatchRuleItem(item)) {
        rules.push(this.add(item));
      } else if (isScopedRuleItem(item)) {
        rules.push(this.add(item));
      } else if (isSwitchRuleItem(item)) {
        rules.push(this.add(item));
      }
    }
    return rules;
  }
}
