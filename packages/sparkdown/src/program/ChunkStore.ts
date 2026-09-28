// Loads the engine's modules in the order that settles their import cycle
// (see `CompilationAnnotator`).
import "../inkjs/engine/Container";
import {
  createProgramTable,
  type ProgramTable,
} from "../binary/ProgramBinaryWriter";
import type { DebugMetadata } from "../inkjs/engine/DebugMetadata";
import type { Story } from "../inkjs/engine/Story";
import { FunctionCall } from "../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import type { ParsedObject } from "../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Text } from "../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { BinaryProgramWriter, factHash } from "./BinaryProgramWriter";
import { UnsupportedConstruct } from "./ProgramEmitter";
import {
  ChunkTable,
  ProgramRoot,
  type SequenceArrays,
  type SequenceRow,
} from "./ProgramRoot";
import { internSymbol, type SymbolKindValue } from "./ProgramSymbols";
import {
  chunkId,
  referenceTableStart,
  H_REFERENCE_ROWS,
  REFERENCE_ROW_WORDS,
  type StatementChunk,
} from "./StatementChunk";

/** One statement of a flow, as the compile hands it to the store. */
export interface StatementSource {
  /** What stands for the statement's syntax node: the compiled block the
   *  compilation annotator lowered it to. It is the same object for as long
   *  as the incremental parse keeps the node and the lowering inputs the node
   *  recorded read the same. */
  block: object;
  /** The statement's parsed objects, in the order it runs them. */
  objects: readonly ParsedObject[];
  /** The statement's own source range, with lines counting from 1. */
  range: DebugMetadata | null;
  /** The statement's first line in its script, counting from 0. */
  firstLine: number;
  /** The statement's source text, which its fingerprint hashes. */
  source: () => string;
  /** The statement's syntax: its node's name, the column it starts at and its
   *  source text, which together settle every position its chunk's line rows
   *  hold. Read only for a statement whose block is not the one a chunk was
   *  emitted for. */
  syntax: () => string;
  /** The lowering inputs the block recorded, with the answers they got. */
  reads: string;
}

/** One flow of the program, as the compile hands it to the store. */
export interface FlowSource {
  /** The flow's qualified name; the top-level content's flow is named by the
   *  empty string. */
  name: string;
  kind: SymbolKindValue;
  uri: string;
  /** The body's first line in its script, counting from 0. */
  firstLine: number;
  /** The lines the body spans. */
  span: number;
  statements: readonly StatementSource[];
}

/** The construct that made a compile fall back, where it was first met. */
export interface ProgramFallback {
  /** The parsed class's `typeName`, or the builtin's name. */
  construct: string;
  uri: string;
  /** The line of the statement that holds it, counting from 0. */
  line: number;
}

/** What one build of the program did. */
export interface ProgramCoverage {
  /** The statements of the program's flows. */
  statements: number;
  /** The statements whose chunk this build emitted. */
  emitted: number;
  /** The statements the writer has no emit path for, by construct. */
  unsupported: Record<string, number>;
}

export interface ProgramBuild {
  /** The root, or nothing when the program falls back. */
  root?: ProgramRoot;
  fallback?: ProgramFallback;
  coverage: ProgramCoverage;
}

// What the store knows of a chunk it emitted or reused: the syntax of the
// statement it was emitted for, the lowering inputs that statement recorded,
// and the values its emission recorded.
interface ChunkInfo {
  syntax: string;
  reads: string;
  emitReads: readonly string[];
}

/**
 * The chunk store (docs/engine/binary-program.md, section 9): the ordered
 * statement chunks of each flow, filled by the compiler and read by reference
 * by a game in the same worker. The compiler owns one store; each compile
 * builds a root from it, and a compile that is not a preview makes that root
 * the store's current one.
 *
 * A statement keeps its chunk across compiles by the identity rule of the
 * design (section 1, Identity), which three things decide:
 *
 * - its syntax is what the incremental parse kept: its compiled block is the
 *   one the chunk was emitted for, or the reparse window lowered it again
 *   and its node reads the same, from the same column, as the statement's it
 *   replaces, which the alignment of the program's old and new statements
 *   finds;
 * - every lowering input its lowering recorded read the same, and every value
 *   its emission recorded (a continuation's group name, which the compiler
 *   numbers by document order) still reads the same;
 * - every fact its reference table records about a symbol is unchanged.
 *
 * Otherwise the statement is emitted again and its chunk gets a new id. Chunk
 * ids and sequence ids come from counters that never go back.
 */
