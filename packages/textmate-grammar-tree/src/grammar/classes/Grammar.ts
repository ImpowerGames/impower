/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NodeID } from "../../core";

import type { GrammarDefinition,RuleDefinition } from "../types/GrammarDefinition";
import type { Rule } from "../types/Rule";
import { GrammarNode } from "./GrammarNode";
import { GrammarRepository } from "./GrammarRepository";
import { GrammarState } from "./GrammarState";

export class Grammar {
  public definition: GrammarDefinition;

  declarator?: (
    typeIndex: number,
    typeId: string,
    def: RuleDefinition,
  ) => Record<string, any>;

  declare repository: GrammarRepository;

  declare rules: Rule[];

  declare nodes: GrammarNode[];

  declare nodeNames: string[];

  constructor(
    definition: GrammarDefinition,
    declarator?: (
      typeIndex: number,
      typeId: string,
      def: RuleDefinition,
    ) => Record<string, any>,
  ) {
    this.definition = definition;
    this.declarator = declarator;

    this.repository = new GrammarRepository(this);
    if (definition?.repository) {
      for (const name in definition.repository) {
        const item = definition.repository[name];
        if (item != null) {
          this.repository.add(item, name, true);
        }
      }
    }

    if (definition?.patterns) {
      this.rules = this.repository.getRules(definition.patterns, "");
    }

    this.repository.resolveAll();

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
    this.nodes = [
      noneNode,
      topNode,
      unrecognizedNode,
      incompleteNode,
      ...this.repository.nodes(),
    ];
    this.nodeNames = this.nodes.map((n) => n.typeId);
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
