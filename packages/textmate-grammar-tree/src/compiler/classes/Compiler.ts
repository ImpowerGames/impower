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

/** What a chunk holds, to compare a reparsed chunk with the one it replaced. */
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

/**
 * The last epoch any compiler was given. Epochs are drawn from one sequence
 * so that a compiler rolled back to an earlier epoch (see
 * {@link Compiler.rollback}) never reaches the epoch of a tree the rolled-back
 * parse built: the next destructive reuse moves past both.
 */
let lastReuseEpoch = 0;

/**
 * What a compiler and its chunks held before a journaled parse began, and how
 * to undo each change the parse made since, in the order it made them (see
 * {@link Compiler.beginJournal}).
 */
class CompilerJournal {
  /** The undo of each change, in the order the changes were made. */
  undo: (() => void)[] = [];
  /** Where the records of the compiled buffer the journal began with that a
   *  parse overwrote start, and what they held up to its end
   *  (`journalCompiled`). */
  savedFrom = Infinity;
  saved?: Int32Array;
  /** The chunks whose token stream was saved before a token was added. */
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

  /**
   * When {@link reuse} restarts from an in-scope split point, this holds
   * the tokenizer snapshot needed to resume there (consumed by the parse).
   */
  declare resumeState?: TokenizerResume;

