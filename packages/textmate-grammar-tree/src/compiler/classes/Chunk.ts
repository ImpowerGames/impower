/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { GrammarToken,ParserAction } from "../../core";
import { type TokenizerResume } from "../../grammar/classes/ResumableTokenizer";

import { type ITreeBuffer } from "../types/ITreeBuffer";
import { CompileStack } from "./CompileStack";
import { FlatBufferCursor } from "./FlatBufferCursor";

export const CHUNK_ARRAY_INTERVAL = 1024;

export const TREE_BUFFER_LENGTH_LIMIT = 2 ** 16;

export class Chunk {
  declare from: number;

  declare to: number;

  length = 0;

  compiled = new Int32Array(CHUNK_ARRAY_INTERVAL);

  stack: CompileStack = new CompileStack();

  scopes?: ParserAction;

  nodeCount: number = 0;

  treeBuffer?: ITreeBuffer | null;

  compilerNodeCount: number = 0;

  compilerReusedCount: number = 0;

  compilerMaxTreeBufferLength: number = 0;

  isSplitPoint: boolean;

  startsPure = true;

  resume?: TokenizerResume;

  entrySeeds?: { ids: number[]; children: number[]; absPositions: number[] };

  inheritedCloseRecords?: { seedIndex: number; offset: number }[];

  spliceSafe = false;

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
    if (this.resume) {
      for (const f of this.resume.frames) {
        f.openedAtAbs += offset;
      }
    }
    if (this.entrySeeds) {
      for (let i = 0; i < this.entrySeeds.absPositions.length; i++) {
        this.entrySeeds.absPositions[i]! += offset;
      }
    }
  }

  inheritFrom(prev: Chunk) {
    this.startsPure = false;
    const ids: number[] = [];
    const children: number[] = [];
    const absPositions: number[] = [];
    for (let i = 0; i < prev.stack.length; i++) {
      const prevRelative = prev.stack.positions[i]! | 0;
      const abs = prev.from + prevRelative;
      this.stack.push(prev.stack.ids[i]!, abs - this.from, prev.stack.children[i]!);
      ids.push(prev.stack.ids[i]!);
      children.push(prev.stack.children[i]!);
      absPositions.push(abs);
    }
    this.entrySeeds = { ids, children, absPositions };
    if (prev.scopes && prev.scopes.length > 0) {
      this.scopes = prev.scopes.slice();
    }
  }

  add(token: GrammarToken) {
    let [id, from, to, open, close] = token;

    this.treeBuffer = undefined;

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
      this.compiled = new Int32Array(old.length + CHUNK_ARRAY_INTERVAL);
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
    let { id, start, end, size } = cursor;
    cursor.next();
    if (size >= 0) {
      let startIndex = index;
      if (size > 4) {
        let endPos = cursor.pos - (size - 4);
        while (cursor.pos > endPos) {
          index = this.copyToTreeBuffer(cursor, bufferStart, buffer, index);
        }
      }
      buffer[--index] = startIndex;
      buffer[--index] = end - bufferStart;
      buffer[--index] = start - bufferStart;
      buffer[--index] = id;
    }
    return index;
  }
}
