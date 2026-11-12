/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { GrammarToken,ParserAction } from "../../core";
import { type TokenizerResume } from "../../grammar/classes/ResumableTokenizer";

import { type IReusedRecords } from "../types/IReusedRecords";
import { type ITreeBuffer } from "../types/ITreeBuffer";
import { CompileStack } from "./CompileStack";
import { FlatBufferCursor } from "./FlatBufferCursor";

export const CHUNK_ARRAY_INITIAL_LENGTH = 32;

const EMPTY_COMPILED = new Int32Array(0);

export const TREE_BUFFER_LENGTH_LIMIT = 2 ** 16;

export interface ChunkResume {
  readonly stack: TokenizerResume["stack"];
  readonly frames: TokenizerResume["frames"];
  openedAt: number[];
}

export interface ChunkRun {
  members: Chunk[];
  stamps: Int32Array;
  reused: IReusedRecords;
}

export class Chunk {
  declare from: number;

  declare to: number;

  length = 0;

  compiled = EMPTY_COMPILED;

  stack: CompileStack = new CompileStack();

  scopes?: ParserAction = undefined;

  nodeCount: number = 0;

  treeBuffer?: ITreeBuffer | null = undefined;

  compilerNodeCount: number = 0;

  compilerReusedCount: number = 0;

  compilerMaxTreeBufferLength: number = 0;

  isSplitPoint: boolean;

  startsPure = true;

  resume?: ChunkResume = undefined;

  entrySeeds?: { ids: readonly number[]; children: number[] } = undefined;

  inheritedCloseRecords?: { seedIndex: number; offset: number }[] = undefined;

  spliceSafe = false;

  version = 0;

  run?: ChunkRun = undefined;

  get endsPure() {
    return !this.scopes || this.scopes.length === 0;
  }

  get treeBufferLength() {
    return this.nodeCount * 4;
  }

  constructor(from: number, isSplitPoint: boolean = false) {
    this.from = from;
    this.to = from;
    this.isSplitPoint = isSplitPoint;
  }

  offset(offset: number) {
    this.from += offset;
    this.to = this.from + this.length;
  }

  attachResume(resume: TokenizerResume) {
    const openedAt = new Array<number>(resume.openedAtAbs.length);
    for (let i = 0; i < openedAt.length; i++) {
      openedAt[i] = resume.openedAtAbs[i]! - this.from;
    }
    this.resume = { stack: resume.stack, frames: resume.frames, openedAt };
  }

  absoluteResume(): TokenizerResume | undefined {
    const resume = this.resume;
    if (!resume) {
      return undefined;
    }
    const openedAtAbs = new Array<number>(resume.openedAt.length);
    for (let i = 0; i < openedAtAbs.length; i++) {
      openedAtAbs[i] = resume.openedAt[i]! + this.from;
    }
    return { stack: resume.stack, frames: resume.frames, openedAtAbs };
  }

  inheritFrom(prev: Chunk) {
    this.startsPure = false;
    const stack = prev.stack;
    const length = stack.length;
    const children = new Array<number>(length);
    for (let i = 0; i < length; i++) {
      const abs = prev.from + stack.position(i);
      this.stack.push(stack.id(i), abs - this.from, stack.childCount(i));
      children[i] = stack.childCount(i);
    }
    this.entrySeeds = { ids: seedIds(stack, prev.entrySeeds?.ids), children };
    if (prev.scopes && prev.scopes.length > 0) {
      this.scopes = prev.scopes.slice();
    }
  }

