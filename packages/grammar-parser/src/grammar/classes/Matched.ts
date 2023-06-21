/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GrammarToken } from "../../core";

import { Wrapping } from "../enums/Wrapping";
import GrammarNode from "./GrammarNode";
import type GrammarState from "./GrammarState";

/** Represents a leaf or branch of a tree of matches found by a grammar. */
export default class Matched {
  /** The total length of the match. */
  declare length: number;

  constructor(
    /** The current {@link GrammarState}. */
    public state: GrammarState,
    /** The match's {@link GrammarNode} type. */
    public node: GrammarNode,
    /** The entire matched string. */
    public total: string,
    /** The start of the match. */
    public from: number,
    /** The children contained by this match's {@link GrammarNode}. */
    public captures?: Matched[],
    /**
     * The wrapping mode of the match. There are three modes:
     *
     * - FULL: The {@link GrammarNode} in this match contains the entirety of the branch.
     * - BEGIN: The {@link GrammarNode} in this match begins the branch.
     * - END: The {@link GrammarNode} in this match ends the branch.
     */
    public wrapping: Wrapping = Wrapping.FULL
  ) {
    this.length = total.length;
  }

  /** Changes the starting offset of the match. */
  offset(offset: number) {
    if (this.captures) {
      for (let i = 0; i < this.captures.length; i++) {
        const child = this.captures[i]!;
        child.offset(child.from - this.from + offset);
      }
    }
    this.from = offset;
  }

  /**
   * Wraps this `Matched` with another one.
   *
   * @param node - The node of the `Matched` to wrap with.
   * @param wrap - The wrapping mode, if different.
   */
  wrap(node: GrammarNode, wrap = this.wrapping) {
    return new Matched(this.state, node, this.total, this.from, [this], wrap);
  }

  /**
   * Pushes an opening or closing node to one side of this matches captures.
   *
   * @param node - The node to push.
   * @param side - The side to push to.
   * @param wrap - The wrapping mode of the node. Can't be `FULL`.
   */
  push(node: GrammarNode, side: -1 | 1, wrap = this.wrapping) {
    if (wrap === Wrapping.FULL) {
      throw new Error("Cannot push onto a FULL match");
    }
    this.captures ??= [];
    let pos = side === -1 ? this.from : this.from + this.length;
    const match = new Matched(this.state, node, "", pos, undefined, wrap);
    if (side === -1) {
      this.captures.unshift(match);
    } else {
      this.captures.push(match);
    }
  }

  /** Internal method for compiling. */
  private _compile() {
    if (!this.captures) {
      return compileLeaf(this);
    }

    // verbose approach for performance
    const tokens: GrammarToken[] = [];
    for (let i = 0; i < this.captures!.length; i++) {
      const compiled = this.captures![i]!._compile();
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

  // prettier-ignore
  switch(match.wrapping) {
     case Wrapping.FULL: return [
       match.node === GrammarNode.None ? null : match.node.typeIndex,
       match.from,
       match.from + match.length
     ]
 
     case Wrapping.BEGIN: return [
       null,
       match.from,
       match.from + match.length,
       [match.node.typeIndex]
     ]
 
     case Wrapping.END: return [
       null,
       match.from,
       match.from + match.length,
       undefined,
       [match.node.typeIndex]
     ]
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

  if (match.wrapping === Wrapping.FULL || match.wrapping === Wrapping.BEGIN) {
    first[3] ??= [];
    first[3].unshift(match.node.typeIndex);
  }

  if (match.wrapping === Wrapping.FULL || match.wrapping === Wrapping.END) {
    last[4] ??= [];
    last[4].push(match.node.typeIndex);
  }

  return tokens;
};
