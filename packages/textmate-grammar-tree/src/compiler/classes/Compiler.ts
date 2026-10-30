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

export const FINISH_INCOMPLETE_NODES = true;

export const COMPILER_ARRAY_INTERVAL = 32768;

export const DEFAULT_MAX_TREE_BUFFER_LENGTH = 1024;

type ChunkRecord = {
  from: number;
  to: number;
  startsPure: boolean;
  compiled: Int32Array;
};

function chunkRecord(chunk: Chunk): ChunkRecord {
  return {
    from: chunk.from,
    to: chunk.to,
    startsPure: chunk.startsPure,
    compiled: chunk.compiled.slice(0, chunk.nodeCount * 4),
  };
}

function sameChunk(chunk: Chunk, record: ChunkRecord): boolean {
  if (
    chunk.from !== record.from ||
    chunk.to !== record.to ||
    chunk.startsPure !== record.startsPure ||
    chunk.nodeCount * 4 !== record.compiled.length
  ) {
    return false;
  }
  for (let i = 0; i < record.compiled.length; i++) {
    if (chunk.compiled[i] !== record.compiled[i]) {
      return false;
    }
  }
  return true;
}

let lastReuseEpoch = 0;

class CompilerJournal {
  undo: (() => void)[] = [];
  savedFrom = Infinity;
  saved?: Int32Array;
  savedContent = new Set<Chunk>();

