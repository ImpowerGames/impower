/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GrammarNode } from "./GrammarNode";
import { GrammarStack } from "./GrammarStack";

export type CallFrame = { ruleId: string; position: number; scoped: boolean };

export class GrammarState {
  stack: GrammarStack = new GrammarStack([
    {
      node: GrammarNode.None,
      beginCaptures: [],
      enclosingAnchor: -1,
      beginCapturedLineBreak: false,
    },
  ]);

  anchor = -1;

  protected _anchorLineStart = -1;

  visited: CallFrame[] = [];

  enclosing: CallFrame[] = [];

  str: string;

  next?: (absolutePos: number) => string;

  absolutePos: number;

  protected _matchDepth: number = 0;

  protected _lineStart = 0;

  protected _lineEnd = -1;

  protected _lineText = "";

  protected _lineStrLength = -1;

  protected _exhaustedAt = -1;

  constructor(
    str: string,
    next?: (absolutePos: number) => string,
    absolutePos: number = 0,
  ) {
    this.str = str;
    this.next = next;
    this.absolutePos = absolutePos;
  }

  resetToLine(line: string, absolutePos: number, enclosing: CallFrame[]) {
    this.stack.close(1);
    this.anchor = -1;
    this._anchorLineStart = -1;
    this.visited.length = 0;
    this.enclosing = enclosing;
    this.str = line;
    this.absolutePos = absolutePos;
    this._matchDepth = 0;
    this._lineStart = 0;
    this._lineEnd = line.length;
    this._lineText = line;
    this._lineStrLength = line.length;
    this._exhaustedAt = -1;
  }

  advance() {
    if (!this.next) {
      return;
    }
    const next = this.next(this.absolutePos + this.str.length);
    this.str += next;
  }

  exhaustLineAt(at: number) {
    this._exhaustedAt = at;
  }

  line(at: number) {
    const str = this.str;
    const from = at === this._exhaustedAt ? at - 1 : at;
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

  protected syncAnchor(from: number) {
    this.line(from);
    if (this._lineStart !== this._anchorLineStart) {
      this._anchorLineStart = this._lineStart;
      this.anchor = this.stack.at(-1)?.beginCapturedLineBreak
        ? this._lineStart
        : -1;
    }
  }

  isAnchor(from: number) {
    this.syncAnchor(from);
    return this.anchor === from;
  }

  pushScope(
    node: GrammarNode,
    beginCaptures: string[],
    from: number,
    to: number,
  ) {
    this.syncAnchor(from);
    this.stack.push(
      node,
      beginCaptures,
      this.anchor,
      to === this._lineEnd && endsWithBreak(this._lineText),
    );
    this.anchor = to;
  }

  popScope(at: number) {
    this.syncAnchor(at);
    const popped = this.stack.pop();
    if (popped) {
      this.anchor = popped.enclosingAnchor;
    }
    return popped;
  }

  possibleStackOverflow(ruleId: string, position: number): boolean {
    const visited = this.visited;
    if (visited.length > 10000) {
      console.warn("Possible stack overflow!", visited);
      return true;
    }
    for (let i = visited.length - 1; i >= 0; i--) {
      const frame = visited[i]!;
      if (frame.position === position && frame.ruleId === ruleId) {
        console.warn("Infinite recursion detected!", ruleId, position);
        return true;
      }
    }
    return false;
  }

  enter(ruleId: string, position: number, scoped = false) {
    this.visited.push({ ruleId, position, scoped });
  }

  enclosingAt(lineStart: number, captureId: string, captureAt: number) {
    const position = captureAt - lineStart;
    const frames: CallFrame[] = [
      { ruleId: captureId, position, scoped: true },
    ];
    const visited = this.visited;
    for (let i = visited.length - 1; i >= 0; i--) {
      const frame = visited[i]!;
      if (!frame.scoped) {
        continue;
      }
      if (frame.position !== captureAt) {
        return frames.reverse();
      }
      frames.push({ ruleId: frame.ruleId, position, scoped: true });
    }
    const enclosing = this.enclosing;
    for (let i = enclosing.length - 1; i >= 0; i--) {
      const frame = enclosing[i]!;
      if (frame.position !== captureAt) {
        break;
      }
      frames.push({ ruleId: frame.ruleId, position, scoped: true });
    }
    return frames.reverse();
  }

  exit(ruleId: string, position: number) {
    const visited = this.visited;
    for (let i = visited.length - 1; i >= 0; i--) {
      const frame = visited[i]!;
      if (frame.ruleId === ruleId && frame.position === position) {
        for (let j = i + 1; j < visited.length; j++) {
          visited[j - 1] = visited[j]!;
        }
        visited.pop();
        return;
      }
    }
  }
}

const endsWithBreak = (text: string) => {
  const c = text.charCodeAt(text.length - 1);
  return c === 10 || c === 13;
};
