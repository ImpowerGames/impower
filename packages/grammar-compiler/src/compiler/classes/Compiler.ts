/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GrammarToken, NodeID } from "../../core";
import { Grammar } from "../../grammar";

import { SpecialRecord } from "../enums/SpecialRecord";
import { ITreeBuffer } from "../types/ITreeBuffer";
import type { Chunk } from "./Chunk";
import { ChunkBuffer } from "./ChunkBuffer";
import { CompileStack } from "./CompileStack";
import FlatBufferCursor from "./FlatBufferCursor";
import TreeBuffer from "./TreeBuffer";

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

export class Compiler {
  declare grammar: Grammar;
  declare stack: CompileStack;
  declare buffer: ChunkBuffer;
  declare compiled: Int32Array;
  declare size: number;
  declare reused: TreeBuffer[];
  declare index: number;

  constructor(grammar: Grammar, buffer?: ChunkBuffer) {
    this.grammar = grammar;
    this.stack = new CompileStack();
    this.buffer = buffer || new ChunkBuffer([], grammar.nodeNames);
    this.compiled = new Int32Array(COMPILER_ARRAY_INTERVAL);
    this.size = 0;
    this.reused = [];
    this.index = 0;
  }

  get cursor() {
    return new FlatBufferCursor(this.compiled, this.size * 4);
  }

  get done() {
    return this.index >= this.buffer.chunks.length;
  }

  reset() {
    this.stack = new CompileStack();
    this.buffer = new ChunkBuffer([], this.grammar.nodeNames);
    this.compiled = new Int32Array(COMPILER_ARRAY_INTERVAL);
    this.size = 0;
    this.reused = [];
    this.index = 0;
  }

  private emitReused(type: number, from: number, to: number) {
    this.emit(type, from, to, SpecialRecord.Reuse);
  }

  private emit(type: number, from: number, to: number, children: number) {
    const idx = this.size * 4;

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
    this.size++;
    this.stack.increment();

    // console.log(
    //   "EMIT",
    //   type,
    //   this.grammar.nodes?.[type]?.typeId,
    //   from,
    //   to,
    //   children
    // );
  }

  private parse(chunk: Chunk) {
    const from = chunk.from;
    const to = chunk.to;

    if (chunk.tryForTree()) {
      const tree = chunk.tree!;
      const reusedIndex = this.reused.length;
      this.emitReused(reusedIndex, from, to);
      this.reused.push(tree);
      return;
    }

    // add open nodes to stack
    // this doesn't affect the buffer at all, but now we can watch for
    // when another node closes one of the open nodes we added
    if (chunk.opens) {
      for (let i = 0; i < chunk.opens.length; i++) {
        this.stack.push(chunk.opens[i]!, from, 0);
      }
    }

    if (chunk.size) {
      for (let i = 0; i < chunk.size * 3; i += 3) {
        this.emit(
          chunk.tokens[i]!,
          from + chunk.tokens[i + 1]!,
          from + chunk.tokens[i + 2]!,
          4
        );
      }
    }

    // pop close nodes from the stack, if they can be paired with an open node
    if (chunk.closes) {
      for (let i = 0; i < chunk.closes.length; i++) {
        const id = chunk.closes[i]!;
        const idx = this.stack.last(id);

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

          this.emit(node, pos, to, children * 4 + 4);
        }
      }
    }
  }

  step() {
    if (this.index < this.buffer.chunks.length) {
      const chunk = this.buffer.chunks[this.index]!;
      this.parse(chunk);
      this.index++;
      return true;
    }
    return false;
  }

  advanceFully() {
    if (!this.done) {
      while (this.step()) {}
    }
  }

  finish(length: number): {
    cursor: FlatBufferCursor;
    reused: ITreeBuffer[];
  } | null {
    if (!this.buffer.chunks.length) {
      return null;
    }

    this.advanceFully();

    if (FINISH_INCOMPLETE_NODES) {
      while (this.stack.length > 0) {
        // emit an error token
        this.emit(NodeID.incomplete, length, length, 4);

        // finish the last element in the stack
        const s = this.stack.pop()!;
        const node = s[0]!;
        const pos = s[1]!;
        const children = s[2]!;

        this.emit(node, pos, length, children * 4 + 4);
      }
    }

    const reused = this.reused;
    const cursor = new FlatBufferCursor(this.compiled, this.size * 4);

    return {
      cursor,
      reused,
    };
  }

  compile(source: string) {
    this.reset();
    let state = this.grammar.startState();
    let pos = 0;
    while (pos < source.length) {
      const match = this.grammar.match(state, source, pos, pos, false);
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
      if (matchLength === 0) {
        break;
      }
      for (let idx = 0; idx < matchTokens!.length; idx++) {
        const token = matchTokens![idx]!;
        this.buffer.add(token);
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
