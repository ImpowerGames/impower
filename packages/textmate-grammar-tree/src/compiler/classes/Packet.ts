/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { type GrammarToken, type ParserAction } from "../../core";
import { type TokenizerResume } from "../../grammar/classes/ResumableTokenizer";

import { search } from "../utils/search";
import { Chunk } from "./Chunk";

/**
 * A `Packet` stores `Chunk` objects that then store the actual tokens
 * emitted by tokenizing. The creation of `Chunk` objects is fully
 * automatic, all the parser needs to do is push the tokens to the packet.
 *
 * Storing chunks instead of tokens allows the packet to more easily manage
 * a large number of tokens, and more importantly, allows the parser to use
 * chunks as checkpoints, enabling it to only tokenize what it needs to and
 * reuse everything else.
 */
export class Packet {
  /** The actual array of chunks that the packet manages. */
  chunks: Chunk[] = [];

  /** The node(s) that are open at the end of this packet. */
  scopes?: ParserAction;

  /**
   * A pending in-scope split request from the tokenizer: the next token at
   * or past `at` should start a new inheriting split-point chunk carrying
   * `resume` (see {@link add}).
   */
  protected pendingSplit?: { at: number; resume: TokenizerResume };

  /** @param chunks - The chunks to populate the packet with. */
  constructor(chunks?: Chunk[]) {
    if (chunks) {
      this.chunks = chunks;
    }
  }

  /**
   * Schedules an in-scope line-boundary split: when the next token at or
   * past `at` arrives, a new split-point chunk is minted there, inheriting
   * the previous chunk's residual open frames and carrying the tokenizer's
   * resume snapshot so a later parse can restart at `at`.
   *
   * (Called before the boundary's tokens are added — the tokenizer's
   * one-token lookbehind buffer means the last token BEFORE the boundary
   * arrives in the same batch; comparing `from >= at` sorts them out.)
   */
  scheduleSplit(at: number, resume: TokenizerResume) {
    this.pendingSplit = { at, resume };
  }

  /** Clears any scheduled split (a new parse run starts fresh). */
  clearScheduledSplit() {
    this.pendingSplit = undefined;
  }

  /** The first chunk in the packet. */
  get first() {
    if (!this.chunks.length) {
      return null;
    }
    return this.chunks[0] ?? null;
  }

  /** The last chunk in the packet. */
  get last() {
    if (!this.chunks.length) {
      return null;
    }
    return this.chunks[this.chunks.length - 1] ?? null;
  }

  /** The last emitted size */
  get compilerNodeCount() {
    return this.last?.compilerNodeCount;
  }

  /** The last reused length */
  get compilerReusedCount() {
    return this.last?.compilerReusedCount;
  }

  /** The last max tree buffer length */
  get compilerMaxTreeBufferLength() {
    return this.last?.compilerMaxTreeBufferLength;
  }

  /** Retrieves a `Chunk` from the packet. */
  get(index: number): Chunk | null {
    return this.chunks[index] ?? null;
  }

  /**
   * Adds tokens to the packet, splitting them automatically into chunks.
   * Returns true if the current chunk can be converted to a tree.
   *
   * @param state - The state to be cached.
   * @param token - The token to add to the packet.
   */
  add(token: GrammarToken) {
    const [, from] = token;

    let current = this.chunks[this.chunks.length - 1];

    let newChunk = false;

    if (this.pendingSplit && from >= this.pendingSplit.at) {
      const { at, resume } = this.pendingSplit;
      this.pendingSplit = undefined;
      // Mint an inheriting split-point chunk at the line boundary — but
      // only mid-scope: at a pure boundary the ordinary split machinery
      // below already provides a (cheaper, snapshot-free) restart point.
      if (current && !current.endsPure && current.from < at && current.to <= at) {
        current = new Chunk(at, true);
        current.inheritFrom(this.chunks[this.chunks.length - 1]!);
        current.resume = resume;
        current.spliceSafe = spliceStateAccountsForSeeds(resume, current);
        this.chunks.push(current);
        newChunk = true;
      }
    }

    if (!current || current.endsPure) {
      current = new Chunk(from);
      this.chunks.push(current);
      newChunk = true;
    }

    current.add(token);

    if (current.endsPure) {
      // Create an empty chunk to act as a clean split point.
      //
      // Position the split AT THE END of the just-added chunk
      // (`current.to`), NOT at the token's `from`. Using `from`
      // would place the split BEFORE the content we just added —
      // which makes `packet.last.to` artificially small. After an
      // incremental parse appends `ahead` (whose last entry is one
      // of these split chunks), the parser sets `parsedPos =
      // packet.last.to` and finds it's *behind* the content's end.
      // It then re-emits whatever sits between, producing duplicate
      // tokens (most visibly: a duplicate trailing-EOF `Newline`
      // grows by one with every incremental edit).
      const splitAt = current.to;
      current = new Chunk(splitAt, true);
      this.chunks.push(current);
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
      return { chunk: null, index: 0 };
    }

    let index = result.index;
    let chunk = this.chunks[index];

    while (chunk) {
      index = index - 1;
      chunk = this.chunks[index];
      if (chunk && chunk.isSplitPoint && chunk.from < editedFrom) {
        // This is the first pure chunk before the edit.
        // We can safely reuse everything before this point
        return { chunk, index };
      }
    }

    return { chunk: null, index: 0 };
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
      // Pure split points are always valid ahead targets. In-scope split
      // points are only candidates when marked spliceSafe with a resume
      // snapshot — the parse verifies on ARRIVAL that its tokenizer state
      // matches the snapshot before splicing (and fixes up the baked
      // child counts/positions); if the check fails it simply parses on
      // and re-splits further ahead.
      if (
        chunk &&
        chunk.isSplitPoint &&
        (chunk.startsPure || (chunk.spliceSafe && chunk.resume)) &&
        chunk.from > editedTo
      ) {
        // This is the first pure chunk after the edit.
        // We can safely reuse everything after this point
        return { chunk, index };
      }
      index = index + 1;
      chunk = this.chunks[index];
    }

