/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GrammarToken, NodeID } from "../../core";
import { Grammar } from "../../grammar";

import { SpecialRecord } from "../enums/SpecialRecord";
import { ITreeBuffer } from "../types/ITreeBuffer";
import { Chunk } from "./Chunk";
import { FlatBufferCursor } from "./FlatBufferCursor";
import { Packet } from "./Packet";

/**
 * If true, the parser will try to close off incomplete nodes at the end of
 * the syntax tree.
 */
export const FINISH_INCOMPLETE_NODES = true;

/**
 * Sets the initial array size of the compiler's buffer, and how much to
 * grow it if it's full.
 */
export const COMPILER_ARRAY_INTERVAL = 32768;

export const DEFAULT_MAX_TREE_BUFFER_LENGTH = 1024;

export class Compiler {
  declare grammar: Grammar;
  declare packet: Packet;
  declare compiled: Int32Array;
  declare nodeCount: number;
  declare reused: ITreeBuffer[];
  declare index: number;
  declare reparsedFrom?: number;
  declare reparsedTo?: number;
  declare ahead?: Packet;
  declare maxTreeBufferLength: number;

  constructor(
    grammar: Grammar,
    packet?: Packet,
    compiled?: Int32Array,
    reused?: ITreeBuffer[]
  ) {
    this.grammar = grammar;
    this.packet = packet || new Packet([]);
    this.compiled = compiled || new Int32Array(COMPILER_ARRAY_INTERVAL);
    this.reused =
      packet && reused ? reused.slice(0, packet.compilerReusedCount) : [];
    this.nodeCount = packet && compiled ? packet.compilerNodeCount ?? 0 : 0;
    this.maxTreeBufferLength =
      packet && compiled
        ? packet.compilerMaxTreeBufferLength ?? DEFAULT_MAX_TREE_BUFFER_LENGTH
        : DEFAULT_MAX_TREE_BUFFER_LENGTH;
    this.index = packet && compiled ? packet.chunks.length : 0;
  }

  get done() {
    return this.index >= this.packet.chunks.length;
  }

  reset() {
    this.compiled = new Int32Array(COMPILER_ARRAY_INTERVAL);
    this.packet = new Packet([]);
    this.index = 0;
    this.nodeCount = 0;
    this.reused = [];
  }

  rewind(index: number) {
    const { left, right } = this.packet.split(index);
    this.packet = left;
    this.index = left.chunks.length;
    this.nodeCount = left.compilerNodeCount ?? 0;
    this.reused.length = left.compilerReusedCount ?? 0;
    this.maxTreeBufferLength =
      left.compilerMaxTreeBufferLength ?? DEFAULT_MAX_TREE_BUFFER_LENGTH;
    this.reparsedFrom = left.last?.to ?? 0;
    return right;
  }

  reuse(editedFrom: number, editedTo: number, editedOffset: number) {
    const splitPointBeforeEdit = this.packet.findBehindSplitPoint(editedFrom);
    const splitBehind = this.packet.findBehindSplitPoint(
      splitPointBeforeEdit.chunk?.from ?? 0
    );
    if (splitBehind.index != null) {
      const right = this.rewind(splitBehind.index);
      const from = splitBehind.chunk?.from ?? 0;
      right.slide(0, editedOffset, true);
      const splitAhead = right.findAheadSplitPoint(editedTo);
      if (splitAhead.chunk && splitAhead.index != null) {
        const aheadSplitBuffer = right.split(splitAhead.index);
        this.ahead = aheadSplitBuffer.right;
      }
      return from;
    }
    return null;
  }

  append(aheadBuffer: Packet) {
    this.reparsedTo = aheadBuffer.first!.from;
    this.packet.append(aheadBuffer);
  }

  add(token: GrammarToken) {
    const addedChunk = this.packet.add(token);
    const lastChunk = this.packet.last;
    const lastTreeBufferLength = lastChunk?.treeBufferLength ?? 0;
    if (
      lastChunk?.canConvertToTreeBuffer() &&
      lastTreeBufferLength > this.maxTreeBufferLength
    ) {
      this.maxTreeBufferLength = lastTreeBufferLength;
    }
    return addedChunk;
  }