export class ChunkStore {
  readonly table: ProgramTable;

  /** The root of the last compile that was not a preview and did not fall
   *  back. */
  current: ProgramRoot | undefined;

  /** The chunks the last build emitted. */
  emittedLastBuild = 0;

  protected _writer: BinaryProgramWriter;
  protected _nextChunkId = 0;
  protected _nextSequenceId = 0;
  protected _nextRootId = 0;
  /** The chunk emitted or reused for a statement's compiled block. */
  protected _byBlock = new WeakMap<object, StatementChunk>();
  protected _info = new WeakMap<StatementChunk, ChunkInfo>();

  constructor(table: ProgramTable = createProgramTable()) {
    this.table = table;
    this._writer = new BinaryProgramWriter(table, (symbol) =>
      this.factsOf(symbol),
    );
  }

  /** Builds a root for `flows`, in the order the program runs them. A build
   *  that is not committed (a preview compile's) leaves `current` as it was.
   *  `runtimeStory` is the current engine's story of the same compile (see
   *  `ProgramRoot.runtimeStory`). */
  build(
    flows: readonly FlowSource[],
    commit: boolean,
    runtimeStory: Story | null = null,
  ): ProgramBuild {
    const previous = this.current;
    const emittedBefore = this._writer.emitted;
    const coverage: ProgramCoverage = {
      statements: 0,
      emitted: 0,
      unsupported: {},
    };
    let fallback: ProgramFallback | undefined;
    const sequences = new Map<number, SequenceRow>();
    const flowIds = new Map<number, number>();
    const scriptFlows = new Map<string, number[]>();
    // Symbols are interned first, so a reference table's facts see every flow
    // this program defines, as the kind this program defines it as.
    const symbols = flows.map((flow) => internSymbol(this.table, flow.name));
    this._definedKinds = new Map(
      flows.map((flow, f) => [symbols[f]!, flow.kind]),
    );
    // The program's statements, flow after flow, are aligned with the
    // previous root's as one list, so a statement keeps its chunk when an
    // edit renames its flow or moves it into another, as when a scene's
    // header is deleted. A statement whose block the store emitted a chunk
    // for keeps that chunk first.
    this._used = new Set();
    const statements = flows.flatMap((flow) => flow.statements);
    const kept = statements.map((statement) => {
      const chunk = this._byBlock.get(statement.block);
      if (chunk && !this._used.has(chunk) && this.holds(chunk, statement)) {
        this._used.add(chunk);
        return chunk;
      }
      return undefined;
    });
    const old = previous
      ? [...previous.sequences()].flatMap((row) => [...row.arrays.chunks])
      : [];
    const reused = this.align(statements, old, kept);
    let first = 0;
    flows.forEach((flow, f) => {
      const symbol = symbols[f]!;
      const before = previous?.flow(symbol);
      const flowReused = reused.slice(first, first + flow.statements.length);
      first += flow.statements.length;
      const chunks = this.buildSequence(flow, flowReused, coverage, (construct, line) => {
        fallback ??= { construct, uri: flow.uri, line };
      });
      const lineStarts = flow.statements.map((s) => s.firstLine - flow.firstLine);
      const arrays: SequenceArrays =
        before && sameArrays(before.arrays, chunks, lineStarts)
          ? before.arrays
          : { chunks, lineStarts };
      const row: SequenceRow = {
        id: before?.id ?? this._nextSequenceId++,
        arrays,
        flow: symbol,
        kind: flow.kind,
        owner: -1,
        block: -1,
        uri: flow.uri,
        firstLine: flow.firstLine,
        span: flow.span,
      };
      sequences.set(row.id, row);
      flowIds.set(symbol, row.id);
      let ids = scriptFlows.get(flow.uri);
      if (!ids) {
        ids = [];
        scriptFlows.set(flow.uri, ids);
      }
      ids.push(row.id);
    });
    coverage.emitted = this._writer.emitted - emittedBefore;
    this.emittedLastBuild = coverage.emitted;
    if (fallback) {
      return { fallback, coverage };
    }
    for (const ids of scriptFlows.values()) {
      ids.sort(
        (a, b) => sequences.get(a)!.firstLine - sequences.get(b)!.firstLine,
      );
    }
    const root = new ProgramRoot(
      this.table,
      this._nextRootId++,
      previous?.id ?? -1,
      sequences,
      flowIds,
      scriptFlows,
      this.chunkTable(previous, sequences),
      this.table.generation,
      runtimeStory,
    );
    if (commit) {
      this.current = root;
    }
    return { root, coverage };
  }