  /**
   * The chunks holding nodes that a parse reparses only for a lookahead
   * into the edit, as they were before it: from packet index `index` up to
   * position `to`, where the edit alone would restart. `reparsedFrom` is
   * what the edit alone gives (see {@link settleReparsedFrom}).
   */
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
      // The journal holds the array as it was; the parse fills a copy.
      this.reused = this.reused.slice(0, left.compilerReusedCount ?? 0);
    } else {
      this.reused.length = left.compilerReusedCount ?? 0;
    }
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

  /** The journal of the parse in progress, while one is kept. */
  protected _journal?: CompilerJournal;

  /**
   * Start recording what the parses from now on change, so that
   * {@link rollback} can put this compiler and every chunk it holds back as
   * they are now.
   *
   * An incremental parse mutates the compiler it reuses in place: it rewinds
   * the packet, slides every chunk after the edit by the edit's offset,
   * detaches a restart snapshot, patches the baked close records of a
   * mid-scope splice and restamps the compiler counts of every chunk it
   * steps. Each of those is recorded as it is made, with its undo, so the
   * rollback costs what the parse touched rather than a copy of the whole
   * packet. Of the compiled buffer, which the parse overwrites from its
   * restart point on, the records from there to its end are saved on the
   * parse's first write (`journalCompiled`).
   *
   * Journals do not nest: one begun while another is kept is refused.
   */
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

  /**
   * Undo everything the parses since {@link beginJournal} changed, and stop
   * recording. A compiler with no journal is left as it is.
   */
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

  /** Stop recording and keep what the parses since {@link beginJournal}
   *  changed. */
  commitJournal() {
    this._journal = undefined;
  }

  /**
   * Save the records of the compiled buffer the journal began with that a
   * write at `idx` is about to overwrite. A parse writes forward from its
   * restart point, so what it can overwrite is the buffer's live records from
   * there to their end, which are saved once; a later parse of the same
   * journal that restarts further back saves the stretch before them too.
   * Once a write outgrows the buffer it moves to a new one, and the journal's
   * buffer takes no more writes.
   */
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

  /** Record the compiler counts and tree buffer `chunk` holds before a step
   *  restamps them. */
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

  /** Record the token stream `chunk` holds before a token is added to it:
   *  the end of the packet a parse resumes is a chunk it may keep adding
   *  to. Saved once per chunk; what an add writes past `nodeCount` is never
   *  read once the count is put back. */
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

  /** Record what a mid-scope splice patches in `chunk` (see
   *  {@link spliceFixup}) before it patches it. */
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

  /**
   * Rewinds the packet to a restart point before the edit and keeps the
   * chunks after it aside to splice back in. Returns the restart position,
   * or null when nothing can be reused.
   *
   * `lookaheadStart` gives, for an edit at a position, the earliest position
   * whose tokens a lookahead into the edit can have come from (see
   * `TextmateGrammarParser.lookaheadStart`); the restart point lies before it.
   */
  reuse(
    editedFrom: number,
    editedTo: number,
    editedOffset: number,
    lookaheadStart?: (editedFrom: number) => number,
  ) {
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
    this.retokenized = undefined;
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
    this.reuseEpoch = ++lastReuseEpoch;
    const editOnly = this.restartPoint(editedFrom);
    let splitBehind = editOnly;
    const earliest = lookaheadStart?.(editedFrom);
    if (earliest != null && earliest < (editOnly.chunk?.from ?? 0)) {
      // Tokens from `earliest` on may have read the edit through a
      // lookahead: restart at or before it.
      splitBehind = this.restartableSplitPoint(earliest + 1);
      if (editOnly.index != null && splitBehind.index != null) {
        // The chunks up to the edit's own restart point are reparsed only
        // for that lookahead. Keep a copy, so that when they come out the
        // same the parse reports its changes from where the edit's do.
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
      // Capture the restart snapshot for in-scope split points, and detach
      // it from the discarded chunk BEFORE the slide below — the restart
      // point is behind the edit, so its positions must not shift.
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
        // Sliding is its own inverse with the offset negated.
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

  /**
   * The stretch of the text a parse of an edit at `pos` would parse again:
   * from the split point it restarts at to the first split point after `pos`
   * it can splice the old chunks back in at, or the end of the packet.
   *
   * A from-scratch parse mints no split points inside a block, so an edit
   * inside a long block reparses all of it until an incremental parse has
   * minted them.
   */
  reparseRange(pos: number): { from: number; to: number } {
    const behind = this.restartPoint(pos);
    const ahead = this.packet.findAheadSplitPoint(pos);
    const from = behind.chunk?.from ?? 0;
    const to = ahead.chunk?.from ?? this.packet.last?.to ?? pos;
    return { from, to: Math.max(from, to) };
  }

  /**
   * The split point a parse restarts from for an edit at `pos`: the second
   * split point before it, walked back to one that can be restarted from.
   */
  private restartPoint(pos: number) {
    const splitPointBeforeEdit = this.packet.findBehindSplitPoint(pos);
    return this.restartableSplitPoint(splitPointBeforeEdit.chunk?.from ?? 0);
  }

  /** The last split point before `pos` that a parse can restart from. */
  private restartableSplitPoint(pos: number) {
    let splitBehind = this.packet.findBehindSplitPoint(pos);
    // An in-scope split point is only restartable with its resume snapshot;
    // without one, restarting there would reparse mid-block with an empty
    // scope stack (the wrong-tree failure mode). Walk further back.
    // A split point right after zero-width nodes at its own position is not
    // restartable either: the steps that matched empty there are made again
    // by a parse that restarts at that position (the tokenizer's empty-match
    // count starts over), so keeping them would hold them twice (#1614).
    while (
      splitBehind.chunk &&
      ((!splitBehind.chunk.startsPure && !splitBehind.chunk.resume) ||
        this.followsZeroWidthNodes(splitBehind.index))
    ) {
      splitBehind = this.packet.findBehindSplitPoint(splitBehind.chunk.from);
    }
    return splitBehind;
  }

  /** True if the chunk before `index` holds nodes and ends where it starts, at `index`'s position. */
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

  /**
   * After a parse that restarted early for a lookahead (see {@link reuse}),
   * moves `reparsedFrom` up to where the edit alone would have restarted
   * when every chunk reparsed before that point came out as it was, so
   * that what reads `reparsedFrom` redoes only what changed.
   */
  settleReparsedFrom() {
    const retokenized = this.retokenized;
    this.retokenized = undefined;
    if (!retokenized) {
      return;
    }
    // Compare the chunks that hold nodes: a restart point's own empty split
    // chunk is not minted again at the restart.
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
      if (this._journal) {
        this.journalFixup(chunk);
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
    const last = this.packet.last;
    if (this._journal && last && !last.endsPure) {
      // The token may join the packet's last chunk, which can be one the
      // journal began with.
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