  step() {
    if (this.index < this.packet.chunks.length) {
      const chunk = this.packet.chunks[this.index]!;

      const treeBuffer = chunk.tryForTreeBuffer();
      if (treeBuffer) {
        this.emitTreeBuffer(chunk, treeBuffer);
      } else {
        for (let i = 0; i < chunk.nodeCount * 4; i += 4) {
          this.emitNode(
            chunk.compiled[i]!,
            chunk.from + chunk.compiled[i + 1]!,
            chunk.from + chunk.compiled[i + 2]!,
            chunk.compiled[i + 3]!
          );
        }
      }

      chunk.compilerNodeCount = this.nodeCount;
      chunk.compilerReusedCount = this.reused.length;
      chunk.compilerMaxTreeBufferLength = this.maxTreeBufferLength;

      this.index++;
      return true;
    }
    return false;
  }

  private emitTreeBuffer(chunk: Chunk, treeBuffer: ITreeBuffer) {
    const reusedIndex = this.reused.length;
    this.emitNode(reusedIndex, chunk.from, chunk.to, SpecialRecord.Reuse);
    this.reused.push(treeBuffer);
  }

  private emitNode(type: number, from: number, to: number, children: number) {
    const idx = this.nodeCount * 4;

    // we may need to resize the array
    if (idx + 4 > this.compiled.length) {
      const old = this.compiled;
      this.compiled = new Int32Array(old.length + COMPILER_ARRAY_INTERVAL);
      this.compiled.set(old);
    }

    this.compiled[idx] = type;
    this.compiled[idx + 1] = from;
    this.compiled[idx + 2] = to;
    this.compiled[idx + 3] = children;
    this.nodeCount++;
  }

  advanceFully() {
    if (!this.done) {
      while (this.step()) {}
    }
  }

  finish(length: number): {
    cursor: FlatBufferCursor;
    reused: ITreeBuffer[];
    maxBufferLength: number;
  } | null {
    if (!this.packet.chunks.length) {
      return null;
    }

    this.advanceFully();

    if (FINISH_INCOMPLETE_NODES) {
      const lastChunk = this.packet.last;
      if (lastChunk) {
        while (lastChunk.stack.length > 0) {
          // emit an error token
          this.emitNode(NodeID.incomplete, length, length, 4);

          // finish the last element in the stack
          const s = lastChunk.stack.pop()!;
          const node = s[0]!;
          const pos = s[1]!;
          const children = s[2]!;

          this.emitNode(node, pos, length, children * 4 + 4);
        }
      }
    }

    const reused = this.reused;
    const cursor = new FlatBufferCursor(this.compiled, this.nodeCount * 4);
    const maxBufferLength = this.maxTreeBufferLength;

    return {
      cursor,
      reused,
      maxBufferLength,
    };
  }

  compile(source: string) {
    this.reset();
    let pos = 0;
    while (pos < source.length) {
      const next = () => "";
      const match = this.grammar.match(source, next, pos, pos);
      let matchTokens: GrammarToken[] | null = null;
      let matchLength = 0;
      if (match) {
        matchTokens = match.compile();
        matchLength = match.length;
      } else {
        // if we didn't match, we'll advance to prevent getting stuck
        matchTokens = [[NodeID.unrecognized, pos, pos + 1]];
        matchLength = 1;
      }
      // console.log(
      //   "full parse match",
      //   matchTokens?.map((t) => [
      //     this.grammar.nodeNames[t[0]!],
      //     JSON.stringify(source.slice(t[1], t[2])),
      //     t[3]?.map((o) => this.grammar.nodeNames[o]).join(","),
      //     t[4]?.map((c) => this.grammar.nodeNames[c]).join(","),
      //   ]),
      //   JSON.stringify(source.slice(pos, pos + matchLength))
      // );
      for (let idx = 0; idx < matchTokens!.length; idx++) {
        const token = matchTokens![idx]!;
        this.packet.add(token);
      }
      pos += matchLength;
    }
    const result = this.finish(source.length);
    if (result) {
      return result;
    }
    return null;
  }
}
