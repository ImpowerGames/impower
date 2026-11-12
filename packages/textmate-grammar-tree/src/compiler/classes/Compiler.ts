/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { type GrammarToken, NodeID } from "../../core";
import { Grammar } from "../../grammar";
import { type TokenizerResume } from "../../grammar/classes/ResumableTokenizer";

import { SpecialRecord } from "../enums/SpecialRecord";
import type { IReusedRecords } from "../types/IReusedRecords";
import type { ITreeBuffer } from "../types/ITreeBuffer";

export type ReusedNode = ITreeBuffer | IReusedRecords;
import { Chunk } from "./Chunk";
import { CompileStack } from "./CompileStack";
import { FlatBufferCursor } from "./FlatBufferCursor";
import { Packet } from "./Packet";

export const FINISH_INCOMPLETE_NODES = true;

export const COMPILER_ARRAY_INTERVAL = 32768;

export const DEFAULT_MAX_TREE_BUFFER_LENGTH = 1024;

const RUN_PENDING = -1;

const IN_RUN = -1;

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

function settledChunk(chunks: Chunk[]): { index: number; chunk?: Chunk } {
  let index = chunks.length;
  while (index > 0 && chunks[index - 1]!.compilerNodeCount === IN_RUN) {
    index--;
  }
  return { index, chunk: chunks[index - 1] };
}

function cachedRunEnd(chunks: Chunk[], start: number): number {
  const first = chunks[start]!;
  const cached = first.run;
  if (!cached || start + cached.members.length > chunks.length) {
    return -1;
  }
  for (let k = 0; k < cached.members.length; k++) {
    const chunk = chunks[start + k]!;
    if (
      cached.members[k] !== chunk ||
      cached.stamps[k * 2] !== chunk.version ||
      cached.stamps[k * 2 + 1] !== chunk.from - first.from
    ) {
      return -1;
    }
  }
  return start + cached.members.length - 1;
}

function runRecords(members: readonly Chunk[]): Int32Array {
  const first = members[0]!;
  let length = 0;
  for (const chunk of members) {
    length += chunk.nodeCount * 4;
  }
  const records = new Int32Array(length);
  let at = 0;
  for (const chunk of members) {
    const base = chunk.from - first.from;
    const compiled = chunk.compiled;
    for (let j = 0; j < chunk.nodeCount * 4; j += 4) {
      records[at] = compiled[j]!;
      records[at + 1] = compiled[j + 1]! + base;
      records[at + 2] = compiled[j + 2]! + base;
      records[at + 3] = compiled[j + 3]!;
      at += 4;
    }
  }
  return records;
}

function runReused(chunks: Chunk[], start: number, end: number): IReusedRecords {
  const first = chunks[start]!;
  if (cachedRunEnd(chunks, start) === end) {
    return first.run!.reused;
  }
  const members = chunks.slice(start, end + 1);
  const stamps = new Int32Array(members.length * 2);
  for (let k = 0; k < members.length; k++) {
    stamps[k * 2] = members[k]!.version;
    stamps[k * 2 + 1] = members[k]!.from - first.from;
  }
  const reused: IReusedRecords = {
    records: () => runRecords(members),
    length: chunks[end]!.to - first.from,
  };
  first.run = { members, stamps, reused };
  return reused;
}

let lastReuseEpoch = 0;

type JournalKind = "snapshot" | "parse";

export class CompilerJournal {
  finished = false;
  undo: (() => void)[] = [];
  savedFrom = Infinity;
  saved?: Int32Array;
  savedContent = new Set<Chunk>();

  constructor(
    readonly kind: JournalKind,
    readonly packet: Packet,
    readonly chunks: Chunk[],
    readonly chunkCount: number,
    readonly pendingSplits: ReturnType<Packet["scheduledSplits"]>,
    readonly compiled: Int32Array,
    readonly nodeCount: number,
    readonly reused: ReusedNode[],
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
  declare reused: ReusedNode[];
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
    reused?: ReusedNode[],
  ) {
    this.grammar = grammar;
    this.packet = packet || new Packet([]);
    this.compiled = compiled || new Int32Array(COMPILER_ARRAY_INTERVAL);
    const settled = packet ? settledChunk(packet.chunks) : null;
    this.reused =
      packet && reused ? reused.slice(0, settled?.chunk?.compilerReusedCount) : [];
    this.nodeCount = compiled ? (settled?.chunk?.compilerNodeCount ?? 0) : 0;
    this.maxTreeBufferLength = compiled
      ? (settled?.chunk?.compilerMaxTreeBufferLength ?? DEFAULT_MAX_TREE_BUFFER_LENGTH)
      : DEFAULT_MAX_TREE_BUFFER_LENGTH;
    this.index = compiled ? (settled?.index ?? 0) : 0;
  }

