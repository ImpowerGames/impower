/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GrammarNode } from "./GrammarNode";
import { GrammarStack } from "./GrammarStack";

/** Internal state for a {@link Grammar}. */
export class GrammarState {
  stack: GrammarStack = new GrammarStack([
    {
      node: GrammarNode.None,
      beginCaptures: [],
    },
  ]);

  str: string;

  next?: (absolutePos: number) => string;

  absolutePos: number;

  protected _matchDepth: number = 0;

  constructor(
    str: string,
    next?: (absolutePos: number) => string,
    absolutePos: number = 0
  ) {
    this.str = str;
    this.next = next;
    this.absolutePos = absolutePos;
  }

  increaseMatchDepth() {
    this._matchDepth++;
    if (this._matchDepth > 10000) {
      console.error(
        "Exceeded maximum match depth!",
        JSON.stringify(
          this.stack.stack.map((e) => ({
            beginCaptures: e.beginCaptures,
            node: e.node.typeId,
          }))
        )
      );
      return false;
      5;
    }
    return true;
  }

  advance() {
    if (!this.next) {
      return;
    }
    const next = this.next(this.absolutePos + this.str.length);
    this.str += next;
  }
}
