/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { type GrammarToken, NodeID } from "../../core";
import { Grammar } from "../../grammar";
import { type TokenizerResume } from "../../grammar/classes/ResumableTokenizer";

import { SpecialRecord } from "../enums/SpecialRecord";
import type { ITreeBuffer } from "../types/ITreeBuffer";
import { Chunk } from "./Chunk";
import { CompileStack } from "./CompileStack";
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

  /**
   * When {@link reuse} restarts from an in-scope split point, this holds
   * the tokenizer snapshot needed to resume there (consumed by the parse).
   */
  declare resumeState?: TokenizerResume;

  constructor(
    grammar: Grammar,
    packet?: Packet,
    compiled?: Int32Array,
    reused?: ITreeBuffer[],
  ) {
    this.grammar = grammar;
    this.packet = packet || new Packet([]);
    this.compiled = compiled || new Int32Array(COMPILER_ARRAY_INTERVAL);
    this.reused =
      packet && reused ? reused.slice(0, packet.compilerReusedCount) : [];
    this.nodeCount = packet && compiled ? (packet.compilerNodeCount ?? 0) : 0;
    this.maxTreeBufferLength =
      packet && compiled
        ? (packet.compilerMaxTreeBufferLength ?? DEFAULT_MAX_TREE_BUFFER_LENGTH)
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

  /**
   * Bumped on every DESTRUCTIVE reuse (rewind/slide/detach). Each finished
   * parse stamps its tree with the epoch it left the compiler in; a later
   * parse only reuses the compiler if the stamp still matches — a mismatch
   * means some other parse (possibly abandoned mid-flight) mutated the
   * compiler since that tree was built, so its fragments no longer
   * describe this state and the parse must start from scratch.
   */
  reuseEpoch = 0;

  reuse(editedFrom: number, editedTo: number, editedOffset: number) {
    // Clear any `reparsedTo` left over from a PREVIOUS incremental parse.
    // `reparsedTo` is only meaningful when this parse reuses chunks AHEAD
    // of the edit (set by `append`). If it isn't reset here, an edit that
    // reuses-ahead (e.g. a mid-document change) leaves `reparsedTo`
    // populated, and a subsequent edit that does NOT reuse ahead (e.g. an
    // append at end-of-document) would inherit that stale value. The
    // annotator then re-annotates the inverted/empty range
    // `[reparsedFrom, staleReparsedTo]` instead of `[reparsedFrom, end]`,
    // silently dropping every annotation for the newly appended content.
    this.reparsedTo = undefined;
    this.resumeState = undefined;
    // A leftover `ahead` from a previous (possibly abandoned) parse is in
    // that parse's coordinates — if it survives here it can be spliced into
    // a future tree at a stale offset, resurrecting deleted text.
    this.ahead = undefined;
    // a stale split request from a previous parse run must not leak into
    // this one
    this.packet.clearScheduledSplit();
    // No-op "edit" (the fragment analysis produces a zero-width, zero-offset
    // edit at the document end for scroll-continuation parses): if the
    // packet ends EXACTLY at that point, EVERY cached chunk is still
    // valid — reuse them all without rewinding. Rewinding here would
    // discard everything after the last split point behind the document end
    // and force the NEXT parse to re-tokenize it, which is most of the
    // document when a giant root scope has no internal pure boundaries.
    // Strict equality is load-bearing: a DELETION at the document tail also
    // reaches here as a zero-width zero-offset edit at the (new) document
    // end, and its packet ends PAST that point — those stale chunks must be
    // rewound away, not reused (they would put phantom nodes past the end
    // of the document and permanently poison the packet).
    const packetEnd = this.packet.last?.to ?? 0;
    if (
      editedOffset === 0 &&
      editedFrom === editedTo &&
      packetEnd === editedFrom &&
      packetEnd > 0
    ) {
      this.reparsedFrom = packetEnd;
      return packetEnd;
    }
    // Every path below mutates the packet — invalidate all other trees
    // holding this compiler (see reuseEpoch).
    this.reuseEpoch++;
    const splitPointBeforeEdit = this.packet.findBehindSplitPoint(editedFrom);
    let splitBehind = this.packet.findBehindSplitPoint(
      splitPointBeforeEdit.chunk?.from ?? 0,
    );
    // An in-scope split point is only restartable with its resume snapshot;
    // without one, restarting there would reparse mid-block with an empty
    // scope stack (the wrong-tree failure mode). Walk further back.
    while (
      splitBehind.chunk &&
      !splitBehind.chunk.startsPure &&
      !splitBehind.chunk.resume
    ) {
      splitBehind = this.packet.findBehindSplitPoint(splitBehind.chunk.from);
    }
    if (splitBehind.index != null) {
      const right = this.rewind(splitBehind.index);
      const from = splitBehind.chunk?.from ?? 0;
      // Capture the restart snapshot for in-scope split points, and detach
      // it from the discarded chunk BEFORE the slide below — the restart
      // point is behind the edit, so its positions must not shift.
      this.resumeState = splitBehind.chunk?.resume;
      if (splitBehind.chunk) {
        splitBehind.chunk.resume = undefined;
      }
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

  /**
   * After splicing reused chunks in MID-scope, rebases everything those
   * chunks baked in about the scopes that SPAN the splice point (opened
   * behind it, closed within the spliced region): their accumulated child
   * counts changed by `deltas[i]` (the reparse emitted a different number
   * of records behind the splice) and their true open positions are now
   * `trueAbs[i]`. Patches, walking chunks from `startIndex` until every
   * spanning scope has closed:
   * - each chunk's entry seeds (the baseline future splices diff against);
   * - the compiled close records of spanning scopes (baked size/position);
   * - each chunk's residual live stack (used by future inherits/finish);
   * - each restart snapshot's frame open positions (`frameOpenPositions`
   *   is tokenizer-frame-level; `frameGroupSizes` maps chunk-level seed
   *   prefixes to whole frames).
   */
  spliceFixup(
    startIndex: number,
    deltas: number[],
    trueAbs: number[],
    frameOpenPositions: number[],
    frameGroupSizes: number[],
  ) {
    let m = deltas.length;
    for (let k = startIndex; k < this.packet.chunks.length && m > 0; k++) {
      const chunk = this.packet.chunks[k]!;
      const seeds = chunk.entrySeeds;
      if (!seeds) {
        break;
      }
      const prefix = Math.min(m, seeds.ids.length);
      for (let i = 0; i < prefix; i++) {
        seeds.children[i]! += deltas[i]!;
        seeds.absPositions[i] = trueAbs[i]!;
      }
      // The restart snapshot describes the state ENTERING this chunk —
      // patch the frames that are spanning at entry.
      if (chunk.resume) {
        let consumed = 0;
        let groups = 0;
        for (const g of frameGroupSizes) {
          if (consumed + g <= prefix) {
            consumed += g;
            groups++;
          } else {
            break;
          }
        }
        for (let i = 0; i < groups && i < chunk.resume.frames.length; i++) {
          chunk.resume.frames[i]!.openedAtAbs = frameOpenPositions[i]!;
        }
      }
      // Baked closes of spanning scopes: fix size + position; a close at
      // seed index i also cut every deeper seed (CompileStack.close), so
      // the spanning set shrinks to i.
      let mNext = m;
      if (chunk.inheritedCloseRecords) {
        for (const rec of chunk.inheritedCloseRecords) {
          if (rec.seedIndex < mNext) {
            chunk.compiled[rec.offset + 1] =
              trueAbs[rec.seedIndex]! - chunk.from;
            chunk.compiled[rec.offset + 3]! += deltas[rec.seedIndex]! * 4;
            mNext = rec.seedIndex;
          }
        }
      }
      // Residual live stack: entries below mNext are still open spanning
      // scopes (a preserved bottom prefix).
      const stackPrefix = Math.min(mNext, chunk.stack.length);
      for (let i = 0; i < stackPrefix; i++) {
        chunk.stack.children[i]! += deltas[i]!;
        chunk.stack.positions[i] = trueAbs[i]! - chunk.from;
      }
      m = mNext;
    }
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

  step(force = false) {
    // Never compile the packet's final chunk unless forced: the parse may
    // still be adding tokens to it. (The whole-construct matcher preserved
    // this implicitly — its token batches always ended at pure boundaries,
    // so a completed chunk always existed ahead of the compiler. The
    // stepping tokenizer adds tokens one at a time, leaving the last chunk
    // under construction until the next chunk begins.)
    const limit = force
      ? this.packet.chunks.length
      : this.packet.chunks.length - 1;
    if (this.index < limit) {
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
            chunk.compiled[i + 3]!,
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
      while (this.step(true)) {}
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
      if (lastChunk && lastChunk.stack.length > 0) {
        // Pop a CLONE — the chunk (and its residual stack) is cached and
        // may seed a future parse's inherit; draining it in place would
        // corrupt that state.
        const stack = new CompileStack(lastChunk.stack);
        while (stack.length > 0) {
          // emit an error token
          this.emitNode(NodeID.incomplete, length, length, 4);

          // finish the last element in the stack
          const s = stack.pop()!;
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
