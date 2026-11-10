/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type {
GrammarDefinition,
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

  definition: GrammarDefinition;

  prefix: string;

  self: SwitchRule;

  declarator?: (
    typeIndex: number,
    typeId: string,
    def: RuleDefinition,
  ) => Record<string, any>;

  private map = new Map<string, GrammarNode | Rule>();

  private ids = new WeakMap<object, string>();

  constructor(grammar: Grammar, definition: GrammarDefinition, prefix: string) {
    this.grammar = grammar;
    this.definition = definition;
    this.prefix = prefix;
    const declarator = grammar.declarator;
    this.declarator =
      declarator && prefix
        ? (typeIndex, typeId, def) =>
            declarator(typeIndex, typeId, {
              ...def,
              tag: this.qualifyTag(def.tag),
              openedBy: this.qualify(def.openedBy),
              closedBy: this.qualify(def.closedBy),
            })
        : declarator;
    this.self = new SwitchRule(
      this,
      { id: prefix, patterns: definition.patterns ?? [] },
      GrammarNode.None,
    );
  }

  private qualifyName(name: string) {
    return name.startsWith(this.prefix) ? name : this.prefix + name;
  }

  private qualify(names: string | string[] | undefined) {
    return Array.isArray(names)
      ? names.map((name) => this.qualifyName(name))
      : names && this.qualifyName(names);
  }

  private qualifyTag(tag: string | undefined) {
    const modified = tag && /^\((\S*?)\)(\s+\S+)$/.exec(tag);
    if (!modified) {
      return tag;
    }
    return `(${this.qualifyPath(modified[1]!)})${modified[2]}`;
  }

  private qualifyPath(path: string) {
    let qualified = "";
    let rest = path;
    while (rest) {
      if (rest === "...") {
        return qualified + rest;
      }
      const name = /^"(?:[^"\\]|\\.)*?"|^[^/!]+/.exec(rest)?.[0];
      if (!name) {
        qualified += rest[0];
        rest = rest.slice(1);
        continue;
      }
      if (name === "*") {
        qualified += name;
      } else if (name.startsWith('"')) {
        qualified += JSON.stringify(this.qualifyName(JSON.parse(name)));
      } else {
        qualified += this.qualifyName(name);
      }
      rest = rest.slice(name.length);
    }
    return qualified;
  }

  load() {
    const repository = this.definition.repository;
    if (repository) {
      for (const name in repository) {
        const item = repository[name];
        if (item != null) {
          this.add(item, this.prefix + name, true);
        }
      }
    }
    this.self.resolve();
    this.resolveAll();
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

  prune(): boolean {
    let pruned = this.self.prune();
    for (const obj of this.map.values()) {
      if (obj instanceof SwitchRule && obj.prune()) {
        pruned = true;
      }
    }
    return pruned;
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
    return this.grammar.nextTypeIndex();
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
    const ruleId = this.ids.get(obj) || id || obj.id;
    if (ruleId) {
      this.ids.set(obj, ruleId);
      const existing = this.map.get(ruleId);
      if (existing) {
        return existing;
      }
    }
    const def = ruleId === obj.id ? obj : { ...obj, id: ruleId };

    if (isMatchRuleDefinition(def)) {
      const rule = new MatchRule(this, def);
      this.map.set(rule.id, rule);
      return rule;
    }

    if (isScopedRuleDefinition(def)) {
      const rule = new ScopedRule(this, def);
      this.map.set(rule.id, rule);
      return rule;
    }

    if (isSwitchRuleDefinition(def)) {
      const rule = new SwitchRule(this, def);
      this.map.set(rule.id, rule);
      return rule;
    }

    if (isIncludeDefinition(def)) {
      const rule = new SwitchRule(this, {
        ...def,
        patterns: [{ include: def.include }],
      });
      this.map.set(rule.id, rule);
      return rule;
    }

    if (id && isRepositoryRule) {
      const matchDef = { match: "(.+)", ...(def as any) };
      const rule = new MatchRule(this, matchDef);
      this.map.set(rule.id, rule);
      return rule;
    }

    const node = new GrammarNode(
      this.nextTypeIndex(),
      def,
      this.declarator,
    );
    this.map.set(node.typeId, node);
    return node;
  }

  include(str: string): Rule[] {
    if (str === "$self") {
      return [this.self];
    }
    if (str === "$base") {
      return [this.grammar.load(this.grammar.definition).self];
    }
    const sharp = str.indexOf("#");
    if (sharp === 0) {
      return this.rule(str.slice(1));
    }
    const repository = this.grammar.repositoryOf(
      sharp < 0 ? str : str.slice(0, sharp),
    );
    if (!repository) {
      return [];
    }
    return sharp < 0 ? [repository.self] : repository.rule(str.slice(sharp + 1));
  }

  rule(name: string): Rule[] {
    const repository = this.definition.repository;
    if (!repository || !Object.hasOwn(repository, name)) {
      return [];
    }
    const includedRule = this.map.get(this.prefix + name);
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
    let missing = false;
    if (items) {
      items.forEach((item, i) => {
        const patternId = idPrefix + `-p${i}`;
        if (isIncludeDefinition(item)) {
          const included = this.include(item.include);
          missing ||= included.length === 0;
          rules.push(...included);
        } else if (isMatchRuleDefinition(item)) {
          rules.push(this.add(item, patternId));
        } else if (isScopedRuleDefinition(item)) {
          rules.push(this.add(item, patternId));
        } else if (isSwitchRuleDefinition(item)) {
          rules.push(this.add(item, patternId));
        }
      });
    }
    return { rules, missing };
  }
}
