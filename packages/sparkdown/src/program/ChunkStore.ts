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
  loopExitOf,
  partOfBody,
  type BodyShape,
} from "../compiler/lower/utils/statementShape";
import type { DebugMetadata } from "../inkjs/engine/DebugMetadata";
import type { Story } from "../inkjs/engine/Story";
import { Choice } from "../inkjs/compiler/Parser/ParsedHierarchy/Choice";
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
  factsText,
  NO_FACTS,
  normalizeSource,
  type BlockInput,
  type FunctionInput,
} from "./BinaryProgramWriter";
import {
  FACT_KIND,
  FACT_PARAMS,
  parameterKinds,
  UNDEFINED_FACT,
} from "./ProgramFacts";
import { StoryException } from "../inkjs/engine/StoryException";
import { UnsupportedConstruct } from "./ProgramEmitter";
import { ProgramStory } from "./ProgramStory";
import {
  ChunkTable,
  emptyDefinitions,
  holdsChunk,
  holdsChunkIn,
  ProgramRoot,
  type DefinitionArrays,
  type SequenceArrays,
  type SequenceRow,
} from "./ProgramRoot";
import { identityOf, StatementWatch } from "./StatementWatch";
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
  /** The source of the part that heads the body (a branch's condition or
   *  its `else`, a loop's header, a `then` clause), by which the body keeps
   *  its sequence id when the statement is emitted again in place
   *  (docs/engine/binary-program.md, section 2). */
  headSource?: () => string;
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

// One choice a chunk raises: what it is aligned by, its anonymous count
// symbol (-1 for a named choice, which counts under its label's), and the
// block its body is (-1 for a choice whose body is no block).
interface ChoicePart {
  fingerprint: string;
  symbol: number;
  block: number;
}

// One body a chunk's block statement holds that neither a choice nor a
// function heads: the fingerprint of its heading part, and its block.
interface HeadPart {
  fingerprint: string;
  block: number;
}

/** How a body of a statement emitted in place got its sequence id: by the
 *  pass of the alignment (`alignParts`) that paired its heading part with an
 *  old one (equal and in order, equal wherever it stands, or between two
 *  matched parts), or a new id. */
export type HandedOn = "aligned" | "aligned-moved" | "between" | "new";

/** One body id a build handed on (`ChunkStore.handedOnLastBuild`). */
export interface BodyHandOff {
  sequenceId: number;
  part: "function" | "choice" | "head";
  how: HandedOn;
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
  /** The choices the statement raises, in order. */
  choices: readonly ChoicePart[];
  /** The bodies that neither a choice nor a function heads (a branch's, a
   *  loop's, a `do` block's, a `then` clause's), each with the fingerprint of
   *  the part that heads it. */
  heads: readonly HeadPart[];
  anonymousReferences: readonly number[];
  /** The locals each function the statement writes declares at its entry
   *  (`hoistedOf`). */
  hoisted: string;
  /** Whether the statement stands in a body or in a flow or a declaration
   *  sequence, which decides the source range the compile gives it
   *  (`placementOf`). */
  placement: string;
  /** The parameters the entry of each function the statement writes or runs
   *  in place binds (`paramsOf`). */
  params: string;
  /** The names of the facts the chunk's code read about each symbol it
   *  refers to, which its reference table row hashes with the values read
   *  (`ProgramEmitter.fact`). */
  facts: ReadonlyMap<number, readonly string[]>;
  generation: number;
}

// The symbols a build gives the functions a statement writes, by body, and
// for a statement emitted again in place, the old block each function's body
// takes its sequence id from, with the pass of the alignment that paired it.
interface FunctionPlan {
  symbols: (number | undefined)[];
  oldBlocks: (number | undefined)[];
  how: (HandedOn | undefined)[];
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
 * emitted again in place: each of its bodies takes the sequence id of the old
 * body whose heading part its own aligns with by its source (`alignParts`),
 * and the functions it writes take the anonymous symbols of the old functions
 * they align with (section 2).
 */
export class ChunkStore {
  readonly table: ProgramTable;

  /** The root of the last compile that was not a preview and did not fall
   *  back. */
  current: ProgramRoot | undefined;

  /** The chunks the last build emitted. */
  emittedLastBuild = 0;

  /** How the last build handed on the sequence id of each body of the
   *  statements it emitted again in place (section 2): every one through
   *  the alignment of its heading part, or a new id. */
  handedOnLastBuild: BodyHandOff[] = [];

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

  /** Where the compile's passes report the statements whose recorded values
   *  read otherwise (`StatementWatch`), which a build reads again. */
  readonly watch = new StatementWatch();

  /** How many chunks each pass of the last build visited. */
  passesLastBuild: BuildPasses = emptyPasses();

  /** Derives each root a build makes from nothing but its sequences, and
   *  throws when the tables the build wrote over the current root's differ
   *  (`verifyRoot`). For tests. */
  static verifyBuilds = false;

  /** The chunks of the current root that read a fact about each symbol:
   *  the reverse index of the reference tables. */
  protected _readers = new Map<number, Set<StatementChunk>>();
  /** The facts the current root's program gives each symbol it defines
   *  (`definitionText`), against which a build finds the symbols whose
   *  facts changed. */
  protected _committedFacts = new Map<number, string>();
  /** The labels of the current root's functions and alternators. */
  protected _committedLabels = new Map<number, string>();
  /** The chunk each statement the build in progress did not carry holds, by
   *  its block, which a committed build gives `_byBlock`. */
  protected _placed = new Map<object, StatementChunk>();
  protected _placedDeclarations = new Map<object, StatementChunk>();
  // Each root's statements in alignment order, with their owners.
  protected _orders = new WeakMap<
    ProgramRoot,
    { order: StatementChunk[]; owners: Map<StatementChunk, StatementChunk> }
  >();
  // How many statements each root holds.
  protected _statementCounts = new WeakMap<ProgramRoot, number>();
  // Whether each sequence of the current root is inside a function, whose
  // chunks then hold a function's code (`_functionChunks`).
  protected _sequenceInFunction = new Map<number, boolean>();

  /** `table` is the compiler's persistent `ProgramTable`, which the store
   *  interns into and keeps no table of its own (#696); a reseed of it goes
   *  through `reseed`. */
  constructor(table: ProgramTable = createProgramTable()) {
    this.table = table;
    this._writer = new BinaryProgramWriter(
      table,
      (symbol, name) => this.factOf(symbol, name),
      (fn) => this.symbolOf(fn),
      (sequence) => this.alternatorOf(sequence),
    );
  }

