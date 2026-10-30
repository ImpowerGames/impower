import { createProgramTable, reseedProgramTable, type ProgramTable } from "./ProgramTable";
import {
  alternatorSourceOf,
  functionShapeOf,
  isLoopInternal,
  loopExitOf,
  partOfBody,
  type BodyShape,
} from "../compiler/lower/utils/statementShape";
import type { DebugMetadata } from "../runtime/DebugMetadata";
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
  type BlockInput,
  type FunctionInput,
} from "./BinaryProgramWriter";
import {
  FACT_KIND,
  FACT_PARAMS,
  parameterKinds,
  UNDEFINED_FACT,
} from "./ProgramFacts";
import { StoryException } from "../runtime/StoryException";
import {
  StatementMemoRetry,
  type StatementMemoEntry,
} from "../compiler/lower/statementMemo";
import { MemoizedStatementNeeded } from "../inkjs/compiler/Parser/ParsedHierarchy/MemoizedStatement";
import { StatementFailure, UnsupportedConstruct } from "./ProgramEmitter";
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
  type ProgramStoryTables,
  type RunFile,
} from "./ProgramRoot";
import { identityOf, StatementWatch } from "./StatementWatch";
import { Op, opOf } from "./ProgramInstructions";
import { alignParts, recordChunkParts, type HandedOn } from "./chunkParts";
import {
  anonymousSymbol,
  internSymbol,
  isAnonymousSymbol,
  NUMBERED_SYNTHETIC_NAME,
  NUMBERED_SYNTHETIC_NAMES,
  renumberAnonymousSymbols,
  snapshotTable,
  SymbolKind,
  UNDEFINED_KIND,
  type SequenceKind,
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
  type ProgramChunk,
} from "./ProgramChunk";

export interface StatementSource {
  block: object;
  objects: readonly ParsedObject[];
  range: DebugMetadata | null;
  firstLine: number;
  source: () => string;
  fingerprint?: () => string;
  syntax: () => string;
  reads: string;
  fingerprintOf?: (from: number, to: number) => string;
  bodies?: readonly BodySource[];
  lineEnd?: (line: number) => number;
  defines?: string;
  memo?: boolean;
  stands?: readonly ParsedObject[];
}

export interface BodySource {
  shape: object;
  statements: readonly StatementSource[];
  firstLine: number;
  span: number;
  headLines: number;
  headFingerprint?: () => string;
  fn?: ParsedObject;
  partFingerprint?: () => string;
}

export interface DeclaredGlobal {
  name: string;
  assignment: VariableAssignment;
}

export interface DeclarationSource extends StatementSource {
  uri: string;
  globals: readonly DeclaredGlobal[];
}

export interface FlowSource {
  name: string;
  kind: SymbolKindValue;
  uri: string;
  firstLine: number;
  span: number;
  statements: readonly StatementSource[];
  startsWith?: string;
  params?: string;
}

export interface ProgramSource {
  flows: readonly FlowSource[];
  declarations?: readonly DeclarationSource[];
  lineCount?: (uri: string) => number;
  changed?: ReadonlyMap<string, readonly (readonly [number, number])[]>;
  runFiles?: ReadonlyMap<string, RunFile>;
}

export interface UnsupportedConstructSite {
  construct: string;
  uri: string;
  line: number;
}

const emitFailure = (
  e: unknown,
  uri: string,
  statement: StatementSource,
): unknown =>
  e instanceof MemoizedStatementNeeded ||
  e instanceof StatementMemoRetry ||
  e instanceof StatementFailure
    ? e
    : new StatementFailure(uri, statement.firstLine, e, lastLineOf(statement));

const lastLineOf = (statement: StatementSource): number =>
  statement.range
    ? Math.max(statement.firstLine, statement.range.endLineNumber - 1)
    : statement.firstLine;

const clashAt = (
  row: SequenceRow | undefined,
  entry: number,
  uri: string,
): { uri: string; line: number } => ({
  uri: row?.uri ?? uri,
  line: !row
    ? 0
    : entry < 0 || row.block >= 0
      ? row.firstLine
      : row.flow >= 0
        ? row.firstLine + row.arrays.lineStarts[entry]!
        : row.arrays.lineStarts[entry]!,
});

interface DeclarationSite {
  uri: string;
  line: number;
  endLine: number;
}

export interface ProgramCoverage {
  statements: number;
  emitted: number;
  unsupported: Record<string, number>;
}

export interface ProgramBuild {
  root?: ProgramRoot;
  unsupported?: UnsupportedConstructSite;
  coverage: ProgramCoverage;
  declarationsChanged: boolean;
}

export interface BuildRecord {
  previous: ProgramRoot | undefined;
  root: ProgramRoot;
  dropped: ReadonlySet<ProgramChunk>;
  placed: ReadonlySet<ProgramChunk>;
  sequences: ReadonlySet<number>;
  declarationsChanged: boolean;
}

interface FunctionPart {
  fingerprint: string;
  symbol: number;
  block: number;
}

interface AlternatorPart {
  fingerprint: string;
  symbol: number;
}

interface ChoicePart {
  fingerprint: string;
  symbol: number;
  block: number;
}

interface HeadPart {
  fingerprint: string;
  block: number;
}

export type { HandedOn };

export interface BodyHandOff {
  sequenceId: number;
  part: "function" | "choice" | "head";
  how: HandedOn;
}

interface ChunkInfo {
  syntax: string;
  reads: string;
  emitReads: readonly string[];
  resolutions: readonly string[];
  globals?: string;
  defines?: string;
  parts: readonly FunctionPart[];
  alternators: readonly AlternatorPart[];
  choices: readonly ChoicePart[];
  heads: readonly HeadPart[];
  anonymousReferences: readonly number[];
  hoisted: string;
  placement: string;
  params: string;
  facts: ReadonlyMap<number, readonly string[]>;
  generation: number;
}

interface FunctionPlan {
  symbols: (number | undefined)[];
  oldBlocks: (number | undefined)[];
  how: (HandedOn | undefined)[];
}

const assignedNames = (statement: StatementSource): string | undefined =>
  "globals" in statement
    ? (statement as DeclarationSource).globals.map((g) => g.name).join("\u0000")
    : undefined;

export class ChunkStore {
  readonly table: ProgramTable;

  current: ProgramRoot | undefined;

  emittedLastBuild = 0;

  handedOnLastBuild: BodyHandOff[] = [];

  initializerRuns = 0;

  protected _writer: BinaryProgramWriter;
  protected _nextChunkId = 1;
  protected _nextSequenceId = 0;
  protected _nextRootId = 0;
  protected _byBlock = new WeakMap<object, ProgramChunk>();
  protected _byDeclaration = new WeakMap<object, ProgramChunk>();
  protected _info = new WeakMap<ProgramChunk, ChunkInfo>();
  protected _functionChunks: ReadonlySet<ProgramChunk> = new Set();

  readonly watch = new StatementWatch();

  passesLastBuild: BuildPasses = emptyPasses();

  lastBuild: BuildRecord | undefined;

  static verifyBuilds = false;

  protected _readers = new Map<number, Set<ProgramChunk>>();
  protected _committedFacts = new Map<number, string>();
  protected _committedLabels = new Map<number, string>();
  protected _placed = new Map<object, ProgramChunk>();
  protected _placedDeclarations = new Map<object, ProgramChunk>();
  protected _orders = new WeakMap<
    ProgramRoot,
    { order: ProgramChunk[]; owners: Map<ProgramChunk, ProgramChunk> }
  >();
  protected _statementCounts = new WeakMap<ProgramRoot, number>();
  protected _sequenceInFunction = new Map<number, boolean>();

  constructor(table: ProgramTable = createProgramTable()) {
    this.table = table;
    this._writer = new BinaryProgramWriter(
      table,
      (symbol, name) => this.factOf(symbol, name),
      (fn) => this.symbolOf(fn),
      (sequence) => this.alternatorOf(sequence),
    );
  }

