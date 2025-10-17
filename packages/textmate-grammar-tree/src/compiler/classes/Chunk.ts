/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GrammarToken, type ParserAction } from "../../core";

import { type ITreeBuffer } from "../types/ITreeBuffer";
import { CompileStack } from "./CompileStack";
import { FlatBufferCursor } from "./FlatBufferCursor";

/**
 * Sets the initial array size for chunks, and how much to grow a chunk's
 * array if it's full.
 */
export const CHUNK_ARRAY_INTERVAL = 1024;

/**
 * Tree buffers must be under this limit so children indexes can fit inside 16-bit typed array slots
 */
export const TREE_BUFFER_LENGTH_LIMIT = 2 ** 16; // (65536)

/**
 * A syntactic chunk of a parsed document. The full syntax tree can be
 * constructed by stringing these chunks together in a list. They can also
 * be used to restart a parse from the chunk's starting position.
 */
export class Chunk {
  /** The starting document position of the chunk. */
  declare from: number;

  /** The ending document position of the chunk. */
  declare to: number;

  /** The document length of the chunk. */
  length = 0;

  compiled = new Int32Array(CHUNK_ARRAY_INTERVAL);

  stack: CompileStack = new CompileStack();

  /** The node(s) that are currently open. */
  scopes?: ParserAction;

  /** The number of nodes in this chunk */
  nodeCount: number = 0;

  /**
   * {@link ITreeBuffer} version of this chunk.
   * If `null`, the tree will not be available, ever, due to the shape of the chunk.
   */
  treeBuffer?: ITreeBuffer | null;

  /** The number of nodes emitted by the compiler so far */
  compilerNodeCount: number = 0;

  /** The number of reused tree buffers emitted by the compiler so far */
  compilerReusedCount: number = 0;

  /** The max tree buffer length emitted by the compiler so far */
  compilerMaxTreeBufferLength: number = 0;

  isSplitPoint: boolean;

  get endsPure() {
    return !this.scopes || this.scopes.length === 0;
  }

  get treeBufferLength() {
    return this.nodeCount * 4;
  }

  /**
   * @param from - The starting position.
   * @param inherits - The scopes at the starting position.
   */
  constructor(from: number, isSplitPoint: boolean = false) {
    this.from = from;
    this.to = from;
    this.isSplitPoint = isSplitPoint;
  }

  /**
   * Offsets the chunk's starting position.
   *
   * @param offset - The offset to add to the chunk's starting position.
   */
  offset(offset: number) {
    this.from += offset;
    this.to = this.from + this.length;
  }

  /**
   * Adds a new token to the chunk.
   *
   * @param id - The token ID.
   * @param from - The starting position of the token.
   * @param to - The ending position of the token.
   */
  add(token: GrammarToken) {
    let [id, from, to, open, close] = token;

    this.treeBuffer = undefined;

    if (to > this.to) {
      this.to = to;
      this.length = to - this.from;
    }

    // make token relative to chunk position
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
      // Full node that doesn't contain any children
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
          // cut off anything past the closing element
          // i.e. inside nodes won't persist outside their parent if they
          // never closed before their parent did
          this.stack.close(idx);
          // finally pop the node
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

  /**
   * Tries to convert this chunk into a {@link Tree}. If that isn't
   * possible, this function will return `null` and cache the result. The
   * cache is invalidated if the chunk changes.
   *
   * @param nodes - The language node set to use when creating the tree.
   */
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
    // Unlike compiled buffers (which are stored in suffix order, children before parents),
    // TreeBuffers must be stored in prefix order (parents before children)
    // So we must traverse the compiled buffer and copy the nodes to a new buffer in prefix order
    this.copyToTreeBuffer(cursor, 0, treeBuffer, treeBufferLength);

    this.treeBuffer = {
      buffer: treeBuffer,
      length: this.length,
    };

    return this.treeBuffer;
  }

  private emitNode(type: number, from: number, to: number, children: number) {
    const idx = this.nodeCount * 4;

    // we may need to resize the array
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
    index: number
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