  get done() {
    return this.index >= this.packet.chunks.length;
  }

  reset() {
    this.runScan = undefined;
    this.compiled = new Int32Array(COMPILER_ARRAY_INTERVAL);
    this.packet = new Packet([]);
    this.index = 0;
    this.nodeCount = 0;
    this.reused = [];
  }

  rewind(index: number) {
    this.runScan = undefined;
    const { left, right } = this.packet.split(index);
    this.packet = left;
    const settled = settledChunk(left.chunks);
    this.index = settled.index;
    this.nodeCount = settled.chunk?.compilerNodeCount ?? 0;
    if (this._journal) {
      this.reused = this.reused.slice(0, settled.chunk?.compilerReusedCount ?? 0);
    } else {
      this.reused.length = settled.chunk?.compilerReusedCount ?? 0;
    }
    this.maxTreeBufferLength =
      settled.chunk?.compilerMaxTreeBufferLength ?? DEFAULT_MAX_TREE_BUFFER_LENGTH;
    this.reparsedFrom = left.last?.to ?? 0;
    return right;
  }

  reuseEpoch = 0;

  protected _journal?: CompilerJournal;

  beginJournal(): boolean {
    if (this._journal?.kind === "snapshot") {
      return false;
    }
    this._journal = this.openJournal("snapshot");
    return true;
  }

  beginParseJournal(): CompilerJournal | undefined {
    if (this._journal?.kind === "snapshot") {
      return undefined;
    }
    this._journal = this.openJournal("parse");
    return this._journal;
  }

  canRollBackTo(epoch: number): boolean {
    return (
      this._journal?.kind === "parse" &&
      this._journal.finished &&
      this._journal.reuseEpoch === epoch &&
      epoch !== this.reuseEpoch
    );
  }

