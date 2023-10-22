/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { GrammarToken } from "../../core";
import type { GrammarState } from "../../grammar";

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

  /** @param chunks - The chunks to populate the buffer with. */
  constructor(chunks?: Chunk[]) {
    if (chunks) {
      this.chunks = chunks;
    }
  }

  /** The last chunk in the buffer. */
  get last() {
    if (!this.chunks.length) {
      return null;
    }
    return this.chunks[this.chunks.length - 1] ?? null;
  }

  /** The last chunk in the buffer. */
  set last(chunk: Chunk | null) {
    if (!chunk) {
      return;
    } // just satisfying typescript here
    if (!this.chunks.length) {
      this.chunks.push(chunk);
    }
    this.chunks[this.chunks.length - 1] = chunk;
  }

  /** Ensures there is at least one chunk in the buffer. */
  ensureLast(pos: number, state: GrammarState) {
    if (!this.last) {
      this.last = new Chunk(pos, state);
    }
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
  add(state: GrammarState, token: GrammarToken) {
    const [id, from, to, open, close] = token;
    let newChunk = false;

    let current = this.chunks[this.chunks.length - 1];

    if (!current) {
      current = new Chunk(from, state);
      this.chunks.push(current);
    }

    if (open) {
      if (current.length !== 0) {
        current = new Chunk(current.to, state);
        this.chunks.push(current);
        newChunk = true;
      }
      current.pushOpen(...open);
    }

    current.add(id, from, to);

    if (close) {
      current.pushClose(...close);
      current = new Chunk(current.to, state);
      this.chunks.push(current);
      newChunk = true;
    }

    return newChunk;
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
      left = new ChunkBuffer(this.chunks.slice(0));
      right = new ChunkBuffer(); // empty
    } else {
      left = new ChunkBuffer(this.chunks.slice(0, index + 1));
      right = new ChunkBuffer(this.chunks.slice(index + 1));
    }

    if (left.last) {
      left.last = left.last.clone();
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
    if (!this.get(index)) {
      throw new Error("Tried to slide buffer on invalid index!");
    }

    if (this.chunks.length === 0) {
      return this;
    }
    if (this.chunks.length === 1) {
      this.last!.offset(offset);
      return this;
    }

    if (cutLeft) {
      this.chunks = this.chunks.slice(index);
    }

    for (let idx = cutLeft ? 0 : index; idx < this.chunks.length; idx++) {
      this.chunks[idx]?.offset(offset);
    }

    return this;
  }

  /**
   * Links another `ChunkBuffer` to the end of this buffer.
   *
   * @param right - The buffer to link.
   * @param max - If given, the maximum size of the buffer (by document
   *   position) will be clamped to below this number.
   */
  link(right: ChunkBuffer, max?: number) {
    this.chunks = [...this.chunks, ...right.chunks];
    if (max) {
      for (let idx = 0; idx < this.chunks.length; idx++) {
        const chunk = this.chunks[idx];
        if (chunk && chunk.to > max) {
          this.chunks = this.chunks.slice(0, idx);
          break;
        }
      }
    }
    return this;
  }

  /** Binary search comparator function. */
  private searchCmp = ({ from: pos }: Chunk, target: number) =>
    pos === target || pos - target;

  /**
   * Searches for the closest chunk to the given position.
   *
   * @param pos - The position to find.
   * @param side - The side to search on. -1 for first matching chunk, 1 for last matching chunk, 0 for either.
   * @param precise - If true, the search will require an exact hit. If the
   *   search misses, it will return `null` for both the token and index.
   */
  search(pos: number, side: 1 | 0 | -1 = 0) {
    const result = search(this.chunks, pos, this.searchCmp, { precise: true });

    // null result or null resulting index
    if (!result || !this.chunks[result.index]) {
      return { chunk: null, index: null };
    }

    let { index } = result;
    let chunk = this.chunks[index];

    // We don't care about sidedness
    if (side === 0) {
      return { chunk, index };
    }

    // correct for sidedness
    while (chunk) {
      const nextIndex = side === 1 ? index + 1 : index - 1;
      const nextChunk = this.chunks[nextIndex];
      if (nextChunk?.from !== pos) {
        break;
      }
      index = nextIndex;
      chunk = nextChunk;
    }

    // no valid chunks
    if (!chunk) {
      return { chunk: null, index: null };
    }

    return { chunk, index };
  }
}
