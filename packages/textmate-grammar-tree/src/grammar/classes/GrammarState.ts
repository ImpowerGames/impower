/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GrammarNode } from "./GrammarNode";
import { GrammarStack } from "./GrammarStack";

type CallFrame = { ruleId: string; position: number };

/** Internal state for a {@link Grammar}. */
export class GrammarState {
  stack: GrammarStack = new GrammarStack([
    {
      node: GrammarNode.None,
      beginCaptures: [],
    },
  ]);

  visited: CallFrame[] = [];

  str: string;

  next?: (absolutePos: number) => string;

  absolutePos: number;

  protected _matchDepth: number = 0;

  constructor(
    str: string,
    next?: (absolutePos: number) => string,
    absolutePos: number = 0,
  ) {
    this.str = str;
    this.next = next;
    this.absolutePos = absolutePos;
  }

  /**
   * Re-arm this state for a new match window. The per-call scratch (`visited`
   * recursion guard, `_matchDepth`) is always cleared.
   *
   * Phase A: the scope `stack` is also reset to its initial single `None` frame,
   * so reusing one `GrammarState` across match calls is byte-identical to
   * allocating a fresh one each time. Phase B will stop resetting the stack so
   * scope context can persist across lines.
   */
  reset(
    str: string,
    next?: (absolutePos: number) => string,
    absolutePos: number = 0,
  ) {
    this.str = str;
    this.next = next;
    this.absolutePos = absolutePos;
    this.visited.length = 0;
    this._matchDepth = 0;
    this.stack = new GrammarStack([
      {
        node: GrammarNode.None,
        beginCaptures: [],
      },
    ]);
  }

  advance() {
    if (!this.next) {
      return;
    }
    const next = this.next(this.absolutePos + this.str.length);
    this.str += next;
  }

  possibleStackOverflow(ruleId: string, position: number): boolean {
    if (this.visited.length > 10000) {
      console.warn("Possible stack overflow!", this.visited);
      return true;
    }
    const hasVisited = this.visited.some(
      (frame) => frame.ruleId === ruleId && frame.position === position,
    );
    if (hasVisited) {
      console.warn("Infinite recursion detected!", ruleId, position);
    }
    return hasVisited;
  }

  enter(ruleId: string, position: number) {
    this.visited.push({ ruleId, position });
  }

  exit(ruleId: string, position: number) {
    const idx = this.visited.findIndex(
      (f) => f.ruleId === ruleId && f.position === position,
    );
    if (idx >= 0) this.visited.splice(idx, 1);
  }
}
