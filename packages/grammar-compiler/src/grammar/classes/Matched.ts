/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GrammarToken } from "../../core";

import { Wrapping } from "../enums/Wrapping";
import GrammarNode from "./GrammarNode";
import type GrammarState from "./GrammarState";

/** Represents a leaf or branch of a tree of matches found by a grammar. */
export default class Matched {
  static create(...args: ConstructorParameters<typeof Matched>): Matched {
    const matched = new Matched(...args);
    if (matched.length > 0) {
      return matched;
    } else {
      // Empty matches must have at least one capture to prevent nesting issues
      const node = matched.node;
      matched.node = GrammarNode.None;
      const emptyMatched = matched.wrap(node);
      return emptyMatched;
    }
  }

  constructor(
    /** The current {@link GrammarState}. */
    public state: GrammarState,
    /** The match's {@link GrammarNode} type. */
    public node: GrammarNode,
    /** The start of the match. */
    public from: number,
    /** The length of the match. */
    public length: number,
    /** The children contained by this match's {@link GrammarNode}. */
    public children?: Matched[],
    /**
     * The wrapping mode of the match. There are three modes:
     *
     * - FULL: The {@link GrammarNode} in this match contains the entirety of the branch.
     * - BEGIN: The {@link GrammarNode} in this match begins the branch.
     * - END: The {@link GrammarNode} in this match ends the branch.
     */
    public wrapping: Wrapping = Wrapping.FULL
  ) {}

  /** Changes the starting offset of the match. */
  offset(offset: number) {
    if (this.children) {
      for (let i = 0; i < this.children.length; i++) {
        const child = this.children[i]!;
        child.offset(child.from - this.from + offset);
      }
    }
    this.from = offset;
    return this;
  }

  /**
   * Wraps this `Matched` with another one.
   *
   * @param node - The node of the `Matched` to wrap with.
   * @param wrap - The wrapping mode, if different.
   */
  wrap(node: GrammarNode, wrap = this.wrapping) {
    return new Matched(this.state, node, this.from, this.length, [this], wrap);
  }

  /** Internal method for compiling. */
  private _compile() {
    if (!this.children) {
      return compileLeaf(this);
    }

    // verbose approach for performance
    const tokens: GrammarToken[] = [];
    for (let i = 0; i < this.children!.length; i++) {
      const compiled = this.children![i]!._compile();
      // wasn't emitted
      if (!compiled) {
        continue;
      }
      // leaf
      if (!isGrammarTokenList(compiled)) {
        tokens.push(compiled);
      }
      // branch
      else {
        for (let i = 0; i < compiled.length; i++) {
          tokens.push(compiled[i]!);
        }
      }
    }

    return compileTree(this, tokens);
  }

  /**
   * Compiles this match into a list of tokens. Always returns a list, even
   * if this match represents a leaf.
   */
  compile() {
    const compiled = this._compile();
    if (isGrammarTokenList(compiled)) {
      return compiled;
    } else if (compiled) {
      return [compiled];
    } else {
      return [];
    }
  }
}

const isGrammarTokenList = (
  token: GrammarToken | GrammarToken[]
): token is GrammarToken[] => {
  if (token.length === 0) {
    return true;
  }
  return Array.isArray(token[0]);
};

/** Compiles a {@link Matched} as a leaf. */
const compileLeaf = (match: Matched): GrammarToken => {
  if (match.wrapping !== Wrapping.FULL && match.node === GrammarNode.None) {
    throw new Error("Cannot compile a null leaf with a non-full wrapping");
  }

  switch (match.wrapping) {
    case Wrapping.FULL:
      return [
        match.node === GrammarNode.None ? null : match.node.typeIndex,
        match.from,
        match.from + match.length,
      ];

    case Wrapping.BEGIN:
      return [
        null,
        match.from,
        match.from + match.length,
        [match.node.typeIndex],
      ];

    case Wrapping.END:
      return [
        null,
        match.from,
        match.from + match.length,
        undefined,
        [match.node.typeIndex],
      ];
  }
};

/**
 * Compiles a {@link Matched} as a tree, with the given token list being its
 * already compiled children.
 */
const compileTree = (match: Matched, tokens: GrammarToken[]) => {
  if (match.node === GrammarNode.None) {
    return tokens;
  }

  const first = tokens[0]!;
  const last = tokens[tokens.length - 1]!;

  const openedBy = 3;
  const closedBy = 4;

  if (match.wrapping === Wrapping.FULL || match.wrapping === Wrapping.BEGIN) {
    first[openedBy] ??= [];
    first[openedBy].unshift(match.node.typeIndex);
  }

  if (match.wrapping === Wrapping.FULL || match.wrapping === Wrapping.END) {
    last[closedBy] ??= [];
    last[closedBy].push(match.node.typeIndex);
  }

  return tokens;
};
