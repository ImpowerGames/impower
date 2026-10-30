/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { GrammarToken } from "../../core";

import { Wrapping } from "../enums/Wrapping";
import { GrammarNode } from "./GrammarNode";

export class Matched {
  static create(...args: ConstructorParameters<typeof Matched>): Matched {
    const matched = new Matched(...args);
    if (matched.length > 0) {
      return matched;
    } else {
      const node = matched.node;
      matched.node = GrammarNode.None;
      const emptyMatched = matched.wrap(node);
      return emptyMatched;
    }
  }

  constructor(
    public node: GrammarNode,
    public from: number,
    public length: number,
    public children?: Matched[],
    public wrapping: Wrapping = Wrapping.FULL,
  ) {}

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

  wrap(node: GrammarNode, wrap = this.wrapping) {
    return new Matched(node, this.from, this.length, [this], wrap);
  }

  private _compile() {
    if (!this.children) {
      return compileLeaf(this);
    }

    const tokens: GrammarToken[] = [];
    for (let i = 0; i < this.children!.length; i++) {
      const compiled = this.children![i]!._compile();
      if (!compiled) {
        continue;
      }
      if (!isGrammarTokenList(compiled)) {
        tokens.push(compiled);
      }
      else {
        for (let i = 0; i < compiled.length; i++) {
          tokens.push(compiled[i]!);
        }
      }
    }

    return compileTree(this, tokens);
  }

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
  token: GrammarToken | GrammarToken[],
): token is GrammarToken[] => {
  if (token.length === 0) {
    return true;
  }
  return Array.isArray(token[0]);
};

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
        undefined,
        undefined,
      ];

    case Wrapping.BEGIN:
      return [
        null,
        match.from,
        match.from + match.length,
        [match.node.typeIndex],
        undefined,
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
