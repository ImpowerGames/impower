/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { type GrammarToken, type ParserAction } from "../../core";

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
  scopes?: ParserAction;

  /** @param chunks - The chunks to populate the buffer with. */
  constructor(chunks?: Chunk[]) {
    if (chunks) {
      this.chunks = chunks;
    }
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

  /** The last emitted size */
  get emittedSize() {
    return this.last?.emittedSize;
  }

  /** The last reused length */
  get reusedLength() {
    return this.last?.reusedLength;
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
      this.scopes ??= [];
      for (const o of open) {
        this.scopes.push(o);
      }
    }

    if (!current || open) {
      current = new Chunk(from, this.scopes);
      this.chunks.push(current);
      newChunk = true;
    }

    if (open) {
      for (const o of open) {
        current.pushOpen(o);
      }
    }

    current.add(id, from, to);

    if (close) {
      for (const c of close) {
        current.pushClose(c);
      }
      current = new Chunk(current.to, this.scopes);
      this.chunks.push(current);
      newChunk = true;
    }

    if (close) {
      close.forEach((c) => {
        if (this.scopes) {
          const removeIndex = this.scopes.findLastIndex((n) => n === c);
          if (removeIndex >= 0) {
            this.scopes.splice(removeIndex, 1);
            if (this.scopes.length === 0) {
              this.scopes = undefined;
            }
          }
        }
      });
    }

    if (!this.scopes) {
      // Add a chunk that we can safely restart parsing from
      current = new Chunk(current.to, this.scopes);
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
      if (chunk && chunk.isPure() && chunk.from < editedFrom) {
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
      if (chunk && chunk.isPure() && chunk.from > editedTo) {
        // This is the first pure chunk after the edit.
        // We can safely reuse everything after this point
        return { chunk, index };
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
      left = new ChunkBuffer(this.chunks.slice(0));
      right = new ChunkBuffer([]); // empty
    } else {
      left = new ChunkBuffer(this.chunks.slice(0, index));
      right = new ChunkBuffer(this.chunks.slice(index));
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
   */
  append(right: ChunkBuffer) {
    for (const c of right.chunks) {
      this.chunks.push(c);
    }
    return this;
  }
}