  // The flows the build in progress defines, each with its kind, and the
  // chunks it has placed, so that no chunk stands in two places of one root.
  protected _definedKinds = new Map<number, SymbolKindValue>();
  protected _used = new Set<StatementChunk>();

  /** What a chunk that refers to `symbol` depends on: the kind the program
   *  being built defines it as, or that the program does not define it. */
  protected factsOf(symbol: number): string {
    const kind = this._definedKinds.get(symbol);
    return kind === undefined ? "undefined" : `defined:${kind}`;
  }

  protected buildSequence(
    flow: FlowSource,
    reused: readonly (StatementChunk | undefined)[],
    coverage: ProgramCoverage,
    fail: (construct: string, line: number) => void,
  ): StatementChunk[] {
    const statements = flow.statements;
    const chunks: StatementChunk[] = [];
    statements.forEach((statement, i) => {
      coverage.statements += 1;
      let chunk = reused[i];
      if (!chunk) {
        try {
          const emitted = this._writer.write({
            objects: statement.objects,
            range: statement.range,
            firstLine: statement.firstLine,
            source: statement.source(),
            chunkId: this._nextChunkId++,
          });
          chunk = emitted.chunk;
          this._info.set(chunk, {
            syntax: statement.syntax(),
            reads: statement.reads,
            emitReads: emitted.reads,
          });
        } catch (e) {
          if (!(e instanceof UnsupportedConstruct)) {
            throw e;
          }
          coverage.unsupported[e.construct] =
            (coverage.unsupported[e.construct] ?? 0) + 1;
          fail(e.construct, statement.firstLine);
          return;
        }
      }
      this._byBlock.set(statement.block, chunk);
      chunks.push(chunk);
    });
    return chunks;
  }

  /**
   * The chunk each statement keeps, by the identity rule, or nothing for a
   * statement to emit. `statements` and `old` are the new and the previous
   * program's statements, flow after flow, and `kept` holds the chunks of the
   * statements whose block the store emitted a chunk for. The others are
   * aligned with the old chunks: between two statements that kept old chunks,
   * the old and new statements are matched from both ends and then in order
   * by their syntax, and a statement matched with one whose syntax and
   * recorded lowering inputs read the same takes its chunk, while its
   * recorded values and facts hold.
   */
  protected align(
    statements: readonly StatementSource[],
    old: readonly StatementChunk[],
    kept: readonly (StatementChunk | undefined)[],
  ): (StatementChunk | undefined)[] {
    const used = this._used;
    const oldEntry = new Map<StatementChunk, number>();
    old.forEach((chunk, entry) => oldEntry.set(chunk, entry));
    // Anchors: statements that kept a chunk of the old sequence, in order.
    let lastOld = -1;
    let runStart = 0;
    const result = kept.slice();
    const matchRun = (newFrom: number, newTo: number, oldFrom: number, oldTo: number) => {
      const candidates: number[] = [];
      for (let i = newFrom; i < newTo; i += 1) {
        if (!result[i]) {
          candidates.push(i);
        }
      }
      if (candidates.length === 0 || oldTo <= oldFrom) {
        return;
      }
      const olds: number[] = [];
      for (let o = oldFrom; o < oldTo; o += 1) {
        olds.push(o);
      }
      const syntaxOf = (o: number) => this._info.get(old[o]!)?.syntax;
      const take = (i: number, o: number): boolean => {
        const chunk = old[o]!;
        const info = this._info.get(chunk);
        const statement = statements[i]!;
        if (
          !info ||
          used.has(chunk) ||
          info.reads !== statement.reads ||
          info.syntax !== statement.syntax() ||
          !this.holds(chunk, statement)
        ) {
          return false;
        }
        used.add(chunk);
        result[i] = chunk;
        return true;
      };
      // From the front, then from the back, while the syntax matches.
      let front = 0;
      while (
        front < candidates.length &&
        front < olds.length &&
        syntaxOf(olds[front]!) === statements[candidates[front]!]!.syntax()
      ) {
        take(candidates[front]!, olds[front]!);
        front += 1;
      }
      let back = 0;
      while (
        back < candidates.length - front &&
        back < olds.length - front &&
        syntaxOf(olds[olds.length - 1 - back]!) ===
          statements[candidates[candidates.length - 1 - back]!]!.syntax()
      ) {
        take(
          candidates[candidates.length - 1 - back]!,
          olds[olds.length - 1 - back]!,
        );
        back += 1;
      }
      // In between, in order, each statement with the next old one that reads
      // the same.
      let o = front;
      for (let c = front; c < candidates.length - back; c += 1) {
        const syntax = statements[candidates[c]!]!.syntax();
        for (let k = o; k < olds.length - back; k += 1) {
          if (syntaxOf(olds[k]!) === syntax) {
            if (take(candidates[c]!, olds[k]!)) {
              o = k + 1;
            }
            break;
          }
        }
      }
    };
    for (let i = 0; i <= kept.length; i += 1) {
      const chunk = kept[i];
      const entry = chunk ? oldEntry.get(chunk) : undefined;
      if (i === kept.length || (entry !== undefined && entry > lastOld)) {
        matchRun(runStart, i, lastOld + 1, i === kept.length ? old.length : entry!);
        if (entry !== undefined) {
          lastOld = entry;
        }
        runStart = i + 1;
      }
    }
    return result;
  }

