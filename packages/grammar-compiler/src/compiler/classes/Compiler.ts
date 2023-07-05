/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Node, NodeID } from "../../core";
import { Grammar } from "../../grammar";

import { FINISH_INCOMPLETE_NODES } from "../constants/finish";
import { COMPILER_ARRAY_INTERVAL } from "../constants/size";
import { IBufferCursor } from "../types/IBufferCursor";
import { ITreeBuffer } from "../types/ITreeBuffer";
import ArrayBufferCursor from "./ArrayBufferCursor";
import type { Chunk } from "./Chunk";
import { ChunkBuffer } from "./ChunkBuffer";
import { CompileStack } from "./CompileStack";
import CompileTreeBuffer from "./CompileTreeBuffer";

const enum SpecialRecord {
  Reuse = -1,
  ContextChange = -3,
  LookAhead = -4,
}

export class Compiler {
  declare grammar: Grammar;
  declare stack: CompileStack;
  declare buffer: ChunkBuffer;
  declare compiled: Int32Array;
  declare size: number;
  declare reused: CompileTreeBuffer[];
  declare index: number;

  constructor(grammar: Grammar, buffer?: ChunkBuffer) {
    this.grammar = grammar;
    this.stack = new CompileStack();
    this.buffer = buffer || new ChunkBuffer();
    this.compiled = new Int32Array(COMPILER_ARRAY_INTERVAL);
    this.size = 0;
    this.reused = [];
    this.index = 0;
  }

  get cursor() {
    return new ArrayBufferCursor(this.compiled, this.size * 4);
  }

  get done() {
    return this.index >= this.buffer.chunks.length;
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

    if (chunk.tryForTree(this.grammar.nodes)) {
      const tree = chunk.tree!;
      const reusedIndex = this.reused.length;
      this.emit(reusedIndex, from, to, SpecialRecord.Reuse);
      this.reused.push(tree);
      return;
    }

    // add open nodes to stack
    // this doesn't affect the buffer at all, but now we can watch for
    // when another node closes one of the open nodes we added
    if (chunk.open) {
      for (let i = 0; i < chunk.open.length; i++) {
        this.stack.push(chunk.open[i]!, from, 0);
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
    if (chunk.close) {
      for (let i = 0; i < chunk.close.length; i++) {
        const id = chunk.close[i]!;
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

  compile(length: number): {
    cursor: IBufferCursor;
    reused: ITreeBuffer[];
    nodes: Node[];
  } | null {
    if (!this.buffer.chunks.length) {
      return null;
    }

    this.advanceFully();

    if (FINISH_INCOMPLETE_NODES) {
      while (this.stack.length > 0) {
        // emit an error token
        this.emit(NodeID.ERROR_INCOMPLETE, length, length, 4);

        // finish the last element in the stack
        const s = this.stack.pop()!;
        const node = s[0]!;
        const pos = s[1]!;
        const children = s[2]!;

        this.emit(node, pos, length, children * 4 + 4);
      }
    }

    const reused = this.reused;
    const cursor = new ArrayBufferCursor(this.compiled, this.size * 4);
    const nodes = this.grammar.nodes;

    return {
      cursor,
      reused,
      nodes,
    };
  }
}
