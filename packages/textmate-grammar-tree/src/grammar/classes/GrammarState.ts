/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GrammarNode } from "./GrammarNode";
import { GrammarStack } from "./GrammarStack";

type CallFrame = { ruleId: string; position: number };

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

  protected _lineStart = 0;

  protected _lineEnd = -1;

  protected _lineText = "";

  protected _lineStrLength = -1;

  constructor(
    str: string,
    next?: (absolutePos: number) => string,
    absolutePos: number = 0,
  ) {
    this.str = str;
    this.next = next;
    this.absolutePos = absolutePos;
  }

  static ofLine(str: string) {
    const state = new GrammarState(str);
    state._lineStart = 0;
    state._lineEnd = str.length;
    state._lineText = str;
    state._lineStrLength = str.length;
    return state;
  }

  advance() {
    if (!this.next) {
      return;
    }
    const next = this.next(this.absolutePos + this.str.length);
    this.str += next;
  }

  line(from: number) {
    const str = this.str;
    if (
      from >= this._lineStart &&
      (from < this._lineEnd ||
        (from === this._lineEnd &&
          (this._lineEnd === this._lineStart ||
            (this._lineEnd === str.length && !endsWithBreak(this._lineText))))) &&
      str.length === this._lineStrLength
    ) {
      return;
    }
    let start = from;
    while (start > 0) {
      const c = str.charCodeAt(start - 1);
      if (c === 10) {
        break;
      }
      if (c === 13 && str.charCodeAt(start) !== 10) {
        break;
      }
      start--;
    }
    let end = from;
    while (end < str.length) {
      const c = str.charCodeAt(end);
      end++;
      if (c === 10) {
        break;
      }
      if (c === 13 && str.charCodeAt(end) !== 10) {
        break;
      }
    }
    this._lineStart = start;
    this._lineEnd = end;
    this._lineText = str.slice(start, end);
    this._lineStrLength = str.length;
  }

  get lineStart() {
    return this._lineStart;
  }

  get lineText() {
    return this._lineText;
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

const endsWithBreak = (text: string) => {
  const c = text.charCodeAt(text.length - 1);
  return c === 10 || c === 13;
};
