/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { type ParserAction } from "../../core";

import { type ITreeBuffer } from "../types/ITreeBuffer";

/**
 * Sets the initial array size for chunks, and how much to grow a chunk's
 * array if it's full.
 */
export const CHUNK_ARRAY_INTERVAL = 16;

/**
 * A syntactic chunk of a parsed document. The full syntax tree can be
 * constructed by stringing these chunks together in a list. They can also
 * be used to restart a parse from the chunk's starting position.
 */
export class Chunk {
  /** The starting position of the chunk. */
  declare from: number;

  /** The ending position of the chunk. */
  declare to: number;

  /** The length of the chunk, in characters. */
  declare length: number;

  /**
   * The list of tokens this chunk is made up of. Note that each token is
   * made up of three elements in the array.
   */
  declare tokens: Int16Array;

  /** The number of tokens in the chunk. */
  declare size: number;

  /** The node(s) to open when this chunk starts. `null` if the chunk opens nothing. */
  declare opens: ParserAction | null;

  /** The node(s) to close when this chunk ends. `null` if the chunk closes nothing. */
  declare closes: ParserAction | null;

  /** The node(s) active in this chunk (scopes the chunk opens or inherits (i.e. were already open when the chunk was created)). */
  declare scopes: ParserAction | null;

  /**
   * {@link ITreeBuffer} version of this chunk.
   * If `null`, the tree will not be available, ever, due to the shape of the chunk.
   */
  declare tree?: ITreeBuffer | null;

  /** The last emitted size */
  emittedSize: number = 0;

  /** The last reused length */
  reusedLength: number = 0;

  /**
   * @param from - The starting position.
   * @param inherits - The scopes at the starting position.
   */
  constructor(from: number, inherits?: ParserAction) {
    this.from = from;
    this.to = from;
    this.length = 0;
    this.scopes = inherits ? [...inherits] : null;
    this.tokens = new Int16Array(CHUNK_ARRAY_INTERVAL);
    this.size = 0;
    this.opens = null;
    this.closes = null;
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
  add(id: number | null, from: number, to: number) {
    this.tree = undefined;

    if (to > this.to) {
      this.to = to;
      this.length = to - this.from;
    }

    // make token relative to chunk position
    from -= this.from;
    to -= this.from;

    if (id !== null) {
      // resize token array if needed
      if (this.size * 3 + 3 > this.tokens.length) {
        const old = this.tokens;
        this.tokens = new Int16Array(this.tokens.length + CHUNK_ARRAY_INTERVAL);
        this.tokens.set(old);
      }

      const idx = this.size * 3;
      this.tokens[idx] = id;
      this.tokens[idx + 1] = from;
      this.tokens[idx + 2] = to;
      this.size++;
    }
  }

  /**
   * Adds a node to open when the chunk starts.
   *
   * @param ids - The node ID(s).
   */
  pushOpen(...ids: number[]) {
    this.tree = undefined;
    ids.forEach((id) => {
      this.opens ??= [];
      this.opens.push(id);
    });
  }

  /**
   * Adds a node to close when the chunk ends.
   *
   * @param ids - The node ID(s).
   */
  pushClose(...ids: number[]) {
    this.tree = undefined;
    ids.forEach((id) => {
      this.closes ??= [];
      this.closes.push(id);
    });
  }

  /** Checks if the chunk can be converted into a {@link Tree}. */
  private canConvertToTree() {
    if (this.tree === null) {
      return false;
    }

    if (this.size <= 1) {
      return false;
    }

    if (this.opens || this.closes) {
      if (!(this.opens && this.closes)) {
        return false;
      }
      if (this.opens.length !== this.closes.length) {
        return false;
      }
      const open = this.opens.slice().reverse();
      const close = this.closes;
      for (let i = 0; i < open.length; i++) {
        if (open[i] !== close[i]) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Tries to convert this chunk into a {@link Tree}. If that isn't
   * possible, this function will return `null` and cache the result. The
   * cache is invalidated if the chunk changes.
   *
   * @param nodes - The language node set to use when creating the tree.
   */
  tryForTree() {
    if (this.tree === null) {
      return null;
    }
    if (this.tree) {
      return this.tree;
    }

    if (!this.canConvertToTree()) {
      this.tree = null;
      return null;
    }

    const buffer: number[] = [];

    const total = this.size * 4 + (this.opens?.length ?? 0) * 4;

    if (this.opens) {
      for (let i = this.opens.length - 1; i >= 0; i--) {
        buffer.push(this.opens[i]!, 0, this.length, total);
      }
    }

    for (let i = 0; i < this.size; i++) {
      const idx = i * 3;
      buffer.push(
        this.tokens[idx]!,
        this.tokens[idx + 1]!,
        this.tokens[idx + 2]!,
        buffer.length + 4
      );
    }

    this.tree = { buffer: new Uint16Array(buffer), length: this.length };

    return this.tree;
  }

  isPure() {
    // Chunk is completely pure (it does not inherit any scope, open any scope, or close any scope).
    return (
      (!this.scopes || this.scopes.length === 0) &&
      (!this.opens || this.opens.length === 0) &&
      (!this.closes || this.closes.length === 0) &&
      this.from === this.to
    );
  }
}