  /** Whether a chunk's recorded values and facts still hold for `statement`. */
  protected holds(chunk: StatementChunk, statement: StatementSource): boolean {
    const info = this._info.get(chunk);
    if (!info) {
      return false;
    }
    const names = compilerNamedTexts(statement.objects);
    if (
      names.length !== info.emitReads.length ||
      names.some((name, i) => name !== info.emitReads[i])
    ) {
      return false;
    }
    const start = referenceTableStart(chunk);
    for (let r = 0; r < chunk[H_REFERENCE_ROWS]!; r += 1) {
      const at = start + r * REFERENCE_ROW_WORDS;
      if (factHash(this.factsOf(chunk[at]!)) !== chunk[at + 1]) {
        return false;
      }
    }
    return true;
  }

  /** The chunk table of a root holding `sequences`, written over the previous
   *  root's where a chunk was added, moved or dropped. */
  protected chunkTable(
    previous: ProgramRoot | undefined,
    sequences: ReadonlyMap<number, SequenceRow>,
  ): ChunkTable {
    const writer = (previous?.chunkIndex ?? new ChunkTable()).fork();
    const held = new Set<StatementChunk>();
    for (const row of sequences.values()) {
      const before = previous?.sequence(row.id);
      if (before?.arrays === row.arrays) {
        for (const chunk of row.arrays.chunks) {
          held.add(chunk);
        }
        continue;
      }
      for (const chunk of row.arrays.chunks) {
        held.add(chunk);
        writer.set(chunkId(chunk), row.id);
      }
    }
    if (previous) {
      for (const row of previous.sequences()) {
        if (sequences.get(row.id)?.arrays === row.arrays) {
          continue;
        }
        for (const chunk of row.arrays.chunks) {
          if (!held.has(chunk)) {
            writer.set(chunkId(chunk), -1);
          }
        }
      }
    }
    return writer.finish();
  }

  /** The chunk emitted or reused for a statement's compiled block, for a
   *  test that asserts which chunks a compile kept. */
  chunkOf(block: object): StatementChunk | undefined {
    return this._byBlock.get(block);
  }
}

const sameArrays = (
  arrays: SequenceArrays,
  chunks: readonly StatementChunk[],
  lineStarts: readonly number[],
): boolean =>
  arrays.chunks.length === chunks.length &&
  arrays.chunks.every((chunk, i) => chunk === chunks[i]) &&
  arrays.lineStarts.every((line, i) => line === lineStarts[i]);

/** The texts the compiler rewrites in place in a statement's parsed objects,
 *  in the order the writer reads them (`StringExpression.EmitProgram`). A
 *  call's arguments are read through `args`, since a call the runtime tree
 *  was generated for no longer holds them in `content`. */
export const compilerNamedTexts = (
  objects: readonly ParsedObject[],
): string[] => {
  const out: string[] = [];
  const visit = (obj: ParsedObject) => {
    if (obj instanceof Text && obj.isCompilerNamed) {
      out.push(obj.text);
    }
    const children = obj instanceof FunctionCall ? obj.args : obj.content;
    for (const child of children ?? []) {
      visit(child);
    }
  };
  objects.forEach(visit);
  return out;
};
