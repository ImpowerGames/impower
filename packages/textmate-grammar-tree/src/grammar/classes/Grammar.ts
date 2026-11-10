/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NodeID } from "../../core";

import type { GrammarDefinition,RuleDefinition } from "../types/GrammarDefinition";
import type { Rule } from "../types/Rule";
import { GrammarNode } from "./GrammarNode";
import { GrammarRegistry } from "./GrammarRegistry";
import { GrammarRepository } from "./GrammarRepository";
import { GrammarState } from "./GrammarState";

export class Grammar {
  public definition: GrammarDefinition;

  public registry: GrammarRegistry;

  declarator?: (
    typeIndex: number,
    typeId: string,
    def: RuleDefinition,
  ) => Record<string, any>;

  declare repository: GrammarRepository;

  declare rules: Rule[];

  declare nodes: GrammarNode[];

  declare nodeNames: string[];

  private repositories = new Map<GrammarDefinition, GrammarRepository>();

  private curID = NodeID.safe;

  constructor(
    grammar: GrammarDefinition | GrammarRegistry,
    declarator?: (
      typeIndex: number,
      typeId: string,
      def: RuleDefinition,
    ) => Record<string, any>,
  ) {
    this.registry =
      grammar instanceof GrammarRegistry
        ? grammar
        : new GrammarRegistry([grammar]);
    this.definition = this.registry.start;
    this.declarator = declarator;

    this.repository = this.load(this.definition);
    this.prune();
    this.rules = this.repository.self.rules ?? [];

    const noneNode = new GrammarNode(
      NodeID.none,
      { id: "none" },
      this.declarator,
    );
    const topNode = new GrammarNode(NodeID.top, { id: "top" }, this.declarator);
    const unrecognizedNode = new GrammarNode(
      NodeID.unrecognized,
      { id: "unrecognized" },
      (typeIndex, typeId, def) => ({
        isError: true,
        ...(this.declarator?.(typeIndex, typeId, def) || {}),
      }),
    );
    const incompleteNode = new GrammarNode(
      NodeID.incomplete,
      { id: "incomplete" },
      (typeIndex, typeId, def) => ({
        isError: true,
        ...(this.declarator?.(typeIndex, typeId, def) || {}),
      }),
    );
    const loaded = Array.from(this.repositories.values()).flatMap((repository) =>
      repository.nodes(),
    );
    this.nodes = [
      noneNode,
      topNode,
      unrecognizedNode,
      incompleteNode,
      ...loaded.sort((a, b) => a.typeIndex - b.typeIndex),
    ];
    this.nodeNames = this.nodes.map((n) => n.typeId);
  }

  nextTypeIndex() {
    const id = this.curID;
    this.curID++;
    return id;
  }

  load(definition: GrammarDefinition): GrammarRepository {
    const loaded = this.repositories.get(definition);
    if (loaded) {
      return loaded;
    }
    const repository = new GrammarRepository(
      this,
      definition,
      this.registry.prefixOf(definition),
    );
    this.repositories.set(definition, repository);
    repository.load();
    return repository;
  }

  private prune() {
    let pruned = true;
    while (pruned) {
      pruned = false;
      for (const repository of this.repositories.values()) {
        if (repository.prune()) {
          pruned = true;
        }
      }
    }
  }

  repositoryOf(scopeName: string): GrammarRepository | undefined {
    const definition = this.registry.get(scopeName);
    return definition ? this.load(definition) : undefined;
  }

  match(
    str: string,
    next: (pos: number) => string,
    relativePos: number,
    absolutePos = relativePos,
  ) {
    const state = new GrammarState(str, next, absolutePos);

    const rules = this.rules;
    if (rules) {
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const result = rule?.match(state, relativePos);
        if (result) {
          if (absolutePos !== relativePos) {
            result.offset(absolutePos);
          }
          return result;
        }
      }
    }

    return null;
  }
}