    return { chunk: null, index: null };
  }

  /**
   * Splits the packet into a left and right section. The left section
   * takes the indexed chunk, which will have its tokens cleared.
   *
   * @param index - The chunk index to split on.
   */
  split(index: number) {
    if (!this.get(index)) {
      throw new Error(`Tried to split packet on invalid index: ${index}`);
    }

    let left: Packet;
    let right: Packet;

    if (this.chunks.length <= 1) {
      left = new Packet(this.chunks.slice(0));
      right = new Packet([]); // empty
    } else {
      left = new Packet(this.chunks.slice(0, index));
      right = new Packet(this.chunks.slice(index));
    }

    return { left, right };
  }

  /**
   * Offsets every chunk's position whose index is past or at the given index.
   *
   * @param index - The index the slide will start at.
   * @param offset - The positional offset that is applied to the chunks.
   * @param cutLeft - If true, every chunk previous to `index` will be
   *   removed from the packet.
   */
  slide(index: number, offset: number, cutLeft = false) {
    if (!offset) {
      return this;
    }
    if (this.chunks.length === 0) {
      return this;
    }
    if (this.chunks.length === 1) {
      this.last!.offset(offset);
      return this;
    }

    if (!this.get(index)) {
      throw new Error(`Tried to slide packet on invalid index: ${index}`);
    }

    if (cutLeft) {
      this.chunks = this.chunks.slice(index);
    }

    for (let i = cutLeft ? 0 : index; i < this.chunks.length; i++) {
      const chunk = this.chunks[i]!;
      chunk.offset(offset);
    }

    return this;
  }

  /**
   * Appends another `Packet` to the end of this packet.
   *
   * @param right - The packet to link.
   */
  append(right: Packet) {
    for (const c of right.chunks) {
      this.chunks.push(c);
    }
    return this;
  }
}

/**
 * True when the tokenizer-level resume state fully explains the chunk-level
 * inherited stack: each open frame contributes its emitting-switch wrappers
 * (outermost first), its scope node, and — if opened — its content wrapper.
 * When the boundary's first steps retroactively closed markers onto the
 * token BEFORE the boundary, the seeds diverge from this derivation and
 * the boundary cannot be spliced into mid-scope (the pre-boundary token in
 * a NEW parse would be missing those markers).
 */
function spliceStateAccountsForSeeds(
  resume: TokenizerResume,
  chunk: Chunk,
): boolean {
  const seeds = chunk.entrySeeds;
  if (!seeds) {
    return false;
  }
  const derived: number[] = [];
  for (const f of resume.frames) {
    if (f.wrapperNodes) {
      for (const w of f.wrapperNodes) {
        derived.push(w);
      }
    }
    derived.push(f.rule.node.typeIndex);
    if (f.contentOpened) {
      derived.push(f.contentNodeIndex);
    }
  }
  if (derived.length !== seeds.ids.length) {
    return false;
  }
  for (let i = 0; i < derived.length; i++) {
    if (derived[i] !== seeds.ids[i]) {
      return false;
    }
  }
  return true;
}
