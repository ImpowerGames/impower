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
import { ConstantDeclaration } from "../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ConstantDeclaration";
import { VariableAssignment } from "../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { VariableReference } from "../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import {
  BinaryProgramWriter,
  factHash,
  type BlockInput,
} from "./BinaryProgramWriter";
import { StoryException } from "../inkjs/engine/StoryException";
import { UnsupportedConstruct } from "./ProgramEmitter";
import { ProgramStory } from "./ProgramStory";
import {
  ChunkTable,
  ProgramRoot,
  type SequenceArrays,
  type SequenceRow,
} from "./ProgramRoot";
import { internSymbol, SymbolKind, type SymbolKindValue } from "./ProgramSymbols";
import {
  B_SEQUENCE,
  blockCount,
  blockField,
  chunkId,
  referenceTableStart,
  H_REFERENCE_ROWS,
  REFERENCE_ROW_WORDS,
  type StatementChunk,
} from "./StatementChunk";

/** One statement, as the compile hands it to the store. */
export interface StatementSource {
  /** What stands for the statement's syntax: the compiled block the
   *  compilation annotator lowered a top-level statement to, or the shape a
   *  statement inside a block's body was recorded as. It is the same object
   *  for as long as the incremental parse keeps the node and the lowering
   *  inputs the node recorded read the same. */
  block: object;
  /** The statement's parsed objects, in the order it runs them. */
  objects: readonly ParsedObject[];
  /** The statement's own source range, with lines counting from 1. */
  range: DebugMetadata | null;
  /** The statement's first line in its script, counting from 0. */
  firstLine: number;
  /** The statement's source text, which its fingerprint hashes: a block
   *  statement's own parts, without its bodies. */
  source: () => string;
  /** The statement's syntax: its node's name, the column it starts at and its
   *  own source text, which together settle every position its chunk's line
   *  rows hold. Read only for a statement whose block is not the one a chunk
   *  was emitted for. */
  syntax: () => string;
  /** The lowering inputs the statement recorded, with the answers they got. */
  reads: string;
  /** The bodies of a block statement, in the order it runs them. */
  bodies?: readonly BodySource[];
  /** The column at which a line of the statement's script ends. */
  lineEnd?: (line: number) => number;
}

/** One body of a block statement. */
export interface BodySource {
  /** What the writer knows the body by (the lowering's `BodyShape`). */
  shape: object;
  statements: readonly StatementSource[];
  /** The body's first line in its script, counting from 0. */
  firstLine: number;
  /** The lines the body spans. */
  span: number;
  /** The lines of the owner's parts between the body above it (or the
   *  owner's first line) and this body. */
  headLines: number;
}

/** A statement that declares globals, as the compile hands it to the store. */
export interface DeclarationSource extends StatementSource {
  /** The script it is written in. */
  uri: string;
  /** The globals it declares, in the order the story initializes them. */
  globals: readonly VariableAssignment[];
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

/** What a compile hands the store to build a root from. */
export interface ProgramSource {
  flows: readonly FlowSource[];
  /** The declaration statements, in the order the story initializes their
   *  globals. */
  declarations?: readonly DeclarationSource[];
  /** The compiled blocks of the program's functions (see `programFlows`). */
  functionBlocks?: readonly object[];
  /** How many lines each script has. */
  lineCount?: (uri: string) => number;
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
  /** The statements of the program's flows, the statements inside their
   *  block statements' bodies included, and its declaration statements. */
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
  /** Whether the build re-emitted a declaration chunk, changed the
   *  declarations' order or a function, which is when a compile runs the
   *  declarations again. */
  declarationsChanged: boolean;
}

// What the store knows of a chunk it emitted or reused: the syntax of the
// statement it was emitted for, the lowering inputs that statement recorded,
// and the values its emission recorded.
interface ChunkInfo {
  syntax: string;
  reads: string;
  emitReads: readonly string[];
  resolutions: readonly string[];
}

/**
 * The chunk store (docs/engine/binary-program.md, section 9): the ordered
 * statement chunks of each flow, the sequences of the bodies of its block
 * statements, and each script's declaration sequence, filled by the compiler
 * and read by reference by a game in the same worker. The compiler owns one
 * store; each compile builds a root from it, and a compile that is not a
 * preview makes that root the store's current one.
 *
 * A statement keeps its chunk across compiles by the identity rule of the
 * design (section 1, Identity), which three things decide:
 *
 * - its syntax is what the incremental parse kept: its compiled block, or
 *   the shape recorded for it inside a block's body, is the one the chunk was
 *   emitted for, or the reparse window lowered it again and its node reads
 *   the same, from the same column, as the statement's it replaces, which the
 *   alignment of the program's old and new statements finds. A block
 *   statement's syntax is its own parts: an edit inside one of its bodies
 *   leaves it as it was;
 * - every lowering input its lowering recorded read the same, and every value
 *   its emission recorded (a continuation's group name, which the compiler
 *   numbers by document order) still reads the same;
 * - every fact its reference table records about a symbol is unchanged.
 *
 * Otherwise the statement is emitted again and its chunk gets a new id. Chunk
 * ids and sequence ids come from counters that never go back. A body keeps
 * its sequence id while its owner keeps its chunk, whose block table names it,
 * and when its owner is emitted again in place (one statement between the
 * same neighbours before and after), the owner's bodies take the ids of the
 * old owner's in order.
 */
export class ChunkStore {
  readonly table: ProgramTable;

