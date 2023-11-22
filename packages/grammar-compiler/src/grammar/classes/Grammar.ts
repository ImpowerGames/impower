/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NodeID } from "../../core";

import { GrammarDefinition, RuleDefinition } from "../types/GrammarDefinition";
import { Rule } from "../types/Rule";
import GrammarNode from "./GrammarNode";
import GrammarRepository from "./GrammarRepository";
import GrammarStack from "./GrammarStack";
import GrammarState from "./GrammarState";
import type Matched from "./Matched";
import ScopedRule from "./rules/ScopedRule";

export default class Grammar {
  /**
   * The definition used to create this grammar.
   */
  public definition: GrammarDefinition;

  /**
   * Used to declare additional props when creating a new {@link GrammarNode}.
   */
  declarator?: (
    typeIndex: number,
    typeId: string,
    def: RuleDefinition
  ) => Record<string, any>;

  /**
   * {@link GrammarRepository} of rules and nodes used by this grammar.
   */
  declare repository: GrammarRepository;

  /**
   * The root {@link Rule}s to begin tokenizing with.
   */
  declare rules: Rule[];

  /**
   * All {@link GrammarNode}s in this grammar, ordered by type index
   */
  declare nodes: GrammarNode[];

  /**
   * Names of all {@link GrammarNode}s in this grammar, ordered by type index
   */
  declare nodeNames: string[];

  constructor(
    /**
     * The definition used to create this grammar.
     */
    definition: GrammarDefinition,
    /**
     * Used to declare additional props when creating a new {@link GrammarNode}.
     *
     * If you have data that you'd like to associate with a grammar node
     * and that data cannot be statically declared in the {@link GrammarDefinition},
     * you can use this method to attach the data to the node at runtime.
     */
    declarator?: (
      typeIndex: number,
      typeId: string,
      def: RuleDefinition
    ) => Record<string, any>
  ) {
    this.definition = definition;
    this.declarator = declarator;

    // Populate repository
    this.repository = new GrammarRepository(this);
    if (definition?.repository) {
      for (const name in definition.repository) {
        const item = definition.repository[name];
        if (item != null) {
          this.repository.add(item, name);
        }
      }
    }

    // Populate rules
    if (definition?.patterns) {
      this.rules = this.repository.getRules(definition.patterns, "");
    }

    // Cache ordered Nodes
    const noneNode = new GrammarNode(
      NodeID.none,
      { id: "none" },
      this.declarator
    );
    const topNode = new GrammarNode(NodeID.top, { id: "top" }, this.declarator);
    const unrecognizedNode = new GrammarNode(
      NodeID.unrecognized,
      { id: "unrecognized" },
      (typeIndex, typeId, def) => ({
        isError: true,
        ...(this.declarator?.(typeIndex, typeId, def) || {}),
      })
    );
    const incompleteNode = new GrammarNode(
      NodeID.incomplete,
      { id: "incomplete" },
      (typeIndex, typeId, def) => ({
        isError: true,
        ...(this.declarator?.(typeIndex, typeId, def) || {}),
      })
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

  /** Returns a {@link GrammarState} setup for this grammar's default state. */
  startState() {
    return new GrammarState(
      {},
      new GrammarStack([
        {
          node: GrammarNode.None,
          rules: this.rules,
          end: null,
          beginCaptures: [],
        },
      ])
    );
  }

  /**
   * Runs a match against a string (starting from a given position).
   *
   * @param state - The {@link GrammarState} to run the match with.
   * @param str - The string to match.
   * @param from - The position to start matching at.
   * @param offset - The offset to apply to the resulting {@link Matched}'s
   *   `from` position.
   */
  match(
    state: GrammarState,
    str: string,
    from: number,
    offset = from,
    possiblyIncomplete = true
  ) {
    if (state.stack.end instanceof ScopedRule) {
      let result = state.stack.end.end(str, from, state);
      if (result) {
        if (offset !== from) {
          result.offset(offset);
        }
        return result;
      }
    }

    const rules = state.stack.rules;
    if (rules) {
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const result = rule?.match(str, from, state, possiblyIncomplete);
        if (result) {
          if (offset !== from) {
            result.offset(offset);
          }
          return result;
        }
      }
    }

    return null;
  }
}
