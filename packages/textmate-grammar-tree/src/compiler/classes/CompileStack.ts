/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const STACK_ARRAY_INTERVAL = 64;

export class CompileStack {
  declare ids: Uint16Array;
  declare positions: Uint32Array;
  declare children: Uint32Array;
  declare length: number;

  constructor(stack?: CompileStack) {
    if (stack) {
      this.ids = new Uint16Array(stack.ids.length);
      this.ids.set(stack.ids);
      this.positions = new Uint32Array(stack.positions.length);
      this.positions.set(stack.positions);
      this.children = new Uint32Array(stack.children.length);
      this.children.set(stack.children);
      this.length = stack.length;
    } else {
      this.ids = new Uint16Array(STACK_ARRAY_INTERVAL);
      this.positions = new Uint32Array(STACK_ARRAY_INTERVAL);
      this.children = new Uint32Array(STACK_ARRAY_INTERVAL);
      this.length = 0;
    }
  }

  increment() {
    for (let i = 0; i < this.length; i++) {
      this.children[i]!++;
    }
  }

  push(id: number, start: number, children: number) {
    if (this.length + 1 > this.ids.length) {
      const old = this.ids;
      this.ids = new Uint16Array(old.length + STACK_ARRAY_INTERVAL);
      this.ids.set(old);
    }
    if (this.length + 1 > this.positions.length) {
      const old = this.positions;
      this.positions = new Uint32Array(old.length + STACK_ARRAY_INTERVAL);
      this.positions.set(old);
    }
    if (this.length + 1 > this.children.length) {
      const old = this.children;
      this.children = new Uint32Array(old.length + STACK_ARRAY_INTERVAL);
      this.children.set(old);
    }

    this.ids[this.length] = id;
    this.positions[this.length] = start;
    this.children[this.length] = children;
    this.length++;
  }

  pop() {
    const id = this.ids[this.length - 1];
    const start = this.positions[this.length - 1];
    const children = this.children[this.length - 1];
    this.length--;
    return [id, start, children];
  }

  close(idx: number) {
    this.length = idx + 1;
  }

  last(id: number) {
    let last = -1;
    for (let i = 0; i < this.length; i++) {
      if (this.ids[i] === id) {
        last = i;
      }
    }
    if (last === -1) {
      return null;
    }
    return last;
  }
}
