/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GrammarStackElement } from "../types/GrammarStackElement";
import { GrammarNode } from "./GrammarNode";
import { GrammarStack } from "./GrammarStack";

type CallFrame = { ruleId: string; position: number };

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a mix of a 32-bit number into a running hash. */
function fnvNum(h: number, n: number): number {
  for (let i = 0; i < 4; i++) {
    h ^= (n >>> (i * 8)) & 0xff;
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/** FNV-1a mix of a string (UTF-16 code units) into a running hash. */
function fnvStr(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h ^= c & 0xff;
    h = Math.imul(h, FNV_PRIME);
    h ^= (c >>> 8) & 0xff;
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/** Shallow clone of a scope-stack snapshot — begin captures copied; node and
 * scopedRule references shared (immutable grammar objects). */
function cloneStackElements(
  elements: readonly GrammarStackElement[],
): GrammarStackElement[] {
  return elements.map((e) => ({ ...e, beginCaptures: e.beginCaptures.slice() }));
}

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
   * Re-arm this state for a new match window (one line). The per-call scratch
   * (`visited` recursion guard, `_matchDepth`) is cleared every call.
   *
   * The scope `stack` PERSISTS across calls — this is what makes the tokenizer
   * line-at-a-time: a scope opened on one line stays on the stack so the next
   * line continues it (and can be snapshot/restored for incremental reuse).
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
  }

  advance() {
    if (!this.next) {
      return;
    }
    const next = this.next(this.absolutePos + this.str.length);
    this.str += next;
  }

  /**
   * Order- and capture-sensitive hash of the open-scope stack. Used as the
   * entry key for per-line tokenization memoization: the matcher's output for a
   * line depends on `(line text, this stack)` (begin captures are folded in
   * because `ScopedRule.end` back-references them). Hash collisions are caught
   * by a follow-up exact `stackMatches` check, so this only needs to be fast.
   */
  stackHash(): number {
    let h = FNV_OFFSET;
    const frames = this.stack.stack;
    for (let i = 0; i < frames.length; i++) {
      const el = frames[i]!;
      h = fnvNum(h, el.node.typeIndex);
      h = fnvNum(h, el.beginCaptures.length);
      for (let j = 0; j < el.beginCaptures.length; j++) {
        h = fnvStr(h, el.beginCaptures[j]!);
      }
    }
    return h >>> 0;
  }

  /** Capture the current open-scope stack (for a memo entry's exit stack). */
  snapshotStack(): GrammarStackElement[] {
    return cloneStackElements(this.stack.stack);
  }

  /** Install a previously-captured open-scope stack (replay a memo hit). */
  restoreStack(snapshot: readonly GrammarStackElement[]) {
    this.stack = new GrammarStack(cloneStackElements(snapshot));
  }

  /** Exact compare of the live stack against a snapshot (node identity + begin
   * captures) — the collision-proof verify before trusting a memo hit. */
  stackMatches(snapshot: readonly GrammarStackElement[]): boolean {
    const live = this.stack.stack;
    if (live.length !== snapshot.length) {
      return false;
    }
    for (let i = 0; i < live.length; i++) {
      const a = live[i]!;
      const b = snapshot[i]!;
      if (a.node !== b.node) {
        return false;
      }
      if (a.beginCaptures.length !== b.beginCaptures.length) {
        return false;
      }
      for (let j = 0; j < a.beginCaptures.length; j++) {
        if (a.beginCaptures[j] !== b.beginCaptures[j]) {
          return false;
        }
      }
    }
    return true;
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