  build(
    source: ProgramSource | readonly FlowSource[],
    commit: boolean,
    tables: ProgramStoryTables | null = null,
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
    this.lastBuild = undefined;
    const coverage: ProgramCoverage = {
      statements: 0,
      emitted: 0,
      unsupported: {},
    };
    let unsupported: UnsupportedConstructSite | undefined;
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
    const facts = new Map<number, string>();
    for (const [symbol, defined] of this._definitions) {
      facts.set(symbol, definitionText(defined));
    }
    const flagged = new Set<ProgramChunk>();
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
    this._used = new Set();
    this._inherit = new Map();
    const statements: StatementSource[] = [];
    const owners = new Map<StatementSource, StatementSource>();
    const slots: ListSlot[] = [];
    const entries: number[] = [];
    const starts = new Map<StatementSource, number>();
    const ends = new Map<StatementSource, number>();
    const bodySlots = new Map<StatementSource, ListSlot[]>();
    const collect = (slot: ListSlot) => {
      slot.statements.forEach((statement, entry) => {
        if (slot.owner) {
          owners.set(statement, slot.owner);
          this._inBody.add(statement);
        }
        slots.push(slot);
        entries.push(entry);
        statements.push(statement);
        if (statement.bodies?.length) {
          starts.set(statement, statements.length - 1);
          collectBodies(statement);
          ends.set(statement, statements.length);
        }
      });
    };
    const collectBodies = (statement: StatementSource) => {
      const lists = (statement.bodies ?? []).map(
        (body, block): ListSlot => ({
          statements: body.statements,
          owner: statement,
          block,
          lo: -1,
          hi: -1,
        }),
      );
      bodySlots.set(statement, lists);
      lists.forEach(collect);
    };
    const flowSlots = flows.map(
      (flow, f): ListSlot => ({
        statements: flow.statements,
        flow: f,
        block: -1,
        lo: -1,
        hi: -1,
      }),
    );
    const flowStarts = flowSlots.map((slot) => {
      const start = statements.length;
      collect(slot);
      return start;
    });
    const declarationsStart = statements.length;
    const declarationRanges = declarations.map((declaration) => {
      const start = statements.length;
      collectBodies(declaration);
      return [start, statements.length] as const;
    });
    const carried = new Set<StatementSource>();
    let lo = -1;
    let hi = -1;
    const kept = statements.map((statement, i) => {
      const chunk =
        this.keepCarried(this._byBlock, statement, previous, flagged, carried) ??
        this.keep(this._byBlock, statement);
      if (!carried.has(statement)) {
        lo = lo < 0 ? i : lo;
        hi = Math.max(hi, (ends.get(statement) ?? i + 1) - 1);
      }
      return chunk;
    });
    this.memosKept(statements, carried);
    const nesting = {
      owner: (statement: StatementSource) => owners.get(statement),
      oldLine: (chunk: ProgramChunk) =>
        previous ? this.oldLineOf(previous, chunk) : -1,
      oldShape: (chunk: ProgramChunk) =>
        Array.from(
          { length: previous ? blockCount(chunk) : 0 },
          (_, k) => previous!.body(chunk, k)?.arrays.chunks.length ?? 0,
        ),
    };
    const window =
      program.changed && previous
        ? this.alignmentWindow({
            previous,
            flows,
            symbols,
            declarations,
            statements,
            kept,
            slots,
            entries,
            starts,
            flowStarts,
            declarationsStart,
            declarationRanges,
            lo,
            hi,
          })
        : undefined;
    let reused: (ProgramChunk | undefined)[];
    if (window) {
      passes.order = window.old.length;
      const checked =
        ChunkStore.verifyBuilds && lo >= 0 && (lo > 0 || hi + 1 < statements.length)
          ? { used: new Set(this._used), inherit: new Map(this._inherit) }
          : undefined;
      reused = kept.slice();
      if (lo >= 0) {
        const aligned = this.align(
          statements.slice(lo, hi + 1),
          window.old,
          kept.slice(lo, hi + 1),
          { ...nesting, oldOwner: (chunk) => window.owners.get(chunk) },
        );
        aligned.forEach((chunk, i) => (reused[lo + i] = chunk));
      }
      if (checked) {
        this.verifyAlignment(statements, kept, previous!, nesting, reused, checked);
      }
    } else {
      const old = previous ? this.statementOrderOf(previous) : [];
      passes.order = old.length;
      reused = this.align(statements, old, kept, {
        ...nesting,
        oldOwner: (chunk) => this.oldOwnerOf(previous!, chunk),
      });
    }
    const chunkOf = new Map<StatementSource, ProgramChunk | undefined>();
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

    const everyStatement = [...statements, ...declarations];
    for (const statement of everyStatement) {
      this.planFunctions(statement, chunkOf.get(statement));
    }
    for (const [symbol, defined] of this._anonymousDefinitions) {
      facts.set(symbol, definitionText(defined));
    }
    const recheck = new Set<ProgramChunk>();
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
    this.memosKept(statements, carried);
    const unsettled = new Set<StatementSource>();
    const declarationWindows = new Map<string, { lo: number; hi: number }>();
    const widen = (uri: string, from: number, to: number) => {
      const window = declarationWindows.get(uri);
      if (window) {
        window.lo = Math.min(window.lo, from);
        window.hi = Math.max(window.hi, to);
      } else {
        declarationWindows.set(uri, { lo: from, hi: to });
      }
    };
    for (const [uri, ranges] of program.changed ?? []) {
      for (const [from, to] of ranges) {
        widen(uri, from, to);
      }
    }
    everyStatement.forEach((statement, i) => {
      if (carried.has(statement)) {
        return;
      }
      if (i >= statements.length) {
        const declaration = statement as DeclarationSource;
        widen(declaration.uri, declaration.firstLine, declaration.firstLine);
      }
      let at: StatementSource | undefined = statement;
      let index: number | undefined = i < statements.length ? i : undefined;
      while (at && !unsettled.has(at)) {
        unsettled.add(at);
        if (index !== undefined) {
          const slot = slots[index]!;
          const entry = entries[index]!;
          slot.lo = slot.lo < 0 ? entry : Math.min(slot.lo, entry);
          slot.hi = Math.max(slot.hi, entry);
        }
        at = owners.get(at);
        index = at ? starts.get(at) : undefined;
      }
    });

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
      droppedRows: new Set(),
      placed: new Map(),
      live: new Set(),
      inFunction: new Map(),
      statements: previous ? this.statementCountOf(previous) : 0,
      failed: 0,
      fail: () => {},
      changed: program.changed,
      bodySlots,
      placedFor: ChunkStore.verifyBuilds ? new Map() : undefined,
    };
    const flowIds = new Map<number, number>();
    const scriptFlows = new Map<string, number[]>();
    flows.forEach((flow, f) => {
      const symbol = symbols[f]!;
      const before = previous?.flowNamed(flow.name);
      const id = before?.id ?? this._nextSequenceId++;
      build.fail = (construct: string, line: number) => {
        unsupported ??= { construct, uri: flow.uri, line };
      };
      const arrays = this.buildSequence(
        build,
        flowSlots[f]!,
        flow.firstLine,
        flow.span,
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

    const declarationChunks: ProgramChunk[] = [];
    const declarationIds = new Map<string, number>();
    const emittedBeforeDeclarations = this._writer.emitted;
    const byScript = new Map<string, { source: DeclarationSource; chunk: ProgramChunk }[]>();
    const windowed = new Map<string, { source: DeclarationSource; chunk: ProgramChunk }[]>();
    const heldDeclarations = new Set<ProgramChunk>();
    declarations.forEach((declaration) => {
      let chunk = chunkOf.get(declaration);
      if (!chunk) {
        try {
          chunk = this.emit(declaration, (input) =>
            declaration.globals.length === 0
              ? this._writer.write(input)
              : this._writer.writeDeclaration({
                  ...input,
                  globals: declaration.globals,
                }),
          );
        } catch (e) {
          if (!(e instanceof UnsupportedConstruct)) {
            throw emitFailure(e, declaration.uri, declaration);
          }
          coverage.unsupported[e.construct] =
            (coverage.unsupported[e.construct] ?? 0) + 1;
          build.failed += 1;
          unsupported ??= {
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
      build.placedFor?.set(declaration, chunk);
      declarationChunks.push(chunk);
      heldDeclarations.add(chunk);
      let list = byScript.get(declaration.uri);
      if (!list) {
        list = [];
        byScript.set(declaration.uri, list);
      }
      list.push({ source: declaration, chunk });
      const window = declarationWindows.get(declaration.uri);
      if (
        window &&
        declaration.firstLine >= window.lo &&
        declaration.firstLine <= window.hi
      ) {
        let inWindow = windowed.get(declaration.uri);
        if (!inWindow) {
          inWindow = [];
          windowed.set(declaration.uri, inWindow);
        }
        inWindow.push({ source: declaration, chunk });
      }
      build.fail = (construct, line) => {
        unsupported ??= { construct, uri: declaration.uri, line };
      };
      if (unsettled.has(declaration)) {
        this.buildBodies(
          build,
          declaration,
          chunk,
          { flow: -1, kind: UNDEFINED_KIND, uri: declaration.uri },
          false,
        );
      }
    });
    const declarationsEmitted =
      this._writer.emitted > emittedBeforeDeclarations;
    for (const [uri, list] of byScript) {
      const before = previous?.declarations(uri);
      const id = before?.id ?? this._nextSequenceId++;
      const kept =
        before && program.changed
          ? this.keptDeclarations(
              list.length,
              declarationWindows.get(uri),
              windowed.get(uri) ?? [],
              heldDeclarations,
              before,
              program.lineCount?.(uri),
            )
          : undefined;
      let arrays: SequenceArrays;
      if (kept) {
        arrays = kept.arrays;
        this.placeIn(build, id, before, arrays, false, false, kept.window);
      } else {
        passes.assembly += list.length;
        list.sort((a, b) => a.source.firstLine - b.source.firstLine);
        const chunks = list.map((entry) => entry.chunk);
        const lineStarts = list.map((entry) => entry.source.firstLine);
        arrays = shareArrays(before?.arrays, chunks, lineStarts);
        this.placeIn(build, id, before, arrays, false, false);
      }
      this.setRow(build, {
        id,
        arrays,
        flow: -1,
        kind: UNDEFINED_KIND,
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
    const dropped = this.droppedChunks(build);
    coverage.statements = build.statements + build.failed;
    if (unsupported) {
      return { unsupported, coverage, declarationsChanged: true };
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
      functionsChanged ||
      !previous.tables?.luauEntry !== !tables?.luauEntry;
    const definitions = this.definitionArrays(
      flows,
      symbols,
      flowIds,
      build,
      dropped,
      previous,
      (construct, uri, line) => {
        unsupported ??= { construct, uri, line };
      },
    );
    if (unsupported || !definitions) {
      return { unsupported, coverage, declarationsChanged };
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
      tables,
      declarationIds,
      declarationChunks,
      definitions,
      this._labels,
      this._symbolRemaps,
      this.runFilesBySymbol(program.runFiles),
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
        declarations,
        (statement) =>
          build.placedFor?.get(statement) ?? build.chunkOf.get(statement),
      );
    }
    if (declarationsChanged || this._declarationsFailed) {
      this.initializerRuns += 1;
      const sources = new Map<number, DeclarationSource>();
      for (const list of byScript.values()) {
        for (const { source, chunk } of list) {
          sources.set(chunkId(chunk), source);
        }
      }
      const failure = this.runDeclarations(root, (chunk, globalIndex) => {
        const source = sources.get(chunk);
        if (!source) {
          return undefined;
        }
        const global = source.globals[globalIndex];
        const metadata = global?.assignment.debugMetadata;
        if (!metadata) {
          return { uri: source.uri, line: source.firstLine, endLine: lastLineOf(source) };
        }
        const line = metadata.startLineNumber - 1;
        return { uri: source.uri, line, endLine: Math.max(line, metadata.endLineNumber - 1) };
      });
      if (commit) {
        this._declarationsFailed = failure !== null;
      }
      if (failure) {
        const { error, site } = failure;
        if (site) {
          throw new StatementFailure(site.uri, site.line, error, site.endLine);
        }
        const at =
          error instanceof StoryException && error.raisedAddress !== null
            ? root.locationOf(error.raisedAddress)
            : undefined;
        throw at ? new StatementFailure(at.uri, at.startLine, error) : error;
      }
    }
    if (commit) {
      this.commit(root, build, dropped, facts, functionChunks, everyStatement);
    }
    this.lastBuild = {
      previous,
      root,
      dropped,
      placed: new Set(build.placed.keys()),
      sequences: new Set([...build.rebuilt.keys(), ...build.droppedRows]),
      declarationsChanged,
    };
    return { root, coverage, declarationsChanged };
  }

  protected commit(
    root: ProgramRoot,
    build: SequenceBuild,
    dropped: ReadonlySet<ProgramChunk>,
    facts: ReadonlyMap<number, string>,
    functionChunks: Set<ProgramChunk>,
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

  protected definitionArrays(
    flows: readonly FlowSource[],
    symbols: readonly number[],
    flowIds: ReadonlyMap<number, number>,
    build: SequenceBuild,
    dropped: ReadonlySet<ProgramChunk>,
    previous: ProgramRoot | undefined,
    fail: (construct: string, uri: string, line: number) => void,
  ): DefinitionArrays | undefined {
    const defs = copyDefinitions(
      previous?.definitionArrays,
      this.table.symbols.length,
      previous?.generation === this.table.generation,
    );
    const passes = this.passesLastBuild;
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
    let failed: { uri: string; line: number } | undefined;
    flows.forEach((flow, f) => {
      const symbol = symbols[f]!;
      defs.sequence[symbol] = flowIds.get(symbol) ?? -1;
      if (defs.chunk[symbol]! >= 0) {
        if (defs.kind[symbol] === SymbolKind.Label) {
          failed ??= { uri: flow.uri, line: flow.firstLine };
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
            const row = build.sequences.get(place.sequence);
            failed ??= clashAt(
              row,
              row ? row.arrays.chunks.indexOf(chunk) : -1,
              flows[0]?.uri ?? "",
            );
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
      if (previous) {
        failed = this.coldClash(flows, symbols, flowIds, build) ?? failed;
      }
      fail("a label named as another", failed.uri, failed.line);
      return undefined;
    }
    return defs;
  }

  protected coldClash(
    flows: readonly FlowSource[],
    symbols: readonly number[],
    flowIds: ReadonlyMap<number, number>,
    build: SequenceBuild,
  ): { uri: string; line: number } | undefined {
    const kinds = new Map<number, SymbolKindValue>();
    const owners = new Map<number, number>();
    flows.forEach((flow, f) => kinds.set(symbols[f]!, flow.kind));
    let failed: { uri: string; line: number } | undefined;
    const visited = new Set<number>();
    const bodies = (row: SequenceRow) => {
      for (const chunk of row.arrays.chunks) {
        for (let k = 0; k < blockCount(chunk); k += 1) {
          visit(blockField(chunk, k, B_SEQUENCE));
        }
      }
    };
    const place = (row: SequenceRow) => {
      row.arrays.chunks.forEach((chunk, entry) => {
        for (let r = 0; r < exportCount(chunk); r += 1) {
          const symbol = exportSymbol(chunk, r);
          const label = exportsLabel(chunk, r);
          const before = kinds.get(symbol);
          if (
            owners.get(symbol) !== chunkId(chunk) &&
            before !== undefined &&
            (label || before === SymbolKind.Label)
          ) {
            failed ??= clashAt(row, entry, flows[0]?.uri ?? "");
          }
          owners.set(symbol, chunkId(chunk));
          kinds.set(symbol, label ? SymbolKind.Label : SymbolKind.Function);
        }
        for (const part of this._info.get(chunk)?.alternators ?? []) {
          kinds.set(part.symbol, SymbolKind.Alternator);
        }
        for (const part of this._info.get(chunk)?.choices ?? []) {
          if (part.symbol >= 0) {
            kinds.set(part.symbol, SymbolKind.Choice);
          }
        }
      });
    };
    const visit = (id: number) => {
      const row = build.sequences.get(id);
      if (!row || visited.has(id)) {
        return;
      }
      visited.add(id);
      bodies(row);
      place(row);
    };
    flows.forEach((_, f) => {
      const id = flowIds.get(symbols[f]!);
      if (id !== undefined) {
        visit(id);
      }
    });
    const declarations = [...build.sequences.values()].filter(
      (row) => row.owner < 0 && row.flow < 0,
    );
    declarations.forEach((row) => {
      visited.add(row.id);
      bodies(row);
    });
    declarations.forEach(place);
    return failed;
  }

  protected _declarationsFailed = false;

  protected _symbolRemaps: Int32Array[] = [];

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

  protected runDeclarations(
    root: ProgramRoot,
    locate: (
      declarationChunk: number,
      globalIndex: number,
    ) => DeclarationSite | undefined,
  ): { error: unknown; site: DeclarationSite | undefined } | null {
    let error: { site: DeclarationSite | undefined } | undefined;
    let warning: { site: DeclarationSite | undefined } | undefined;
    try {
      new ProgramStory(root, {
        onDeclarationIssue: (chunk, isWarning, globalIndex) => {
          if (isWarning) {
            warning ??= { site: locate(chunk, globalIndex) };
          } else {
            error ??= { site: locate(chunk, globalIndex) };
          }
        },
      });
      return null;
    } catch (thrown) {
      if (thrown instanceof StoryException || error || warning) {
        return { error: thrown, site: (error ?? warning)?.site };
      }
      throw thrown;
    }
  }

  protected _definitions = new Map<number, Readonly<Record<string, string>>>();
  protected _anonymousDefinitions = new Map<
    number,
    Readonly<Record<string, string>>
  >();
  protected _functionSymbols = new Map<object, number>();
  protected _labels = new Map<number, string>();
  protected _plans = new Map<StatementSource, FunctionPlan>();
  protected _used = new Set<ProgramChunk>();
  protected _inherit = new Map<StatementSource, ProgramChunk>();
  protected _referenced: Set<number> | null = null;
  protected _alternatorPlan: Map<object, number> | null = null;

  protected alternatorOf(sequence: object): number {
    let symbol = this._alternatorPlan?.get(sequence);
    if (symbol === undefined) {
      symbol = anonymousSymbol(this.table);
      this._alternatorPlan?.set(sequence, symbol);
    }
    return symbol;
  }

  protected factOf(symbol: number, name: string): string {
    const facts = isAnonymousSymbol(this.table, symbol)
      ? this._anonymousDefinitions.get(symbol)
      : this._definitions.get(symbol);
    return facts?.[name] ?? UNDEFINED_FACT;
  }

  protected definitionFacts(flow: FlowSource): Record<string, string> {
    if (flow.kind === SymbolKind.Scene || flow.kind === SymbolKind.Branch) {
      return {
        [FACT_KIND]: String(flow.kind),
        [FACT_PARAMS]: flow.params ?? "",
      };
    }
    if (flow.kind !== SymbolKind.Function) {
      return { [FACT_KIND]: String(flow.kind) };
    }
    const fn = flow.statements[0]?.bodies?.find((body) => body.fn)?.fn;
    return {
      [FACT_KIND]: String(flow.kind),
      [FACT_PARAMS]: parameterKinds((fn as FlowBase | undefined)?.args),
    };
  }

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

  protected keep(
    byBlock: WeakMap<object, ProgramChunk>,
    statement: StatementSource,
  ): ProgramChunk | undefined {
    const chunk = byBlock.get(statement.block);
    if (chunk && !this._used.has(chunk) && this.holds(chunk, statement)) {
      this._used.add(chunk);
      return chunk;
    }
    return undefined;
  }

  protected planFunctions(
    statement: StatementSource,
    chunk: ProgramChunk | undefined,
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

  protected runFilesBySymbol(
    runFiles: ReadonlyMap<string, RunFile> | undefined,
  ): Map<number, RunFile> {
    const bySymbol = new Map<number, RunFile>();
    for (const [name, file] of runFiles ?? []) {
      const symbol = this.table.symbolIds.get(name);
      if (symbol !== undefined) {
        bySymbol.set(symbol, file);
      }
    }
    return bySymbol;
  }

  protected anonymousReferencesHold(
    chunk: ProgramChunk,
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

  protected emit(
    statement: StatementSource,
    write: (input: {
      objects: readonly ParsedObject[];
      range: DebugMetadata | null;
      firstLine: number;
      source: string;
      fingerprint: string;
      chunkId: number;
      blocks: BlockInput[];
      lineEnd?: (line: number) => number;
      definesOnly: boolean;
    }) => {
      chunk: ProgramChunk;
      reads: readonly string[];
      resolutions: readonly string[];
      facts: ReadonlyMap<number, readonly string[]>;
    },
  ): ProgramChunk {
    const bodies = statement.bodies ?? [];
    const inherited = this._inherit.get(statement);
    const oldInfo = inherited ? this._info.get(inherited) : undefined;
    const plan = this._plans.get(statement);
    const choices = choicesOf(statement);
    const choicePrints = choices.map((choice) =>
      choiceFingerprint(choice, statement.fingerprintOf),
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
    const alternators = alternatorsOf(statement);
    const fingerprints = alternators.map((sequence) =>
      alternatorFingerprint(sequence, statement.fingerprintOf),
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
        fingerprint: statement.fingerprint?.() ?? statement.source(),
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
    const info = this._info.get(chunk)!;
    recordChunkParts(chunk, {
      functions: info.parts,
      alternators: info.alternators,
      choices: info.choices,
      heads: info.heads,
    });
    return chunk;
  }

  protected buildSequence(
    build: SequenceBuild,
    slot: ListSlot,
    firstLine: number,
    span: number,
    before: SequenceRow | undefined,
    id: number,
    home: SequenceHome,
    inFunction: boolean,
  ): SequenceArrays {
    const statements = slot.statements;
    const chunks: ProgramChunk[] = [];
    const lineStarts: number[] = [];
    const moved =
      !before ||
      !sameHome(before, home) ||
      this._sequenceInFunction.get(id) !== inFunction;
    build.inFunction.set(id, inFunction);
    const reuse =
      moved || !build.changed
        ? undefined
        : this.reuseOf(build, slot, firstLine, span, home.uri, before!.arrays);
    const from = reuse?.head ?? 0;
    const to = statements.length - (reuse?.tail ?? 0);
    this.passesLastBuild.assembly += to - from;
    for (let entry = from; entry < to; entry += 1) {
      const statement = statements[entry]!;
      let chunk = build.chunkOf.get(statement);
      if (!chunk) {
        try {
          chunk = this.emit(statement, (input) => this._writer.write(input));
        } catch (e) {
          if (!(e instanceof UnsupportedConstruct)) {
            throw emitFailure(e, home.uri, statement);
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
      build.placedFor?.set(statement, chunk);
      chunks.push(chunk);
      lineStarts.push(statement.firstLine - firstLine);
      if (build.unsettled.has(statement) || moved) {
        this.buildBodies(build, statement, chunk, home, inFunction);
      }
    }
    if (!reuse) {
      const arrays = shareArrays(before?.arrays, chunks, lineStarts);
      this.placeIn(build, id, before, arrays, inFunction, moved);
      return arrays;
    }
    const old = before!.arrays;
    const oldTo = old.chunks.length - reuse.tail;
    if (from === to && from === oldTo && reuse.delta === 0) {
      return old;
    }
    const arrays = shareArrays(
      old,
      [...old.chunks.slice(0, from), ...chunks, ...old.chunks.slice(oldTo)],
      [
        ...old.lineStarts.slice(0, from),
        ...lineStarts,
        ...old.lineStarts.slice(oldTo).map((line) => line + reuse.delta),
      ],
    );
    this.placeIn(build, id, before, arrays, inFunction, moved, {
      from,
      to: from + chunks.length,
      oldFrom: from,
      oldTo,
    });
    return arrays;
  }

  protected reuseOf(
    build: SequenceBuild,
    slot: ListSlot,
    firstLine: number,
    span: number,
    uri: string,
    old: SequenceArrays,
  ): { head: number; tail: number; delta: number } | undefined {
    const list = slot.statements;
    const count = list.length;
    let lo = slot.lo;
    let hi = slot.hi;
    const lastBy = (line: number): number => {
      let a = 0;
      let b = count;
      while (a < b) {
        const m = (a + b) >> 1;
        if (list[m]!.firstLine <= line) {
          a = m + 1;
        } else {
          b = m;
        }
      }
      return a - 1;
    };
    const top = slot.flow === undefined ? firstLine : firstLine - 1;
    for (const [start, end] of build.changed?.get(uri) ?? []) {
      if (count === 0 || end < top || start >= firstLine + span) {
        continue;
      }
      const first = Math.max(0, lastBy(start));
      const last = Math.max(first, lastBy(end));
      lo = lo < 0 ? first : Math.min(lo, first);
      hi = Math.max(hi, last);
    }
    const head = lo < 0 ? count : lo;
    const tail = lo < 0 ? 0 : count - hi - 1;
    const oldCount = old.chunks.length;
    if (head + tail > oldCount || (lo < 0 && count !== oldCount)) {
      return undefined;
    }
    const chunkAt = (entry: number) => build.chunkOf.get(list[entry]!);
    const lineAt = (entry: number) => list[entry]!.firstLine - firstLine;
    const same = (entry: number, oldEntry: number, delta: number) =>
      chunkAt(entry) === old.chunks[oldEntry] &&
      lineAt(entry) === old.lineStarts[oldEntry]! + delta;
    if (head > 0 && !(same(0, 0, 0) && same(head - 1, head - 1, 0))) {
      return undefined;
    }
    let delta = 0;
    if (tail > 0) {
      const oldFrom = oldCount - tail;
      delta = lineAt(count - tail) - old.lineStarts[oldFrom]!;
      if (!(same(count - tail, oldFrom, delta) && same(count - 1, oldCount - 1, delta))) {
        return undefined;
      }
    }
    return { head, tail, delta };
  }

  protected keptDeclarations(
    count: number,
    window: { lo: number; hi: number } | undefined,
    inWindow: readonly { source: DeclarationSource; chunk: ProgramChunk }[],
    held: ReadonlySet<ProgramChunk>,
    before: SequenceRow,
    lineCount: number | undefined,
  ):
    | {
        arrays: SequenceArrays;
        window?: { from: number; to: number; oldFrom: number; oldTo: number };
      }
    | undefined {
    const old = before.arrays;
    const oldCount = old.chunks.length;
    if (lineCount === undefined) {
      return undefined;
    }
    if (!window) {
      return count === oldCount && lineCount === before.span
        ? { arrays: old }
        : undefined;
    }
    const { lo, hi } = window;
    const delta = lineCount - before.span;
    const firstFrom = (line: number): number => {
      let a = 0;
      let b = oldCount;
      while (a < b) {
        const m = (a + b) >> 1;
        if (old.lineStarts[m]! < line) {
          a = m + 1;
        } else {
          b = m;
        }
      }
      return a;
    };
    const head = firstFrom(lo);
    const tail = Math.max(head, firstFrom(hi - delta + 1));
    const middle = [...inWindow].sort(
      (a, b) => a.source.firstLine - b.source.firstLine,
    );
    if (head + middle.length + (oldCount - tail) !== count) {
      return undefined;
    }
    for (const entry of [0, head - 1, tail, oldCount - 1]) {
      const kept = entry < head || entry >= tail;
      if (entry >= 0 && entry < oldCount && kept && !held.has(old.chunks[entry]!)) {
        return undefined;
      }
    }
    this.passesLastBuild.assembly += middle.length;
    const arrays = shareArrays(
      old,
      [
        ...old.chunks.slice(0, head),
        ...middle.map((entry) => entry.chunk),
        ...old.chunks.slice(tail),
      ],
      [
        ...old.lineStarts.slice(0, head),
        ...middle.map((entry) => entry.source.firstLine),
        ...old.lineStarts.slice(tail).map((line) => line + delta),
      ],
    );
    return {
      arrays,
      window: { from: head, to: head + middle.length, oldFrom: head, oldTo: tail },
    };
  }

  protected placeIn(
    build: SequenceBuild,
    id: number,
    before: SequenceRow | undefined,
    arrays: SequenceArrays,
    inFunction: boolean,
    moved: boolean,
    window?: { from: number; to: number; oldFrom: number; oldTo: number },
  ): void {
    if (arrays === before?.arrays && !moved) {
      return;
    }
    const from = window?.from ?? 0;
    const to = window?.to ?? arrays.chunks.length;
    build.rebuilt.set(id, {
      arrays: before?.arrays,
      from: window?.oldFrom ?? 0,
      to: window?.oldTo ?? before?.arrays.chunks.length ?? 0,
      held: window ? new Set(arrays.chunks.slice(from, to)) : undefined,
    });
    for (let entry = from; entry < to; entry += 1) {
      const chunk = arrays.chunks[entry]!;
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

  protected buildBodies(
    build: SequenceBuild,
    statement: StatementSource,
    chunk: ProgramChunk,
    home: SequenceHome,
    inFunction: boolean,
  ): void {
    const slots = build.bodySlots.get(statement) ?? [];
    (statement.bodies ?? []).forEach((body, k) => {
      const id = blockField(chunk, k, B_SEQUENCE);
      const before = build.previous?.sequence(id);
      const arrays = this.buildSequence(
        build,
        slots[k] ?? { statements: body.statements, block: k, lo: 0, hi: body.statements.length - 1 },
        body.firstLine,
        body.span,
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

  protected droppedChunks(build: SequenceBuild): Set<ProgramChunk> {
    const dropped = new Set<ProgramChunk>();
    const previous = build.previous;
    if (!previous) {
      return dropped;
    }
    const dropRow = (row: SequenceRow | undefined) => {
      if (!row || build.live.has(row.id) || !build.sequences.has(row.id)) {
        return;
      }
      build.sequences.delete(row.id);
      build.droppedRows.add(row.id);
      build.statements -= row.arrays.chunks.length;
      for (const chunk of row.arrays.chunks) {
        drop(chunk);
      }
    };
    const drop = (chunk: ProgramChunk) => {
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
      for (let entry = before.from; entry < before.to; entry += 1) {
        const chunk = before.arrays!.chunks[entry]!;
        const held = before.held
          ? !!now && before.held.has(chunk)
          : !!now && holdsChunk(now, chunk);
        if (!held) {
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

  protected chunkTable(
    previous: ProgramRoot | undefined,
    build: SequenceBuild,
    dropped: ReadonlySet<ProgramChunk>,
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

  protected keepCarried(
    byBlock: WeakMap<object, ProgramChunk>,
    statement: StatementSource,
    previous: ProgramRoot | undefined,
    flagged: ReadonlySet<ProgramChunk>,
    carried: Set<StatementSource>,
  ): ProgramChunk | undefined {
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
      info.defines !== statement.defines ||
      info.placement !== this.placementOf(statement) ||
      !holdsChunkIn(previous, chunk) ||
      blockCount(chunk) !== (statement.bodies?.length ?? 0) ||
      (statement.bodies ?? []).some(
        (body, k) =>
          previous.body(chunk, k)?.arrays.chunks.length !== body.statements.length,
      )
    ) {
      return undefined;
    }
    this._used.add(chunk);
    carried.add(statement);
    return chunk;
  }

  protected memosKept(
    statements: readonly StatementSource[],
    carried: ReadonlySet<StatementSource>,
  ): void {
    const stale = statements.filter(
      (statement) => statement.memo && !carried.has(statement),
    );
    if (stale.length > 0) {
      throw new StatementMemoRetry(
        stale.map((statement) => statement.block as StatementMemoEntry),
        "the chunk store cannot keep its chunk",
      );
    }
  }

  memoChunk(memo: object): ProgramChunk | undefined {
    const chunk = this._byBlock.get(memo);
    const info = chunk && this._info.get(chunk);
    const owner = (memo as StatementMemoEntry).owner;
    const choose = !!owner?.choose;
    const labels = choose
      ? owner!.holders.filter((holder) => holder.kind === "label" || holder.kind === "choice").length
      : 1;
    if (
      !chunk ||
      !info ||
      !this.holdsMemoChunk(chunk, info.generation) ||
      info.parts.length > 0 ||
      info.alternators.length > 0 ||
      (info.choices.length > 0 && !choose) ||
      info.anonymousReferences.length > 0 ||
      info.defines !== undefined ||
      info.globals !== undefined ||
      info.hoisted !== "" ||
      info.params !== "" ||
      blockCount(chunk) !==
        info.heads.length + info.choices.filter((part) => part.block >= 0).length ||
      exportCount(chunk) > labels
    ) {
      return undefined;
    }
    return chunk;
  }

  holdsMemoChunk(chunk: ProgramChunk, generation: number): boolean {
    return (
      generation === this.table.generation &&
      !!this.current &&
      holdsChunkIn(this.current, chunk)
    );
  }

  protected orderOf(root: ProgramRoot): {
    order: ProgramChunk[];
    owners: Map<ProgramChunk, ProgramChunk>;
  } {
    let known = this._orders.get(root);
    if (!known) {
      const owners = new Map<ProgramChunk, ProgramChunk>();
      const order = root.statementOrder(owners);
      known = { order, owners };
      this._orders.set(root, known);
    }
    return known;
  }

  protected statementOrderOf(root: ProgramRoot): ProgramChunk[] {
    return this.orderOf(root).order;
  }

  protected alignmentWindow(at: {
    previous: ProgramRoot;
    flows: readonly FlowSource[];
    symbols: readonly number[];
    declarations: readonly DeclarationSource[];
    statements: readonly StatementSource[];
    kept: readonly (ProgramChunk | undefined)[];
    slots: readonly ListSlot[];
    entries: readonly number[];
    starts: ReadonlyMap<StatementSource, number>;
    flowStarts: readonly number[];
    declarationsStart: number;
    declarationRanges: readonly (readonly [number, number])[];
    lo: number;
    hi: number;
  }):
    | { old: ProgramChunk[]; owners: Map<ProgramChunk, ProgramChunk> }
    | undefined {
    const { previous, statements, lo, hi } = at;
    const owners = new Map<ProgramChunk, ProgramChunk>();
    if (lo < 0) {
      return { old: [], owners };
    }
    if (previous.generation !== this.table.generation) {
      return undefined;
    }
    const oldFlows = previous.flowSequences();
    if (
      oldFlows.length !== at.flows.length ||
      oldFlows.some((row, f) => row.flow !== at.symbols[f])
    ) {
      return undefined;
    }
    const initialization = previous.initialization;
    const oldUnits = initialization.filter((chunk) => {
      for (let k = 0; k < blockCount(chunk); k += 1) {
        if ((previous.body(chunk, k)?.arrays.chunks.length ?? 0) > 0) {
          return true;
        }
      }
      return false;
    });
    const units = at.declarations.flatMap((declaration, i) => {
      const [start, end] = at.declarationRanges[i]!;
      return end > start ? [{ declaration, start, end }] : [];
    });
    const above = units.filter((unit) => unit.end <= lo);
    const below = units.filter((unit) => unit.start > hi);
    const unitChunk = (unit: (typeof units)[number]) =>
      this._byDeclaration.get(unit.declaration.block);
    if (
      above.length + below.length > oldUnits.length ||
      above.some((unit, u) => unitChunk(unit) !== oldUnits[u]) ||
      below.some(
        (unit, u) =>
          unitChunk(unit) !== oldUnits[oldUnits.length - below.length + u],
      )
    ) {
      return undefined;
    }
    const chunkOf = (statement: StatementSource) =>
      this._byBlock.get(statement.block);
    const sameEnds = (
      list: readonly StatementSource[],
      from: number,
      row: readonly ProgramChunk[],
      oldFrom: number,
      count: number,
    ) =>
      count === 0 ||
      (chunkOf(list[from]!) === row[oldFrom] &&
        chunkOf(list[from + count - 1]!) === row[oldFrom + count - 1]);
    for (let f = 0; f < at.flows.length; f += 1) {
      const start = at.flowStarts[f]!;
      const end = at.flowStarts[f + 1] ?? at.declarationsStart;
      const list = at.flows[f]!.statements;
      const row = oldFlows[f]!.arrays.chunks;
      if (
        (end <= lo || start > hi) &&
        (list.length !== row.length || !sameEnds(list, 0, row, 0, list.length))
      ) {
        return undefined;
      }
    }
    const holds = (index: number, above: boolean): boolean => {
      let inside = true;
      for (let i: number | undefined = index; i !== undefined; ) {
        const slot: ListSlot = at.slots[i]!;
        const entry = at.entries[i]!;
        const list = slot.statements;
        const count = above
          ? inside
            ? entry
            : entry + 1
          : list.length - (inside ? entry : entry + 1);
        if (count > 0) {
          let row: readonly ProgramChunk[] | undefined;
          if (slot.flow !== undefined) {
            row = oldFlows[slot.flow]!.arrays.chunks;
          } else {
            const owner = slot.owner!;
            const ownerChunk =
              "globals" in owner
                ? this._byDeclaration.get(owner.block)
                : chunkOf(owner);
            row = ownerChunk
              ? previous.body(ownerChunk, slot.block)?.arrays.chunks
              : undefined;
          }
          if (
            !row ||
            count > row.length ||
            !(above
              ? sameEnds(list, 0, row, 0, count)
              : sameEnds(list, list.length - count, row, row.length - count, count))
          ) {
            return false;
          }
        }
        inside = false;
        i =
          slot.owner && !("globals" in slot.owner)
            ? at.starts.get(slot.owner)
            : undefined;
      }
      return true;
    };
    const next = hi + 1 < statements.length ? hi + 1 : undefined;
    if (!holds(lo, true) || (next !== undefined && !holds(next, false))) {
      return undefined;
    }
    const count =
      this.statementCountOf(previous) -
      initialization.length -
      lo -
      (statements.length - hi - 1);
    if (count < 0) {
      return undefined;
    }
    const old = previous.statementOrderBetween(
      lo > 0 ? at.kept[lo - 1] : undefined,
      next !== undefined ? at.kept[next] : undefined,
      count,
      owners,
    );
    return old?.length === count ? { old, owners } : undefined;
  }

  protected verifyAlignment(
    statements: readonly StatementSource[],
    kept: readonly (ProgramChunk | undefined)[],
    previous: ProgramRoot,
    nesting: {
      owner(statement: StatementSource): StatementSource | undefined;
      oldLine(chunk: ProgramChunk): number;
    },
    reused: readonly (ProgramChunk | undefined)[],
    checked: { used: Set<ProgramChunk>; inherit: Map<StatementSource, ProgramChunk> },
  ): void {
    const passes = { ...this.passesLastBuild };
    const windowed = { used: this._used, inherit: this._inherit };
    this._used = checked.used;
    this._inherit = checked.inherit;
    const whole = this.align(statements, this.statementOrderOf(previous), kept, {
      ...nesting,
      oldOwner: (chunk) => this.oldOwnerOf(previous, chunk),
    });
    const differs =
      whole.findIndex((chunk, i) => chunk !== reused[i]) >= 0 ||
      this._used.size !== windowed.used.size ||
      [...this._used].some((chunk) => !windowed.used.has(chunk)) ||
      this._inherit.size !== windowed.inherit.size ||
      [...this._inherit].some(([s, chunk]) => windowed.inherit.get(s) !== chunk);
    this._used = windowed.used;
    this._inherit = windowed.inherit;
    Object.assign(this.passesLastBuild, passes);
    if (differs) {
      throw new Error(
        "ChunkStore.verifyBuilds: aligning the window pairs statements otherwise than aligning the whole program",
      );
    }
  }

  protected oldOwnerOf(
    root: ProgramRoot,
    chunk: ProgramChunk,
  ): ProgramChunk | undefined {
    return this.orderOf(root).owners.get(chunk);
  }

  protected oldLineOf(root: ProgramRoot, chunk: ProgramChunk): number {
    const at = root.position(chunkId(chunk));
    return at ? root.lineOf(at.sequence, at.entry) : -1;
  }

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

  protected verifyRoot(
    root: ProgramRoot,
    previous: ProgramRoot | undefined,
    flows: readonly FlowSource[],
    symbols: readonly number[],
    statements: number,
    functionChunks: ReadonlySet<ProgramChunk>,
    declarations: readonly DeclarationSource[],
    chunkOf: (statement: StatementSource) => ProgramChunk | undefined,
  ): void {
    const fail = (what: string) => {
      throw new Error(`ChunkStore.verifyBuilds: ${what}`);
    };
    const assembled = (
      row: SequenceRow | undefined,
      list: readonly StatementSource[],
      firstLine: number,
      what: string,
    ) => {
      if (!row || row.arrays.chunks.length !== list.length) {
        fail(`${what} holds ${row?.arrays.chunks.length} entries, not ${list.length}`);
        return;
      }
      list.forEach((statement, entry) => {
        const chunk = chunkOf(statement);
        if (row.arrays.chunks[entry] !== chunk) {
          fail(`${what}, entry ${entry}, is not its statement's chunk`);
        }
        if (row.arrays.lineStarts[entry] !== statement.firstLine - firstLine) {
          fail(`${what}, entry ${entry}, starts at ${row.arrays.lineStarts[entry]}, not ${statement.firstLine - firstLine}`);
        }
        assembledBodies(statement, chunk!, `${what}, entry ${entry}`);
      });
    };
    const assembledBodies = (
      statement: StatementSource,
      chunk: ProgramChunk,
      what: string,
    ) =>
      (statement.bodies ?? []).forEach((body, k) =>
        assembled(root.body(chunk, k), body.statements, body.firstLine, `${what}, body ${k}`),
      );
    flows.forEach((flow, f) =>
      assembled(root.flow(symbols[f]!), flow.statements, flow.firstLine, `flow ${flow.name}`),
    );
    const byScript = new Map<string, DeclarationSource[]>();
    for (const declaration of declarations) {
      const list = byScript.get(declaration.uri) ?? [];
      list.push(declaration);
      byScript.set(declaration.uri, list);
    }
    for (const [uri, list] of byScript) {
      assembled(
        root.declarations(uri),
        [...list].sort((a, b) => a.firstLine - b.firstLine),
        0,
        `the declarations of ${uri}`,
      );
    }
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
    const holdingFunctions = functionChunksOf(root);
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

  protected align(
    statements: readonly StatementSource[],
    old: readonly ProgramChunk[],
    kept: readonly (ProgramChunk | undefined)[],
    nesting?: {
      owner(statement: StatementSource): StatementSource | undefined;
      oldOwner(chunk: ProgramChunk): ProgramChunk | undefined;
      oldLine?(chunk: ProgramChunk): number;
      oldShape?(chunk: ProgramChunk): number[];
    },
  ): (ProgramChunk | undefined)[] {
    const used = this._used;
    const oldEntry = new Map<ProgramChunk, number>();
    old.forEach((chunk, entry) => oldEntry.set(chunk, entry));
    let lastOld = -1;
    let runStart = 0;
    const result = kept.slice();
    const viable = new Map<ProgramChunk, boolean>();
    const factsHold = (chunk: ProgramChunk): boolean => {
      let holds = viable.get(chunk);
      if (holds === undefined) {
        holds = this.factsHold(chunk);
        viable.set(chunk, holds);
      }
      return holds;
    };
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
    const alternating = new Map<StatementSource, boolean>();
    const writesAlternators = (statement: StatementSource): boolean => {
      let writes = alternating.get(statement);
      if (writes === undefined) {
        writes = alternatorsOf(statement).length > 0;
        alternating.set(statement, writes);
      }
      return writes;
    };
    const choosing = new Map<StatementSource, boolean>();
    const raisesChoices = (statement: StatementSource): boolean => {
      let raises = choosing.get(statement);
      if (raises === undefined) {
        raises = choicesOf(statement).length > 0;
        choosing.set(statement, raises);
      }
      return raises;
    };
    const ownsParts = (statement: StatementSource, chunk: ProgramChunk) =>
      ((statement.bodies?.length ?? 0) > 0 && blockCount(chunk) > 0) ||
      (writesAlternators(statement) &&
        (this._info.get(chunk)?.alternators.length ?? 0) > 0) ||
      (raisesChoices(statement) && (this._info.get(chunk)?.choices.length ?? 0) > 0);
    const outermostOf = <T>(
      items: readonly T[],
      owner: ((of: T) => T | undefined) | undefined,
    ) => {
      let ends: Int32Array | null | undefined;
      const findEnds = (owner: (of: T) => T | undefined): Int32Array | null => {
        const index = new Map<T, number>();
        items.forEach((item, i) => index.set(item, i));
        const listedAbove = new Map<T, number>();
        const nearest = (of: T | undefined): number => {
          const path: T[] = [];
          let found = -1;
          for (let at = of; at !== undefined; at = owner(at)) {
            const known = index.get(at) ?? listedAbove.get(at);
            if (known !== undefined) {
              found = known;
              break;
            }
            path.push(at);
          }
          for (const at of path) {
            listedAbove.set(at, found);
          }
          return found;
        };
        const parent = new Int32Array(items.length);
        const end = new Int32Array(items.length);
        for (let i = 0; i < items.length; i += 1) {
          parent[i] = nearest(owner(items[i]!));
          if (parent[i]! >= i) {
            return null;
          }
          end[i] = i;
        }
        for (let i = items.length - 1; i >= 0; i -= 1) {
          const p = parent[i]!;
          if (p >= 0 && end[i]! > end[p]!) {
            end[p] = end[i]!;
          }
        }
        return end;
      };
      return (left: readonly number[]): number[] => {
        if (!owner || left.length < 2) {
          return left.slice();
        }
        if (ends === undefined) {
          ends = findEnds(owner);
        }
        if (ends === null) {
          const held = new Set(left.map((index) => items[index]!));
          return left.filter((index) => {
            for (let at = owner(items[index]!); at; at = owner(at)) {
              if (held.has(at)) {
                return false;
              }
            }
            return true;
          });
        }
        const end = ends;
        const open: number[] = [];
        const outer: number[] = [];
        for (const index of left) {
          while (open.length && end[open[open.length - 1]!]! < index) {
            open.pop();
          }
          if (open.length === 0) {
            outer.push(index);
          }
          open.push(index);
        }
        return outer;
      };
    };
    const outermostNew = outermostOf(statements, nesting?.owner);
    const outermostOld = outermostOf(old, nesting?.oldOwner);
    const matchTwins = (
      candidates: readonly number[],
      olds: readonly number[],
      infoOf: (o: number) => ChunkInfo | undefined,
    ): Set<number> => {
      const paired = new Set<number>();
      const oldLine = nesting?.oldLine;
      if (!oldLine) {
        return paired;
      }
      const alike = new Map<string, { news: number[]; olds: number[] }>();
      for (const o of olds) {
        const info = infoOf(o);
        if (info && !used.has(old[o]!)) {
          const reads = `${info.syntax}\u0000${info.reads}`;
          const group = alike.get(reads);
          if (group) {
            group.olds.push(o);
          } else {
            alike.set(reads, { news: [], olds: [o] });
          }
        }
      }
      for (const i of candidates) {
        const statement = statements[i]!;
        alike.get(`${statement.syntax()}\u0000${statement.reads}`)?.news.push(i);
      }
      let shifts: readonly [number, number] | undefined;
      const shiftsOf = (): readonly [number, number] => {
        if (!shifts) {
          let newFirst = Infinity;
          let newLast = -Infinity;
          let oldFirst = Infinity;
          let oldLast = -Infinity;
          for (const i of candidates) {
            newFirst = Math.min(newFirst, statements[i]!.firstLine);
            newLast = Math.max(newLast, statements[i]!.firstLine);
          }
          for (const o of olds) {
            const line = oldLine(old[o]!);
            if (line >= 0) {
              oldFirst = Math.min(oldFirst, line);
              oldLast = Math.max(oldLast, line);
            }
          }
          shifts =
            oldFirst <= oldLast ? [newFirst - oldFirst, newLast - oldLast] : [0, 0];
        }
        return shifts;
      };
      for (const group of alike.values()) {
        const n = group.news.length;
        const m = group.olds.length;
        if (n === 0 || n === m || pairCells(n, m) > TWIN_CELLS) {
          continue;
        }
        const [above, below] = shiftsOf();
        const misshapen = 1 / (Math.min(n, m) + 1);
        const news = group.news.map((i) => {
          const statement = statements[i]!;
          return {
            line: statement.firstLine,
            identity: this.statementIdentity(statement),
            bodied: (statement.bodies?.length ?? 0) > 0,
            alternating: writesAlternators(statement),
            choosing: raisesChoices(statement),
            shape: (statement.bodies ?? []).map((body) => body.statements.length),
          };
        });
        const chunks = group.olds.map((o) => {
          const chunk = old[o]!;
          const info = infoOf(o)!;
          return {
            line: oldLine(chunk),
            identity: factsHold(chunk) ? this.chunkIdentity(chunk) : undefined,
            bodied: blockCount(chunk) > 0,
            alternating: info.alternators.length > 0,
            choosing: info.choices.length > 0,
            shape: nesting?.oldShape?.(chunk) ?? [],
          };
        });
        const pairs = pairInOrder(n, m, (s, l) => {
          const twin = news[s]!;
          const chunk = chunks[l]!;
          const keeps = chunk.identity !== undefined && chunk.identity === twin.identity;
          const inherits =
            (twin.bodied && chunk.bodied) ||
            (twin.alternating && chunk.alternating) ||
            (twin.choosing && chunk.choosing);
          if (!keeps && !inherits) {
            return undefined;
          }
          const moved = twin.line - chunk.line;
          return (
            Math.min(Math.abs(moved - above), Math.abs(moved - below)) +
            (sameNumbers(twin.shape, chunk.shape) ? 0 : misshapen)
          );
        });
        for (const [s, l] of pairs) {
          if (take(group.news[s]!, group.olds[l]!)) {
            paired.add(group.olds[l]!);
          }
        }
      }
      return paired;
    };
    const matchRun = (newFrom: number, newTo: number, oldFrom: number, oldTo: number) => {
      const unmatched: number[] = [];
      for (let i = newFrom; i < newTo; i += 1) {
        if (!result[i]) {
          unmatched.push(i);
        }
      }
      if (unmatched.length === 0 || oldTo <= oldFrom) {
        return;
      }
      const run: number[] = [];
      for (let o = oldFrom; o < oldTo; o += 1) {
        run.push(o);
      }
      const infos = new Map<number, ChunkInfo | undefined>();
      const infoOf = (o: number) => {
        if (!infos.has(o)) {
          infos.set(o, this._info.get(old[o]!));
        }
        return infos.get(o);
      };
      const twins = matchTwins(unmatched, run, infoOf);
      const candidates = twins.size ? unmatched.filter((i) => !result[i]) : unmatched;
      const olds = twins.size ? run.filter((o) => !twins.has(o)) : run;
      if (candidates.length === 0 || olds.length === 0) {
        return;
      }
      const syntaxOf = (o: number) => infoOf(o)?.syntax;
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
      const leftNew = outermostNew(
        candidates.filter((i) => !result[i] && !this._inherit.has(statements[i]!)),
      );
      const leftOld = outermostOld(olds.filter((k) => !used.has(old[k]!)));
      if (leftNew.length === 1 && leftOld.length === 1) {
        const i = leftNew[0]!;
        const k = leftOld[0]!;
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
    interface Held {
      bySyntax: Map<string, number[]>;
      bodied: number[];
      alternating: number[];
      choosing: number[];
    }
    const byIdentity = new Map<string, { free: number[]; held: Held }>();
    const chunkLists = new Map<number, { free: number[]; held: Held } | null>();
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
    const ownsAny = (chunk: ProgramChunk) =>
      blockCount(chunk) > 0 ||
      (this._info.get(chunk)?.alternators.length ?? 0) > 0 ||
      (this._info.get(chunk)?.choices.length ?? 0) > 0;
    const queue: number[] = [];
    statements.forEach((_, i) => {
      if (!result[i]) {
        queue.push(i);
      }
    });
    const listsOf = new Map<number, NonNullable<ReturnType<typeof listOf>> | null>();
    for (let n = 0; n < queue.length; n += 1) {
      const i = queue[n]!;
      if (result[i]) {
        continue;
      }
      let lists = listsOf.get(i);
      if (lists === undefined) {
        const statement = statements[i]!;
        lists = readAs.has(`${statement.syntax()}\u0000${statement.reads}`)
          ? (byIdentity.get(this.statementIdentity(statement)) ?? null)
          : null;
        listsOf.set(i, lists);
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
        const defines = statements[i]!.defines;
        const named =
          defines === undefined
            ? undefined
            : lists.held.bySyntax.get(statements[i]!.syntax());
        const o = named?.findLast((c) => {
          const p = holder.get(c);
          return (
            p !== undefined &&
            p !== i &&
            statements[p]!.defines !== defines &&
            this._info.get(old[c]!)?.defines === defines
          );
        });
        if (o !== undefined) {
          const p = holder.get(o)!;
          unpair(p);
          result[i] = old[o]!;
          queue.push(p);
        }
        continue;
      }
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
    matchMoved();
    return result;
  }

  protected holds(chunk: ProgramChunk, statement: StatementSource): boolean {
    const values = this.chunkValues(chunk);
    return (
      values !== undefined &&
      values === this.statementValues(statement) &&
      this.factsHold(chunk)
    );
  }

  protected placementOf(statement: StatementSource): string {
    return this._inBody.has(statement) ? "body" : "sequence";
  }

  protected _inBody = new WeakSet<StatementSource>();

  protected _statementValues = new WeakMap<StatementSource, string>();
  protected _chunkValues = new WeakMap<ChunkInfo, string>();

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

  protected chunkValues(chunk: ProgramChunk): string | undefined {
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

  protected statementIdentity(statement: StatementSource): string {
    let identity = this._statementIdentities.get(statement);
    if (identity === undefined) {
      identity = `${statement.syntax()}\u0000${statement.reads}\u0000${this.statementValues(statement)}`;
      this._statementIdentities.set(statement, identity);
    }
    return identity;
  }

  protected _statementIdentities = new WeakMap<StatementSource, string>();
  protected _chunkIdentities = new WeakMap<ChunkInfo, string>();

  protected chunkIdentity(chunk: ProgramChunk): string | undefined {
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

  protected factsHold(chunk: ProgramChunk, anonymous = false): boolean {
    const info = this._info.get(chunk);
    if (!info || info.generation !== this.table.generation) {
      return false;
    }
    this.passesLastBuild.facts += 1;
    const start = referenceTableStart(chunk);
    for (let r = 0; r < chunk[H_REFERENCE_ROWS]!; r += 1) {
      const at = start + r * REFERENCE_ROW_WORDS;
      const symbol = chunk[at]!;
      if (chunk[at + 1] === NO_FACTS) {
        continue;
      }
      if (isAnonymousSymbol(this.table, symbol) !== anonymous) {
        continue;
      }
      if (this.readFacts(symbol, info.facts.get(symbol) ?? []) !== chunk[at + 1]) {
        return false;
      }
    }
    return true;
  }

  protected readFacts(symbol: number, names: readonly string[]): number {
    const read = new Map<string, string>();
    for (const name of names) {
      read.set(name, this.factOf(symbol, name));
    }
    return factHash(factsText(read));
  }

  chunkOf(block: object): ProgramChunk | undefined {
    return this._placed.get(block) ?? this._byBlock.get(block);
  }

  declarationChunkOf(block: object): ProgramChunk | undefined {
    return (
      this._placedDeclarations.get(block) ?? this._byDeclaration.get(block)
    );
  }

  definesOf(chunk: ProgramChunk): string | undefined {
    return this._info.get(chunk)?.defines;
  }
}

const sameChunks = (
  a: readonly ProgramChunk[],
  b: readonly ProgramChunk[],
): boolean => a.length === b.length && a.every((chunk, i) => chunk === b[i]);

const sameNumbers = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((n, i) => n === b[i]);

const TWIN_SLACK = 16;
const TWIN_CELLS = 1 << 20;

export const pairCells = (n: number, m: number) =>
  (Math.min(n, m) + 1) * (Math.abs(n - m) + 2 * TWIN_SLACK + 1);

export const pairInOrder = (
  n: number,
  m: number,
  cost: (s: number, l: number) => number | undefined,
): [number, number][] =>
  n > m
    ? pairShorterFirst(m, n, (l, s) => cost(s, l)).map(([l, s]) => [s, l])
    : pairShorterFirst(n, m, cost);

const pairShorterFirst = (
  n: number,
  m: number,
  cost: (s: number, l: number) => number | undefined,
): [number, number][] => {
  const lo = Math.min(0, m - n) - TWIN_SLACK;
  const hi = Math.max(0, m - n) + TWIN_SLACK;
  const width = hi - lo + 1;
  const size = (n + 1) * width;
  const count = new Int32Array(size).fill(-1);
  const total = new Float64Array(size);
  const step = new Uint8Array(size);
  const at = (s: number, l: number) =>
    s < 0 || l < 0 || l - s < lo || l - s > hi ? -1 : s * width + l - s - lo;
  count[at(0, 0)] = 0;
  for (let s = 0; s <= n; s += 1) {
    for (let l = Math.max(0, s + lo); l <= Math.min(m, s + hi); l += 1) {
      const k = at(s, l);
      const offer = (from: number, pairs: number, sum: number, how: number) => {
        if (
          from >= 0 &&
          count[from]! >= 0 &&
          (pairs > count[k]! || (pairs === count[k] && sum < total[k]!))
        ) {
          count[k] = pairs;
          total[k] = sum;
          step[k] = how;
        }
      };
      const left = at(s, l - 1);
      if (left >= 0) {
        offer(left, count[left]!, total[left]!, 1);
      }
      const up = at(s - 1, l);
      if (up >= 0) {
        offer(up, count[up]!, total[up]!, 2);
      }
      const diagonal = at(s - 1, l - 1);
      if (diagonal >= 0 && count[diagonal]! >= 0) {
        const d = cost(s - 1, l - 1);
        if (d !== undefined) {
          offer(diagonal, count[diagonal]! + 1, total[diagonal]! + d, 3);
        }
      }
    }
  }
  const pairs: [number, number][] = [];
  for (let s = n, l = m; s > 0 || l > 0; ) {
    const how = step[at(s, l)];
    if (how === 3) {
      pairs.push([s - 1, l - 1]);
      s -= 1;
      l -= 1;
    } else if (how === 2) {
      s -= 1;
    } else {
      l -= 1;
    }
  }
  return pairs.reverse();
};

const shareArrays = (
  before: SequenceArrays | undefined,
  chunks: ProgramChunk[],
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

interface SequenceHome {
  flow: number;
  kind: SequenceKind;
  uri: string;
}

const sameHome = (row: SequenceRow, home: SequenceHome): boolean =>
  row.flow === home.flow && row.kind === home.kind && row.uri === home.uri;

interface ListSlot {
  statements: readonly StatementSource[];
  flow?: number;
  owner?: StatementSource;
  block: number;
  lo: number;
  hi: number;
}

interface SequenceBuild {
  previous: ProgramRoot | undefined;
  chunkOf: ReadonlyMap<StatementSource, ProgramChunk | undefined>;
  carried: ReadonlySet<StatementSource>;
  unsettled: ReadonlySet<StatementSource>;
  coverage: ProgramCoverage;
  sequences: Map<number, SequenceRow>;
  rebuilt: Map<
    number,
    {
      arrays: SequenceArrays | undefined;
      from: number;
      to: number;
      held?: ReadonlySet<ProgramChunk>;
    }
  >;
  changed?: ReadonlyMap<string, readonly (readonly [number, number])[]>;
  bodySlots: ReadonlyMap<StatementSource, readonly ListSlot[]>;
  placedFor?: Map<StatementSource, ProgramChunk>;
  droppedRows: Set<number>;
  placed: Map<ProgramChunk, { sequence: number; inFunction: boolean }>;
  live: Set<number>;
  inFunction: Map<number, boolean>;
  statements: number;
  failed: number;
  fail: (construct: string, line: number) => void;
}

const definitionText = (defined: Readonly<Record<string, string>>): string =>
  Object.keys(defined)
    .sort()
    .map((name) => `${name}=${defined[name]}`)
    .join("\n");

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

type WatchRead = (obj: ParsedObject, read: (obj: any) => string) => void;

const isOwnJump = (obj: Divert): boolean =>
  obj.isFunctionCall ||
  obj.isEnd ||
  obj.isDone ||
  loopExitOf.has(obj) ||
  isLoopInternal(obj);

const targetOf = (target: ParsedObject | null | undefined): string => {
  if (!target) {
    return "-";
  }
  const name =
    target.programSymbolName ??
    (target instanceof FlowBase &&
    target.parent === target.story &&
    !NUMBERED_SYNTHETIC_NAME.test(target.identifier?.name ?? "")
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

const entryFunctions = (statement: StatementSource): ParsedObject[] => [
  ...(statement.bodies ?? []).flatMap((body) => (body.fn ? [body.fn] : [])),
  ...statement.objects.filter((obj) => obj instanceof FlowBase),
];

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

const paramsOf = (statement: StatementSource): string =>
  entryFunctions(statement)
    .map((fn) =>
      ((fn as FlowBase).args ?? [])
        .map((arg) => `${arg.identifier?.name ?? ""}${arg.isVararg ? "..." : ""}`)
        .join(","),
    )
    .join(";");

const hoistedLocals = (statement: StatementSource): ParsedObject[] =>
  (statement.bodies ?? []).flatMap((body) =>
    body.fn ? (functionShapeOf.get(body.fn)?.hoisted ?? []) : [],
  );

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

const exportsLabel = (chunk: ProgramChunk, r: number): boolean => {
  const offset = exportOffset(chunk, r);
  return (
    offset < codeWords(chunk) &&
    opOf(chunk[HEADER_WORDS + offset]!) === Op.Visit &&
    chunk[HEADER_WORDS + offset + 1] === exportSymbol(chunk, r)
  );
};

const exportsFunction = (chunk: ProgramChunk): boolean => {
  for (let r = 0; r < exportCount(chunk); r += 1) {
    if (!exportsLabel(chunk, r)) {
      return true;
    }
  }
  return false;
};

export const functionChunksOf = (root: ProgramRoot): Set<ProgramChunk> => {
  const holding = new Set<ProgramChunk>();
  const inFunctions = (row: SequenceRow | undefined, inFunction: boolean) => {
    for (const chunk of row?.arrays.chunks ?? []) {
      if (inFunction || exportsFunction(chunk)) {
        holding.add(chunk);
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
  return holding;
};

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

const choiceFingerprint = (
  choice: Choice,
  fingerprintOf?: (from: number, to: number) => string,
): string => {
  const range = alternatorSourceOf.get(choice);
  if (range && fingerprintOf) {
    return `choice|${fingerprintOf(range.from, range.to)}`;
  }
  const text = (list: ParsedObject): string =>
    list.content
      .map((obj) => (obj instanceof Text ? obj.text : obj.typeName))
      .join("");
  return `choice|${text(choice.startContent)}[${text(choice.choiceOnlyContent)}]`;
};

const alternatorFingerprint = (
  sequence: Sequence,
  fingerprintOf?: (from: number, to: number) => string,
): string => {
  const range = alternatorSourceOf.get(sequence);
  if (range && fingerprintOf) {
    return `${sequence.sequenceType}|${fingerprintOf(range.from, range.to)}`;
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
    const children = obj instanceof FunctionCall ? obj.args : (obj.content ?? []);
    const own = `${obj.typeName}:${String(obj)}`;
    return children.length > 0 ? `${own}(${children.map(text).join("")})` : own;
  };
  const generated = new Map<string, number>();
  return arms(sequence).replace(NUMBERED_SYNTHETIC_NAMES, (name) => {
    if (!generated.has(name)) {
      generated.set(name, generated.size);
    }
    return `__synth#${generated.get(name)}`;
  });
};

const fingerprintOf = (body: BodySource): string => body.partFingerprint?.() ?? "";

const headFingerprint = (body: BodySource): string => {
  const part = partOfBody.get(body.shape as BodyShape);
  const depth =
    part instanceof Gather ? `then:${part.indentationDepth}|` : "head|";
  return `${depth}${body.headFingerprint?.() ?? ""}`;
};

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

const functionLabel = (fn: ParsedObject): string => {
  const names: string[] = [];
  let at: ParsedObject | null = fn;
  while (at && !(at instanceof ParsedStory)) {
    if (at instanceof FlowBase) {
      names.unshift(at._authoredName ?? at.identifier?.name ?? "");
    }
    at = at.parent;
  }
  return names.join(".");
};

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
  return [...new Set(out)].sort();
};

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
      for (const obj of nested.stands ?? []) {
        out.add(obj);
      }
    }
  }
  return out;
};