  protected openJournal(kind: JournalKind): CompilerJournal {
    return new CompilerJournal(
      kind,
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
  }

  rollback() {
    const journal = this._journal;
    if (!journal) {
      return;
    }
    this._journal = undefined;
    this.runScan = undefined;
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

  protected settleStep(
    chunk: Chunk,
    nodeCount: number,
    reusedCount: number,
    maxTreeBufferLength: number,
    treeBufferBefore: Chunk["treeBuffer"],
  ) {
    const nodeCountBefore = chunk.compilerNodeCount;
    const reusedCountBefore = chunk.compilerReusedCount;
    const maxTreeBufferLengthBefore = chunk.compilerMaxTreeBufferLength;
    if (
      this._journal &&
      (nodeCountBefore !== nodeCount ||
        reusedCountBefore !== reusedCount ||
        maxTreeBufferLengthBefore !== maxTreeBufferLength ||
        treeBufferBefore !== chunk.treeBuffer)
    ) {
      this._journal.undo.push(() => {
        chunk.compilerNodeCount = nodeCountBefore;
        chunk.compilerReusedCount = reusedCountBefore;
        chunk.compilerMaxTreeBufferLength = maxTreeBufferLengthBefore;
        chunk.treeBuffer = treeBufferBefore;
      });
    }
    chunk.compilerNodeCount = nodeCount;
    chunk.compilerReusedCount = reusedCount;
    chunk.compilerMaxTreeBufferLength = maxTreeBufferLength;
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
    const entries = stack.entries;
    const stackLength = stack.length;
    const entriesCopy = entries.slice(0, stackLength * 3);
    journal.undo.push(() => {
      chunk.version++;
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
      entries.set(entriesCopy);
      stack.entries = entries;
      stack.length = stackLength;
      chunk.stack = stack;
    });
  }

  protected journalFixup(chunk: Chunk) {
    const seeds = chunk.entrySeeds;
    const seedChildren = seeds?.children.slice();
    const openedAt = chunk.resume?.openedAt;
    const frameOpenings = openedAt?.slice();
    const compiled = chunk.compiled;
    const closes = chunk.inheritedCloseRecords?.map((rec) => [
      rec.offset,
      compiled[rec.offset + 1]!,
      compiled[rec.offset + 3]!,
    ]);
    const stack = chunk.stack;
    const entriesCopy = stack.entries.slice(0, stack.length * 3);
    this._journal!.undo.push(() => {
      chunk.version++;
      if (seeds) {
        seedChildren!.forEach((n, i) => (seeds.children[i] = n));
      }
      frameOpenings?.forEach((n, i) => (openedAt![i] = n));
      for (const [offset, position, size] of closes ?? []) {
        compiled[offset! + 1] = position!;
        compiled[offset! + 3] = size!;
      }
      stack.entries.set(entriesCopy);
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
      this.resumeState = splitBehind.chunk?.absoluteResume();
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
      chunk.version++;
      const prefix = Math.min(m, seeds.ids.length);
      for (let i = 0; i < prefix; i++) {
        seeds.children[i]! += deltas[i]!;
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
        const openedAt = chunk.resume.openedAt;
        for (let i = 0; i < groups && i < openedAt.length; i++) {
          openedAt[i] = frameOpenPositions[i]! - chunk.from;
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
        chunk.stack.addChildren(i, deltas[i]!);
        chunk.stack.setPosition(i, trueAbs[i]! - chunk.from);
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
      const runEnd = this.runEnd(this.index, limit, force);
      if (runEnd === RUN_PENDING) {
        return false;
      }
      if (runEnd > this.index) {
        this.stepRun(this.index, runEnd);
        return true;
      }

      const chunk = this.packet.chunks[this.index]!;
      const treeBufferBefore = chunk.treeBuffer;
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

      this.settleStep(
        chunk,
        this.nodeCount,
        this.reused.length,
        this.maxTreeBufferLength,
        treeBufferBefore,
      );

      this.index++;
      return true;
    }
    return false;
  }

  protected runScan?: {
    chunks: Chunk[];
    start: Chunk;
    next: number;
    counted: Chunk;
    length: number;
  };

  protected cachedRun?: Chunk;

  private runEnd(start: number, limit: number, force: boolean): number {
    this.cachedRun = undefined;
    const chunks = this.packet.chunks;
    const first = chunks[start]!;
    if (!first.startsPure || first.endsPure) {
      return start;
    }
    const cachedEnd = cachedRunEnd(chunks, start);
    if (cachedEnd >= 0 && cachedEnd < limit) {
      this.cachedRun = first;
      return cachedEnd;
    }
    const scan = this.runScan;
    let next = start + 1;
    let length = first.nodeCount * 4;
    if (
      scan &&
      scan.chunks === chunks &&
      scan.start === first &&
      scan.next <= chunks.length &&
      chunks[scan.next - 1] === scan.counted
    ) {
      next = scan.next;
      length = scan.length;
    }
    this.runScan = undefined;
    for (let i = next; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      if (chunk.startsPure) {
        return start;
      }
      if (i >= limit) {
        this.runScan = { chunks, start: first, next: i, counted: chunks[i - 1]!, length };
        return RUN_PENDING;
      }
      length += chunk.nodeCount * 4;
      if (chunk.endsPure) {
        return chunk.stack.length === 0 && length > 0 ? i : start;
      }
    }
    if (force) {
      return start;
    }
    this.runScan = {
      chunks,
      start: first,
      next: chunks.length,
      counted: chunks[chunks.length - 1]!,
      length,
    };
    return RUN_PENDING;
  }

  private stepRun(start: number, end: number) {
    const chunks = this.packet.chunks;
    const first = chunks[start]!;
    const last = chunks[end]!;
    const reused =
      this.cachedRun === first ? first.run!.reused : runReused(chunks, start, end);
    this.cachedRun = undefined;
    this.emitNode(this.reused.length, first.from, last.to, SpecialRecord.Reuse);
    this.reused.push(reused);
    for (let i = start; i < end; i++) {
      const chunk = chunks[i]!;
      if (
        chunk.compilerNodeCount !== IN_RUN ||
        chunk.compilerReusedCount !== IN_RUN ||
        chunk.compilerMaxTreeBufferLength !== IN_RUN
      ) {
        this.settleStep(chunk, IN_RUN, IN_RUN, IN_RUN, chunk.treeBuffer);
      }
    }
    this.settleStep(
      last,
      this.nodeCount,
      this.reused.length,
      this.maxTreeBufferLength,
      last.treeBuffer,
    );
    this.index = end + 1;
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
    reused: ReusedNode[];
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
}
