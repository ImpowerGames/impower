/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { GrammarStackElement } from "../core/types";
import type { ParserNode } from "./node";
import type { Rule } from "./types/rule";

/** Internal state for a {@link Grammar}. */
export class GrammarState {
  /**
   * @param context - The current context table.
   * @param stack - The current {@link GrammarStack}.
   */
  constructor(
    public context: Record<string, string> = {},
    public stack: GrammarStack = new GrammarStack()
  ) {}

  /**
   * Returns if another {@link GrammarState} is effectively equivalent to this one.
   *
   * @param other - The other {@link GrammarState} to compare to.
   */
  equals(other: GrammarState) {
    if (!contextEquivalent(this.context, other.context)) {
      return false;
    }
    if (!this.stack.equals(other.stack)) {
      return false;
    }
    return true;
  }

  /** Returns a new clone of this state, including its stack. */
  clone() {
    return new GrammarState(this.context, this.stack.clone());
  }
}

/** A stack of {@link GrammarStackElement}s used by a {@link Grammar}. */
export class GrammarStack {
  /** The current stack. */
  declare readonly stack: GrammarStackElement[];

  /** @param stack - The stack array to use. Will be shallow cloned. */
  constructor(stack?: GrammarStackElement[]) {
    this.stack = stack?.slice() ?? [];
  }

  /**
   * Pushes a new {@link GrammarStackElement}.
   *
   * @param node - The parent {@link ParserNode}.
   * @param rules - The rules to loop parsing with.
   * @param end - A specific {@link Rule} that, when matched, should pop
   *   this element off.
   */
  push(node: ParserNode, rules: Rule[], end: Rule | null) {
    this.stack.push({ node, rules, end });
  }

  /** Pops the last element on the stack. */
  pop() {
    if (this.stack.length === 0) {
      throw new Error("Grammar stack underflow");
    }
    return this.stack.pop();
  }

  /**
   * Remove every element at or beyond the index given.
   *
   * @param idx - The index to remove elements at or beyond.
   */
  close(idx: number) {
    this.stack.splice(idx);
  }

  /**
   * Returns if another {@link GrammarStack} is effectively equivalent to this one.
   *
   * @param other - The other {@link GrammarStack} to compare to.
   */
  equals(other: GrammarStack) {
    if (this === other) {
      return true;
    }
    if (this.length !== other.stack.length) {
      return false;
    }
    for (let i = 0; i < this.stack.length; i++) {
      const el = this.stack[i];
      const otherEl = other.stack[i];
      if (el && otherEl) {
        if (!stackElementEquivalent(el, otherEl)) {
          return false;
        }
      }
    }
    return true;
  }

  /** The number of elements on the stack. */
  get length() {
    return this.stack.length;
  }

  /** The last parent {@link ParserNode}. */
  get node() {
    return this.stack[this.stack.length - 1]?.node;
  }

  /** The last list of rules. */
  get rules() {
    return this.stack[this.stack.length - 1]?.rules;
  }

  /** The last end rule. */
  get end() {
    return this.stack[this.stack.length - 1]?.end;
  }

  /** Returns a new clone of this stack. */
  clone() {
    return new GrammarStack(this.stack);
  }
}

function stackElementEquivalent(
  a: GrammarStackElement,
  b: GrammarStackElement
) {
  // do quick checks first
  if (
    a.node !== b.node ||
    a.end !== b.end ||
    a.rules.length !== b.rules.length
  ) {
    return false;
  }
  for (let i = 0; i < a.rules.length; i++) {
    if (a.rules[i] !== b.rules[i]) {
      return false;
    }
  }
  return true;
}

function contextEquivalent(
  a: Record<string, string>,
  b: Record<string, string>
) {
  if (a === b) {
    return true;
  }
  if (Object.keys(a).length !== Object.keys(b).length) {
    return false;
  }
  for (const key in a) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}