  /** The root of the last compile that was not a preview and did not fall
   *  back. */
  current: ProgramRoot | undefined;

  /** The chunks the last build emitted. */
  emittedLastBuild = 0;

  /** How many times a compile has run the program's declarations (see
   *  `runDeclarations`). */
  initializerRuns = 0;

  protected _writer: BinaryProgramWriter;
  protected _nextChunkId = 0;
  protected _nextSequenceId = 0;
  protected _nextRootId = 0;
  /** The chunk emitted or reused for a statement's block. */
  protected _byBlock = new WeakMap<object, StatementChunk>();
  /** The declaration chunk emitted or reused for a statement's block. */
  protected _byDeclaration = new WeakMap<object, StatementChunk>();
  protected _info = new WeakMap<StatementChunk, ChunkInfo>();
  /** The function blocks of the last committed build. */
  protected _functionBlocks: ReadonlySet<object> = new Set();

  constructor(table: ProgramTable = createProgramTable()) {
    this.table = table;
    this._writer = new BinaryProgramWriter(table, (symbol) =>
      this.factsOf(symbol),
    );
  }

  /** Builds a root for the program, whose flows are in the order the
   *  program runs them. A build that is not committed (a preview compile's)
   *  leaves `current` as it was. `runtimeStory` is the current engine's story
   *  of the same compile (see `ProgramRoot.runtimeStory`). */
  build(
    source: ProgramSource | readonly FlowSource[],
    commit: boolean,
    runtimeStory: Story | null = null,
  ): ProgramBuild {
    const program: ProgramSource = Array.isArray(source)
      ? { flows: source }
      : (source as ProgramSource);
    const flows = program.flows;
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
    // The program's statements, flow after flow and each block statement
    // before the statements of its bodies, are aligned with the previous
    // root's as one list, so a statement keeps its chunk when an edit renames
    // its flow or moves it into another, as when a scene's header is
    // deleted. A statement whose block the store emitted a chunk for keeps
    // that chunk first.
    this._used = new Set();
    this._inherit = new Map();
    const statements: StatementSource[] = [];
    const collect = (list: readonly StatementSource[]) => {
      for (const statement of list) {
        statements.push(statement);
        for (const body of statement.bodies ?? []) {
          collect(body.statements);
        }
      }
    };
    flows.forEach((flow) => collect(flow.statements));
    const kept = statements.map((statement) =>
      this.keep(this._byBlock, statement),
    );
    const old = previous ? previous.statementOrder() : [];
    const reused = this.align(statements, old, kept);
    const chunkOf = new Map<StatementSource, StatementChunk | undefined>();
    statements.forEach((statement, i) => chunkOf.set(statement, reused[i]));

    flows.forEach((flow, f) => {
      const symbol = symbols[f]!;
      const before = previous?.flow(symbol);
      const id = before?.id ?? this._nextSequenceId++;
      const failFlow = (construct: string, line: number) => {
        fallback ??= { construct, uri: flow.uri, line };
      };
      const arrays = this.buildSequence(
        flow.statements,
        flow.firstLine,
        chunkOf,
        coverage,
        failFlow,
        before?.arrays,
        (ownerId, block, body, bodyArrays, seqId) => {
          sequences.set(seqId, {
            id: seqId,
            arrays: bodyArrays,
            flow: symbol,
            kind: flow.kind,
            owner: ownerId,
            block,
            uri: flow.uri,
            firstLine: body.firstLine,
            span: body.span,
          });
        },
        previous,
      );
      const row: SequenceRow = {
        id,
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

    // The declarations: each script's declaration sequence, and the order
    // `ResetState` runs their chunks in, which is the story's.
    const declarations = program.declarations ?? [];
    const declarationChunks: StatementChunk[] = [];
    const declarationIds = new Map<string, number>();
    const emittedBeforeDeclarations = this._writer.emitted;
    const oldDeclarations = previous?.initialization ?? [];
    const keptDeclarations = declarations.map((declaration) =>
      this.keep(this._byDeclaration, declaration),
    );
    const reusedDeclarations = this.align(
      declarations,
      oldDeclarations,
      keptDeclarations,
    );
    const byScript = new Map<string, { source: DeclarationSource; chunk: StatementChunk }[]>();
    declarations.forEach((declaration, i) => {
      coverage.statements += 1;
      let chunk = reusedDeclarations[i];
      if (!chunk) {
        try {
          const emitted = this._writer.writeDeclaration({
            objects: [],
            globals: declaration.globals,
            range: declaration.range,
            firstLine: declaration.firstLine,
            source: declaration.source(),
            chunkId: this._nextChunkId++,
          });
          chunk = emitted.chunk;
          this._info.set(chunk, {
            syntax: declaration.syntax(),
            reads: declaration.reads,
            emitReads: emitted.reads,
            resolutions: emitted.resolutions,
          });
        } catch (e) {
          if (!(e instanceof UnsupportedConstruct)) {
            throw e;
          }
          coverage.unsupported[e.construct] =
            (coverage.unsupported[e.construct] ?? 0) + 1;
          fallback ??= {
            construct: e.construct,
            uri: declaration.uri,
            line: declaration.firstLine,
          };
          return;
        }
      }
      this._byDeclaration.set(declaration.block, chunk);
      declarationChunks.push(chunk);
      let list = byScript.get(declaration.uri);
      if (!list) {
        list = [];
        byScript.set(declaration.uri, list);
      }
      list.push({ source: declaration, chunk });
    });
    const declarationsEmitted =
      this._writer.emitted > emittedBeforeDeclarations;
    for (const [uri, list] of byScript) {
      list.sort((a, b) => a.source.firstLine - b.source.firstLine);
      const chunks = list.map((entry) => entry.chunk);
      const lineStarts = list.map((entry) => entry.source.firstLine);
      const before = previous?.declarations(uri);
      const id = before?.id ?? this._nextSequenceId++;
      const arrays: SequenceArrays =
        before && sameArrays(before.arrays, chunks, lineStarts)
          ? before.arrays
          : { chunks, lineStarts };
      sequences.set(id, {
        id,
        arrays,
        flow: -1,
        kind: SymbolKind.Root,
        owner: -1,
        block: -1,
        uri,
        firstLine: 0,
        span: program.lineCount?.(uri) ?? 0,
      });
      declarationIds.set(uri, id);
    }

    coverage.emitted = this._writer.emitted - emittedBefore;
    this.emittedLastBuild = coverage.emitted;
    const functionBlocks = new Set(program.functionBlocks ?? []);
    const declarationsChanged =
      !previous ||
      declarationsEmitted ||
      !sameChunks(oldDeclarations, declarationChunks) ||
      functionBlocks.size !== this._functionBlocks.size ||
      [...functionBlocks].some((block) => !this._functionBlocks.has(block));
    if (fallback) {
      return { fallback, coverage, declarationsChanged };
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
      declarationIds,
      declarationChunks,
    );
    // The declarations run again when a declaration chunk or a function
    // changed, since an initializer may read another global or call a
    // function: a compile that changed only the statements of flows runs
    // none. An initializer that raises an error makes the program fall back,
    // whose story then raises it as the current engine does.
    if (declarationsChanged || this._declarationsFailed) {
      this.initializerRuns += 1;
      this._declarationsFailed = !this.runDeclarations(root);
      if (this._declarationsFailed) {
        return {
          fallback: {
            construct: "initializer error",
            uri: flows[0]?.uri ?? "",
            line: 0,
          },
          coverage,
          declarationsChanged,
        };
      }
    }
    if (commit) {
      this.current = root;
      this._functionBlocks = functionBlocks;
    }
    return { root, coverage, declarationsChanged };
  }

  // Whether the last declarations run raised an error, which runs them again
  // on the next compile.
  protected _declarationsFailed = false;

  /** Runs a root's declarations on a new engine, and returns whether they
   *  ran without an error. */
  protected runDeclarations(root: ProgramRoot): boolean {
    try {
      new ProgramStory(root);
      return true;
    } catch (e) {
      if (e instanceof StoryException) {
        return false;
      }
      throw e;
    }
  }

  // The flows the build in progress defines, each with its kind, and the
  // chunks it has placed, so that no chunk stands in two places of one root.
  protected _definedKinds = new Map<number, SymbolKindValue>();
  protected _used = new Set<StatementChunk>();
  // The old owner each block statement emitted again in place takes its
  // bodies' sequence ids from.
  protected _inherit = new Map<StatementSource, StatementChunk>();

  /** What a chunk that refers to `symbol` depends on: the kind the program
   *  being built defines it as, or that the program does not define it. */
  protected factsOf(symbol: number): string {
    const kind = this._definedKinds.get(symbol);
    return kind === undefined ? "undefined" : `defined:${kind}`;
  }

  /** The chunk `statement`'s block was emitted or kept for, while it still
   *  holds and no other statement of the build has taken it. */
  protected keep(
    byBlock: WeakMap<object, StatementChunk>,
    statement: StatementSource,
  ): StatementChunk | undefined {
    const chunk = byBlock.get(statement.block);
    if (chunk && !this._used.has(chunk) && this.holds(chunk, statement)) {
      this._used.add(chunk);
      return chunk;
    }
    return undefined;
  }

  /** The arrays of the sequence of `statements`, whose body starts on line
   *  `firstLine`, emitting the chunks alignment gave none, and the rows of
   *  the sequences of their bodies through `addBody`. */
  protected buildSequence(
    statements: readonly StatementSource[],
    firstLine: number,
    chunkOf: ReadonlyMap<StatementSource, StatementChunk | undefined>,
    coverage: ProgramCoverage,
    fail: (construct: string, line: number) => void,
    before: SequenceArrays | undefined,
    addBody: (
      owner: number,
      block: number,
      body: BodySource,
      arrays: SequenceArrays,
      id: number,
    ) => void,
    previous: ProgramRoot | undefined,
  ): SequenceArrays {
    const chunks: StatementChunk[] = [];
    const lineStarts: number[] = [];
    for (const statement of statements) {
      coverage.statements += 1;
      let chunk = chunkOf.get(statement);
      const bodies = statement.bodies ?? [];
      if (!chunk) {
        // The sequence ids of the statement's bodies: an owner emitted again
        // in place takes the old owner's, in order.
        const inherited = this._inherit.get(statement);
        const blocks: BlockInput[] = bodies.map((body, k) => ({
          body: body.shape,
          sequenceId:
            inherited && k < blockCount(inherited)
              ? blockField(inherited, k, B_SEQUENCE)
              : this._nextSequenceId++,
          headLines: body.headLines,
          firstLine: body.firstLine,
          span: body.span,
        }));
        try {
          const emitted = this._writer.write({
            objects: statement.objects,
            range: statement.range,
            firstLine: statement.firstLine,
            source: statement.source(),
            chunkId: this._nextChunkId++,
            blocks,
            lineEnd: statement.lineEnd,
          });
          chunk = emitted.chunk;
          this._info.set(chunk, {
            syntax: statement.syntax(),
            reads: statement.reads,
            emitReads: emitted.reads,
            resolutions: emitted.resolutions,
          });
        } catch (e) {
          if (!(e instanceof UnsupportedConstruct)) {
            throw e;
          }
          coverage.unsupported[e.construct] =
            (coverage.unsupported[e.construct] ?? 0) + 1;
          fail(e.construct, statement.firstLine);
          continue;
        }
      }
      this._byBlock.set(statement.block, chunk);
      chunks.push(chunk);
      lineStarts.push(statement.firstLine - firstLine);
      // The statement's bodies, each a sequence under the id its owner's
      // block table names.
      bodies.forEach((body, k) => {
        const id = blockField(chunk!, k, B_SEQUENCE);
        const beforeBody = previous?.sequence(id)?.arrays;
        const arrays = this.buildSequence(
          body.statements,
          body.firstLine,
          chunkOf,
          coverage,
          fail,
          beforeBody,
          addBody,
          previous,
        );
        addBody(chunkId(chunk!), k, body, arrays, id);
      });
    }
    return before && sameArrays(before, chunks, lineStarts)
      ? before
      : { chunks, lineStarts };
  }

  /**
   * The chunk each statement keeps, by the identity rule, or nothing for a
   * statement to emit. `statements` and `old` are the new and the previous
   * program's statements in order, and `kept` holds the chunks of the
   * statements whose block the store emitted a chunk for. The others are
   * aligned with the old chunks: between two statements that kept old chunks,
   * the old and new statements are matched from both ends and then in order
   * by their syntax, and a statement matched with one whose syntax and
   * recorded lowering inputs read the same takes its chunk, while its
   * recorded values and facts hold. A run left with one new block statement
   * and one old one pairs them, so that the new one takes the old one's body
   * ids when it is emitted.
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
      // A block statement edited in place: one left on each side.
      const leftNew = candidates.filter((i) => !result[i]);
      const leftOld = olds.filter((k) => !used.has(old[k]!));
      if (
        leftNew.length === 1 &&
        leftOld.length === 1 &&
        (statements[leftNew[0]!]!.bodies?.length ?? 0) > 0 &&
        blockCount(old[leftOld[0]!]!) > 0
      ) {
        this._inherit.set(statements[leftNew[0]!]!, old[leftOld[0]!]!);
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
    const exclude = bodyObjects(statement);
    const names = compilerNamedTexts(statement.objects, exclude);
    if (
      names.length !== info.emitReads.length ||
      names.some((name, i) => name !== info.emitReads[i])
    ) {
      return false;
    }
    const resolutions = resolutionsOf(statement.objects, exclude);
    if (
      resolutions.length !== info.resolutions.length ||
      resolutions.some((value, i) => value !== info.resolutions[i])
    ) {
      return false;
    }
    if (
      (statement.bodies?.length ?? 0) !== blockCount(chunk)
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

  /** The chunk emitted or reused for a statement's block, for a test that
   *  asserts which chunks a compile kept. */
  chunkOf(block: object): StatementChunk | undefined {
    return this._byBlock.get(block);
  }

  /** The declaration chunk emitted or reused for a statement's block. */
  declarationChunkOf(block: object): StatementChunk | undefined {
    return this._byDeclaration.get(block);
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

const sameChunks = (
  a: readonly StatementChunk[],
  b: readonly StatementChunk[],
): boolean => a.length === b.length && a.every((chunk, i) => chunk === b[i]);

/** The texts the compiler rewrites in place in a statement's parsed objects,
 *  in the order the writer reads them (`StringExpression.EmitProgram`),
 *  leaving out the objects in `exclude` (a block statement's bodies, whose
 *  statements have chunks of their own). A call's arguments are read through
 *  `args`, since a call the runtime tree was generated for no longer holds
 *  them in `content`. */
export const compilerNamedTexts = (
  objects: readonly ParsedObject[],
  exclude?: ReadonlySet<ParsedObject>,
): string[] => {
  const out: string[] = [];
  const visit = (obj: ParsedObject) => {
    if (exclude?.has(obj)) {
      return;
    }
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

/** How the names a statement's objects read resolved, sorted, as the writer
 *  records them (`VariableReference.EmitExpression`), leaving out the objects
 *  in `exclude` and the declarations a flow's statement holds, whose
 *  initializers are the declaration sequence's code and not the
 *  statement's. */
export const resolutionsOf = (
  objects: readonly ParsedObject[],
  exclude?: ReadonlySet<ParsedObject>,
): string[] => {
  const out: string[] = [];
  const visit = (obj: ParsedObject) => {
    if (
      exclude?.has(obj) ||
      obj instanceof ConstantDeclaration ||
      (obj instanceof VariableAssignment && obj.isGlobalDeclaration)
    ) {
      return;
    }
    if (obj instanceof VariableReference) {
      out.push(obj.resolutionKey);
    }
    const children = obj instanceof FunctionCall ? obj.args : obj.content;
    for (const child of children ?? []) {
      visit(child);
    }
  };
  objects.forEach(visit);
  return out.sort();
};

/** The objects of the statements in a block statement's bodies. */
const bodyObjects = (
  statement: StatementSource,
): ReadonlySet<ParsedObject> | undefined => {
  if (!statement.bodies?.length) {
    return undefined;
  }
  const out = new Set<ParsedObject>();
  for (const body of statement.bodies) {
    for (const nested of body.statements) {
      for (const obj of nested.objects) {
        out.add(obj);
      }
    }
  }
  return out;
};