  constructor(
    readonly packet: Packet,
    readonly chunks: Chunk[],
    readonly chunkCount: number,
    readonly pendingSplits: ReturnType<Packet["scheduledSplits"]>,
    readonly compiled: Int32Array,
    readonly nodeCount: number,
    readonly reused: ITreeBuffer[],
    readonly index: number,
    readonly reparsedFrom: number | undefined,
    readonly reparsedTo: number | undefined,
    readonly ahead: Packet | undefined,
    readonly maxTreeBufferLength: number,
    readonly resumeState: TokenizerResume | undefined,
    readonly retokenized: Compiler["retokenized"],
    readonly reuseEpoch: number,
  ) {}
}

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

  declare resumeState?: TokenizerResume;

  declare retokenized?: {
    index: number;
    to: number;
    chunks: ChunkRecord[];
    reparsedFrom: number;
  };

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
    if (this._journal) {
      this.reused = this.reused.slice(0, left.compilerReusedCount ?? 0);
    } else {
      this.reused.length = left.compilerReusedCount ?? 0;
    }
    this.maxTreeBufferLength =
      left.compilerMaxTreeBufferLength ?? DEFAULT_MAX_TREE_BUFFER_LENGTH;
    this.reparsedFrom = left.last?.to ?? 0;
    return right;
  }

  reuseEpoch = 0;

  protected _journal?: CompilerJournal;

  beginJournal(): boolean {
    if (this._journal) {
      return false;
    }
    this._journal = new CompilerJournal(
      this.packet,
      this.packet.chunks,
      this.packet.chunks.length,
      this.packet.scheduledSplits(),
      this.compiled,
      this.nodeCount,
      this.reused,
      this.index,
      this.reparsedFrom,
      this.reparsedTo,
      this.ahead,
      this.maxTreeBufferLength,
      this.resumeState,
      this.retokenized,
      this.reuseEpoch,
    );
    return true;
  }

  rollback() {
    const journal = this._journal;
    if (!journal) {
      return;
    }
    this._journal = undefined;
    for (let i = journal.undo.length - 1; i >= 0; i--) {
      journal.undo[i]!();
    }
    journal.packet.chunks = journal.chunks;
    journal.chunks.length = journal.chunkCount;
    journal.packet.restoreScheduledSplits(journal.pendingSplits);
    this.packet = journal.packet;
    if (journal.saved) {
      journal.compiled.set(journal.saved, journal.savedFrom);
    }
    this.compiled = journal.compiled;
    this.nodeCount = journal.nodeCount;
    this.reused = journal.reused;
    this.index = journal.index;
    this.reparsedFrom = journal.reparsedFrom;
    this.reparsedTo = journal.reparsedTo;
    this.ahead = journal.ahead;
    this.maxTreeBufferLength = journal.maxTreeBufferLength;
    this.resumeState = journal.resumeState;
    this.retokenized = journal.retokenized;
    this.reuseEpoch = journal.reuseEpoch;
  }

  commitJournal() {
    this._journal = undefined;
  }

  protected journalCompiled(idx: number) {
    const journal = this._journal!;
    if (this.compiled !== journal.compiled || idx >= journal.savedFrom) {
      return;
    }
    const end = Math.min(journal.savedFrom, journal.nodeCount * 4);
    if (idx < end) {
      const head = journal.compiled.slice(idx, end);
      if (journal.saved) {
        const joined = new Int32Array(head.length + journal.saved.length);
        joined.set(head);
        joined.set(journal.saved, head.length);
        journal.saved = joined;
      } else {
        journal.saved = head;
      }
    }
    journal.savedFrom = idx;
  }

  protected journalStep(chunk: Chunk) {
    const nodeCount = chunk.compilerNodeCount;
    const reusedCount = chunk.compilerReusedCount;
    const maxTreeBufferLength = chunk.compilerMaxTreeBufferLength;
    const treeBuffer = chunk.treeBuffer;
    this._journal!.undo.push(() => {
      chunk.compilerNodeCount = nodeCount;
      chunk.compilerReusedCount = reusedCount;
      chunk.compilerMaxTreeBufferLength = maxTreeBufferLength;
      chunk.treeBuffer = treeBuffer;
    });
  }

  protected journalContent(chunk: Chunk) {
    const journal = this._journal!;
    if (journal.savedContent.has(chunk)) {
      return;
    }
    journal.savedContent.add(chunk);
    const { to, length, nodeCount, compiled, treeBuffer, inheritedCloseRecords } = chunk;
    const closes = inheritedCloseRecords?.length ?? 0;
    const scopes = chunk.scopes;
    const scopesCopy = scopes?.slice();
    const stack = chunk.stack;
    const { ids, positions, children } = stack;
    const stackCopy = new CompileStack(stack);
    journal.undo.push(() => {
      chunk.to = to;
      chunk.length = length;
      chunk.nodeCount = nodeCount;
      chunk.compiled = compiled;
      chunk.treeBuffer = treeBuffer;
      if (inheritedCloseRecords) {
        inheritedCloseRecords.length = closes;
      }
      chunk.inheritedCloseRecords = inheritedCloseRecords;
      if (scopes) {
        scopes.length = 0;
        scopes.push(...scopesCopy!);
      }
      chunk.scopes = scopes;
      ids.set(stackCopy.ids);
      positions.set(stackCopy.positions);
      children.set(stackCopy.children);
      stack.ids = ids;
      stack.positions = positions;
      stack.children = children;
      stack.length = stackCopy.length;
      chunk.stack = stack;
    });
  }

  protected journalFixup(chunk: Chunk) {
    const seeds = chunk.entrySeeds;
    const seedChildren = seeds?.children.slice();
    const seedPositions = seeds?.absPositions.slice();
    const frames = chunk.resume?.frames;
    const frameOpenings = frames?.map((f) => f.openedAtAbs);
    const compiled = chunk.compiled;
    const closes = chunk.inheritedCloseRecords?.map((rec) => [
      rec.offset,
      compiled[rec.offset + 1]!,
      compiled[rec.offset + 3]!,
    ]);
    const stack = chunk.stack;
    const stackChildren = stack.children.slice();
    const stackPositions = stack.positions.slice();
    this._journal!.undo.push(() => {
      if (seeds) {
        seedChildren!.forEach((n, i) => (seeds.children[i] = n));
        seedPositions!.forEach((n, i) => (seeds.absPositions[i] = n));
      }
      frames?.forEach((f, i) => {
        f.openedAtAbs = frameOpenings![i]!;
      });
      for (const [offset, position, size] of closes ?? []) {
        compiled[offset! + 1] = position!;
        compiled[offset! + 3] = size!;
      }
      stack.children.set(stackChildren);
      stack.positions.set(stackPositions);
    });
  }

  reuse(
    editedFrom: number,
    editedTo: number,
    editedOffset: number,
    lookaheadStart?: (editedFrom: number) => number,
  ) {
    this.reparsedTo = undefined;
    this.resumeState = undefined;
    this.retokenized = undefined;
    this.ahead = undefined;
    this.packet.clearScheduledSplit();
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
    this.reuseEpoch = ++lastReuseEpoch;
    const editOnly = this.restartPoint(editedFrom);
    let splitBehind = editOnly;
    const earliest = lookaheadStart?.(editedFrom);
    if (earliest != null && earliest < (editOnly.chunk?.from ?? 0)) {
      splitBehind = this.restartableSplitPoint(earliest + 1);
      if (editOnly.index != null && splitBehind.index != null) {
        this.retokenized = {
          index: splitBehind.index,
          to: editOnly.chunk?.from ?? 0,
          chunks: this.packet.chunks
            .slice(splitBehind.index, editOnly.index)
            .filter((chunk) => chunk.nodeCount > 0)
            .map(chunkRecord),
          reparsedFrom: this.packet.chunks[editOnly.index - 1]?.to ?? 0,
        };
      }
    }
    if (splitBehind.index != null) {
      const right = this.rewind(splitBehind.index);
      const from = splitBehind.chunk?.from ?? 0;
      this.resumeState = splitBehind.chunk?.resume;
      if (splitBehind.chunk) {
        const chunk = splitBehind.chunk;
        const resume = chunk.resume;
        this._journal?.undo.push(() => {
          chunk.resume = resume;
        });
        chunk.resume = undefined;
      }
      if (this._journal && editedOffset) {
        const slid = right.chunks;
        this._journal.undo.push(() => {
          for (const chunk of slid) {
            chunk.offset(-editedOffset);
          }
        });
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

  reparseRange(pos: number): { from: number; to: number } {
    const behind = this.restartPoint(pos);
    const ahead = this.packet.findAheadSplitPoint(pos);
    const from = behind.chunk?.from ?? 0;
    const to = ahead.chunk?.from ?? this.packet.last?.to ?? pos;
    return { from, to: Math.max(from, to) };
  }

  private restartPoint(pos: number) {
    const splitPointBeforeEdit = this.packet.findBehindSplitPoint(pos);
    return this.restartableSplitPoint(splitPointBeforeEdit.chunk?.from ?? 0);
  }

  private restartableSplitPoint(pos: number) {
    let splitBehind = this.packet.findBehindSplitPoint(pos);
    while (
      splitBehind.chunk &&
      ((!splitBehind.chunk.startsPure && !splitBehind.chunk.resume) ||
        this.followsZeroWidthNodes(splitBehind.index))
    ) {
      splitBehind = this.packet.findBehindSplitPoint(splitBehind.chunk.from);
    }
    return splitBehind;
  }

  private followsZeroWidthNodes(index: number) {
    const chunk = this.packet.chunks[index];
    const before = this.packet.chunks[index - 1];
    return (
      !!chunk &&
      !!before &&
      before.nodeCount > 0 &&
      before.from === chunk.from &&
      before.to === chunk.from
    );
  }

  settleReparsedFrom() {
    const retokenized = this.retokenized;
    this.retokenized = undefined;
    if (!retokenized) {
      return;
    }
    const reparsed: Chunk[] = [];
    for (
      let i = retokenized.index;
      i < this.packet.chunks.length && this.packet.chunks[i]!.from < retokenized.to;
      i++
    ) {
      const chunk = this.packet.chunks[i]!;
      if (chunk.nodeCount > 0) {
        reparsed.push(chunk);
      }
    }
    if (
      reparsed.length !== retokenized.chunks.length ||
      reparsed.some((chunk, i) => !sameChunk(chunk, retokenized.chunks[i]!))
    ) {
      return;
    }
    this.reparsedFrom = retokenized.reparsedFrom;
  }

  append(aheadBuffer: Packet) {
    this.reparsedTo = aheadBuffer.first!.from;
    this.packet.append(aheadBuffer);
  }

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
      if (this._journal) {
        this.journalFixup(chunk);
      }
      const prefix = Math.min(m, seeds.ids.length);
      for (let i = 0; i < prefix; i++) {
        seeds.children[i]! += deltas[i]!;
        seeds.absPositions[i] = trueAbs[i]!;
      }
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
      const stackPrefix = Math.min(mNext, chunk.stack.length);
      for (let i = 0; i < stackPrefix; i++) {
        chunk.stack.children[i]! += deltas[i]!;
        chunk.stack.positions[i] = trueAbs[i]! - chunk.from;
      }
      m = mNext;
    }
  }

  add(token: GrammarToken) {
    const last = this.packet.last;
    if (this._journal && last && !last.endsPure) {
      this.journalContent(last);
    }
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
    const limit = force
      ? this.packet.chunks.length
      : this.packet.chunks.length - 1;
    if (this.index < limit) {
      const chunk = this.packet.chunks[this.index]!;
      if (this._journal) {
        this.journalStep(chunk);
      }

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

    if (this._journal) {
      this.journalCompiled(idx);
    }

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
        const stack = new CompileStack(lastChunk.stack);
        while (stack.length > 0) {
          this.emitNode(NodeID.incomplete, length, length, 4);

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
        matchTokens = [[NodeID.unrecognized, pos, pos + 1]];
        matchLength = 1;
      }
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
