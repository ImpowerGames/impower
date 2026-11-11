/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const STACK_ARRAY_INITIAL_LENGTH = 8;

const EMPTY = new Int32Array(0);

export class CompileStack {
  declare entries: Int32Array;
  declare length: number;

  constructor(stack?: CompileStack) {
    if (stack && stack.length > 0) {
      this.entries = stack.entries.slice(0, stack.length * 3);
      this.length = stack.length;
    } else {
      this.entries = EMPTY;
      this.length = 0;
    }
  }

  id(index: number) {
    return this.entries[index * 3]!;
  }

  position(index: number) {
    return this.entries[index * 3 + 1]!;
  }

  childCount(index: number) {
    return this.entries[index * 3 + 2]!;
  }

  setPosition(index: number, position: number) {
    this.entries[index * 3 + 1] = position;
  }

  addChildren(index: number, delta: number) {
    this.entries[index * 3 + 2]! += delta;
  }

  increment() {
    const entries = this.entries;
    for (let i = 2; i < this.length * 3; i += 3) {
      entries[i]!++;
    }
  }

  push(id: number, start: number, children: number) {
    let entries = this.entries;
    const at = this.length * 3;
    if (at + 3 > entries.length) {
      const old = entries;
      entries = new Int32Array(
        Math.max(STACK_ARRAY_INITIAL_LENGTH, this.length * 2) * 3,
      );
      entries.set(old.subarray(0, at));
      this.entries = entries;
    }
    entries[at] = id;
    entries[at + 1] = start;
    entries[at + 2] = children;
    this.length++;
  }

  pop() {
    const at = (this.length - 1) * 3;
    const entries = this.entries;
    this.length--;
    return [entries[at], entries[at + 1], entries[at + 2]];
  }

  close(idx: number) {
    this.length = idx + 1;
  }

  last(id: number) {
    const entries = this.entries;
    for (let i = this.length - 1; i >= 0; i--) {
      if (entries[i * 3] === id) {
        return i;
      }
    }
    return null;
  }
}