  add(token: GrammarToken) {
    let [id, from, to, open, close] = token;

    this.treeBuffer = undefined;
    this.version++;

    if (to > this.to) {
      this.to = to;
      this.length = to - this.from;
    }

    from -= this.from;
    to -= this.from;

    if (open) {
      for (const o of open) {
        this.scopes ??= [];
        this.scopes.push(o);
        this.stack.push(o, from, 0);
      }
    }

    if (id != null) {
      this.emitNode(id, from, to, 4);
    }

    if (close) {
      for (const c of close) {
        if (this.scopes) {
          const removeIndex = this.scopes.findLastIndex((n) => n === c);
          if (removeIndex >= 0) {
            this.scopes.splice(removeIndex, 1);
          }
        }
        const idx = this.stack.last(c);
        if (idx !== null) {
          if (this.entrySeeds && idx < this.entrySeeds.ids.length) {
            (this.inheritedCloseRecords ??= []).push({
              seedIndex: idx,
              offset: this.nodeCount * 4,
            });
          }
          this.stack.close(idx);
          const s = this.stack.pop()!;
          const node = s[0]!;
          const pos = s[1]!;
          const children = s[2]!;
          this.emitNode(node, pos, to, children * 4 + 4);
        }
      }
    }
  }

  canConvertToTreeBuffer() {
    return (
      !this.isSplitPoint &&
      this.endsPure &&
      this.nodeCount > 0 &&
      this.treeBufferLength < TREE_BUFFER_LENGTH_LIMIT
    );
  }

  tryForTreeBuffer() {
    if (!this.canConvertToTreeBuffer()) {
      this.treeBuffer = null;
      return null;
    }

    if (this.treeBuffer) {
      return this.treeBuffer;
    }

    const treeBufferLength = this.nodeCount * 4;
    const cursor = new FlatBufferCursor(this.compiled, treeBufferLength);
    const treeBuffer = new Uint16Array(treeBufferLength);
    this.copyToTreeBuffer(cursor, 0, treeBuffer, treeBufferLength);

    this.treeBuffer = {
      buffer: treeBuffer,
      length: this.length,
    };

    return this.treeBuffer;
  }

  private emitNode(type: number, from: number, to: number, children: number) {
    const idx = this.nodeCount * 4;

    if (idx + 4 > this.compiled.length) {
      const old = this.compiled;
      this.compiled = new Int32Array(
        Math.max(CHUNK_ARRAY_INITIAL_LENGTH, old.length * 2),
      );
      this.compiled.set(old);
    }

    this.compiled[idx] = type;
    this.compiled[idx + 1] = from;
    this.compiled[idx + 2] = to;
    this.compiled[idx + 3] = children;
    this.nodeCount++;
    this.stack.increment();
  }

  copyToTreeBuffer(
    cursor: FlatBufferCursor,
    bufferStart: number,
    buffer: Uint16Array,
    index: number,
  ): number {
    const open: number[] = [];
    for (;;) {
      const { id, start, end, size } = cursor;
      cursor.next();
      if (size > 4) {
        open.push(id, start, end, index, cursor.pos - (size - 4));
        continue;
      }
      if (size >= 0) {
        const startIndex = index;
        buffer[--index] = startIndex;
        buffer[--index] = end - bufferStart;
        buffer[--index] = start - bufferStart;
        buffer[--index] = id;
      }
      while (open.length > 0 && cursor.pos <= open[open.length - 1]!) {
        open.pop();
        const startIndex = open.pop()!;
        const openEnd = open.pop()!;
        const openStart = open.pop()!;
        const openId = open.pop()!;
        buffer[--index] = startIndex;
        buffer[--index] = openEnd - bufferStart;
        buffer[--index] = openStart - bufferStart;
        buffer[--index] = openId;
      }
      if (open.length === 0) {
        return index;
      }
    }
  }
}

function seedIds(stack: CompileStack, previous?: readonly number[]): readonly number[] {
  const length = stack.length;
  if (previous && previous.length === length) {
    let same = true;
    for (let i = 0; i < length; i++) {
      if (previous[i] !== stack.id(i)) {
        same = false;
        break;
      }
    }
    if (same) {
      return previous;
    }
  }
  const ids = new Array<number>(length);
  for (let i = 0; i < length; i++) {
    ids[i] = stack.id(i);
  }
  return ids;
}