  /** Builds a root for the program, whose flows are in the order the
   *  program runs them. A build that is not committed (a preview compile's)
   *  leaves `current`, and everything the store keeps of it, as it was.
   *  `runtimeStory` is the current engine's story of the same compile (see
   *  `ProgramRoot.runtimeStory`).
   *
   *  The build is proportional to the edit (docs/engine/binary-program.md,
   *  section 1, Identity): a statement the incremental parse carried, whose
   *  chunk the current root holds, keeps that chunk without a read of its
   *  values or its facts unless the statement watch marked it or a symbol it
   *  read facts about changed (`keepCarried`); a sequence is built again only
   *  where it holds a statement that is not so kept; and the root's tables are
   *  written over the current root's where a chunk was added, moved or
   *  dropped. `passesLastBuild` counts what each pass visited. */
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
    const passes = emptyPasses();
    this.passesLastBuild = passes;
    this.handedOnLastBuild = [];
    const coverage: ProgramCoverage = {
      statements: 0,
      emitted: 0,
      unsupported: {},
    };
    let fallback: ProgramFallback | undefined;
    // Symbols are interned first, so a reference table's facts see every flow
    // this program defines, as the kind this program defines it as, and a
    // function's parameters.
    const symbols = flows.map((flow) => internSymbol(this.table, flow.name));
    this._definitions = new Map(
      flows.map((flow, f) => [symbols[f]!, this.definitionFacts(flow)]),
    );
    this._anonymousDefinitions = new Map();
    this._functionSymbols = new Map();
    this._labels = new Map(this._committedLabels);
    this._plans = new Map();
    this._statementValues = new WeakMap();
    this._statementIdentities = new WeakMap();
    this._placed = new Map();
    this._placedDeclarations = new Map();
    // The symbols whose facts differ from the current root's program, and the
    // chunks of the current root that read a fact about one of them, which
    // are the only chunks whose facts the build reads again before it plans
    // the statements' functions.
    const facts = new Map<number, string>();
    for (const [symbol, defined] of this._definitions) {
      facts.set(symbol, definitionText(defined));
    }
    const flagged = new Set<StatementChunk>();
    const flag = (symbol: number) => {
      for (const chunk of this._readers.get(symbol) ?? []) {
        flagged.add(chunk);
      }
    };
    for (const [symbol, text] of facts) {
      if (this._committedFacts.get(symbol) !== text) {
        flag(symbol);
      }
    }
    for (const symbol of this._committedFacts.keys()) {
      if (!isAnonymousSymbol(this.table, symbol) && !facts.has(symbol)) {
        flag(symbol);
      }
    }
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
          this._inBody.add(statement);
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
    // The statements that keep their chunks with nothing read again.
    const carried = new Set<StatementSource>();
    const kept = statements.map(
      (statement) =>
        this.keepCarried(this._byBlock, statement, previous, flagged, carried) ??
        this.keep(this._byBlock, statement),
    );
    const old = previous ? this.statementOrderOf(previous) : [];
    passes.order = old.length;
    const reused = this.align(statements, old, kept, {
      owner: (statement) => owners.get(statement),
      oldOwner: (chunk) => this.oldOwnerOf(previous!, chunk),
    });
    const chunkOf = new Map<StatementSource, StatementChunk | undefined>();
    statements.forEach((statement, i) => chunkOf.set(statement, reused[i]));
    const oldDeclarations = previous?.initialization ?? [];
    const keptDeclarations = declarations.map(
      (declaration) =>
        this.keepCarried(
          this._byDeclaration,
          declaration,
          previous,
          flagged,
          carried,
        ) ?? this.keep(this._byDeclaration, declaration),
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
    // function by a symbol that function no longer has, or read a fact about
    // a function a statement writes that no longer reads the same, which are
    // emitted again in place. A carried statement's chunk is read again only
    // when it read a fact about such a function.
    const everyStatement = [...statements, ...declarations];
    for (const statement of everyStatement) {
      this.planFunctions(statement, chunkOf.get(statement));
    }
    for (const [symbol, defined] of this._anonymousDefinitions) {
      facts.set(symbol, definitionText(defined));
    }
    const recheck = new Set<StatementChunk>();
    for (const [symbol, text] of facts) {
      if (
        isAnonymousSymbol(this.table, symbol) &&
        this._committedFacts.get(symbol) !== text
      ) {
        for (const chunk of this._readers.get(symbol) ?? []) {
          recheck.add(chunk);
        }
      }
    }
    for (const symbol of this._committedFacts.keys()) {
      if (isAnonymousSymbol(this.table, symbol) && !facts.has(symbol)) {
        for (const chunk of this._readers.get(symbol) ?? []) {
          recheck.add(chunk);
        }
      }
    }
    for (const statement of everyStatement) {
      const chunk = chunkOf.get(statement);
      if (!chunk || (carried.has(statement) && !recheck.has(chunk))) {
        continue;
      }
      passes.anonymous += 1;
      if (
        !this.anonymousReferencesHold(chunk, statement) ||
        !this.factsHold(chunk, true)
      ) {
        chunkOf.set(statement, undefined);
        carried.delete(statement);
        this._inherit.set(statement, chunk);
      }
    }
    // The statements whose bodies a sequence is built for again: each one not
    // carried, and the statements that hold one.
    const unsettled = new Set<StatementSource>();
    for (const statement of everyStatement) {
      if (carried.has(statement)) {
        continue;
      }
      for (
        let at: StatementSource | undefined = statement;
        at && !unsettled.has(at);
        at = owners.get(at)
      ) {
        unsettled.add(at);
      }
    }

    const build: SequenceBuild = {
      previous,
      chunkOf,
      carried,
      unsettled,
      coverage,
      sequences: new Map(
        previous ? [...previous.sequences()].map((row) => [row.id, row]) : [],
      ),
      rebuilt: new Map(),
      placed: new Map(),
      live: new Set(),
      inFunction: new Map(),
      statements: previous ? this.statementCountOf(previous) : 0,
      failed: 0,
      fail: () => {},
    };
    const flowIds = new Map<number, number>();
    const scriptFlows = new Map<string, number[]>();
    flows.forEach((flow, f) => {
      const symbol = symbols[f]!;
      // By name: the previous root may hold the ids of an older table
      // generation, which a reseed renumbered.
      const before = previous?.flowNamed(flow.name);
      const id = before?.id ?? this._nextSequenceId++;
      build.fail = (construct: string, line: number) => {
        fallback ??= { construct, uri: flow.uri, line };
      };
      const arrays = this.buildSequence(
        build,
        flow.statements,
        flow.firstLine,
        before,
        id,
        { flow: symbol, kind: flow.kind, uri: flow.uri },
        flow.kind === SymbolKind.Function,
      );
      this.setRow(build, {
        id,
        arrays,
        flow: symbol,
        kind: flow.kind,
        owner: -1,
        block: -1,
        uri: flow.uri,
        firstLine: flow.firstLine,
        span: flow.span,
      });
      flowIds.set(symbol, id);
      let ids = scriptFlows.get(flow.uri);
      if (!ids) {
        ids = [];
        scriptFlows.set(flow.uri, ids);
      }
      ids.push(id);
    });

    // The declarations: each script's declaration sequence, and the order
    // `ResetState` runs their chunks in, which is the story's.
    const declarationChunks: StatementChunk[] = [];
    const declarationIds = new Map<string, number>();
    const emittedBeforeDeclarations = this._writer.emitted;
    passes.assembly += declarations.length;
    const byScript = new Map<string, { source: DeclarationSource; chunk: StatementChunk }[]>();
    declarations.forEach((declaration) => {
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
          build.failed += 1;
          fallback ??= {
            construct: e.construct,
            uri: declaration.uri,
            line: declaration.firstLine,
          };
          return;
        }
      }
      if (!carried.has(declaration)) {
        this._placedDeclarations.set(declaration.block, chunk);
      }
      declarationChunks.push(chunk);
      let list = byScript.get(declaration.uri);
      if (!list) {
        list = [];
        byScript.set(declaration.uri, list);
      }
      list.push({ source: declaration, chunk });
      build.fail = (construct, line) => {
        fallback ??= { construct, uri: declaration.uri, line };
      };
      if (unsettled.has(declaration)) {
        this.buildBodies(
          build,
          declaration,
          chunk,
          { flow: -1, kind: SymbolKind.Root, uri: declaration.uri },
          false,
        );
      }
    });
    const declarationsEmitted =
      this._writer.emitted > emittedBeforeDeclarations;
    for (const [uri, list] of byScript) {
      list.sort((a, b) => a.source.firstLine - b.source.firstLine);
      const chunks = list.map((entry) => entry.chunk);
      const lineStarts = list.map((entry) => entry.source.firstLine);
      const before = previous?.declarations(uri);
      const id = before?.id ?? this._nextSequenceId++;
      const arrays = shareArrays(before?.arrays, chunks, lineStarts);
      this.placeIn(build, id, before, arrays, false, false);
      this.setRow(build, {
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
    passes.emitted = coverage.emitted;
    this.emittedLastBuild = coverage.emitted;
    // What left the root: the flows and declaration sequences the program no
    // longer has, and every chunk a sequence built again no longer holds and
    // no other sequence took, with the bodies it owned that no owner took.
    const dropped = this.droppedChunks(build);
    coverage.statements = build.statements + build.failed;
    if (fallback) {
      return { fallback, coverage, declarationsChanged: true };
    }
    const functionChunks = new Set(this._functionChunks);
    let functionsChanged = false;
    for (const chunk of dropped) {
      functionsChanged = functionChunks.delete(chunk) || functionsChanged;
    }
    for (const [chunk, place] of build.placed) {
      const holds = place.inFunction || exportsFunction(chunk);
      if (holds !== functionChunks.has(chunk)) {
        functionsChanged = true;
        if (holds) {
          functionChunks.add(chunk);
        } else {
          functionChunks.delete(chunk);
        }
      }
    }
    const declarationsChanged =
      !previous ||
      declarationsEmitted ||
      !sameChunks(oldDeclarations, declarationChunks) ||
      functionsChanged;
    const definitions = this.definitionArrays(
      flows,
      symbols,
      flowIds,
      build,
      dropped,
      previous,
      (construct) => {
        fallback ??= { construct, uri: flows[0]?.uri ?? "", line: 0 };
      },
    );
    if (fallback || !definitions) {
      return { fallback, coverage, declarationsChanged };
    }
    for (const ids of scriptFlows.values()) {
      ids.sort(
        (a, b) =>
          build.sequences.get(a)!.firstLine - build.sequences.get(b)!.firstLine,
      );
    }
    const root = new ProgramRoot(
      snapshotTable(this.table),
      this._nextRootId++,
      previous?.id ?? -1,
      build.sequences,
      flowIds,
      scriptFlows,
      this.chunkTable(previous, build, dropped),
      this.table.generation,
      runtimeStory,
      declarationIds,
      declarationChunks,
      definitions,
      this._labels,
      this._symbolRemaps,
    );
    this._statementCounts.set(root, build.statements);
    if (ChunkStore.verifyBuilds) {
      this.verifyRoot(
        root,
        previous,
        flows,
        symbols,
        build.statements,
        functionChunks,
      );
    }
    // The declarations run again when a declaration chunk or a function
    // changed, since an initializer may read another global or call a
    // function: a compile that changed only the statements of flows runs
    // none. An initializer that raises an error makes the program fall back,
    // whose story then raises it as the current engine does.
    if (declarationsChanged || this._declarationsFailed) {
      this.initializerRuns += 1;
      const failed = !this.runDeclarations(root);
      // A preview's run leaves the next compile's decision as it was.
      if (commit) {
        this._declarationsFailed = failed;
      }
      if (failed) {
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
      this.commit(root, build, dropped, facts, functionChunks, everyStatement);
    }
    return { root, coverage, declarationsChanged };
  }

  /** Makes `root` the current one, with what the store keeps of the build
   *  that made it: the chunk each statement's block holds, the readers of
   *  each symbol's facts, the facts the program gives each symbol, the
   *  functions' chunks, the functions' and alternators' labels, and the
   *  statement watch's values of every statement whose chunk the build did
   *  not carry. */
  protected commit(
    root: ProgramRoot,
    build: SequenceBuild,
    dropped: ReadonlySet<StatementChunk>,
    facts: ReadonlyMap<number, string>,
    functionChunks: Set<StatementChunk>,
    statements: readonly StatementSource[],
  ): void {
    this.current = root;
    this._functionChunks = functionChunks;
    this._committedFacts = new Map(facts);
    this._committedLabels = this._labels;
    for (const [id, inFunction] of build.inFunction) {
      this._sequenceInFunction.set(id, inFunction);
    }
    for (const [block, chunk] of this._placed) {
      this._byBlock.set(block, chunk);
    }
    for (const [block, chunk] of this._placedDeclarations) {
      this._byDeclaration.set(block, chunk);
    }
    for (const chunk of dropped) {
      for (const symbol of this._info.get(chunk)?.facts.keys() ?? []) {
        this._readers.get(symbol)?.delete(chunk);
      }
    }
    for (const chunk of build.placed.keys()) {
      for (const symbol of this._info.get(chunk)?.facts.keys() ?? []) {
        let readers = this._readers.get(symbol);
        if (!readers) {
          readers = new Set();
          this._readers.set(symbol, readers);
        }
        readers.add(chunk);
      }
    }
    for (const statement of statements) {
      if (!build.carried.has(statement)) {
        this.watchStatement(statement);
      }
    }
  }

  /**
   * The root's definition arrays (docs/engine/binary-program.md, section 2,
   * Resolution), written over the current root's: each flow at the start of
   * its sequence, with its kind, a branch's scene and the branch a scene with
   * no content of its own enters; each symbol a chunk exports at the chunk
   * and the offset that defines it, a label where its `Visit` stands and a
   * function at its entry; and the kind of each alternator and choice. Only
   * the rows of the flows, of the chunks the build dropped and of the chunks
   * it placed in a sequence built again are written. A label whose qualified
   * name another label or a flow of the program has makes the program fall
   * back, naming `a label named as another`, since a jump to the name could
   * reach either.
   */
  protected definitionArrays(
    flows: readonly FlowSource[],
    symbols: readonly number[],
    flowIds: ReadonlyMap<number, number>,
    build: SequenceBuild,
    dropped: ReadonlySet<StatementChunk>,
    previous: ProgramRoot | undefined,
    fail: (construct: string) => void,
  ): DefinitionArrays | undefined {
    const defs = copyDefinitions(
      previous?.definitionArrays,
      this.table.symbols.length,
      previous?.generation === this.table.generation,
    );
    const passes = this.passesLastBuild;
    // The rows of what left the root.
    for (const chunk of dropped) {
      passes.definitions += 1;
      const id = chunkId(chunk);
      for (let r = 0; r < exportCount(chunk); r += 1) {
        const symbol = exportSymbol(chunk, r);
        if (defs.chunk[symbol] === id) {
          defs.chunk[symbol] = -1;
          defs.offset[symbol] = -1;
          defs.kind[symbol] = UNDEFINED_KIND;
        }
      }
      const info = this._info.get(chunk);
      for (const part of [...(info?.alternators ?? []), ...(info?.choices ?? [])]) {
        if (part.symbol >= 0 && part.symbol < defs.kind.length) {
          defs.kind[part.symbol] = UNDEFINED_KIND;
        }
      }
    }
    // The flows. A symbol a chunk the build kept exports is that chunk's, a
    // label or a function, which a flow of its name does not displace.
    const flowKinds = new Map<number, SymbolKindValue>();
    flows.forEach((flow, f) => flowKinds.set(symbols[f]!, flow.kind));
    for (const row of previous?.flowSequences() ?? []) {
      const symbol = previous!.generation === this.table.generation ? row.flow : -1;
      if (symbol >= 0 && symbol < defs.kind.length && !flowKinds.has(symbol)) {
        defs.sequence[symbol] = -1;
        defs.parent[symbol] = -1;
        defs.start[symbol] = -1;
        if (defs.chunk[symbol]! < 0) {
          defs.kind[symbol] = UNDEFINED_KIND;
        }
      }
    }
    let failed = false;
    flows.forEach((flow, f) => {
      const symbol = symbols[f]!;
      defs.sequence[symbol] = flowIds.get(symbol) ?? -1;
      // A chunk that exports the symbol, kept or moved, defines it as it did
      // in the current root: a function's definition its function, which a
      // flow of the name does not displace, and a label, which collides.
      if (defs.chunk[symbol]! >= 0) {
        if (defs.kind[symbol] === SymbolKind.Label) {
          failed = true;
        }
      } else {
        defs.kind[symbol] = flow.kind;
      }
      defs.parent[symbol] = -1;
      defs.start[symbol] = -1;
    });
    flows.forEach((flow, f) => {
      const symbol = symbols[f]!;
      if (flow.kind === SymbolKind.Branch) {
        const scene = this.table.symbolIds.get(
          flow.name.slice(0, flow.name.lastIndexOf(".")),
        );
        if (scene !== undefined && flowKinds.get(scene) === SymbolKind.Scene) {
          defs.parent[symbol] = scene;
        }
      }
      if (flow.startsWith !== undefined) {
        const start = this.table.symbolIds.get(flow.startsWith);
        if (start !== undefined && flowKinds.get(start) === SymbolKind.Branch) {
          defs.start[symbol] = start;
        }
      }
    });
    // The chunks placed in a sequence built again: what they export, and
    // their alternators and choices, whose shuffle is seeded from the flow
    // that holds them.
    for (const [chunk, place] of build.placed) {
      passes.definitions += 1;
      for (let r = 0; r < exportCount(chunk); r += 1) {
        const symbol = exportSymbol(chunk, r);
        const offset = exportOffset(chunk, r);
        const label = exportsLabel(chunk, r);
        if (defs.chunk[symbol] !== chunkId(chunk)) {
          const before = defs.kind[symbol]!;
          if (
            before !== UNDEFINED_KIND &&
            (label || before === SymbolKind.Label)
          ) {
            failed = true;
          }
        }
        defs.chunk[symbol] = chunkId(chunk);
        defs.offset[symbol] = offset;
        defs.kind[symbol] = label ? SymbolKind.Label : SymbolKind.Function;
      }
      const row = build.sequences.get(place.sequence);
      for (const part of this._info.get(chunk)?.alternators ?? []) {
        if (part.symbol < defs.kind.length) {
          defs.kind[part.symbol] = SymbolKind.Alternator;
          // What its shuffle is seeded from: its flow's name and its own
          // source, which no compile renumbers.
          const flow = row && row.flow >= 0 ? this.table.symbols[row.flow] : "";
          this._labels.set(part.symbol, `${flow}:${part.fingerprint}`);
        }
      }
      for (const part of this._info.get(chunk)?.choices ?? []) {
        if (part.symbol >= 0 && part.symbol < defs.kind.length) {
          defs.kind[part.symbol] = SymbolKind.Choice;
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
      for (const part of this._info.get(chunk)?.choices ?? []) {
        if (part.symbol >= 0) {
          live.add(part.symbol);
        }
      }
      for (let r = 0; r < exportCount(chunk); r += 1) {
        live.add(exportSymbol(chunk, r));
      }
    }
    const remap = reseedProgramTable(this.table, { symbols: live });
    renumberAnonymousSymbols(this.table);
    // What the store keeps by symbol names the old generation's ids. The next
    // compile emits every chunk again, which gives it all anew.
    this._readers = new Map();
    this._committedFacts = new Map();
    this._committedLabels = new Map();
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
          choices: info.choices.map((part) => ({
            ...part,
            symbol: part.symbol >= 0 ? remap.symbols[part.symbol]! : -1,
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
  protected _definitions = new Map<number, Readonly<Record<string, string>>>();
  /** The facts of the functions the statements of the build in progress
   *  write, by the anonymous symbols the build gives them
   *  (`planFunctions`). */
  protected _anonymousDefinitions = new Map<
    number,
    Readonly<Record<string, string>>
  >();
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

  /** One fact about `symbol` in the program being built, as the writer reads
   *  it while it emits a chunk and the store reads it again when it decides
   *  whether the chunk can be kept (docs/engine/binary-program.md, section
   *  1, Identity): what the program defines the symbol as, a function's
   *  parameters, or whatever else a definition holds (`definitionFacts`).
   *  Every fact of a symbol the program does not define reads as
   *  `UNDEFINED_FACT`. An anonymous symbol is a function a statement writes,
   *  whose facts the build gives it when it plans the statement's functions
   *  (`planFunctions`). */
  protected factOf(symbol: number, name: string): string {
    const facts = isAnonymousSymbol(this.table, symbol)
      ? this._anonymousDefinitions.get(symbol)
      : this._definitions.get(symbol);
    return facts?.[name] ?? UNDEFINED_FACT;
  }

  /** The facts a flow's definition holds, which a chunk that refers to the
   *  flow's symbol reads through `factOf`: its kind and, for a function, the
   *  kind of each of its parameters. A definition can hold more than any
   *  emit path reads; only what a chunk's emission read is recorded, and
   *  only that is compared. */
  protected definitionFacts(flow: FlowSource): Record<string, string> {
    if (flow.kind !== SymbolKind.Function) {
      return { [FACT_KIND]: String(flow.kind) };
    }
    const fn = flow.statements[0]?.bodies?.find((body) => body.fn)?.fn;
    return {
      [FACT_KIND]: String(flow.kind),
      [FACT_PARAMS]: parameterKinds((fn as FlowBase | undefined)?.args),
    };
  }

  /** The symbol of a function of the program being built: the one planned
   *  for a function a statement writes, or for a flow of the program, its
   *  qualified name's. */
  protected symbolOf(fn: object): number | undefined {
    let symbol = this._functionSymbols.get(fn);
    if (symbol === undefined && fn instanceof FlowBase) {
      const name = qualifiedFlowName(fn);
      const id = name === null ? undefined : this.table.symbolIds.get(name);
      if (id !== undefined && this._definitions.has(id)) {
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
      how: bodies.map(() => undefined),
    };
    this._plans.set(statement, plan);
    const functions = bodies.flatMap((body, k) => (body.fn ? [k] : []));
    if (statement.defines !== undefined) {
      // A function declared at the top level is the part its name names,
      // which its symbol goes with; its body goes with it too when the
      // definition is emitted again in place, as when its header is edited,
      // as a body goes with the part that heads it (section 2).
      const symbol = internSymbol(this.table, statement.defines);
      const inherited = this._inherit.get(statement);
      const old = inherited ? this._info.get(inherited) : undefined;
      const oldParts = old?.defines === statement.defines ? old.parts : [];
      functions.forEach((k, i) => {
        plan.symbols[k] = symbol;
        const part = oldParts[i];
        if (part) {
          plan.oldBlocks[k] = part.block;
          plan.how[k] = "aligned";
        }
      });
    } else if (chunk) {
      const parts = this._info.get(chunk)?.parts ?? [];
      functions.forEach((k, i) => {
        plan.symbols[k] = parts[i]?.symbol;
      });
    } else {
      const inherited = this._inherit.get(statement);
      const oldParts = inherited ? (this._info.get(inherited)?.parts ?? []) : [];
      const { pairs, how } = alignParts(
        functions.map((k) => fingerprintOf(bodies[k]!)),
        oldParts.map((part) => part.fingerprint),
      );
      functions.forEach((k, i) => {
        const part = pairs[i] === undefined ? undefined : oldParts[pairs[i]!];
        if (part && isAnonymousSymbol(this.table, part.symbol)) {
          plan.symbols[k] = part.symbol;
          plan.oldBlocks[k] = part.block;
          plan.how[k] = how[i];
        }
      });
    }
    for (const k of functions) {
      const fn = bodies[k]!.fn!;
      plan.symbols[k] ??= anonymousSymbol(this.table);
      this._functionSymbols.set(fn, plan.symbols[k]!);
      if (isAnonymousSymbol(this.table, plan.symbols[k]!)) {
        this._anonymousDefinitions.set(plan.symbols[k]!, {
          [FACT_KIND]: String(SymbolKind.Function),
          [FACT_PARAMS]: parameterKinds((fn as FlowBase).args),
        });
      }
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
   *  aligned with by the part that heads it when the statement is emitted
   *  again in place (`alignParts`), and takes a new one otherwise. */
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
      facts: ReadonlyMap<number, readonly string[]>;
    },
  ): StatementChunk {
    const bodies = statement.bodies ?? [];
    const inherited = this._inherit.get(statement);
    const oldInfo = inherited ? this._info.get(inherited) : undefined;
    const plan = this._plans.get(statement);
    // Every body takes its sequence id through the one alignment of its
    // heading part with the old chunk's (section 2), never by position: a
    // choice's body by the choice's own source, which its count symbol goes
    // with too; a function's by the function's own source (`planFunctions`);
    // and any other body (a branch's, a loop's, a `do` block's, a `then`
    // clause's) by the source of the part that heads it.
    const choices = choicesOf(statement);
    const choicePrints = choices.map((choice) =>
      choiceFingerprint(choice, statement.text),
    );
    const choiceAlignment = oldInfo
      ? alignParts(
          choicePrints,
          oldInfo.choices.map((part) => part.fingerprint),
        )
      : undefined;
    const choicePairs = choiceAlignment?.pairs ?? [];
    const headed = bodies.flatMap((body, k) =>
      body.fn || partOfBody.get(body.shape as BodyShape) instanceof Choice
        ? []
        : [k],
    );
    const headPrints = headed.map((k) => headFingerprint(bodies[k]!));
    const headAlignment = oldInfo
      ? alignParts(
          headPrints,
          oldInfo.heads.map((part) => part.fingerprint),
        )
      : undefined;
    const oldBlocks: (number | undefined)[] = bodies.map(() => undefined);
    const how: (HandedOn | undefined)[] = bodies.map(() => undefined);
    bodies.forEach((body, k) => {
      if (body.fn) {
        oldBlocks[k] = plan?.oldBlocks[k];
        how[k] = plan?.how[k];
        return;
      }
      const part = partOfBody.get(body.shape as BodyShape);
      if (part instanceof Choice) {
        const i = choices.indexOf(part);
        const pair = choicePairs[i];
        const block = pair === undefined ? -1 : oldInfo!.choices[pair]!.block;
        if (block >= 0) {
          oldBlocks[k] = block;
          how[k] = choiceAlignment!.how[i];
        }
        return;
      }
      const i = headed.indexOf(k);
      const pair = headAlignment?.pairs[i];
      if (pair !== undefined) {
        oldBlocks[k] = oldInfo!.heads[pair]!.block;
        how[k] = headAlignment!.how[i];
      }
    });
    const blocks: BlockInput[] = bodies.map((body, k) => {
      const oldBlock = oldBlocks[k];
      const kept = inherited && oldBlock !== undefined;
      const sequenceId = kept
        ? blockField(inherited, oldBlock, B_SEQUENCE)
        : this._nextSequenceId++;
      if (inherited) {
        this.handedOnLastBuild.push({
          sequenceId,
          part: body.fn
            ? "function"
            : partOfBody.get(body.shape as BodyShape) instanceof Choice
              ? "choice"
              : "head",
          how: kept ? how[k]! : "new",
        });
      }
      return {
        body: body.shape,
        sequenceId,
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
    choices.forEach((choice, i) => {
      const pair = choicePairs[i];
      const symbol = pair === undefined ? -1 : oldInfo!.choices[pair]!.symbol;
      if (symbol >= 0 && isAnonymousSymbol(this.table, symbol)) {
        alternatorPlan.set(choice, symbol);
      }
    });
    if (inherited) {
      const old = this._info.get(inherited)?.alternators ?? [];
      const { pairs } = alignParts(
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
      facts: emitted.facts,
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
      choices: choices.map((choice, i) => ({
        fingerprint: choicePrints[i]!,
        symbol: choice.name ? -1 : (alternatorPlan.get(choice) ?? -1),
        block: bodies.findIndex(
          (body) => partOfBody.get(body.shape as BodyShape) === choice,
        ),
      })),
      heads: headed.map((k, i) => ({ fingerprint: headPrints[i]!, block: k })),
      anonymousReferences: [...referenced].filter((s) => !own.has(s)),
      hoisted: hoistedOf(statement),
      placement: this.placementOf(statement),
      params: paramsOf(statement),
      generation: this.table.generation,
    });
    return chunk;
  }

  /** The arrays of the sequence `id` of `statements`, whose body starts on
   *  line `firstLine`, emitting the chunks alignment gave none, and the rows
   *  of the sequences of their bodies. The bodies of a statement are built
   *  again only when it or a statement inside it is not carried
   *  (`SequenceBuild.unsettled`), or when the flow, the kind or the script of
   *  the sequence that holds it changed, which its bodies' rows name and its
   *  alternators' shuffles are seeded from; any other statement's bodies keep
   *  their rows. `before` is the current root's row for the sequence. The
   *  chunks that hold a function's code are every chunk of a sequence inside
   *  a function (`inFunction`), and every chunk that writes one. */
  protected buildSequence(
    build: SequenceBuild,
    statements: readonly StatementSource[],
    firstLine: number,
    before: SequenceRow | undefined,
    id: number,
    home: SequenceHome,
    inFunction: boolean,
  ): SequenceArrays {
    const chunks: StatementChunk[] = [];
    const lineStarts: number[] = [];
    this.passesLastBuild.assembly += statements.length;
    // A sequence whose owner an edit moved into a function or out of one is
    // placed whole, as one whose flow changed is, so the function chunks it
    // holds are counted again.
    const moved =
      !before ||
      !sameHome(before, home) ||
      this._sequenceInFunction.get(id) !== inFunction;
    build.inFunction.set(id, inFunction);
    for (const statement of statements) {
      let chunk = build.chunkOf.get(statement);
      if (!chunk) {
        try {
          chunk = this.emit(statement, (input) => this._writer.write(input));
        } catch (e) {
          if (!(e instanceof UnsupportedConstruct)) {
            throw e;
          }
          build.coverage.unsupported[e.construct] =
            (build.coverage.unsupported[e.construct] ?? 0) + 1;
          build.failed += 1;
          build.fail(e.construct, statement.firstLine);
          continue;
        }
      }
      if (!build.carried.has(statement)) {
        this._placed.set(statement.block, chunk);
      }
      chunks.push(chunk);
      lineStarts.push(statement.firstLine - firstLine);
      if (build.unsettled.has(statement) || moved) {
        this.buildBodies(build, statement, chunk, home, inFunction);
      }
    }
    const arrays = shareArrays(before?.arrays, chunks, lineStarts);
    this.placeIn(build, id, before, arrays, inFunction, moved);
    return arrays;
  }

  /** Records what a sequence built again holds that the current root holds
   *  elsewhere or not at all, whose rows of the chunk table and of the
   *  definition arrays the build writes (`SequenceBuild.placed`): every
   *  chunk of it when its flow, kind or script changed (`moved`), and
   *  otherwise each chunk the current root's sequence `id` does not hold. A
   *  chunk that stays in the sequence keeps every row. */
  protected placeIn(
    build: SequenceBuild,
    id: number,
    before: SequenceRow | undefined,
    arrays: SequenceArrays,
    inFunction: boolean,
    moved: boolean,
  ): void {
    if (arrays === before?.arrays && !moved) {
      return;
    }
    build.rebuilt.set(id, before?.arrays);
    for (const chunk of arrays.chunks) {
      if (
        moved ||
        !before ||
        build.previous?.chunkIndex.get(chunkId(chunk)) !== id
      ) {
        this.passesLastBuild.placement += 1;
        build.placed.set(chunk, { sequence: id, inFunction });
      }
    }
  }

  /** The sequences of `statement`'s bodies, each under the id its chunk's
   *  block table names. A function's body is inside a function. */
  protected buildBodies(
    build: SequenceBuild,
    statement: StatementSource,
    chunk: StatementChunk,
    home: SequenceHome,
    inFunction: boolean,
  ): void {
    (statement.bodies ?? []).forEach((body, k) => {
      const id = blockField(chunk, k, B_SEQUENCE);
      const before = build.previous?.sequence(id);
      const arrays = this.buildSequence(
        build,
        body.statements,
        body.firstLine,
        before,
        id,
        home,
        inFunction || !!body.fn,
      );
      this.setRow(build, {
        id,
        arrays,
        flow: home.flow,
        kind: home.kind,
        owner: chunkId(chunk),
        block: k,
        uri: home.uri,
        firstLine: -1,
        span: body.span,
      });
    });
  }

  /** Gives the root `row`, or the current root's row of the same id when it
   *  reads the same, which the new root then shares; and counts the
   *  statements the root holds. */
  protected setRow(build: SequenceBuild, row: SequenceRow): void {
    const before = build.sequences.get(row.id);
    if (before) {
      build.statements -= before.arrays.chunks.length;
    }
    const same =
      before &&
      before.arrays === row.arrays &&
      before.flow === row.flow &&
      before.kind === row.kind &&
      before.owner === row.owner &&
      before.block === row.block &&
      before.uri === row.uri &&
      before.firstLine === row.firstLine &&
      before.span === row.span;
    build.sequences.set(row.id, same ? before : row);
    build.statements += row.arrays.chunks.length;
    build.live.add(row.id);
  }

  /** The chunks of the current root that the new one does not hold: each
   *  chunk a sequence built again no longer holds and no other sequence
   *  took, and the chunks of every body such a chunk owned that no owner
   *  took, and of every flow and declaration sequence the program no longer
   *  has. Their rows leave the new root. */
  protected droppedChunks(build: SequenceBuild): Set<StatementChunk> {
    const dropped = new Set<StatementChunk>();
    const previous = build.previous;
    if (!previous) {
      return dropped;
    }
    const dropRow = (row: SequenceRow | undefined) => {
      if (!row || build.live.has(row.id) || !build.sequences.has(row.id)) {
        return;
      }
      build.sequences.delete(row.id);
      build.statements -= row.arrays.chunks.length;
      for (const chunk of row.arrays.chunks) {
        drop(chunk);
      }
    };
    const drop = (chunk: StatementChunk) => {
      if (dropped.has(chunk) || build.placed.has(chunk)) {
        return;
      }
      dropped.add(chunk);
      for (let k = 0; k < blockCount(chunk); k += 1) {
        dropRow(previous.sequence(blockField(chunk, k, B_SEQUENCE)));
      }
    };
    for (const [id, before] of build.rebuilt) {
      const now = build.sequences.get(id)?.arrays;
      for (const chunk of before?.chunks ?? []) {
        if (!now || !holdsChunk(now, chunk)) {
          drop(chunk);
        }
      }
    }
    for (const row of previous.sequences()) {
      if (row.owner < 0 && !build.live.has(row.id)) {
        dropRow(row);
      }
    }
    return dropped;
  }

  /** The chunk table of the new root, written over the current root's where
   *  a chunk was added, moved or dropped. */
  protected chunkTable(
    previous: ProgramRoot | undefined,
    build: SequenceBuild,
    dropped: ReadonlySet<StatementChunk>,
  ): ChunkTable {
    const writer = (previous?.chunkIndex ?? new ChunkTable()).fork();
    for (const [chunk, place] of build.placed) {
      this.passesLastBuild.chunkTable += 1;
      writer.set(chunkId(chunk), place.sequence);
    }
    for (const chunk of dropped) {
      this.passesLastBuild.chunkTable += 1;
      writer.set(chunkId(chunk), -1);
    }
    return writer.finish();
  }

  /** The chunk `statement`'s block was emitted or kept for, kept with
   *  nothing read again (docs/engine/binary-program.md, section 1,
   *  Identity), when the block is one the incremental parse carried, so the
   *  statement's syntax and lowering inputs are the ones the chunk recorded;
   *  the current root holds the chunk; the statement watch did not mark the
   *  statement, so every name its code reads resolves and every text the
   *  compiler names reads as the chunk recorded (`StatementWatch`); no
   *  symbol the chunk read a fact about changed (`flagged`); its ids belong
   *  to the table's generation; and, for a declaration, it assigns the same
   *  globals. */
  protected keepCarried(
    byBlock: WeakMap<object, StatementChunk>,
    statement: StatementSource,
    previous: ProgramRoot | undefined,
    flagged: ReadonlySet<StatementChunk>,
    carried: Set<StatementSource>,
  ): StatementChunk | undefined {
    const chunk = byBlock.get(statement.block);
    if (
      !chunk ||
      !previous ||
      this._used.has(chunk) ||
      flagged.has(chunk) ||
      this.watch.changed.has(statement.block)
    ) {
      return undefined;
    }
    const info = this._info.get(chunk);
    if (
      !info ||
      info.generation !== this.table.generation ||
      info.globals !== assignedNames(statement) ||
      !holdsChunkIn(previous, chunk)
    ) {
      return undefined;
    }
    this._used.add(chunk);
    carried.add(statement);
    return chunk;
  }

  /** The statements of a root in the order a compile aligns the next
   *  program's statements with (`ProgramRoot.statementOrder`), with the
   *  owner of each statement of a body, found once per root. */
  protected orderOf(root: ProgramRoot): {
    order: StatementChunk[];
    owners: Map<StatementChunk, StatementChunk>;
  } {
    let known = this._orders.get(root);
    if (!known) {
      const owners = new Map<StatementChunk, StatementChunk>();
      const order = root.statementOrder(owners);
      known = { order, owners };
      this._orders.set(root, known);
    }
    return known;
  }

  protected statementOrderOf(root: ProgramRoot): StatementChunk[] {
    return this.orderOf(root).order;
  }

  protected oldOwnerOf(
    root: ProgramRoot,
    chunk: StatementChunk,
  ): StatementChunk | undefined {
    return this.orderOf(root).owners.get(chunk);
  }

  /** How many statements a root holds, which a build counts from the
   *  current root's count by the rows it writes and drops. */
  protected statementCountOf(root: ProgramRoot): number {
    let count = this._statementCounts.get(root);
    if (count === undefined) {
      count = 0;
      for (const row of root.sequences()) {
        count += row.arrays.chunks.length;
      }
      this._statementCounts.set(root, count);
    }
    return count;
  }

  /** Has the statement watch watch every value `statement`'s chunk
   *  recorded of its objects: how each name its code reads resolved, and
   *  each text the compiler names by document order. The readers that build
   *  the statement's identity (`resolutionsOf`, `compilerNamedTexts`) hand
   *  the watch each object they read with the reader that reads it, so a
   *  value added to them is watched with nothing added here. */
  protected watchStatement(statement: StatementSource): void {
    const exclude = bodyObjects(statement);
    const watch = (obj: ParsedObject, read: (obj: any) => string) =>
      this.watch.watch(obj, statement.block, read);
    resolutionsOf(
      [...statement.objects, ...hoistedLocals(statement)],
      exclude,
      watch,
    );
    compilerNamedTexts(statement.objects, exclude, watch);
  }

  /**
   * Derives the new root's tables from nothing but its sequences and the
   * program's flows, as the build did before it wrote them over the current
   * root's, and throws when they differ (`verifyBuilds`): the definition
   * arrays, the chunk table, the rows every owner's block table reaches, and
   * the count of statements.
   */
  protected verifyRoot(
    root: ProgramRoot,
    previous: ProgramRoot | undefined,
    flows: readonly FlowSource[],
    symbols: readonly number[],
    statements: number,
    functionChunks: ReadonlySet<StatementChunk>,
  ): void {
    const fail = (what: string) => {
      throw new Error(`ChunkStore.verifyBuilds: ${what}`);
    };
    // The rows a walk from the flows and the declaration sequences reaches.
    const reached = new Set<number>();
    let count = 0;
    const walk = (row: SequenceRow | undefined, owner: number, block: number) => {
      if (!row) {
        fail(`no row for a body of chunk ${owner}, block ${block}`);
        return;
      }
      if (reached.has(row.id)) {
        fail(`row ${row.id} reached twice`);
      }
      reached.add(row.id);
      if (row.owner !== owner || row.block !== block) {
        fail(`row ${row.id} names owner ${row.owner}:${row.block}, not ${owner}:${block}`);
      }
      count += row.arrays.chunks.length;
      for (const chunk of row.arrays.chunks) {
        if (root.chunkIndex.get(chunkId(chunk)) !== row.id) {
          fail(`chunk ${chunkId(chunk)} is in row ${row.id}, the chunk table says ${root.chunkIndex.get(chunkId(chunk))}`);
        }
        for (let k = 0; k < blockCount(chunk); k += 1) {
          walk(root.body(chunk, k), chunkId(chunk), k);
        }
      }
    };
    for (const row of root.sequences()) {
      if (row.owner < 0) {
        walk(row, -1, -1);
      }
    }
    for (const row of root.sequences()) {
      if (!reached.has(row.id)) {
        fail(`row ${row.id} is reached from no flow`);
      }
    }
    // The chunks that hold a function's code: every chunk of a sequence inside
    // a function (a function's own flow, a function body's block and what
    // they hold) and every chunk that exports a function.
    const holdingFunctions = new Set<StatementChunk>();
    const inFunctions = (row: SequenceRow | undefined, inFunction: boolean) => {
      for (const chunk of row?.arrays.chunks ?? []) {
        if (inFunction || exportsFunction(chunk)) {
          holdingFunctions.add(chunk);
        }
        for (let k = 0; k < blockCount(chunk); k += 1) {
          inFunctions(
            root.body(chunk, k),
            inFunction || !!(blockFlags(chunk, k) & BLOCK_FUNCTION),
          );
        }
      }
    };
    for (const row of root.sequences()) {
      if (row.owner < 0) {
        inFunctions(row, row.flow >= 0 && row.kind === SymbolKind.Function);
      }
    }
    if (
      holdingFunctions.size !== functionChunks.size ||
      [...holdingFunctions].some((chunk) => !functionChunks.has(chunk))
    ) {
      fail(`the build counts ${functionChunks.size} chunks holding a function's code, the root holds ${holdingFunctions.size}`);
    }
    if (count !== statements) {
      fail(`the root holds ${count} statements, the build counted ${statements}`);
    }
    for (const chunk of previous ? this.orderOf(previous).order : []) {
      const id = root.chunkIndex.get(chunkId(chunk));
      if (id >= 0 && !holdsChunk(root.sequence(id)?.arrays ?? { chunks: [], lineStarts: [] }, chunk)) {
        fail(`the chunk table places dropped chunk ${chunkId(chunk)} in row ${id}`);
      }
    }
    // The definition arrays, derived as a cold build derives them.
    const defs = emptyDefinitions(this.table.symbols.length);
    for (const row of root.sequences()) {
      if (row.owner < 0 && row.flow >= 0) {
        defs.sequence[row.flow] = row.id;
        defs.kind[row.flow] = row.kind;
      }
    }
    const flowKinds = new Map<number, SymbolKindValue>();
    flows.forEach((flow, f) => flowKinds.set(symbols[f]!, flow.kind));
    flows.forEach((flow, f) => {
      const symbol = symbols[f]!;
      if (flow.kind === SymbolKind.Branch) {
        const scene = this.table.symbolIds.get(
          flow.name.slice(0, flow.name.lastIndexOf(".")),
        );
        if (scene !== undefined && flowKinds.get(scene) === SymbolKind.Scene) {
          defs.parent[symbol] = scene;
        }
      }
      if (flow.startsWith !== undefined) {
        const start = this.table.symbolIds.get(flow.startsWith);
        if (start !== undefined && flowKinds.get(start) === SymbolKind.Branch) {
          defs.start[symbol] = start;
        }
      }
    });
    for (const row of root.sequences()) {
      for (const chunk of row.arrays.chunks) {
        for (let r = 0; r < exportCount(chunk); r += 1) {
          const symbol = exportSymbol(chunk, r);
          defs.chunk[symbol] = chunkId(chunk);
          defs.offset[symbol] = exportOffset(chunk, r);
          defs.kind[symbol] = exportsLabel(chunk, r)
            ? SymbolKind.Label
            : SymbolKind.Function;
        }
        for (const part of this._info.get(chunk)?.alternators ?? []) {
          if (part.symbol < defs.kind.length) {
            defs.kind[part.symbol] = SymbolKind.Alternator;
            const flow = row.flow >= 0 ? this.table.symbols[row.flow] : "";
            if (this._labels.get(part.symbol) !== `${flow}:${part.fingerprint}`) {
              fail(`alternator ${part.symbol} is labelled ${this._labels.get(part.symbol)}`);
            }
          }
        }
        for (const part of this._info.get(chunk)?.choices ?? []) {
          if (part.symbol >= 0 && part.symbol < defs.kind.length) {
            defs.kind[part.symbol] = SymbolKind.Choice;
          }
        }
      }
    }
    const built = root.definitionArrays;
    for (const key of ["chunk", "offset", "sequence", "kind", "parent", "start"] as const) {
      const want = defs[key];
      const got = built[key];
      for (let s = 0; s < want.length; s += 1) {
        if ((got[s] ?? (key === "kind" ? UNDEFINED_KIND : -1)) !== want[s]) {
          fail(`definition ${key} of ${this.table.symbols[s] ?? s} is ${got[s]}, a cold build gives ${want[s]}`);
        }
      }
    }
  }

  /**
   * The chunk each statement keeps, by the identity rule, or nothing for a
   * statement to emit. `statements` and `old` are the new and the previous
   * program's statements in order, and `kept` holds the chunks of the
   * statements whose block the store emitted a chunk for. The others are
   * aligned with the old chunks in two steps.
   *
   * By position: between two statements that kept old chunks, the old and
   * new statements are matched from both ends and then in order by their
   * syntax, and the one statement left on each side of a run with the one
   * old statement left; of the statements left, only the outermost count:
   * the statements of a left statement's bodies are part of it, as the
   * statements of a function written on its owner's line are, whose columns
   * move when a function is inserted before it (`nesting`). The statements
   * no run matched are then matched in order by their syntax with the old
   * chunks no run took, wherever those were, as statements an edit moved
   * past an anchor are (#1221). A matched statement keeps the old chunk when
   * it can, one that reads as it does in its syntax, its recorded lowering
   * inputs and its recorded values (`statementIdentity`) while the chunk's
   * own facts hold, and is otherwise emitted again in place, taking what
   * belongs to the old chunk's parts (`_inherit`); the one statement left on
   * each side of a run is emitted again in place only when the two have
   * parts.
   *
   * By identity: every statement that can keep an old chunk it does not
   * hold then takes it where that leaves nothing behind (#1496): a chunk no
   * statement holds, when the statement holds none or holds one with no
   * parts, or by exchange, the chunk another statement holds to be emitted
   * again in place, when that one can take the one this statement leaves. A
   * statement that holds none takes no chunk another statement holds, since
   * that one was edited in place and keeps the parts of its old self, whose
   * ids and symbols a saved state may name; and a statement that holds a
   * chunk with parts keeps it over a chunk no statement holds for the same
   * reason. A chunk left behind goes to a statement no pass matched, by its
   * syntax.
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
    // Whether an old chunk's own recorded facts hold in this build, which no
    // statement changes, so each chunk is checked once.
    const viable = new Map<StatementChunk, boolean>();
    const factsHold = (chunk: StatementChunk): boolean => {
      let holds = viable.get(chunk);
      if (holds === undefined) {
        holds = this.factsHold(chunk);
        viable.set(chunk, holds);
      }
      return holds;
    };
    // Whether the statement can keep the old chunk, whoever holds it now: the
    // two read the same in everything a kept chunk depends on
    // (`statementIdentity`, `chunkIdentity`), and the chunk's facts hold.
    // Syntax and lowering reads are compared first, so a statement's full
    // identity is built only for a chunk it can match.
    const fits = (i: number, o: number): boolean => {
      const info = this._info.get(old[o]!);
      const statement = statements[i]!;
      return (
        !!info &&
        info.syntax === statement.syntax() &&
        info.reads === statement.reads &&
        this.chunkIdentity(old[o]!) === this.statementIdentity(statement) &&
        factsHold(old[o]!)
      );
    };
    // Pairs a statement with an old chunk of its syntax: it keeps the chunk
    // when it can, and is otherwise emitted again in place, taking what
    // belongs to the old chunk's parts (`_inherit`).
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
      used.add(chunk);
      if (fits(i, o)) {
        result[i] = chunk;
      } else {
        this._inherit.set(statement, chunk);
      }
      return true;
    };
    // A block statement keeps its bodies' sequence ids by an edit in place,
    // and a statement that writes alternators keeps their count symbols,
    // which its alternators align with by their own source.
    // Whether a statement writes alternators, which reads its own objects
    // past its bodies' statements, so it is found once per statement.
    const alternating = new Map<StatementSource, boolean>();
    const writesAlternators = (statement: StatementSource): boolean => {
      let writes = alternating.get(statement);
      if (writes === undefined) {
        writes = alternatorsOf(statement).length > 0;
        alternating.set(statement, writes);
      }
      return writes;
    };
    // Whether a statement raises choices, found once per statement as well.
    const choosing = new Map<StatementSource, boolean>();
    const raisesChoices = (statement: StatementSource): boolean => {
      let raises = choosing.get(statement);
      if (raises === undefined) {
        raises = choicesOf(statement).length > 0;
        choosing.set(statement, raises);
      }
      return raises;
    };
    const ownsParts = (statement: StatementSource, chunk: StatementChunk) =>
      ((statement.bodies?.length ?? 0) > 0 && blockCount(chunk) > 0) ||
      (writesAlternators(statement) &&
        (this._info.get(chunk)?.alternators.length ?? 0) > 0) ||
      (raisesChoices(statement) && (this._info.get(chunk)?.choices.length ?? 0) > 0);
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
      // the same, found through the positions of each syntax among `olds`
      // rather than by scanning the run. The position the pass has reached
      // only grows, so each syntax's positions are walked once, by a cursor.
      const at = new Map<string, { positions: number[]; next: number }>();
      for (let k = front; k < olds.length - back; k += 1) {
        const syntax = syntaxOf(olds[k]!);
        if (syntax !== undefined) {
          const bucket = at.get(syntax);
          if (bucket) {
            bucket.positions.push(k);
          } else {
            at.set(syntax, { positions: [k], next: 0 });
          }
        }
      }
      let o = front;
      for (let c = front; c < candidates.length - back; c += 1) {
        const bucket = at.get(statements[candidates[c]!]!.syntax());
        if (!bucket) {
          continue;
        }
        while (bucket.next < bucket.positions.length && bucket.positions[bucket.next]! < o) {
          bucket.next += 1;
        }
        const k = bucket.positions[bucket.next];
        if (k !== undefined && take(candidates[c]!, olds[k]!)) {
          o = k + 1;
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
      if (leftNew.length === 1 && leftOld.length === 1) {
        const i = leftNew[0]!;
        const k = leftOld[0]!;
        // Two statements an edit swapped cross over each other, so the
        // passes above match only one of them; the other, left alone with
        // its own old chunk, keeps it.
        if (fits(i, k)) {
          used.add(old[k]!);
          result[i] = old[k]!;
        } else if (ownsParts(statements[i]!, old[k]!)) {
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
    // chunks outside their run: the old chunks no run took are matched with
    // the statements no run matched, in order, by syntax.
    const matchMoved = () => {
      const unmatched = new Map<string, { olds: number[]; next: number }>();
      old.forEach((chunk, o) => {
        const syntax = used.has(chunk) ? undefined : this._info.get(chunk)?.syntax;
        if (syntax !== undefined) {
          const bucket = unmatched.get(syntax);
          if (bucket) {
            bucket.olds.push(o);
          } else {
            unmatched.set(syntax, { olds: [o], next: 0 });
          }
        }
      });
      statements.forEach((statement, i) => {
        if (!result[i] && !this._inherit.has(statement)) {
          const bucket = unmatched.get(statement.syntax());
          const o = bucket?.olds[bucket.next];
          if (o !== undefined) {
            bucket!.next += 1;
            take(i, o);
          }
        }
      });
    };
    matchMoved();

    // Every statement that can keep an old chunk it does not hold now takes
    // it where that leaves nothing behind (#1496). The pairing above follows
    // position, so of statements an edit reordered among others of their
    // syntax, it can pair one for an edit in place with the chunk another
    // can keep. A statement paired with no chunk takes an old chunk no
    // statement holds. A statement paired for an edit in place takes such a
    // chunk only when the one it leaves has no parts, since the ids and
    // symbols of a block's bodies, functions and alternators go with the
    // edit in place and a saved state may name them; and it exchanges
    // chunks with a statement paired for an edit in place with the chunk it
    // can keep, which takes the one it leaves, so no chunk is left behind.
    // A statement paired with no chunk takes none that another statement
    // holds: that one was edited in place, and keeps the parts of its old
    // self.
    const partner = new Map<number, number>();
    const holder = new Map<number, number>();
    statements.forEach((statement, i) => {
      const chunk = result[i] ? undefined : this._inherit.get(statement);
      const o = chunk ? oldEntry.get(chunk) : undefined;
      if (o !== undefined) {
        partner.set(i, o);
        holder.set(o, i);
      }
    });
    const unpair = (i: number) => {
      const o = partner.get(i);
      if (o !== undefined) {
        partner.delete(i);
        holder.delete(o);
        this._inherit.delete(statements[i]!);
      }
    };
    // The old chunks whose facts hold, by identity: those no statement holds,
    // and those paired for an edit in place, filed by what their holder can
    // take in an exchange (`takesLeft`): its syntax, and whether it has
    // bodies, writes alternators or raises choices. An entry is checked when it is taken and
    // dropped when it no longer applies, since a chunk moves between lists;
    // each move files it again, so the lists stay linear in all.
    interface Held {
      bySyntax: Map<string, number[]>;
      bodied: number[];
      alternating: number[];
      choosing: number[];
    }
    const byIdentity = new Map<string, { free: number[]; held: Held }>();
    // Each old chunk's lists, found once: a chunk an exchange passes on is
    // filed again, and its identity, whose length grows with its bodies, is
    // not looked up again.
    const chunkLists = new Map<number, { free: number[]; held: Held } | null>();
    // The syntax and lowering reads of the old chunks filed, so a statement
    // that no old chunk reads as builds no identity.
    const readAs = new Set<string>();
    const listOf = (o: number) => {
      const known = chunkLists.get(o);
      if (known !== undefined) {
        return known ?? undefined;
      }
      const info = this._info.get(old[o]!);
      const identity = this.chunkIdentity(old[o]!);
      let lists: { free: number[]; held: Held } | undefined;
      if (info && identity !== undefined && factsHold(old[o]!)) {
        readAs.add(`${info.syntax}\u0000${info.reads}`);
        lists = byIdentity.get(identity);
        if (!lists) {
          lists = { free: [], held: { bySyntax: new Map(), bodied: [], alternating: [], choosing: [] } };
          byIdentity.set(identity, lists);
        }
      }
      chunkLists.set(o, lists ?? null);
      return lists;
    };
    const fileHeld = (o: number) => {
      const lists = listOf(o);
      const p = holder.get(o);
      if (!lists || p === undefined) {
        return;
      }
      const statement = statements[p]!;
      const syntax = statement.syntax();
      const same = lists.held.bySyntax.get(syntax);
      if (same) {
        same.push(o);
      } else {
        lists.held.bySyntax.set(syntax, [o]);
      }
      if ((statement.bodies?.length ?? 0) > 0) {
        lists.held.bodied.push(o);
      }
      if (writesAlternators(statement)) {
        lists.held.alternating.push(o);
      }
      if (raisesChoices(statement)) {
        lists.held.choosing.push(o);
      }
    };
    for (let o = old.length - 1; o >= 0; o -= 1) {
      if (!used.has(old[o]!)) {
        listOf(o)?.free.push(o);
      } else if (holder.has(o)) {
        fileHeld(o);
      }
    }
    const ownsAny = (chunk: StatementChunk) =>
      blockCount(chunk) > 0 ||
      (this._info.get(chunk)?.alternators.length ?? 0) > 0 ||
      (this._info.get(chunk)?.choices.length ?? 0) > 0;
    const queue: number[] = [];
    statements.forEach((_, i) => {
      if (!result[i]) {
        queue.push(i);
      }
    });
    // Each statement's lists, kept once found: a statement an exchange pairs
    // again is visited again, and reads the same lists. Its identity is
    // built once per build (`statementIdentity`).
    const listsOf = new Map<number, NonNullable<ReturnType<typeof listOf>>>();
    for (let n = 0; n < queue.length; n += 1) {
      const i = queue[n]!;
      if (result[i]) {
        continue;
      }
      let lists = listsOf.get(i);
      if (!lists) {
        const statement = statements[i]!;
        if (!readAs.has(`${statement.syntax()}\u0000${statement.reads}`)) {
          continue;
        }
        lists = byIdentity.get(this.statementIdentity(statement));
        if (lists) {
          listsOf.set(i, lists);
        }
      }
      if (!lists) {
        continue;
      }
      const q = partner.get(i);
      if (q === undefined || !ownsAny(old[q]!)) {
        let o: number | undefined;
        while (lists.free.length && o === undefined) {
          const c = lists.free.pop()!;
          if (!used.has(old[c]!)) {
            o = c;
          }
        }
        if (o !== undefined) {
          if (q !== undefined) {
            unpair(i);
            used.delete(old[q]!);
            listOf(q)?.free.push(q);
          }
          used.add(old[o]!);
          result[i] = old[o]!;
          continue;
        }
      }
      if (q === undefined) {
        continue;
      }
      // The other statement takes the chunk this one leaves: it keeps it,
      // or is emitted again in place from it, as a statement of its syntax
      // or one whose parts the chunk's carry. A statement that could do
      // neither keeps its chunk, so no exchange leaves a chunk behind. Only
      // the lists whose holders can take it are read.
      const left = old[q]!;
      const takesLeft = (p: number) =>
        fits(p, q) ||
        this._info.get(left)?.syntax === statements[p]!.syntax() ||
        ownsParts(statements[p]!, left);
      const candidates: number[][] = [];
      const same = lists.held.bySyntax.get(this._info.get(left)?.syntax ?? "");
      if (same) {
        candidates.push(same);
      }
      if (blockCount(left) > 0) {
        candidates.push(lists.held.bodied);
      }
      if ((this._info.get(left)?.alternators.length ?? 0) > 0) {
        candidates.push(lists.held.alternating);
      }
      if ((this._info.get(left)?.choices.length ?? 0) > 0) {
        candidates.push(lists.held.choosing);
      }
      let o: number | undefined;
      for (const list of candidates) {
        while (list.length && o === undefined) {
          const c = list.pop()!;
          const p = holder.get(c);
          if (p !== undefined && p !== i && takesLeft(p)) {
            o = c;
          }
        }
        if (o !== undefined) {
          break;
        }
      }
      if (o === undefined) {
        continue;
      }
      const p = holder.get(o)!;
      unpair(p);
      unpair(i);
      result[i] = old[o]!;
      if (fits(p, q)) {
        result[p] = left;
      } else {
        partner.set(p, q);
        holder.set(q, p);
        this._inherit.set(statements[p]!, left);
        fileHeld(q);
        queue.push(p);
      }
    }
    // A chunk a statement left for one it keeps goes to a statement no pass
    // matched, as the statements an edit moved find theirs.
    matchMoved();
    return result;
  }

  /** Whether a chunk's recorded values and facts still hold for `statement`. */
  protected holds(chunk: StatementChunk, statement: StatementSource): boolean {
    const values = this.chunkValues(chunk);
    return (
      values !== undefined &&
      values === this.statementValues(statement) &&
      this.factsHold(chunk)
    );
  }

  /** Where a statement stands, which the chunk it keeps must have been
   *  emitted for: in a body, or in a flow or a declaration sequence. The
   *  compile gives a statement of a flow the source range of its lowered
   *  block and a statement of a body the range of its first object, and the
   *  first row of a chunk's line table is that range, so a statement an edit
   *  moves into a body or out of one, with its text and column as they were,
   *  is emitted again as a cold compile emits it there. */
  protected placementOf(statement: StatementSource): string {
    return this._inBody.has(statement) ? "body" : "sequence";
  }

  // The statements of the build in progress that stand in a body.
  protected _inBody = new WeakSet<StatementSource>();

  // The values each statement of the build in progress reads as, and each
  // chunk recorded (`statementValues`, `chunkValues`).
  protected _statementValues = new WeakMap<StatementSource, string>();
  protected _chunkValues = new WeakMap<ChunkInfo, string>();

  /** What a statement reads as in everything a chunk kept for it depends on
   *  besides its syntax, its lowering reads and the chunk's own facts: the
   *  globals it assigns, the function it defines, the locals and parameters
   *  of the functions it writes or runs in place, the texts the compiler
   *  names by document order, how each name resolves, and which of its
   *  bodies are functions. A chunk's values (`chunkValues`) read the same
   *  exactly when they agree. Computed once per build. */
  protected statementValues(statement: StatementSource): string {
    let values = this._statementValues.get(statement);
    if (values === undefined) {
      this.passesLastBuild.identity += 1;
      const exclude = bodyObjects(statement);
      values = JSON.stringify([
        assignedNames(statement) ?? null,
        statement.defines ?? null,
        hoistedOf(statement),
        this.placementOf(statement),
        paramsOf(statement),
        compilerNamedTexts(statement.objects, exclude),
        resolutionsOf([...statement.objects, ...hoistedLocals(statement)], exclude),
        (statement.bodies ?? []).map((body) => !!body.fn),
      ]);
      this._statementValues.set(statement, values);
    }
    return values;
  }

  /** The values a chunk recorded, in the form `statementValues` gives a
   *  statement's, or nothing for a chunk the store knows nothing of. */
  protected chunkValues(chunk: StatementChunk): string | undefined {
    const info = this._info.get(chunk);
    if (!info) {
      return undefined;
    }
    let values = this._chunkValues.get(info);
    if (values === undefined) {
      const functions: boolean[] = [];
      for (let k = 0; k < blockCount(chunk); k += 1) {
        functions.push(!!(blockFlags(chunk, k) & BLOCK_FUNCTION));
      }
      values = JSON.stringify([
        info.globals ?? null,
        info.defines ?? null,
        info.hoisted,
        info.placement,
        info.params,
        info.emitReads,
        info.resolutions,
        functions,
      ]);
      this._chunkValues.set(info, values);
    }
    return values;
  }

  /** A statement's syntax, lowering reads and values, which a chunk it keeps
   *  reads the same in (`chunkIdentity`). */
  protected statementIdentity(statement: StatementSource): string {
    let identity = this._statementIdentities.get(statement);
    if (identity === undefined) {
      identity = `${statement.syntax()}\u0000${statement.reads}\u0000${this.statementValues(statement)}`;
      this._statementIdentities.set(statement, identity);
    }
    return identity;
  }

  // The identities of the build in progress's statements, and of the
  // chunks' recorded infos, each built once (`statementIdentity`,
  // `chunkIdentity`).
  protected _statementIdentities = new WeakMap<StatementSource, string>();
  protected _chunkIdentities = new WeakMap<ChunkInfo, string>();

  /** A chunk's recorded syntax, lowering reads and values, in the form of
   *  `statementIdentity`. */
  protected chunkIdentity(chunk: StatementChunk): string | undefined {
    const info = this._info.get(chunk);
    if (!info) {
      return undefined;
    }
    let identity = this._chunkIdentities.get(info);
    if (identity === undefined) {
      identity = `${info.syntax}\u0000${info.reads}\u0000${this.chunkValues(chunk)}`;
      this._chunkIdentities.set(info, identity);
    }
    return identity;
  }

  /** Whether the facts a chunk recorded about itself still hold in the build
   *  in progress, whatever statement it is kept for: its ids belong to the
   *  table's generation, and every fact its reference table records about a
   *  symbol is unchanged. */
  protected factsHold(chunk: StatementChunk, anonymous = false): boolean {
    const info = this._info.get(chunk);
    if (!info || info.generation !== this.table.generation) {
      return false;
    }
    this.passesLastBuild.facts += 1;
    const start = referenceTableStart(chunk);
    for (let r = 0; r < chunk[H_REFERENCE_ROWS]!; r += 1) {
      const at = start + r * REFERENCE_ROW_WORDS;
      const symbol = chunk[at]!;
      // A jump, a count or a symbol value of a scene, a branch or a label
      // reads no fact about its symbol (`referenceTarget`).
      if (chunk[at + 1] === NO_FACTS) {
        continue;
      }
      // The facts of a function another statement writes are known once the
      // build has planned the statements' functions, which follows the
      // alignment, so they are read in a pass of their own (`anonymous`).
      if (isAnonymousSymbol(this.table, symbol) !== anonymous) {
        continue;
      }
      if (this.readFacts(symbol, info.facts.get(symbol) ?? []) !== chunk[at + 1]) {
        return false;
      }
    }
    return true;
  }

  /** The hash of the facts named `names` about `symbol`, each read again
   *  from the program being built, which a chunk that read them keeps in its
   *  reference table row. */
  protected readFacts(symbol: number, names: readonly string[]): number {
    const read = new Map<string, string>();
    for (const name of names) {
      read.set(name, this.factOf(symbol, name));
    }
    return factHash(factsText(read));
  }

  /** The chunk the last build emitted or reused for a statement's block, for
   *  a test that asserts which chunks a compile kept. */
  chunkOf(block: object): StatementChunk | undefined {
    return this._placed.get(block) ?? this._byBlock.get(block);
  }

  /** The declaration chunk emitted or reused for a statement's block. */
  declarationChunkOf(block: object): StatementChunk | undefined {
    return (
      this._placedDeclarations.get(block) ?? this._byDeclaration.get(block)
    );
  }

  /** The function declared at the top level that the statement a chunk was
   *  emitted or reused for defines, for a test that keys statements by what
   *  their chunks depend on: which of the functions of one name the story
   *  defines under it depends on the others. */
  definesOf(chunk: StatementChunk): string | undefined {
    return this._info.get(chunk)?.defines;
  }
}

const sameChunks = (
  a: readonly StatementChunk[],
  b: readonly StatementChunk[],
): boolean => a.length === b.length && a.every((chunk, i) => chunk === b[i]);

const sameNumbers = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((n, i) => n === b[i]);

/** A sequence's arrays, sharing with the current root's `before` each array
 *  that reads the same (docs/engine/binary-program.md, section 1, The order
 *  structure): the arrays themselves when nothing changed, the chunks when
 *  only the line starts moved, as they do in a sequence that holds the
 *  edited one with a statement below it, and the line starts when only the
 *  chunks changed, as when a statement is emitted again in place. */
const shareArrays = (
  before: SequenceArrays | undefined,
  chunks: StatementChunk[],
  lineStarts: number[],
): SequenceArrays => {
  if (!before) {
    return { chunks, lineStarts };
  }
  const sameChunkArray = sameChunks(before.chunks, chunks);
  const sameStarts = sameNumbers(before.lineStarts, lineStarts);
  if (sameChunkArray && sameStarts) {
    return before;
  }
  return {
    chunks: sameChunkArray ? before.chunks : chunks,
    lineStarts: sameStarts ? before.lineStarts : lineStarts,
  };
};

/** How many chunks each pass of a build visited (`ChunkStore.passesLastBuild`):
 *  the statements whose recorded values it read again (`identity`), the
 *  chunks whose recorded facts it read again (`facts`), the statements whose
 *  references to other statements' functions it read again (`anonymous`),
 *  the chunks it emitted, the chunks it placed where the current root does
 *  not hold them (`placement`), and the chunks whose rows of the definition
 *  arrays and of the chunk table it wrote. A build over an edit reads none of
 *  these for a chunk the edit did not affect.
 *
 *  Two counts are of bookkeeping that is linear in the program, which a
 *  build still does: the current root's statements it lists to align the
 *  statements that are not carried with (`order`, which the root it builds
 *  lists again on the next build), and the entries of the sequences it
 *  assembles (`assembly`): every flow's, whose entries the compile hands
 *  over whole (`programFlows`), and those of the bodies it builds again.
 *  Neither reads a chunk's facts or values, or writes a row. */
export interface BuildPasses {
  identity: number;
  facts: number;
  anonymous: number;
  emitted: number;
  placement: number;
  definitions: number;
  chunkTable: number;
  order: number;
  assembly: number;
}

const emptyPasses = (): BuildPasses => ({
  identity: 0,
  facts: 0,
  anonymous: 0,
  emitted: 0,
  placement: 0,
  definitions: 0,
  chunkTable: 0,
  order: 0,
  assembly: 0,
});

/** The flow, the kind and the script a sequence belongs to, which its row
 *  names. */
interface SequenceHome {
  flow: number;
  kind: SymbolKindValue;
  uri: string;
}

const sameHome = (row: SequenceRow, home: SequenceHome): boolean =>
  row.flow === home.flow && row.kind === home.kind && row.uri === home.uri;

/** What a build of the sequences knows and collects. */
interface SequenceBuild {
  previous: ProgramRoot | undefined;
  chunkOf: ReadonlyMap<StatementSource, StatementChunk | undefined>;
  /** The statements whose chunks were kept with nothing read again. */
  carried: ReadonlySet<StatementSource>;
  /** The statements whose bodies are built again: each one not carried, and
   *  the statements that hold one. */
  unsettled: ReadonlySet<StatementSource>;
  coverage: ProgramCoverage;
  /** The new root's rows, which start as the current root's. */
  sequences: Map<number, SequenceRow>;
  /** Each sequence built again, with its arrays in the current root. */
  rebuilt: Map<number, SequenceArrays | undefined>;
  /** Each chunk placed where the current root does not hold it, with its
   *  sequence and whether that sequence is inside a function. */
  placed: Map<StatementChunk, { sequence: number; inFunction: boolean }>;
  /** The ids of the rows the build wrote. */
  live: Set<number>;
  /** Whether each sequence the build visited is inside a function. */
  inFunction: Map<number, boolean>;
  /** How many statements the new root holds. */
  statements: number;
  /** How many statements the writer had no emit path for. */
  failed: number;
  fail: (construct: string, line: number) => void;
}

/** A definition's facts as one text, by name, which a build compares with the
 *  current root's to find the symbols whose facts changed. */
const definitionText = (defined: Readonly<Record<string, string>>): string =>
  Object.keys(defined)
    .sort()
    .map((name) => `${name}=${defined[name]}`)
    .join("\n");

/** The current root's definition arrays as a build starts from them, sized
 *  for the table: a copy when they belong to the table's generation, and
 *  empty arrays after a reseed, when every chunk is emitted again. */
const copyDefinitions = (
  defs: DefinitionArrays | undefined,
  size: number,
  sameGeneration: boolean,
): DefinitionArrays => {
  const out = emptyDefinitions(size);
  if (defs && sameGeneration) {
    out.chunk.set(defs.chunk.subarray(0, Math.min(size, defs.chunk.length)));
    out.offset.set(defs.offset.subarray(0, Math.min(size, defs.offset.length)));
    out.sequence.set(
      defs.sequence.subarray(0, Math.min(size, defs.sequence.length)),
    );
    out.kind.set(defs.kind.subarray(0, Math.min(size, defs.kind.length)));
    out.parent.set(defs.parent.subarray(0, Math.min(size, defs.parent.length)));
    out.start.set(defs.start.subarray(0, Math.min(size, defs.start.length)));
  }
  return out;
};

/** How the readers of a statement's identity hand the statement watch each
 *  object they read, with the reader that reads its value. */
type WatchRead = (obj: ParsedObject, read: (obj: any) => string) => void;

/** Whether a divert is one a chunk names no symbol for: a call's, `done`,
 *  `fin`, and a loop's own jumps, `break` and `continue` among them, which
 *  the writer emits inside the chunk (`Divert.programJumpKey`). */
const isOwnJump = (obj: Divert): boolean =>
  obj.isFunctionCall ||
  obj.isEnd ||
  obj.isDone ||
  loopExitOf.has(obj) ||
  isLoopInternal(obj);

/** What a name, a call or a jump found, as the symbol its chunk names it by
 *  reads: a scene, a branch, a label or a function declared at the top level
 *  by its qualified name, which the compile keeps whatever object stands for
 *  it; and a function a statement writes by the function itself, whose
 *  anonymous symbol belongs to that object for as long as its statement is
 *  kept. */
const targetOf = (target: ParsedObject | null | undefined): string => {
  if (!target) {
    return "-";
  }
  const name =
    target.programSymbolName ??
    (target instanceof FlowBase && target.parent === target.story
      ? `flow:${target.identifier?.name ?? ""}`
      : null);
  return name ?? `#${identityOf(target)}`;
};

const readReference = (obj: VariableReference): string =>
  `${obj.resolutionKey}|${targetOf(obj.countTarget)}`;
const readAssignment = (obj: VariableAssignment): string => obj.resolutionKey;
const readCall = (obj: FunctionCall): string =>
  obj.isUserCall
    ? `${obj.proxyDivert.callResolutionKey}|${targetOf(obj.proxyDivert.targetContent)}`
    : "native";
const readJump = (obj: Divert): string =>
  `${obj.programJumpKey}|${targetOf(obj.targetContent)}`;
const readLabel = (obj: Gather | Choice): string => obj.programResolutionKey;
const readText = (obj: Text): string => obj.text;

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

/** The choices a statement's own code raises, in the order the writer meets
 *  them: none of its bodies' statements, which are other chunks' code. */
const choicesOf = (statement: StatementSource): Choice[] => {
  const out: Choice[] = [];
  const exclude = bodyObjects(statement);
  const visit = (obj: ParsedObject) => {
    if (exclude?.has(obj) || obj instanceof FlowBase) {
      return;
    }
    if (obj instanceof Choice) {
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

/** What a choice is aligned by when its statement is emitted again, which
 *  its count symbol and its body go with (section 2): its own source,
 *  normalized, read through the statement's `text` from the range its
 *  lowering recorded, or without one the text of its start and choice-only
 *  content. */
const choiceFingerprint = (
  choice: Choice,
  source?: (from: number, to: number) => string,
): string => {
  const range = alternatorSourceOf.get(choice);
  if (range && source) {
    return `choice|${normalizeSource(source(range.from, range.to))}`;
  }
  const text = (list: ParsedObject): string =>
    list.content
      .map((obj) => (obj instanceof Text ? obj.text : obj.typeName))
      .join("");
  return `choice|${normalizeSource(`${text(choice.startContent)}[${text(choice.choiceOnlyContent)}]`)}`;
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
 * part, or nothing, and the pass that paired it. It is the one alignment of
 * every part of a statement emitted again in place: its functions, its
 * alternators, its choices and the parts that head its other bodies.
 */
const alignParts = (
  now: readonly string[],
  was: readonly string[],
): { pairs: (number | undefined)[]; how: (HandedOn | undefined)[] } => {
  const pairs: (number | undefined)[] = now.map(() => undefined);
  const how: (HandedOn | undefined)[] = now.map(() => undefined);
  const taken = new Set<number>();
  // Equal and in order.
  let from = 0;
  now.forEach((fingerprint, i) => {
    for (let o = from; o < was.length; o += 1) {
      if (was[o] === fingerprint) {
        pairs[i] = o;
        how[i] = "aligned";
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
      how[i] = "aligned-moved";
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
      how[i] = "between";
      taken.add(o);
      lastOld = o;
      break;
    }
  }
  return { pairs, how };
};

/** What a body that neither a choice nor a function heads is aligned by
 *  when its statement is emitted again in place (section 2): the source of
 *  the part that heads it, normalized (a branch's condition or its `else`,
 *  a loop's header, a `do`, a `then` clause with its label), and for a `then`
 *  clause the depth of the `choose` block it closes, which tells a block's
 *  own clause from that of a block written in its preamble. */
const headFingerprint = (body: BodySource): string => {
  const part = partOfBody.get(body.shape as BodyShape);
  const depth =
    part instanceof Gather ? `then:${part.indentationDepth}|` : "head|";
  return `${depth}${normalizeSource(body.headSource?.() ?? "")}`;
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
  watch?: WatchRead,
): string[] => {
  const out: string[] = [];
  const visit = (obj: ParsedObject) => {
    if (exclude?.has(obj)) {
      return;
    }
    if (obj instanceof Text && obj.isCompilerNamed) {
      out.push(obj.text);
      watch?.(obj, readText);
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
  watch?: WatchRead,
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
    if (obj instanceof VariableReference) {
      out.push(obj.resolutionKey);
      watch?.(obj, readReference);
    }
    if (obj instanceof VariableAssignment) {
      out.push(obj.resolutionKey);
      watch?.(obj, readAssignment);
    }
    if (obj instanceof FunctionCall && obj.isUserCall) {
      out.push(obj.proxyDivert.callResolutionKey);
      watch?.(obj, readCall);
    }
    // The symbol a jump, a tunnel, a thread or a divert target names, and
    // the symbol a label exports (#696).
    // A divert whose jump names no symbol (a call's, `done`, `fin`, a
    // loop's own) records nothing; one that holds a function as a value
    // records nothing either, and the watch reads which function it found.
    if (obj instanceof Divert && !isOwnJump(obj)) {
      const key = obj.programJumpKey;
      if (key !== null) {
        out.push(key);
      }
      watch?.(obj, readJump);
    }
    if (obj instanceof Gather && obj.name && !isLoopInternal(obj)) {
      out.push(obj.programResolutionKey);
      watch?.(obj, readLabel);
    }
    if (obj instanceof Choice && obj.name) {
      out.push(obj.programResolutionKey);
      watch?.(obj, readLabel);
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
