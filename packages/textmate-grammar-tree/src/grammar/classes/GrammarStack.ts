import type { GrammarStackElement } from "../types/GrammarStackElement";
import type { GrammarNode } from "./GrammarNode";

export class GrammarStack {
  declare readonly stack: GrammarStackElement[];

  constructor(stack?: GrammarStackElement[]) {
    this.stack = stack?.slice() ?? [];
  }

  push(node: GrammarNode, beginCaptures: string[]) {
    this.stack.push({ node, beginCaptures });
  }

  pop() {
    return this.stack.pop();
  }

  at(index: number) {
    return this.stack.at(index);
  }

  close(idx: number) {
    this.stack.splice(idx);
  }

  get length() {
    return this.stack.length;
  }

  get node() {
    return this.stack[this.stack.length - 1]?.node;
  }
}
