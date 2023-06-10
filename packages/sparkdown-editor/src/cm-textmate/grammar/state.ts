/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { GrammarStackElement, MatchOutput } from "../core/types";
import type { ParserNode } from "./node";
import type { Rule } from "./types/rule";

/** Internal state for a {@link Grammar}. */
export class GrammarState {
  /**
   * @param context - The current context table.
   * @param stack - The current {@link GrammarStack}.
   * @param last - The last {@link MatchOutput} that was matched.
   */
  constructor(
    public context: Record<string, string> = {},
    public stack: GrammarStack = new GrammarStack(),
    public last?: MatchOutput
  ) {}

  /**
   * Sets a key in the context table.
   *
   * @param key - The key to set.
   * @param value - The value to set. If `null`, the key will be removed.
   */
  set(key: string, value: string | null) {
    if (value === null) {
      this.context = { ...this.context };
      delete this.context[key];
    } else {
      const subbed = this.sub(value);
      if (typeof subbed !== "string") {
        throw new Error("Invalid context value");
      }
      this.context = { ...this.context, [key]: subbed };
    }
  }

  /**
   * Gets a key from the context table.
   *
   * @param key - The key to get.
   */
  get(key: string): string | null {
    return this.context[key] ?? null;
  }

  /**
   * Expands any substitutions found in the given string.
   *
   * @param str - The string to expand.
   */
  sub(str: string) {
    if (str[0] !== "$") {
      return str;
    } else if (str.startsWith("$ctx:")) {
      // context substitution
      const [, name] = str.split(":");
      return this.context[name ?? ""];
    } else if (this.last?.captures) {
      // match/capture substitution
      const [, index] = str.split("$");
      return this.last.captures[parseInt(index ?? "", 10)];
    }

    throw new Error("Couldn't resolve substitute");
  }

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
    return new GrammarState(this.context, this.stack.clone(), this.last);
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
  push(node: ParserNode, rules: Rule[], end: Rule) {
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
