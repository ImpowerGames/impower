// Loads the engine's modules in the order that settles their import cycle
// (see `CompilationAnnotator`).
import "../inkjs/engine/Container";
import {
  createProgramTable,
  reseedProgramTable,
  type ProgramTable,
} from "../binary/ProgramBinaryWriter";
import {
  alternatorSourceOf,
  functionShapeOf,
  isLoopInternal,
} from "../compiler/lower/utils/statementShape";
import type { DebugMetadata } from "../inkjs/engine/DebugMetadata";
import type { Story } from "../inkjs/engine/Story";
import { Divert } from "../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { DivertTarget } from "../inkjs/compiler/Parser/ParsedHierarchy/Divert/DivertTarget";
import { Gather } from "../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { FlowBase } from "../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowBase";
import { FunctionCall } from "../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import type { ParsedObject } from "../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Story as ParsedStory } from "../inkjs/compiler/Parser/ParsedHierarchy/Story";
import { Sequence } from "../inkjs/compiler/Parser/ParsedHierarchy/Sequence/Sequence";
import { Text } from "../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { ConstantDeclaration } from "../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ConstantDeclaration";
import { VariableAssignment } from "../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { VariableReference } from "../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import {
  BinaryProgramWriter,
  factHash,
  NO_FACTS,
  normalizeSource,
  type BlockInput,
  type FunctionInput,
} from "./BinaryProgramWriter";
import { StoryException } from "../inkjs/engine/StoryException";
import { UnsupportedConstruct } from "./ProgramEmitter";
import { ProgramStory } from "./ProgramStory";
import {
  ChunkTable,
  emptyDefinitions,
  ProgramRoot,
  type DefinitionArrays,
  type SequenceArrays,
  type SequenceRow,
} from "./ProgramRoot";
import { Op, opOf } from "./ProgramInstructions";
import {
  anonymousSymbol,
  internSymbol,
  isAnonymousSymbol,
  renumberAnonymousSymbols,
  snapshotTable,
  SymbolKind,
  UNDEFINED_KIND,
  type SymbolKindValue,
} from "./ProgramSymbols";
import {
  BLOCK_FUNCTION,
  B_SEQUENCE,
  HEADER_WORDS,
  blockCount,
  blockField,
  blockFlags,
  chunkId,
  codeWords,
  exportCount,
  exportOffset,
  exportSymbol,
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
  /** The text between two offsets relative to the start of the top-level
   *  node the statement was lowered in, from which an alternator's own
   *  source is read (`alternatorSourceOf`). */
  text?: (from: number, to: number) => string;
  /** The bodies of a block statement, in the order it runs them, and the
   *  bodies of the functions the statement writes. */
  bodies?: readonly BodySource[];
  /** The column at which a line of the statement's script ends. */
  lineEnd?: (line: number) => number;
  /** For the definition of a function declared at the top level, the
   *  function's qualified name: its one body is the function's, under the
   *  name's symbol, and its chunk has no code before the function's entry. */
  defines?: string;
}

/** One body of a block statement, or of a function the statement writes. */
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
  /** For a function's body, the function (a `FlowBase`). */
  fn?: ParsedObject;
  /** For a function's body, the function's own source text, which aligns it
   *  with the functions of the statement's previous chunk when the statement
   *  is emitted again (docs/engine/binary-program.md, section 2). */
  partSource?: () => string;
}

/** A global a declaration statement declares. */
export interface DeclaredGlobal {
  /** The name the story's `global decl` container assigns it under, its key
   *  in `variableDeclarations`: a `define` that reuses a name under another
   *  type is `$<type>_<name>`, and a builtin an author's declaration shadows
   *  is `$prelude_<name>`, while the assignment's own name is the bare one. */
  name: string;
  assignment: VariableAssignment;
}

/** A statement that declares globals, as the compile hands it to the store. */
export interface DeclarationSource extends StatementSource {
  /** The script it is written in. */
  uri: string;
  /** The globals it declares, in the order the story initializes them. */
  globals: readonly DeclaredGlobal[];
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
  /** For a scene whose content starts with a branch that takes no
   *  parameters, that branch's qualified name: entering the scene enters it,
   *  as the current engine's knot diverts to its first stitch. */
  startsWith?: string;
}

/** What a compile hands the store to build a root from. */
export interface ProgramSource {
  flows: readonly FlowSource[];
  /** The declaration statements, in the order the story initializes their
   *  globals. */
  declarations?: readonly DeclarationSource[];
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
   *  block statements' bodies and functions included, and its declaration
   *  statements. */
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
   *  declarations' order or a function's code, which is when a compile runs
   *  the declarations again. */
  declarationsChanged: boolean;
}

// One function a chunk writes: the hash of the function's own source, its
// symbol, and the block its body is.
interface FunctionPart {
  fingerprint: string;
  symbol: number;
  block: number;
}

// One alternator a chunk writes: what it is aligned by, and its anonymous
// symbol, which counts it.
interface AlternatorPart {
  fingerprint: string;
  symbol: number;
}

// What the store knows of a chunk it emitted or reused: the syntax of the
// statement it was emitted for, the lowering inputs that statement recorded,
// the values its emission recorded, for a declaration chunk the names of the
// globals it assigns, in order (`assignedNames`), the function declared at
// the top level it defines, the functions it writes, the anonymous symbols of
// other statements' functions its code refers to, and the table generation
// its ids belong to.
interface ChunkInfo {
  syntax: string;
  reads: string;
  emitReads: readonly string[];
  resolutions: readonly string[];
  globals?: string;
  defines?: string;
  parts: readonly FunctionPart[];
  alternators: readonly AlternatorPart[];
  anonymousReferences: readonly number[];
  /** The locals each function the statement writes declares at its entry
   *  (`hoistedOf`). */
  hoisted: string;
  /** The parameters the entry of each function the statement writes or runs
   *  in place binds (`paramsOf`). */
  params: string;
  generation: number;
}

// The symbols a build gives the functions a statement writes, by body, and
// for a statement emitted again in place, the old block each function's body
// takes its sequence id from.
interface FunctionPlan {
  symbols: (number | undefined)[];
  oldBlocks: (number | undefined)[];
}

/** The names a declaration assigns, in order, or nothing for a statement of
 *  a flow. Which of a statement's globals one declaration holds depends on
 *  the declarations around it (a constant elsewhere splits it into runs), and
 *  a global's name on the declarations of its name elsewhere (a `define` of
 *  the name under another type, an author's declaration that shadows a
 *  builtin), so a declaration chunk is kept only while they read the same. */
const assignedNames = (statement: StatementSource): string | undefined =>
  "globals" in statement
    ? (statement as DeclarationSource).globals.map((g) => g.name).join("\u0000")
    : undefined;

