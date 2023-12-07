/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { GrammarToken, ParserAction } from "../../core";

import { search } from "../utils/search";
import { Chunk } from "./Chunk";

/**
 * A `ChunkBuffer` stores `Chunk` objects that then store the actual tokens
 * emitted by tokenizing. The creation of `Chunk` objects is fully
 * automatic, all the parser needs to do is push the tokens to the buffer.
 *
 * Storing chunks instead of tokens allows the buffer to more easily manage
 * a large number of tokens, and more importantly, allows the parser to use
 * chunks as checkpoints, enabling it to only tokenize what it needs to and
 * reuse everything else.
 */
export class ChunkBuffer {
  /** The actual array of chunks that the buffer manages. */
  chunks: Chunk[] = [];

  /** The node(s) that are open at the end of this buffer. */
  scopes: ParserAction = [];

  names: string[] = [];

  /** @param chunks - The chunks to populate the buffer with. */
  constructor(chunks?: Chunk[], names?: string[]) {
    if (chunks) {
      this.chunks = chunks;
    }
    if (names) {
      this.names = names;
    }
    this.scopes = [];
  }

  /** The first chunk in the buffer. */
  get first() {
    if (!this.chunks.length) {
      return null;
    }
    return this.chunks[0] ?? null;
  }

  /** The last chunk in the buffer. */
  get last() {
    if (!this.chunks.length) {
      return null;
    }
    return this.chunks[this.chunks.length - 1] ?? null;
  }

  /** Retrieves a `Chunk` from the buffer. */
  get(index: number): Chunk | null {
    return this.chunks[index] ?? null;
  }

  /**
   * Adds tokens to the buffer, splitting them automatically into chunks.
   * Returns true if a new chunk was created.
   *
   * @param state - The state to be cached.
   * @param token - The token to add to the buffer.
   */
  add(token: GrammarToken) {
    const [id, from, to, open, close] = token;
    let newChunk = false;

    let current = this.chunks[this.chunks.length - 1];

    if (open) {
      this.scopes.push(...open);
    }
    if (close) {
      close.forEach((c) => {
        const removeIndex = this.scopes.findLastIndex((n) => n === c);
        if (removeIndex >= 0) {
          this.scopes.splice(removeIndex, 1);
        }
      });
    }

    if (!current || this.scopes.length === 0 || open) {
      current = new Chunk(from, [...this.scopes]);
      this.chunks.push(current);
      newChunk = true;
    }

    if (open) {
      current.pushOpen(...open);
    }

    current.add(id, from, to);

    if (close) {
      current.pushClose(...close);
      current = new Chunk(current.to, [...this.scopes]);
      this.chunks.push(current);
      newChunk = true;
    }

    return newChunk;
  }

  /** Binary search comparator function. */
  private searchCmp = ({ from: pos }: Chunk, target: number) =>
    pos === target || pos - target;

  /**
   * Searches backwards for the closest chunk that parsing can restart from.
   *
   * @param editedFrom - The starting position of the edit.
   */
  findBehindSplitPoint(editedFrom: number) {
    const result = search(this.chunks, editedFrom, this.searchCmp, {
      precise: false,
    });

    if (!result || !this.chunks[result.index]) {
      return { chunk: null, index: null };
    }

    let index = result.index;
    let chunk = this.chunks[index];

    while (chunk) {
      index = index - 1;
      chunk = this.chunks[index];
      if (chunk && chunk.isPure()) {
        return { chunk, index };
      }
    }

    return { chunk: null, index: null };
  }

  findAheadSplitPoint(editedTo: number) {
    const result = search(this.chunks, editedTo, this.searchCmp, {
      precise: false,
    });

    if (!result || !this.chunks[result.index]) {
      return { chunk: null, index: null };
    }

    let index = result.index;
    let chunk = this.chunks[index];

    while (chunk) {
      if (chunk && chunk.isPure() && chunk.from >= editedTo) {
        // First pure chunk after edit range found
        // Now find the point where scope is no longer pure
        return this.findNextUnpureChunk(index);
      }
      index = index + 1;
      chunk = this.chunks[index];
    }

    return { chunk: null, index: null };
  }

  findNextUnpureChunk(index: number) {
    let chunk = this.chunks[index];

    while (chunk) {
      if (chunk && !chunk.isPure()) {
        return { chunk, index };
      }
      index = index + 1;
      chunk = this.chunks[index];
    }

    return { chunk: null, index: null };
  }

  /**
   * Splits the buffer into a left and right section. The left section
   * takes the indexed chunk, which will have its tokens cleared.
   *
   * @param index - The chunk index to split on.
   */
  split(index: number) {
    if (!this.get(index)) {
      throw new Error("Tried to split buffer on invalid index!");
    }

    let left: ChunkBuffer;
    let right: ChunkBuffer;

    if (this.chunks.length <= 1) {
      left = new ChunkBuffer(this.chunks.slice(0), this.names);
      right = new ChunkBuffer([], this.names); // empty
    } else {
      left = new ChunkBuffer(this.chunks.slice(0, index), this.names);
      right = new ChunkBuffer(this.chunks.slice(index), this.names);
    }

    return { left, right };
  }

  /**
   * Offsets every chunk's position whose index is past or at the given index.
   *
   * @param index - The index the slide will start at.
   * @param offset - The positional offset that is applied to the chunks.
   * @param cutLeft - If true, every chunk previous to `index` will be
   *   removed from the buffer.
   */
  slide(index: number, offset: number, cutLeft = false) {
    if (!offset) {
      return this;
    }
    if (!this.get(index))
      throw new Error("Tried to slide buffer on invalid index!");

    if (this.chunks.length === 0) return this;
    if (this.chunks.length === 1) {
      this.last!.offset(offset);
      return this;
    }

    if (cutLeft) this.chunks = this.chunks.slice(index);

    for (let idx = cutLeft ? 0 : index; idx < this.chunks.length; idx++) {
      const chunk = this.chunks[idx]!;
      chunk.offset(offset);
    }

    return this;
  }

  /**
   * Appends another `ChunkBuffer` to the end of this buffer.
   *
   * @param right - The buffer to link.
   * @param max - If given, the maximum size of the buffer (by document
   *   position) will be clamped to below this number.
   */
  append(right: ChunkBuffer, max?: number) {
    this.chunks = [...this.chunks, ...right.chunks];
    if (max != null) {
      for (let idx = 0; idx < this.chunks.length; idx++) {
        const chunk = this.chunks[idx]!;
        if (chunk.to > max) {
          this.chunks = this.chunks.slice(0, idx);
          break;
        }
      }
    }
    return this;
  }
}
