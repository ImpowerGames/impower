/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type {
GrammarDefinition,
IncludeDefinition,
MatchRuleDefinition,
RepositoryDefinition,
RuleDefinition,
ScopedRuleDefinition,
SwitchRuleDefinition,
} from "../types/GrammarDefinition";
import type { Rule } from "../types/Rule";
import { isIncludeDefinition } from "../utils/isIncludeDefinition";
import { isMatchRuleDefinition } from "../utils/isMatchRuleDefinition";
import { isScopedRuleDefinition } from "../utils/isScopedRuleDefinition";
import { isSwitchRuleDefinition } from "../utils/isSwitchRuleDefinition";
import { localName, nodeName } from "../utils/nodeName";
import type { Grammar } from "./Grammar";
import { GrammarNode } from "./GrammarNode";
import { MatchRule } from "./rules/MatchRule";
import { ScopedRule } from "./rules/ScopedRule";
import { SwitchRule } from "./rules/SwitchRule";

interface RuleScope {
  owner: string;
  repository: Record<string, RepositoryDefinition>;
  parent?: RuleScope;
}

const isRule = (obj: GrammarNode | Rule): obj is MatchRule | ScopedRule | SwitchRule =>
  obj instanceof MatchRule || obj instanceof ScopedRule || obj instanceof SwitchRule;

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

  private owned = new Map<string, Record<string, RepositoryDefinition>>();

  private scopes = new Map<string, RuleScope | undefined>();

  constructor(grammar: Grammar, definition: GrammarDefinition, prefix: string) {
    this.grammar = grammar;
    this.definition = definition;
    this.prefix = prefix;
    const declarator = grammar.declarator;
    this.declarator =
      declarator &&
      ((typeIndex, typeId, def) =>
        declarator(
          typeIndex,
          typeId,
          {
            ...def,
            openedBy: this.qualify(def.openedBy),
            closedBy: this.qualify(def.closedBy),
          },
          prefix,
        ));
    this.self = new SwitchRule(
      this,
      { id: prefix, patterns: definition.patterns ?? [] },
      GrammarNode.None,
    );
  }

  private qualify(names: string | string[] | undefined) {
    return Array.isArray(names)
      ? names.map((name) => nodeName(this.prefix, name))
      : names && nodeName(this.prefix, names);
  }

  local(id: string) {
    return localName(this.prefix, id);
  }

  load() {
    const repository = this.definition.repository;
    if (repository) {
      for (const name in repository) {
        const item = repository[name];
        if (item != null) {
          this.add(item, nodeName(this.prefix, name), true);
        }
      }
    }
  }

  enter(rule: Rule) {
    this.bind(rule, undefined);
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
      this.own(rule, def.repository);
      return rule;
    }

    if (isIncludeDefinition(def)) {
      const rule = new SwitchRule(this, {
        ...def,
        patterns: [{ include: def.include }],
      });
      this.map.set(rule.id, rule);
      this.own(rule, def.repository);
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

  private own(
    rule: SwitchRule,
    repository: Record<string, RepositoryDefinition> | undefined,
  ) {
    if (repository) {
      this.owned.set(rule.id, repository);
    }
  }

  private bind(rule: GrammarNode | Rule, scope: RuleScope | undefined) {
    if (!isRule(rule) || rule.repo !== this || this.scopes.has(rule.id)) {
      return;
    }
    const repository = this.owned.get(rule.id);
    const bound = repository
      ? { owner: rule.id, repository, parent: scope }
      : scope;
    this.scopes.set(rule.id, bound);
    if (rule instanceof ScopedRule) {
      this.bind(rule.beginRule, bound);
      this.bind(rule.endRule, bound);
      this.bind(rule.contentRule, bound);
    } else if (rule instanceof MatchRule) {
      rule.captures?.forEach((capture) => this.bind(capture, bound));
    } else if (rule === this.self) {
      rule.resolve();
    } else {
      try {
        rule.resolve();
      } catch {
      }
    }
  }

  private bound<T extends Rule>(rule: T, scope: RuleScope | undefined): T {
    this.bind(rule, scope);
    return rule;
  }

  private nestedId(owner: string, name: string) {
    const local = `${this.local(owner)}#${name}`;
    const taken = (id: string) => {
      for (const existing of this.map.keys()) {
        if (existing.startsWith(id)) {
          return true;
        }
      }
      return false;
    };
    let id = nodeName(this.prefix, local);
    for (let n = 1; taken(id); n++) {
      id = nodeName(this.prefix, `${local}#${n}`);
    }
    return id;
  }

  private lookup(name: string, scope: RuleScope | undefined): Rule[] {
    for (let s = scope; s; s = s.parent) {
      if (Object.hasOwn(s.repository, name)) {
        const item = s.repository[name];
        if (item == null) {
          return [];
        }
        const id = this.ids.get(item) ?? this.nestedId(s.owner, name);
        const rule = this.add(item, id, true);
        return isRule(rule) ? [rule] : [];
      }
    }
    return this.rule(name);
  }

  include(str: string, scope?: RuleScope): Rule[] {
    if (str === "$self") {
      this.bind(this.self, scope);
      return [this.self];
    }
    if (str === "$base") {
      return [this.grammar.load(this.grammar.definition).self];
    }
    const sharp = str.indexOf("#");
    if (sharp === 0) {
      const rules = this.lookup(str.slice(1), scope);
      rules.forEach((rule) => this.bind(rule, scope));
      return rules;
    }
    const repository = this.grammar.repositoryOf(
      sharp < 0 ? str : str.slice(0, sharp),
    );
    if (!repository) {
      return [];
    }
    const name = sharp < 0 ? "" : str.slice(sharp + 1);
    const rules = name ? repository.rule(name) : [repository.self];
    rules.forEach((rule) => repository.enter(rule));
    return rules;
  }

  rule(name: string): Rule[] {
    const repository = this.definition.repository;
    if (!repository || !Object.hasOwn(repository, name)) {
      return [];
    }
    const includedRule = this.map.get(nodeName(this.prefix, name));
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
    const scope = this.scopes.get(idPrefix);
    const rules: Rule[] = [];
    let missing = false;
    if (items) {
      items.forEach((item, i) => {
        const patternId = idPrefix + `-p${i}`;
        if (isIncludeDefinition(item)) {
          const included = this.include(item.include, scope);
          missing ||= included.length === 0;
          rules.push(...included);
        } else if (isMatchRuleDefinition(item)) {
          rules.push(this.bound(this.add(item, patternId), scope));
        } else if (isScopedRuleDefinition(item)) {
          rules.push(this.bound(this.add(item, patternId), scope));
        } else if (isSwitchRuleDefinition(item)) {
          rules.push(this.bound(this.add(item, patternId), scope));
        }
      });
    }
    return { rules, missing };
  }
}
