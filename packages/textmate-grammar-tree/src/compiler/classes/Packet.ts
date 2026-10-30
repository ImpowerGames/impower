/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { type GrammarToken, type ParserAction } from "../../core";
import { type TokenizerResume } from "../../grammar/classes/ResumableTokenizer";

import { search } from "../utils/search";
import { Chunk } from "./Chunk";

export class Packet {
  chunks: Chunk[] = [];

  scopes?: ParserAction;

  protected pendingSplits: { at: number; resume: TokenizerResume }[] = [];

  constructor(chunks?: Chunk[]) {
    if (chunks) {
      this.chunks = chunks;
    }
  }

  scheduleSplit(at: number, resume: TokenizerResume) {
    this.pendingSplits.push({ at, resume });
  }

  clearScheduledSplit() {
    this.pendingSplits.length = 0;
  }

  scheduledSplits(): { at: number; resume: TokenizerResume }[] {
    return this.pendingSplits.slice();
  }

  restoreScheduledSplits(splits: { at: number; resume: TokenizerResume }[]) {
    this.pendingSplits = splits.slice();
  }

  get first() {
    if (!this.chunks.length) {
      return null;
    }
    return this.chunks[0] ?? null;
  }

  get last() {
    if (!this.chunks.length) {
      return null;
    }
    return this.chunks[this.chunks.length - 1] ?? null;
  }

  get compilerNodeCount() {
    return this.last?.compilerNodeCount;
  }

  get compilerReusedCount() {
    return this.last?.compilerReusedCount;
  }

  get compilerMaxTreeBufferLength() {
    return this.last?.compilerMaxTreeBufferLength;
  }

  get(index: number): Chunk | null {
    return this.chunks[index] ?? null;
  }

  add(token: GrammarToken) {
    const [, from] = token;

    let current = this.chunks[this.chunks.length - 1];

    let newChunk = false;

    while (
      this.pendingSplits.length > 1 &&
      from >= this.pendingSplits[1]!.at
    ) {
      this.pendingSplits.shift();
    }
    if (this.pendingSplits.length > 0 && from >= this.pendingSplits[0]!.at) {
      const { at, resume } = this.pendingSplits.shift()!;
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
      const splitAt = current.to;
      current = new Chunk(splitAt, true);
      this.chunks.push(current);
    }

    return newChunk;
  }

  private searchCmp = ({ from: pos }: Chunk, target: number) =>
    pos === target || pos - target;

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
      if (
        chunk &&
        chunk.isSplitPoint &&
        (chunk.startsPure || (chunk.spliceSafe && chunk.resume)) &&
        chunk.from > editedTo
      ) {
        return { chunk, index };
      }
      index = index + 1;
      chunk = this.chunks[index];
    }

    return { chunk: null, index: null };
  }

  split(index: number) {
    if (!this.get(index)) {
      throw new Error(`Tried to split packet on invalid index: ${index}`);
    }

    let left: Packet;
    let right: Packet;

    if (this.chunks.length <= 1) {
      left = new Packet(this.chunks.slice(0));
      right = new Packet([]);
    } else {
      left = new Packet(this.chunks.slice(0, index));
      right = new Packet(this.chunks.slice(index));
    }

    return { left, right };
  }

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

  append(right: Packet) {
    for (const c of right.chunks) {
      this.chunks.push(c);
    }
    return this;
  }
}

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
