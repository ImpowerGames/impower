import { GrammarStackElement } from "../types/GrammarStackElement";
import { Rule } from "../types/Rule";
import type { GrammarNode } from "./GrammarNode";

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
   * @param node - The parent {@link GrammarNode}.
   * @param rules - The rules to loop parsing with.
   * @param end - A specific {@link Rule} that, when matched, should pop
   *   this element off.
   */
  push(node: GrammarNode, beginCaptures: string[]) {
    this.stack.push({ node, beginCaptures });
  }

  /** Pops the last element on the stack. */
  pop() {
    return this.stack.pop();
  }

  at(index: number) {
    return this.stack.at(index);
  }

  /**
   * Remove every element at or beyond the index given.
   *
   * @param idx - The index to remove elements at or beyond.
   */
  close(idx: number) {
    this.stack.splice(idx);
  }

  /** The number of elements on the stack. */
  get length() {
    return this.stack.length;
  }

  /** The last parent {@link GrammarNode}. */
  get node() {
    return this.stack[this.stack.length - 1]?.node;
  }
}
