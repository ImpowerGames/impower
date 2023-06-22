import { GrammarStackElement } from "../types/GrammarStackElement";
import { Rule } from "../types/Rule";
import { stackEquivalent } from "../utils/stackEquivalent";
import type GrammarNode from "./GrammarNode";

/** A stack of {@link GrammarStackElement}s used by a {@link Grammar}. */
export default class GrammarStack {
  /** The current stack. */
  declare readonly stack: GrammarStackElement[];

  /** @param stack - The stack array to use. Will be shallow cloned. */
  constructor(stack?: GrammarStackElement[]) {
    this.stack = stack?.slice() ?? [];
  }

  /**
   * Pushes a new {@link GrammarStackElement}.
   *
   * @param node - The parent {@link GrammarNode}.
   * @param rules - The rules to loop parsing with.
   * @param end - A specific {@link Rule} that, when matched, should pop
   *   this element off.
   */
  push(node: GrammarNode, rules: Rule[], end: Rule | null) {
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
        if (!stackEquivalent(el, otherEl)) {
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

  /** The last parent {@link GrammarNode}. */
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
