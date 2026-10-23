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

  /** Start of the cached line in `str` (see {@link line}). */
  protected _lineStart = 0;

  /** End of the cached line in `str`, after its line break. */
  protected _lineEnd = -1;

  /** Text of the cached line, its line break included. */
  protected _lineText = "";

  /** Length of `str` when the cached line was read. */
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

  /**
   * A state over `str`, which is part of one line, with no line break but at
   * its end, so {@link line} reads it as that line without searching for
   * where it starts.
   */
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

  /**
   * Reads the line of `str` that holds `from`, with its line break (`\r\n`,
   * `\r` or `\n`), into {@link lineStart} and {@link lineText}. Rules match each regex against this text only, as
   * vscode-textmate does, so no match, lookahead or lookbehind sees or
   * consumes another line, however much of the document `str` holds.
   * A position just after a line break starts the next line.
   */
  line(from: number) {
    const str = this.str;
    if (
      from >= this._lineStart &&
      (from < this._lineEnd ||
        (from === this._lineEnd &&
          (this._lineEnd === this._lineStart ||
            // The end of `str`, on a line no break has ended yet.
            (this._lineEnd === str.length && !endsWithBreak(this._lineText))))) &&
      str.length === this._lineStrLength
    ) {
      return;
    }
    let start = from;
    while (start > 0) {
      const c = str.charCodeAt(start - 1);
      if (c === 10 /* \n */) {
        break;
      }
      if (c === 13 /* \r */ && str.charCodeAt(start) !== 10) {
        break;
      }
      start--;
    }
    let end = from;
    while (end < str.length) {
      const c = str.charCodeAt(end);
      end++;
      if (c === 10 /* \n */) {
        break;
      }
      if (c === 13 /* \r */ && str.charCodeAt(end) !== 10) {
        break;
      }
    }
    this._lineStart = start;
    this._lineEnd = end;
    this._lineText = str.slice(start, end);
    this._lineStrLength = str.length;
  }

  /** Start in `str` of the line last read by {@link line}. */
  get lineStart() {
    return this._lineStart;
  }

  /** Text of the line last read by {@link line}, its line break included. */
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
  return c === 10 /* \n */ || c === 13 /* \r */;
};