/**
 * The chunk store (docs/engine/binary-program.md, section 9): the ordered
 * statement chunks of each flow, the sequences of the bodies of its block
 * statements and functions, and each script's declaration sequence, filled
 * by the compiler and read by reference by a game in the same worker. The
 * compiler owns one store; each compile builds a root from it, and a compile
 * that is not a preview makes that root the store's current one.
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
 *   leaves it as it was, and so does an edit inside a function it writes;
 * - every lowering input its lowering recorded read the same, and every value
 *   its emission recorded (a continuation's group name, which the compiler
 *   numbers by document order, how each name and each call resolved) still
 *   reads the same; a declaration chunk also assigns the same globals, by
 *   name and in order (`assignedNames`);
 * - every fact its reference table records about a symbol is unchanged, and
 *   the functions of other statements it calls by an anonymous symbol still
 *   have those symbols.
 *
 * Otherwise the statement is emitted again and its chunk gets a new id. Chunk
 * ids and sequence ids come from counters that never go back. A body keeps
 * its sequence id while its owner keeps its chunk, whose block table names it.
 * A statement whose syntax matches an old statement's but whose chunk cannot
 * be kept, or which is the one statement left on each side of a run, is
 * emitted again in place: its block statement's bodies take the old owner's
 * sequence ids in order, and the functions it writes are aligned with the old
 * chunk's by their own source, each taking the anonymous symbol and the body
 * id of the old function it is aligned with (section 2).
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
  /** The chunks of the last committed build that hold a function's code: the
   *  chunks that write functions and the chunks inside functions' bodies. */
  protected _functionChunks: ReadonlySet<StatementChunk> = new Set();

  /** `table` is the compiler's persistent `ProgramTable`, which the store
   *  interns into and keeps no table of its own (#696); a reseed of it goes
   *  through `reseed`. */
  constructor(table: ProgramTable = createProgramTable()) {
    this.table = table;
    this._writer = new BinaryProgramWriter(
      table,
      (symbol) => this.factsOf(symbol),
      (fn) => this.symbolOf(fn),
      (sequence) => this.alternatorOf(sequence),
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
    const declarations = program.declarations ?? [];
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
    // this program defines, as the kind this program defines it as, and a
    // function's parameters.
    const symbols = flows.map((flow) => internSymbol(this.table, flow.name));
    this._definedFacts = new Map(
      flows.map((flow, f) => [symbols[f]!, flowFacts(flow)]),
    );
    this._functionSymbols = new Map();
    this._labels = new Map();
    this._plans = new Map();
    // The program's statements, flow after flow and each block statement
    // before the statements of its bodies, then the statements of the
    // functions the declarations write, are aligned with the previous root's
    // as one list, so a statement keeps its chunk when an edit renames its
    // flow or moves it into another, as when a scene's header is deleted. A
    // statement whose block the store emitted a chunk for keeps that chunk
    // first.
    this._used = new Set();
    this._inherit = new Map();
    const statements: StatementSource[] = [];
    // The statement whose body holds each statement of a body.
    const owners = new Map<StatementSource, StatementSource>();
    const collect = (
      list: readonly StatementSource[],
      owner?: StatementSource,
    ) => {
      for (const statement of list) {
        statements.push(statement);
        if (owner) {
          owners.set(statement, owner);
        }
        collectBodies(statement);
      }
    };
    const collectBodies = (statement: StatementSource) => {
      for (const body of statement.bodies ?? []) {
        collect(body.statements, statement);
      }
    };
    flows.forEach((flow) => collect(flow.statements));
    declarations.forEach(collectBodies);
    const kept = statements.map((statement) =>
      this.keep(this._byBlock, statement),
    );
    const old = previous ? previous.statementOrder() : [];
    const oldOwners = new Map<StatementChunk, StatementChunk>();
    for (const chunk of old) {
      const at = previous!.position(chunkId(chunk));
      const owner = at ? previous!.ownerOf(at.sequence) : undefined;
      if (owner) {
        oldOwners.set(chunk, owner.sequence.arrays.chunks[owner.entry]!);
      }
    }
    const reused = this.align(statements, old, kept, {
      owner: (statement) => owners.get(statement),
      oldOwner: (chunk) => oldOwners.get(chunk),
    });
    const chunkOf = new Map<StatementSource, StatementChunk | undefined>();
    statements.forEach((statement, i) => chunkOf.set(statement, reused[i]));
    const oldDeclarations = previous?.initialization ?? [];
    const keptDeclarations = declarations.map((declaration) =>
      this.keep(this._byDeclaration, declaration),
    );
    const reusedDeclarations = this.align(
      declarations,
      oldDeclarations,
      keptDeclarations,
    );
    declarations.forEach((declaration, i) =>
      chunkOf.set(declaration, reusedDeclarations[i]),
    );

    // The functions' symbols, then the chunks that call another statement's
    // function by a symbol that function no longer has, which are emitted
    // again in place.
    const everyStatement = [...statements, ...declarations];
    for (const statement of everyStatement) {
      this.planFunctions(statement, chunkOf.get(statement));
    }
    for (const statement of everyStatement) {
      const chunk = chunkOf.get(statement);
      if (chunk && !this.anonymousReferencesHold(chunk, statement)) {
        chunkOf.set(statement, undefined);
        this._inherit.set(statement, chunk);
      }
    }

    const functionChunks = new Set<StatementChunk>();
    flows.forEach((flow, f) => {
      const symbol = symbols[f]!;
      // By name: the previous root may hold the ids of an older table
      // generation, which a reseed renumbered.
      const before = previous?.flowNamed(flow.name);
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
        functionChunks,
        flow.kind === SymbolKind.Function,
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
    const declarationChunks: StatementChunk[] = [];
    const declarationIds = new Map<string, number>();
    const emittedBeforeDeclarations = this._writer.emitted;
    const byScript = new Map<string, { source: DeclarationSource; chunk: StatementChunk }[]>();
    declarations.forEach((declaration) => {
      coverage.statements += 1;
      let chunk = chunkOf.get(declaration);
      if (!chunk) {
        try {
          chunk = this.emit(declaration, (input) =>
            this._writer.writeDeclaration({
              ...input,
              globals: declaration.globals,
            }),
          );
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
      if (exportCount(chunk) > 0) {
        functionChunks.add(chunk);
      }
      this.buildBodies(
        declaration,
        chunk,
        chunkOf,
        coverage,
        (construct, line) => {
          fallback ??= { construct, uri: declaration.uri, line };
        },
        (ownerId, block, body, bodyArrays, seqId) => {
          sequences.set(seqId, {
            id: seqId,
            arrays: bodyArrays,
            flow: -1,
            kind: SymbolKind.Root,
            owner: ownerId,
            block,
            uri: declaration.uri,
            firstLine: body.firstLine,
            span: body.span,
          });
        },
        previous,
        functionChunks,
        false,
      );
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
    const functionsChanged =
      functionChunks.size !== this._functionChunks.size ||
      [...functionChunks].some((chunk) => !this._functionChunks.has(chunk));
    const declarationsChanged =
      !previous ||
      declarationsEmitted ||
      !sameChunks(oldDeclarations, declarationChunks) ||
      functionsChanged;
    const definitions = fallback
      ? undefined
      : this.definitionArrays(flows, symbols, sequences, (construct) => {
          fallback ??= { construct, uri: flows[0]?.uri ?? "", line: 0 };
        });
    if (fallback || !definitions) {
      return { fallback, coverage, declarationsChanged };
    }
    for (const ids of scriptFlows.values()) {
      ids.sort(
        (a, b) => sequences.get(a)!.firstLine - sequences.get(b)!.firstLine,
      );
    }
    const root = new ProgramRoot(
      snapshotTable(this.table),
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
      definitions,
      new Map(this._labels),
      this._symbolRemaps,
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
      this._functionChunks = functionChunks;
    }
    return { root, coverage, declarationsChanged };
  }

  /**
   * The root's definition arrays (docs/engine/binary-program.md, section 2,
   * Resolution): each flow at the start of its sequence, with its kind, a
   * branch's scene and the branch a scene with no content of its own enters;
   * each symbol a chunk exports at the chunk and the offset that defines it,
   * a label where its `Visit` stands and a function at its entry; and the
   * kind of each alternator. A label whose qualified name another label or a
   * flow of the program has makes the program fall back, naming
   * `a label named as another`, since a jump to the name could reach either.
   */
  protected definitionArrays(
    flows: readonly FlowSource[],
    symbols: readonly number[],
    sequences: ReadonlyMap<number, SequenceRow>,
    fail: (construct: string) => void,
  ): DefinitionArrays | undefined {
    const defs = emptyDefinitions(this.table.symbols.length);
    for (const row of sequences.values()) {
      if (row.owner < 0 && row.flow >= 0) {
        defs.sequence[row.flow] = row.id;
        defs.kind[row.flow] = row.kind;
      }
    }
    flows.forEach((flow, f) => {
      const symbol = symbols[f]!;
      if (flow.kind === SymbolKind.Branch) {
        const scene = this.table.symbolIds.get(
          flow.name.slice(0, flow.name.lastIndexOf(".")),
        );
        if (scene !== undefined && defs.kind[scene] === SymbolKind.Scene) {
          defs.parent[symbol] = scene;
        }
      }
      if (flow.startsWith !== undefined) {
        const start = this.table.symbolIds.get(flow.startsWith);
        if (start !== undefined && defs.kind[start] === SymbolKind.Branch) {
          defs.start[symbol] = start;
        }
      }
    });
    let failed = false;
    for (const row of sequences.values()) {
      for (const chunk of row.arrays.chunks) {
        for (let r = 0; r < exportCount(chunk); r += 1) {
          const symbol = exportSymbol(chunk, r);
          const offset = exportOffset(chunk, r);
          const label = exportsLabel(chunk, r);
          const before = defs.kind[symbol]!;
          if (
            before !== UNDEFINED_KIND &&
            (label || before === SymbolKind.Label)
          ) {
            failed = true;
          }
          defs.chunk[symbol] = chunkId(chunk);
          defs.offset[symbol] = offset;
          defs.kind[symbol] = label ? SymbolKind.Label : SymbolKind.Function;
        }
        for (const part of this._info.get(chunk)?.alternators ?? []) {
          if (part.symbol < defs.kind.length) {
            defs.kind[part.symbol] = SymbolKind.Alternator;
            // What its shuffle is seeded from: its flow's name and its own
            // source, which no compile renumbers.
            const flow = row.flow >= 0 ? this.table.symbols[row.flow] : "";
            this._labels.set(part.symbol, `${flow}:${part.fingerprint}`);
          }
        }
      }
    }
    if (failed) {
      fail("a label named as another");
      return undefined;
    }
    return defs;
  }

  // Whether the last declarations run raised an error, which runs them again
  // on the next compile.
  protected _declarationsFailed = false;

  // The symbol remap of each reseed of the session, by the table generation
  // it maps from, which every root reads an older symbol value through.
  protected _symbolRemaps: Int32Array[] = [];

  /**
   * Starts a new generation of the table (docs/engine/binary-program.md,
   * section 2, Reseed). The symbols the current root holds, its flows', the
   * labels and functions its chunks export and the alternators its
   * statements write, are interned again, and every other entry is dropped,
   * so the next compile emits every chunk again. The record of the anonymous
   * symbol each part of a statement owns is remapped with them, so that
   * compile hands every part the symbol it had, and a symbol value made
   * before the reseed takes its id through the remap the store keeps. The
   * table's arrays are replaced, not cleared, so every root built before the
   * reseed goes on reading the generation it was built in
   * (`ProgramRoot.table`). The compiler reseeds through here
   * (`SparkdownCompiler.maybeReseedBinaryTable`).
   */
  reseed(): void {
    const root = this.current;
    const chunks = root ? [...root.statementOrder(), ...root.initialization] : [];
    const live = new Set<number>();
    for (const row of root?.sequences() ?? []) {
      if (row.flow >= 0) {
        live.add(row.flow);
      }
    }
    for (const chunk of chunks) {
      for (const part of this._info.get(chunk)?.parts ?? []) {
        live.add(part.symbol);
      }
      for (const part of this._info.get(chunk)?.alternators ?? []) {
        live.add(part.symbol);
      }
      for (let r = 0; r < exportCount(chunk); r += 1) {
        live.add(exportSymbol(chunk, r));
      }
    }
    const remap = reseedProgramTable(this.table, { symbols: live });
    renumberAnonymousSymbols(this.table);
    this._symbolRemaps[remap.generation - 1] = remap.symbols;
    for (const chunk of chunks) {
      const info = this._info.get(chunk);
      if (info) {
        this._info.set(chunk, {
          ...info,
          parts: info.parts.map((part) => ({
            ...part,
            symbol: remap.symbols[part.symbol]!,
          })),
          alternators: info.alternators.map((part) => ({
            ...part,
            symbol: remap.symbols[part.symbol]!,
          })),
          anonymousReferences: info.anonymousReferences
            .map((symbol) => remap.symbols[symbol]!)
            .filter((symbol) => symbol >= 0),
        });
      }
    }
  }

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

  // The flows the build in progress defines, each with the facts a chunk
  // that refers to it depends on, the symbols it gives the functions of the
  // program (a function's `FlowBase`) with the name each is shown by, the
  // functions each statement writes, and the chunks it has placed, so that
  // no chunk stands in two places of one root.
  protected _definedFacts = new Map<number, string>();
  protected _functionSymbols = new Map<object, number>();
  protected _labels = new Map<number, string>();
  protected _plans = new Map<StatementSource, FunctionPlan>();
  protected _used = new Set<StatementChunk>();
  // The old owner each statement emitted again in place takes its bodies'
  // sequence ids and its functions' symbols from.
  protected _inherit = new Map<StatementSource, StatementChunk>();
  // The anonymous symbols of other statements' functions that the chunk
  // being emitted refers to.
  protected _referenced: Set<number> | null = null;
  // The symbol of each alternator of the statement being emitted.
  protected _alternatorPlan: Map<object, number> | null = null;

  /** The anonymous symbol of an alternator of the statement being emitted:
   *  the one its alignment with the old chunk's alternators gave it, or a
   *  new one. */
  protected alternatorOf(sequence: object): number {
    let symbol = this._alternatorPlan?.get(sequence);
    if (symbol === undefined) {
      symbol = anonymousSymbol(this.table);
      this._alternatorPlan?.set(sequence, symbol);
    }
    return symbol;
  }

  /** What a chunk that refers to `symbol` depends on: the kind the program
   *  being built defines it as (and a function's parameters), or that the
   *  program does not define it. An anonymous symbol's function is another
   *  statement's, whose symbol the build checks for itself
   *  (`anonymousReferencesHold`). */
  protected factsOf(symbol: number): string {
    if (isAnonymousSymbol(this.table, symbol)) {
      return "anonymous";
    }
    return this._definedFacts.get(symbol) ?? "undefined";
  }

  /** The symbol of a function of the program being built: the one planned
   *  for a function a statement writes, or for a flow of the program, its
   *  qualified name's. */
  protected symbolOf(fn: object): number | undefined {
    let symbol = this._functionSymbols.get(fn);
    if (symbol === undefined && fn instanceof FlowBase) {
      const name = qualifiedFlowName(fn);
      const id = name === null ? undefined : this.table.symbolIds.get(name);
      if (id !== undefined && this._definedFacts.has(id)) {
        symbol = id;
      }
    }
    if (
      symbol !== undefined &&
      this._referenced &&
      isAnonymousSymbol(this.table, symbol)
    ) {
      this._referenced.add(symbol);
    }
    return symbol;
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

  /** Gives each function `statement` writes its symbol, and the old block
   *  its body takes its sequence id from: a function declared at the top
   *  level its name's; a kept chunk's functions the symbols the chunk has; a
   *  statement emitted again in place the anonymous symbols of its old
   *  chunk's functions, by aligning the functions by their own source; and
   *  any other function a new anonymous symbol. A name's symbol goes only to
   *  the function declared under the name, so a function that an edit moves
   *  inside another is not given it by its old statement. */
  protected planFunctions(
    statement: StatementSource,
    chunk: StatementChunk | undefined,
  ): void {
    const bodies = statement.bodies ?? [];
    if (!bodies.some((body) => body.fn)) {
      return;
    }
    const plan: FunctionPlan = {
      symbols: bodies.map(() => undefined),
      oldBlocks: bodies.map(() => undefined),
    };
    this._plans.set(statement, plan);
    const functions = bodies.flatMap((body, k) => (body.fn ? [k] : []));
    if (statement.defines !== undefined) {
      const symbol = internSymbol(this.table, statement.defines);
      for (const k of functions) {
        plan.symbols[k] = symbol;
      }
    } else if (chunk) {
      const parts = this._info.get(chunk)?.parts ?? [];
      functions.forEach((k, i) => {
        plan.symbols[k] = parts[i]?.symbol;
      });
    } else {
      const inherited = this._inherit.get(statement);
      const oldParts = inherited ? (this._info.get(inherited)?.parts ?? []) : [];
      const pairs = alignParts(
        functions.map((k) => fingerprintOf(bodies[k]!)),
        oldParts.map((part) => part.fingerprint),
      );
      functions.forEach((k, i) => {
        const part = pairs[i] === undefined ? undefined : oldParts[pairs[i]!];
        if (part && isAnonymousSymbol(this.table, part.symbol)) {
          plan.symbols[k] = part.symbol;
          plan.oldBlocks[k] = part.block;
        }
      });
    }
    for (const k of functions) {
      const fn = bodies[k]!.fn!;
      plan.symbols[k] ??= anonymousSymbol(this.table);
      this._functionSymbols.set(fn, plan.symbols[k]!);
      this._labels.set(
        plan.symbols[k]!,
        statement.defines ?? functionLabel(fn),
      );
    }
  }

  /** Whether the functions of other statements that `chunk`'s code calls by
   *  an anonymous symbol still have those symbols in the build. The objects
   *  are read as the writer emits them and `resolutionsOf` reads them: a
   *  declaration a flow's statement holds emits nothing where it is written,
   *  since its initializer is the declaration sequence's code, whose
   *  functions the declaration's own statement plans. */
  protected anonymousReferencesHold(
    chunk: StatementChunk,
    statement: StatementSource,
  ): boolean {
    const recorded = this._info.get(chunk)?.anonymousReferences ?? [];
    const own = new Set(this._plans.get(statement)?.symbols ?? []);
    const now = new Set<number>();
    const exclude = bodyObjects(statement);
    const visit = (obj: ParsedObject) => {
      if (
        exclude?.has(obj) ||
        obj instanceof ConstantDeclaration ||
        (obj instanceof VariableAssignment && obj.isGlobalDeclaration)
      ) {
        return;
      }
      // Of a function the statement runs in place, the chunk's code declares
      // the locals its lowering hoisted (`emitFunctionInPlace`): its body,
      // and the functions declared in it, are other chunks' code.
      if (obj instanceof FlowBase) {
        (functionShapeOf.get(obj)?.hoisted ?? []).forEach(visit);
        return;
      }
      const target =
        obj instanceof DivertTarget
          ? obj.divert.targetContent
          : obj instanceof FunctionCall && obj.isUserCall
            ? obj.proxyDivert.targetContent
            : null;
      const symbol = target ? this._functionSymbols.get(target) : undefined;
      if (
        symbol !== undefined &&
        !own.has(symbol) &&
        isAnonymousSymbol(this.table, symbol)
      ) {
        now.add(symbol);
      }
      const children = obj instanceof FunctionCall ? obj.args : obj.content;
      for (const child of children ?? []) {
        visit(child);
      }
    };
    statement.objects.forEach(visit);
    return (
      now.size === recorded.length && recorded.every((symbol) => now.has(symbol))
    );
  }

  /** Emits `statement`'s chunk through `write`, with the blocks of its
   *  bodies: a body keeps the sequence id of the old owner's block it is
   *  aligned with when the statement is emitted again in place (a block
   *  statement's bodies in order, a function's by its alignment), and takes
   *  a new one otherwise. */
  protected emit(
    statement: StatementSource,
    write: (input: {
      objects: readonly ParsedObject[];
      range: DebugMetadata | null;
      firstLine: number;
      source: string;
      chunkId: number;
      blocks: BlockInput[];
      lineEnd?: (line: number) => number;
      definesOnly: boolean;
    }) => {
      chunk: StatementChunk;
      reads: readonly string[];
      resolutions: readonly string[];
    },
  ): StatementChunk {
    const bodies = statement.bodies ?? [];
    const inherited = this._inherit.get(statement);
    const plan = this._plans.get(statement);
    const oldControl: number[] = [];
    if (inherited) {
      for (let k = 0; k < blockCount(inherited); k += 1) {
        if (!(blockFlags(inherited, k) & BLOCK_FUNCTION)) {
          oldControl.push(k);
        }
      }
    }
    let control = 0;
    const blocks: BlockInput[] = bodies.map((body, k) => {
      const oldBlock = body.fn ? plan?.oldBlocks[k] : oldControl[control++];
      return {
        body: body.shape,
        sequenceId:
          inherited && oldBlock !== undefined
            ? blockField(inherited, oldBlock, B_SEQUENCE)
            : this._nextSequenceId++,
        headLines: body.headLines,
        firstLine: body.firstLine,
        span: body.span,
        fn: body.fn ? functionInput(body.fn, plan!.symbols[k]!) : undefined,
      };
    });
    // The alternators the statement writes keep the symbols of the old
    // chunk's that they align with by their own source (section 2), and any
    // other takes a new anonymous symbol when the writer first asks for it.
    const alternators = alternatorsOf(statement);
    const fingerprints = alternators.map((sequence) =>
      alternatorFingerprint(sequence, statement.text),
    );
    const alternatorPlan = new Map<object, number>();
    if (inherited) {
      const old = this._info.get(inherited)?.alternators ?? [];
      const pairs = alignParts(
        fingerprints,
        old.map((part) => part.fingerprint),
      );
      alternators.forEach((sequence, i) => {
        const part = pairs[i] === undefined ? undefined : old[pairs[i]!];
        if (part) {
          alternatorPlan.set(sequence, part.symbol);
        }
      });
    }
    this._alternatorPlan = alternatorPlan;
    const referenced = new Set<number>();
    this._referenced = referenced;
    let emitted;
    try {
      emitted = write({
        objects: statement.objects,
        range: statement.range,
        firstLine: statement.firstLine,
        source: statement.source(),
        chunkId: this._nextChunkId++,
        blocks,
        lineEnd: statement.lineEnd,
        definesOnly: statement.defines !== undefined,
      });
    } finally {
      this._referenced = null;
      this._alternatorPlan = null;
    }
    const own = new Set(plan?.symbols ?? []);
    const chunk = emitted.chunk;
    this._info.set(chunk, {
      syntax: statement.syntax(),
      reads: statement.reads,
      emitReads: emitted.reads,
      resolutions: emitted.resolutions,
      globals: assignedNames(statement),
      defines: statement.defines,
      parts: bodies.flatMap((body, k) =>
        body.fn
          ? [{ fingerprint: fingerprintOf(body), symbol: plan!.symbols[k]!, block: k }]
          : [],
      ),
      alternators: alternators.flatMap((sequence, i) => {
        const symbol = alternatorPlan.get(sequence);
        return symbol === undefined
          ? []
          : [{ fingerprint: fingerprints[i]!, symbol }];
      }),
      anonymousReferences: [...referenced].filter((s) => !own.has(s)),
      hoisted: hoistedOf(statement),
      params: paramsOf(statement),
      generation: this.table.generation,
    });
    return chunk;
  }

  /** The arrays of the sequence of `statements`, whose body starts on line
   *  `firstLine`, emitting the chunks alignment gave none, and the rows of
   *  the sequences of their bodies through `addBody`. The chunks that hold a
   *  function's code go into `functionChunks`: every chunk of a sequence
   *  inside a function (`inFunction`), and every chunk that writes one. */
  protected buildSequence(
    statements: readonly StatementSource[],
    firstLine: number,
    chunkOf: ReadonlyMap<StatementSource, StatementChunk | undefined>,
    coverage: ProgramCoverage,
    fail: (construct: string, line: number) => void,
    before: SequenceArrays | undefined,
    addBody: AddBody,
    previous: ProgramRoot | undefined,
    functionChunks: Set<StatementChunk>,
    inFunction: boolean,
  ): SequenceArrays {
    const chunks: StatementChunk[] = [];
    const lineStarts: number[] = [];
    for (const statement of statements) {
      coverage.statements += 1;
      let chunk = chunkOf.get(statement);
      if (!chunk) {
        try {
          chunk = this.emit(statement, (input) => this._writer.write(input));
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
      if (inFunction || exportsFunction(chunk)) {
        functionChunks.add(chunk);
      }
      this.buildBodies(
        statement,
        chunk,
        chunkOf,
        coverage,
        fail,
        addBody,
        previous,
        functionChunks,
        inFunction,
      );
    }
    return before && sameArrays(before, chunks, lineStarts)
      ? before
      : { chunks, lineStarts };
  }

  /** The sequences of `statement`'s bodies, each under the id its chunk's
   *  block table names. A function's body is inside a function. */
  protected buildBodies(
    statement: StatementSource,
    chunk: StatementChunk,
    chunkOf: ReadonlyMap<StatementSource, StatementChunk | undefined>,
    coverage: ProgramCoverage,
    fail: (construct: string, line: number) => void,
    addBody: AddBody,
    previous: ProgramRoot | undefined,
    functionChunks: Set<StatementChunk>,
    inFunction: boolean,
  ): void {
    (statement.bodies ?? []).forEach((body, k) => {
      const id = blockField(chunk, k, B_SEQUENCE);
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
        functionChunks,
        inFunction || !!body.fn,
      );
      addBody(chunkId(chunk), k, body, arrays, id);
    });
  }

  /**
   * The chunk each statement keeps, by the identity rule, or nothing for a
   * statement to emit. `statements` and `old` are the new and the previous
   * program's statements in order, and `kept` holds the chunks of the
   * statements whose block the store emitted a chunk for. The others are
   * aligned with the old chunks: between two statements that kept old chunks,
   * the old and new statements are matched from both ends and then in order
   * by their syntax. A statement matched with an old chunk it can keep, one
   * whose syntax and recorded lowering inputs read the same as its own while
   * the chunk's recorded values and facts hold, takes it; one matched with an
   * old chunk it cannot keep is emitted again in place, taking what belongs
   * to the old chunk's parts (`_inherit`), unless another statement no pass
   * has matched can keep that chunk, which then waits for it (#1496). The one
   * statement left on each side of a run keeps the old one when it can, as
   * two statements an edit swapped do, and is otherwise emitted again in
   * place; of the statements left, only the outermost count: the statements
   * of a left statement's bodies are part of it, as the statements of a
   * function written on its owner's line are, whose columns move when a
   * function is inserted before it (`nesting`). The statements no run
   * matched then take the old chunks no run took that they can keep,
   * wherever those were, as statements an edit moved past an anchor or
   * swapped among others do (#1221), and are matched with the rest in order
   * by their syntax.
   */
  protected align(
    statements: readonly StatementSource[],
    old: readonly StatementChunk[],
    kept: readonly (StatementChunk | undefined)[],
    nesting?: {
      owner(statement: StatementSource): StatementSource | undefined;
      oldOwner(chunk: StatementChunk): StatementChunk | undefined;
    },
  ): (StatementChunk | undefined)[] {
    const used = this._used;
    const oldEntry = new Map<StatementChunk, number>();
    old.forEach((chunk, entry) => oldEntry.set(chunk, entry));
    // Anchors: statements that kept a chunk of the old sequence, in order.
    let lastOld = -1;
    let runStart = 0;
    const result = kept.slice();
    // What a statement and an old chunk it keeps read the same in: its syntax
    // and its recorded lowering inputs.
    const identityOf = (syntax: string, reads: string) => `${syntax}\u0000${reads}`;
    // Whether an old chunk's own recorded facts hold in this build, which no
    // statement changes (`factsHold`): a chunk whose facts fail is kept by no
    // statement, so it is checked once.
    const viable = new Map<StatementChunk, boolean>();
    const viableChunk = (chunk: StatementChunk): boolean => {
      let holds = viable.get(chunk);
      if (holds === undefined) {
        holds = this.factsHold(chunk);
        viable.set(chunk, holds);
      }
      return holds;
    };
    // Whether the statement can keep the old chunk: no statement took it, its
    // syntax and recorded lowering inputs read the same as the statement's,
    // and its recorded values and facts hold.
    const keeps = (i: number, o: number): boolean => {
      const chunk = old[o]!;
      const info = this._info.get(chunk);
      const statement = statements[i]!;
      return (
        !!info &&
        !used.has(chunk) &&
        info.syntax === statement.syntax() &&
        info.reads === statement.reads &&
        viableChunk(chunk) &&
        this.holds(chunk, statement)
      );
    };
    // The statements no pass has matched yet, by identity, so the statements
    // that could keep an old chunk are found without scanning the program.
    const waiting = new Map<string, number[]>();
    statements.forEach((statement, i) => {
      if (!result[i]) {
        const identity = identityOf(statement.syntax(), statement.reads);
        const bucket = waiting.get(identity);
        if (bucket) {
          bucket.push(i);
        } else {
          waiting.set(identity, [i]);
        }
      }
    });
    // Whether a statement other than `by` that no pass has matched can keep
    // the old chunk.
    const wanted = (o: number, by: number): boolean => {
      const chunk = old[o]!;
      const info = this._info.get(chunk);
      if (!info || !viableChunk(chunk)) {
        return false;
      }
      const bucket = waiting.get(identityOf(info.syntax, info.reads)) ?? [];
      return bucket.some(
        (j) =>
          j !== by &&
          !result[j] &&
          !this._inherit.has(statements[j]!) &&
          this.holds(chunk, statements[j]!),
      );
    };
    // Pairs a statement with an old chunk of its syntax: it keeps the chunk
    // when it can; otherwise it is emitted again in place, taking what
    // belongs to the old chunk's parts (`_inherit`), unless another
    // statement no pass has matched can keep that chunk, which then waits
    // for it. Pairing a statement by its syntax alone with a chunk another
    // statement keeps would emit both again (#1496).
    const take = (i: number, o: number): boolean => {
      const chunk = old[o]!;
      const info = this._info.get(chunk);
      const statement = statements[i]!;
      if (
        !info ||
        used.has(chunk) ||
        this._inherit.has(statement) ||
        info.syntax !== statement.syntax()
      ) {
        return false;
      }
      if (keeps(i, o)) {
        used.add(chunk);
        result[i] = chunk;
        return true;
      }
      if (wanted(o, i)) {
        return false;
      }
      used.add(chunk);
      this._inherit.set(statement, chunk);
      return true;
    };
    const matchRun = (newFrom: number, newTo: number, oldFrom: number, oldTo: number) => {
      const candidates: number[] = [];
      for (let i = newFrom; i < newTo; i += 1) {
        if (!result[i] && !this._inherit.has(statements[i]!)) {
          candidates.push(i);
        }
      }
      const olds: number[] = [];
      for (let o = oldFrom; o < oldTo; o += 1) {
        if (!used.has(old[o]!)) {
          olds.push(o);
        }
      }
      if (candidates.length === 0 || olds.length === 0) {
        return;
      }
      const syntaxOf = (o: number) => this._info.get(old[o]!)?.syntax;
      // From the front, then from the back, while the syntax matches and
      // the pairing holds.
      let front = 0;
      while (
        front < candidates.length &&
        front < olds.length &&
        syntaxOf(olds[front]!) === statements[candidates[front]!]!.syntax() &&
        take(candidates[front]!, olds[front]!)
      ) {
        front += 1;
      }
      let back = 0;
      while (
        back < candidates.length - front &&
        back < olds.length - front &&
        syntaxOf(olds[olds.length - 1 - back]!) ===
          statements[candidates[candidates.length - 1 - back]!]!.syntax() &&
        take(
          candidates[candidates.length - 1 - back]!,
          olds[olds.length - 1 - back]!,
        )
      ) {
        back += 1;
      }
      // In between, in order, each statement with the next old one that reads
      // the same, found through the positions of each syntax among `olds`
      // rather than by scanning the run.
      const at = new Map<string, number[]>();
      for (let k = front; k < olds.length - back; k += 1) {
        const syntax = syntaxOf(olds[k]!);
        if (syntax !== undefined) {
          const positions = at.get(syntax);
          if (positions) {
            positions.push(k);
          } else {
            at.set(syntax, [k]);
          }
        }
      }
      let o = front;
      for (let c = front; c < candidates.length - back; c += 1) {
        const positions = at.get(statements[candidates[c]!]!.syntax());
        if (!positions) {
          continue;
        }
        let lo = 0;
        let hi = positions.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (positions[mid]! < o) {
            lo = mid + 1;
          } else {
            hi = mid;
          }
        }
        if (lo < positions.length && take(candidates[c]!, olds[positions[lo]!]!)) {
          o = positions[lo]! + 1;
        }
      }
      // A statement edited in place: one left on each side, counting the
      // outermost of those left.
      const outermost = <T>(
        left: readonly number[],
        item: (index: number) => T,
        owner: ((of: T) => T | undefined) | undefined,
      ): number[] => {
        const held = new Set(left.map(item));
        return left.filter((index) => {
          for (let at = owner?.(item(index)); at; at = owner?.(at)) {
            if (held.has(at)) {
              return false;
            }
          }
          return true;
        });
      };
      const leftNew = outermost(
        candidates.filter((i) => !result[i] && !this._inherit.has(statements[i]!)),
        (i) => statements[i]!,
        nesting?.owner,
      );
      const leftOld = outermost(
        olds.filter((k) => !used.has(old[k]!)),
        (k) => old[k]!,
        nesting?.oldOwner,
      );
      // A block statement keeps its bodies' sequence ids that way, and a
      // statement that writes alternators keeps their count symbols, which
      // its alternators align with by their own source.
      const ownsParts = (statement: StatementSource, chunk: StatementChunk) =>
        ((statement.bodies?.length ?? 0) > 0 && blockCount(chunk) > 0) ||
        (alternatorsOf(statement).length > 0 &&
          (this._info.get(chunk)?.alternators.length ?? 0) > 0);
      if (leftNew.length === 1 && leftOld.length === 1) {
        const i = leftNew[0]!;
        const k = leftOld[0]!;
        // Two statements an edit swapped cross over each other, so the
        // passes above match only one of them; the other, left alone with
        // its own old chunk, keeps it (#1496).
        if (keeps(i, k)) {
          used.add(old[k]!);
          result[i] = old[k]!;
        } else if (ownsParts(statements[i]!, old[k]!) && !wanted(k, i)) {
          used.add(old[k]!);
          this._inherit.set(statements[i]!, old[k]!);
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
    // Statements an edit moved past the anchors, as a scene's statements
    // move into the flow above when its header is broken, find their old
    // chunks outside their run, as do statements an edit swapped among
    // others: the statements no run matched first take the old chunks no run
    // took that they can keep, then are matched with the rest in order, by
    // syntax.
    const byIdentity = new Map<string, number[]>();
    const bySyntax = new Map<string, number[]>();
    const add = (map: Map<string, number[]>, key: string, o: number) => {
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(o);
      } else {
        map.set(key, [o]);
      }
    };
    old.forEach((chunk, o) => {
      const info = used.has(chunk) ? undefined : this._info.get(chunk);
      if (info) {
        if (viableChunk(chunk)) {
          add(byIdentity, identityOf(info.syntax, info.reads), o);
        }
        add(bySyntax, info.syntax, o);
      }
    });
    statements.forEach((statement, i) => {
      if (!result[i] && !this._inherit.has(statement)) {
        const bucket = byIdentity.get(identityOf(statement.syntax(), statement.reads));
        const k = bucket?.findIndex((o) => keeps(i, o)) ?? -1;
        if (k >= 0) {
          take(i, bucket!.splice(k, 1)[0]!);
        }
      }
    });
    statements.forEach((statement, i) => {
      if (!result[i] && !this._inherit.has(statement)) {
        const bucket = bySyntax.get(statement.syntax());
        while (bucket?.length) {
          const o = bucket.shift()!;
          if (!used.has(old[o]!)) {
            take(i, o);
            break;
          }
        }
      }
    });
    return result;
  }

  /** Whether a chunk's recorded values and facts still hold for `statement`. */
  protected holds(chunk: StatementChunk, statement: StatementSource): boolean {
    const info = this._info.get(chunk);
    if (
      !info ||
      info.globals !== assignedNames(statement) ||
      info.defines !== statement.defines ||
      info.hoisted !== hoistedOf(statement) ||
      info.params !== paramsOf(statement)
    ) {
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
    const resolutions = resolutionsOf(
      [...statement.objects, ...hoistedLocals(statement)],
      exclude,
    );
    if (
      resolutions.length !== info.resolutions.length ||
      resolutions.some((value, i) => value !== info.resolutions[i])
    ) {
      return false;
    }
    const bodies = statement.bodies ?? [];
    if (
      bodies.length !== blockCount(chunk) ||
      bodies.some(
        (body, k) => !!body.fn !== !!(blockFlags(chunk, k) & BLOCK_FUNCTION),
      )
    ) {
      return false;
    }
    return this.factsHold(chunk);
  }

  /** Whether the facts a chunk recorded about itself still hold in the build
   *  in progress, whatever statement it is kept for: its ids belong to the
   *  table's generation, and every fact its reference table records about a
   *  symbol is unchanged. */
  protected factsHold(chunk: StatementChunk): boolean {
    const info = this._info.get(chunk);
    if (!info || info.generation !== this.table.generation) {
      return false;
    }
    const start = referenceTableStart(chunk);
    for (let r = 0; r < chunk[H_REFERENCE_ROWS]!; r += 1) {
      const at = start + r * REFERENCE_ROW_WORDS;
      // A jump, a count or a symbol value of a scene, a branch or a label
      // depends on no fact about its symbol (`referenceTarget`).
      if (chunk[at + 1] === NO_FACTS) {
        continue;
      }
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

  /** The function declared at the top level that the statement a chunk was
   *  emitted or reused for defines, for a test that keys statements by what
   *  their chunks depend on: which of the functions of one name the story
   *  defines under it depends on the others. */
  definesOf(chunk: StatementChunk): string | undefined {
    return this._info.get(chunk)?.defines;
  }
}

type AddBody = (
  owner: number,
  block: number,
  body: BodySource,
  arrays: SequenceArrays,
  id: number,
) => void;

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

/** What a chunk that refers to a flow depends on: its kind, and for a
 *  function the kind of each of its parameters, which decide the code of a
 *  call. */
const flowFacts = (flow: FlowSource): string => {
  if (flow.kind !== SymbolKind.Function) {
    return `defined:${flow.kind}`;
  }
  const fn = flow.statements[0]?.bodies?.find((body) => body.fn)?.fn;
  return `defined:${flow.kind}:${paramKinds(fn)}`;
};

const paramKinds = (fn: ParsedObject | undefined): string =>
  ((fn as FlowBase | undefined)?.args ?? [])
    .map((p) => (p.isByReference ? "ref" : p.isVararg ? "..." : "value"))
    .join(",");

/** The functions whose entry a statement's code holds: each function it
 *  writes (`functionInput`) and each it runs in place
 *  (`emitFunctionInPlace`), in order. */
const entryFunctions = (statement: StatementSource): ParsedObject[] => [
  ...(statement.bodies ?? []).flatMap((body) => (body.fn ? [body.fn] : [])),
  ...statement.objects.filter((obj) => obj instanceof FlowBase),
];

/** The locals each function whose entry a statement's code holds declares
 *  there, in order, which the lowering hoists from inside the function's
 *  body (a function it declares without `local`), function by function: the
 *  entry code is the statement's, while the lines that hoist them are the
 *  body's. */
const hoistedOf = (statement: StatementSource): string =>
  entryFunctions(statement)
    .map((fn) =>
      (functionShapeOf.get(fn)?.hoisted ?? [])
        .map((local) =>
          local instanceof VariableAssignment
            ? (local.variableName ?? "")
            : local.typeName,
        )
        .join(","),
    )
    .join(";");

/** The parameters each function whose entry a statement's code holds binds
 *  there. The lowering takes them from the function's parameter list, which
 *  a header the parser could not read whole can find on a later line, inside
 *  the body the statement's syntax leaves out. */
const paramsOf = (statement: StatementSource): string =>
  entryFunctions(statement)
    .map((fn) =>
      ((fn as FlowBase).args ?? [])
        .map((arg) => `${arg.identifier?.name ?? ""}${arg.isVararg ? "..." : ""}`)
        .join(","),
    )
    .join(";");

/** The declarations of the locals `hoistedOf` names, which the functions'
 *  entry code emits among the statement's own code. */
const hoistedLocals = (statement: StatementSource): ParsedObject[] =>
  (statement.bodies ?? []).flatMap((body) =>
    body.fn ? (functionShapeOf.get(body.fn)?.hoisted ?? []) : [],
  );

/** What the writer needs of a function whose body is a block. */
const functionInput = (fn: ParsedObject, symbol: number): FunctionInput => {
  const flow = fn as FlowBase;
  return {
    symbol,
    params: (flow.args ?? []).map((arg) => ({
      name: arg.identifier?.name ?? "",
      vararg: !!arg.isVararg,
    })),
    hoisted: functionShapeOf.get(fn)?.hoisted ?? [],
    range: flow.ownDebugMetadata,
  };
};

/** Whether a chunk's export row `r` is a label's: a label is exported at
 *  the `Visit` of its own symbol, and any other export is a function's. */
const exportsLabel = (chunk: StatementChunk, r: number): boolean => {
  const offset = exportOffset(chunk, r);
  return (
    offset < codeWords(chunk) &&
    opOf(chunk[HEADER_WORDS + offset]!) === Op.Visit &&
    chunk[HEADER_WORDS + offset + 1] === exportSymbol(chunk, r)
  );
};

/** Whether a chunk exports a function: an export that is no label's
 *  (`exportsLabel`). A label's chunk holds no function's code, so adding,
 *  removing or renaming one runs no declaration again. */
const exportsFunction = (chunk: StatementChunk): boolean => {
  for (let r = 0; r < exportCount(chunk); r += 1) {
    if (!exportsLabel(chunk, r)) {
      return true;
    }
  }
  return false;
};

/** The alternators (`Sequence`s) a statement's own code writes, in the order
 *  the writer meets them: none of its bodies' statements, and none of a
 *  function's body, which are other chunks' code. */
const alternatorsOf = (statement: StatementSource): Sequence[] => {
  const out: Sequence[] = [];
  const exclude = bodyObjects(statement);
  const visit = (obj: ParsedObject) => {
    if (exclude?.has(obj) || obj instanceof FlowBase) {
      return;
    }
    if (obj instanceof Sequence) {
      out.push(obj);
    }
    const children = obj instanceof FunctionCall ? obj.args : obj.content;
    for (const child of children ?? []) {
      visit(child);
    }
  };
  statement.objects.forEach(visit);
  return out;
};

/** What an alternator is aligned by when its statement is emitted again,
 *  and its shuffle seeded from: its own source, normalized, as a function
 *  part's is (docs/engine/binary-program.md, section 2), read through the
 *  statement's `text` from the range its lowering recorded. Without one, its
 *  kind and its arms, read as their text, each object's kind and what each
 *  object prints as (a name, a number, a string, a call, an operation), with
 *  the objects it holds, and a nested alternator by its own kind and arms. A
 *  name the compiler generated is read by the order it first appears in,
 *  since the compiler numbers those names by document order
 *  (`SparkdownCompiler.canonicalizeSyntheticFlowNames`) and an edit above
 *  the statement renumbers them. */
const alternatorFingerprint = (
  sequence: Sequence,
  source?: (from: number, to: number) => string,
): string => {
  const range = alternatorSourceOf.get(sequence);
  if (range && source) {
    return `${sequence.sequenceType}|${normalizeSource(source(range.from, range.to))}`;
  }
  const arms = (seq: Sequence): string =>
    `${seq.sequenceType}|${seq.sequenceElements.map(text).join("|")}`;
  const text = (obj: ParsedObject): string => {
    if (obj instanceof Text) {
      return obj.text;
    }
    if (obj instanceof Sequence) {
      return `Sequence(${arms(obj)})`;
    }
    // Each node's own value too, for one with children as for a leaf: a
    // call's name and an expression's operator tell apart two alternators
    // whose arguments and operands read the same (`a(1)` and `b(1)`).
    const children = obj instanceof FunctionCall ? obj.args : (obj.content ?? []);
    const own = `${obj.typeName}:${String(obj)}`;
    return children.length > 0 ? `${own}(${children.map(text).join("")})` : own;
  };
  const generated = new Map<string, number>();
  return normalizeSource(arms(sequence)).replace(GENERATED_NAMES, (name) => {
    if (!generated.has(name)) {
      generated.set(name, generated.size);
    }
    return `__synth#${generated.get(name)}`;
  });
};

// A name the compiler generates, numbered by document order
// (`SparkdownCompiler.canonicalizeSyntheticFlowNames`).
const GENERATED_NAMES = /__synth_\d+/g;

/** The hash a function part is aligned by: its own source, normalized. */
const fingerprintOf = (body: BodySource): string =>
  normalizeSource(body.partSource?.() ?? "");

/**
 * Aligns the new parts of a statement with the old ones, by their
 * fingerprints, as section 2 aligns a re-emitted statement's parts: parts
 * whose fingerprints are equal and that stand in the same order are matched
 * first, the nearest in order where several read the same; then a part left
 * whose fingerprint equals one left on the other side, wherever it stands;
 * then, in each run of parts left between two matched ones, the old are
 * paired with the new in order. Returns, per new part, the index of its old
 * part, or nothing.
 */
const alignParts = (
  now: readonly string[],
  was: readonly string[],
): (number | undefined)[] => {
  const pairs: (number | undefined)[] = now.map(() => undefined);
  const taken = new Set<number>();
  // Equal and in order.
  let from = 0;
  now.forEach((fingerprint, i) => {
    for (let o = from; o < was.length; o += 1) {
      if (was[o] === fingerprint) {
        pairs[i] = o;
        taken.add(o);
        from = o + 1;
        return;
      }
    }
  });
  // Equal, wherever they stand.
  now.forEach((fingerprint, i) => {
    if (pairs[i] !== undefined) {
      return;
    }
    const o = was.findIndex((w, k) => w === fingerprint && !taken.has(k));
    if (o >= 0) {
      pairs[i] = o;
      taken.add(o);
    }
  });
  // The rest, in order, between matched parts.
  let lastOld = -1;
  for (let i = 0; i < now.length; i += 1) {
    if (pairs[i] !== undefined) {
      lastOld = Math.max(lastOld, pairs[i]!);
      continue;
    }
    for (let o = lastOld + 1; o < was.length; o += 1) {
      if (taken.has(o)) {
        break;
      }
      pairs[i] = o;
      taken.add(o);
      lastOld = o;
      break;
    }
  }
  return pairs;
};

/** A flow's qualified name, or nothing for a flow a statement writes. */
const qualifiedFlowName = (flow: FlowBase): string | null => {
  const names: string[] = [];
  let at: ParsedObject | null = flow;
  while (at && !(at instanceof ParsedStory)) {
    if (at instanceof FlowBase) {
      if (functionShapeOf.has(at)) {
        return null;
      }
      names.unshift(at.identifier?.name ?? "");
    }
    at = at.parent;
  }
  return at ? names.join(".") : null;
};

/** The name a function a statement writes is shown by in a stack trace, as
 *  the current engine names its container: the names of the flows that hold
 *  it and its own, which the compiler gives it. */
const functionLabel = (fn: ParsedObject): string => {
  const names: string[] = [];
  let at: ParsedObject | null = fn;
  while (at && !(at instanceof ParsedStory)) {
    if (at instanceof FlowBase) {
      names.unshift(at.identifier?.name ?? "");
    }
    at = at.parent;
  }
  return names.join(".");
};

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

/** How the names and calls a statement's objects read resolved, sorted, as
 *  the writer records them (`VariableReference.EmitExpression`,
 *  `Divert.EmitCall`), leaving out the objects in `exclude` and the
 *  declarations a flow's statement holds, whose initializers are the
 *  declaration sequence's code and not the statement's. Of a function the
 *  statement runs in place, the chunk's code declares the locals its lowering
 *  hoisted (`emitFunctionInPlace`); its body, and the functions the story
 *  places among its flows, are other chunks' code. */
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
    if (obj instanceof FlowBase) {
      (functionShapeOf.get(obj)?.hoisted ?? []).forEach(visit);
      return;
    }
    if (obj instanceof VariableReference || obj instanceof VariableAssignment) {
      out.push(obj.resolutionKey);
    }
    if (obj instanceof FunctionCall && obj.isUserCall) {
      out.push(obj.proxyDivert.callResolutionKey);
    }
    // The symbol a jump, a tunnel, a thread or a divert target names, and
    // the symbol a label exports (#696).
    if (obj instanceof Divert) {
      const key = obj.programJumpKey;
      if (key !== null) {
        out.push(key);
      }
    }
    if (obj instanceof Gather && obj.name && !isLoopInternal(obj)) {
      out.push(obj.programResolutionKey);
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
