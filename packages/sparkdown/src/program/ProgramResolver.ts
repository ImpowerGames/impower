// Loads the engine's modules in the order that settles their import cycle
// (see `CompilationAnnotator`).
import "../inkjs/engine/Container";
import { ErrorType } from "../inkjs/compiler/Parser/ErrorType";
import { Choice } from "../inkjs/compiler/Parser/ParsedHierarchy/Choice";
import {
  bumpResolutionEpoch,
  currentResolutionEpoch,
  enterResolutionEpoch,
} from "../inkjs/compiler/Parser/ParsedHierarchy/CompileEpoch";
import { ConstantDeclaration } from "../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ConstantDeclaration";
import { ExternalDeclaration } from "../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ExternalDeclaration";
import { Divert } from "../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { DivertTarget } from "../inkjs/compiler/Parser/ParsedHierarchy/Divert/DivertTarget";
import {
  FlowBase,
  localsDeclaredIn,
} from "../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowBase";
import { FlowLevel } from "../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowLevel";
import { FunctionCall } from "../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Gather } from "../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ListDefinition } from "../inkjs/compiler/Parser/ParsedHierarchy/List/ListDefinition";
import { MultiReturnType } from "../inkjs/compiler/Parser/ParsedHierarchy/MultiReturnType";
import {
  ParsedObject,
  resolveChild,
} from "../inkjs/compiler/Parser/ParsedHierarchy/Object";
import {
  type ResolutionTap,
  tapResolution,
} from "../inkjs/compiler/Parser/ParsedHierarchy/ResolutionTap";
import { ReturnType } from "../inkjs/compiler/Parser/ParsedHierarchy/ReturnType";
import { Statement } from "../inkjs/compiler/Parser/ParsedHierarchy/Statement";
import { StructDefinition } from "../inkjs/compiler/Parser/ParsedHierarchy/Struct/StructDefinition";
import type { Story } from "../inkjs/compiler/Parser/ParsedHierarchy/Story";
import {
  memoAssignmentOf,
  memoMultiOf,
} from "../inkjs/compiler/Parser/ParsedHierarchy/Variable/MemoizedAssignment";
import { MultiVariableAssignment } from "../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import { memoGatherOf } from "../inkjs/compiler/Parser/ParsedHierarchy/Gather/MemoizedGather";
import { VariableAssignment } from "../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { Weave } from "../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { Container as RuntimeContainer } from "../inkjs/engine/Container";
import { DebugMetadata } from "../runtime/DebugMetadata";
import type { SourceMetadata } from "../runtime/Error";
import type { Story as RuntimeStory } from "../inkjs/engine/Story";
import type { StructDefinition as RuntimeStructDefinition } from "../runtime/StructDefinition";
import type {
  MemoReported,
  MemoResolution,
  StatementMemoEntry,
} from "../compiler/lower/statementMemo";
import {
  MemoizedStatement,
  memoOf,
} from "../inkjs/compiler/Parser/ParsedHierarchy/MemoizedStatement";

/** The parsed objects under `node` that a walk over its subtree visits: its
 *  `content`, and for a call that generated as a builtin, native or stdlib
 *  call, its arguments. Such a call removes its proxy divert, which held the
 *  arguments, from `content` on its first generation, yet the arguments still
 *  generate on every pass and carry cached runtime objects and debug metadata
 *  of their own (a `display()` call's table holds its line's whole text). */
export function parsedChildren(node: ParsedObject): ParsedObject[] {
  const content = node.content ?? [];
  if (!(node instanceof FunctionCall) || content.includes(node.proxyDivert)) {
    return content;
  }
  const args = node.args.filter((arg) => !content.includes(arg));
  return args.length > 0 ? [...content, ...args] : content;
}

/** Clears what generation and resolution left on `node` and every object
 *  under it, so that generating it again generates it anew and resolving it
 *  again resolves it anew (`ParsedObject.ResetRuntime`). */
export function resetSubtreeRuntime(node: ParsedObject): void {
  node.ResetRuntime();
  const identifier = (node as { identifier?: unknown }).identifier;
  if (identifier instanceof Identifier) {
    identifier.ResetRuntime();
  }
  for (const c of parsedChildren(node)) {
    resetSubtreeRuntime(c);
  }
}

/** What one resolve of the program path did (`ProgramResolver.resolve`),
 *  counted the way the chunk store counts its passes. */
export interface ResolverPasses {
  /** Whether it resolved every statement: the first resolve, one after a
   *  compile that resolved otherwise (a program that fell back), or one
   *  after a resolution that stopped. */
  cold: boolean;
  /** The statements the walk of the story listed, a few lookups each: the
   *  objects the compile placed for a block, a flow's header, and a function
   *  a statement or the top level declares. */
  units: number;
  /** Statements generated and resolved: the ones the incremental parse
   *  lowered anew, and `invalidated`. */
  fresh: number;
  /** Carried statements resolved again because a name they read is declared
   *  otherwise, or a position they report moved with a statement that was
   *  lowered anew. */
  invalidated: number;
  /** Carried statements whose recorded diagnostics and declarations the
   *  resolve repeated without visiting them. */
  replayed: number;
  /** Parsed objects of the fresh statements whose runtime objects were
   *  generated. */
  generated: number;
  /** Parsed objects of the fresh statements whose references were
   *  resolved. */
  resolved: number;
  /** Objects the compile adds to the story itself (a flow's closing
   *  `-> DONE`, the top level's last gather), generated and resolved on every
   *  resolve. */
  loose: number;
  /** Parsed objects generated or resolved outside any statement's
   *  generation and resolution: those under the loose objects, and those of
   *  an initializer written with no statement's record
   *  (`visitedOutsideLastResolve`). */
  outside: number;
  /** Globals whose initializers were generated: those of the fresh
   *  statements, and those the story makes of a struct's properties that no
   *  statement holds. */
  initialized: number;
  /** Structs whose runtime definitions were built: those of the fresh
   *  statements. */
  structs: number;
  /** Names declared otherwise than at the compile before. */
  changedNames: number;
  /** Statements served from their memos (`MemoizedStatement`) whose
   *  diagnostics and reads the resolve repeated where they stand. */
  memoized: number;
  /** Whether the resolution stopped at an object that threw, as the current
   *  engine's `ExportRuntime` stops. */
  stopped: boolean;
}

/** A thing a statement's resolution did that the story keeps for the rest
 *  of the compile, recorded so that a compile which does not resolve the
 *  statement again does it again (`ResolutionTap`). */
type ResolutionEvent =
  | {
      /** A diagnostic raised (`ResolutionTap.diagnostic`), reported or kept
       *  back, which is raised again as it was, so that the story decides
       *  again which of the diagnostics of one source it reports. Its
       *  position is read again from a parsed object it was raised on; a
       *  position the report made of anything else (`copy`: a name built for
       *  the report, `target not found`) is moved with the statement. */
      kind: "diagnostic";
      raiser: ParsedObject | null;
      message: string;
      source: unknown;
      isWarning: boolean;
      position: DebugMetadata | null;
      copy: boolean;
    }
  | { kind: "declare"; declaration: VariableAssignment }
  | { kind: "external"; declaration: ExternalDeclaration }
  | { kind: "autoGlobal"; assignment: VariableAssignment }
  | { kind: "builtinDivert"; entry: Story["builtinGlobalDiverts"][number] };

/** What a statement's names and declarations are, read from its syntax
 *  before it is resolved, and what the story's passes over the whole
 *  program take of it. */
interface UnitShape {
  /** Each name the statement declares, with how it declares it. */
  defs: Map<string, string[]>;
  consts: ConstantDeclaration[];
  lists: ListDefinition[];
  structs: StructDefinition[];
  /** The named gathers, then choices, the statement holds at any depth, for
   *  the weave of the flow it stands in. */
  gathers: ParsedObject[];
  choices: ParsedObject[];
  /** For a function: each weave it names, by the flow that holds it (its own
   *  flow under `null`), with its named gathers and choices. */
  naming: Map<FlowBase | null, ParsedObject[]>;
  /** The first return, and multiple return, the statement holds outside any
   *  function it writes. */
  ownReturn: ParsedObject | null;
  ownMultiReturn: ParsedObject | null;
  /** The assignments, and the function values, the statement holds along
   *  `content` once it is generated (a call generated as a builtin drops
   *  the divert that held its arguments), in the order a walk of the story
   *  finds them: what `Story.globalAssignmentNames` and a library-named
   *  local's scope (`FlowBase.IsLocalInScope`) look for over the whole
   *  story (`ProgramResolver.readFacts`). */
  assignments: ParsedObject[];
  functionValues: DivertTarget[];
}

/** What the last resolve that resolved a statement recorded of it. */
interface UnitRecord {
  members: ParsedObject[];
  context: string;
  index: number;
  /** A position of the statement, which an edit above it moves in place, and
   *  its first line when the statement was resolved. */
  anchor: DebugMetadata | null;
  anchorLine: number;
  shape: UnitShape;
  gen: ResolutionEvent[];
  /** What writing each global's initializer did, by the initializer: the
   *  global a constant's or a struct property's initializer is written for
   *  is made anew by every compile (`Story.DeclareStoryTables`). */
  init: Map<ParsedObject, ResolutionEvent[]>;
  resolve: ResolutionEvent[];
  reads: Set<string>;
  /** The other statements whose positions its diagnostics report or print. */
  dependsOn: Set<Unit>;
  /** The positions its messages printed, as they printed them. */
  printed: { metadata: DebugMetadata; printed: string }[];
  /** Whether a message printed a position the resolution made, or reported
   *  one with no anchor to move it by: the statement is resolved again when
   *  its anchor moves, or, with none, on every resolve. */
  volatile: boolean;
  /** The diverts its resolution resolved, whose targets a later compile
   *  moves onto the objects that stand for them then (`retarget`). */
  diverts: Divert[];
}

/** Whether `obj` is a stand-in of a statement served from its memo, or a
 *  target of one. */
const standsIn = (obj: ParsedObject): boolean => {
  for (let at: ParsedObject | null = obj, depth = 0; at && depth < 3; at = at.parent, depth += 1) {
    if (memoOf(at)) {
      return true;
    }
  }
  return false;
};

/** Whether `obj` is an assignment a statement's memo can stand for: a plain
 *  one or a local declaration, of one name or several. */
const standsAsAssignment = (obj: ParsedObject): boolean =>
  (obj instanceof VariableAssignment && memoAssignmentOf(obj) !== null) ||
  (obj instanceof MultiVariableAssignment && memoMultiOf(obj) !== null);

/** The assignments a stand-in, or a block statement's stand-in, holds that
 *  made auto-globals or declared locals, each with what its memo recorded
 *  they made (`MemoResolution`). */
const assignmentsOf = (
  statement: ParsedObject,
  resolution: MemoResolution,
  owner: boolean,
): { assignment: VariableAssignment; made: MemoResolution }[] => {
  const out: { assignment: VariableAssignment; made: MemoResolution }[] = [];
  for (const held of owner ? [statement, ...statement.content] : [statement]) {
    const made =
      held === statement ? resolution : (memoOf(held) as StatementMemoEntry | undefined)?.resolution;
    if (!made || (made.declares.length === 0 && made.autoGlobals.length === 0)) {
      continue;
    }
    // A stand-in of several assignments holds them.
    const parts = held instanceof MemoizedStatement ? held.content : [held];
    for (const part of parts) {
      const targets =
        part instanceof VariableAssignment
          ? [part]
          : part instanceof MultiVariableAssignment
            ? part.targetAssignments
            : [];
      for (const assignment of targets) {
        out.push({ assignment, made });
      }
    }
  }
  return out;
};

/** The object at the top of `obj`'s parents: its story, for an object a
 *  story holds. */
const rootOf = (obj: ParsedObject): ParsedObject => {
  let at = obj;
  while (at.parent) {
    at = at.parent;
  }
  return at;
};

/** The flow of `story` at the path `flow` has in its own story, read
 *  through the tables without reporting a read, or null for none. */
const flowAt = (story: Story, flow: FlowBase): FlowBase | null => {
  const names: string[] = [];
  for (let at: ParsedObject | null = flow; at?.parent; at = at.parent) {
    if (at instanceof FlowBase) {
      const name = at.identifier?.name;
      if (name == null) {
        return null;
      }
      names.unshift(name);
    }
  }
  let found: FlowBase | null = story;
  for (const name of names) {
    found = found
      ? ((Map.prototype.get.call(found.subFlowsByName, name) as FlowBase | undefined) ?? null)
      : null;
  }
  return found;
};

/** A statement of the program as the resolver knows it from compile to
 *  compile: the objects the compile placed for one block where they stand in
 *  a weave (`weave`), a function the top level or a statement declares, whole
 *  (`flow`), or the header of a scene or a branch (`header`). */
class Unit {
  /** This compile's objects. */
  members: ParsedObject[] = [];
  /** Members that a `Statement` holds, which generation leaves to it, and it
   *  generates no flow it holds. */
  skipGeneration: Set<ParsedObject> | null = null;
  flow: FlowBase | null = null;
  /** The flows around it, by name, from the story's top level. */
  context = "";
  /** Its place among the statements of the story, in the story's order. */
  index = 0;
  record: UnitRecord | null = null;
  /** This compile's record, while it is generated and resolved. */
  next: UnitRecord | null = null;
  fresh = false;
  invalidated = false;
  /** Why the last resolve generated and resolved it: it is new, its objects
   *  were lowered anew, the flows around it changed (`moved`), a pass renamed
   *  something of it, a name it reads changed (`name`), or a position it
   *  reports moved (`position`); null when it was replayed. */
  reason: string | null = null;
  seen = -1;

  constructor(
    readonly key: object,
    readonly kind: "weave" | "flow" | "header",
  ) {}
}

/** A scene, a branch or the story, as the walk found it: what its weave and
 *  its content hold, in order. */
interface FlowNode {
  flow: FlowBase;
  path: string;
  header: Unit | null;
  items: Item[];
}

type Item =
  | { kind: "unit"; unit: Unit }
  | { kind: "function"; unit: Unit; flow: FlowBase }
  | { kind: "loose"; obj: ParsedObject }
  | { kind: "flow"; node: FlowNode }
  | { kind: "root"; weave: Weave };

/** What the compile hands the resolver. */
export interface ResolveInput {
  /** The compiled block each placed object came from. */
  blockOf(obj: ParsedObject): object | undefined;
  /** Objects a pass of the compile renamed in place since it last resolved
   *  them (`SparkdownCompiler.canonicalizeSyntheticFlowNames`,
   *  `scopeDefineInstances`), whose statements are resolved again. */
  renamed: Iterable<ParsedObject>;
  /** Resolves every statement. */
  cold: boolean;
  /** The statements of bodies the compile lowered anew and remembered in a
   *  memo (`compiler/lower/statementMemo.ts`), by each object each holds at
   *  its top: what their generation and resolution report and read is kept
   *  for their memos (`memoResolutionsLastResolve`). */
  memoCandidates?: ReadonlyMap<ParsedObject, MemoCandidate>;
}

/** A statement whose memo the resolve completes, with its lines in its
 *  script, counting from 1. */
export interface MemoCandidate {
  readonly entry: StatementMemoEntry;
  /** The objects the statement holds at its top. */
  readonly objects: readonly ParsedObject[];
  readonly line: number;
  readonly endLine: number;
  /** For a block statement, the objects the statements of its bodies hold
   *  at their tops, at any depth, which their own memos judge. */
  readonly nested?: ReadonlySet<ParsedObject>;
}

// What one memo candidate's generation and resolution reported and read.
interface MemoTally {
  readonly candidate: MemoCandidate;
  generate: MemoReported[];
  resolve: MemoReported[];
  reads: Set<string>;
  context: string | null;
  refused: string | null;
  /** The auto-globals the assignment the candidate is made. */
  autoGlobals: string[];
  /** The locals the local declaration the candidate is declared. */
  declares: string[];
}

const sameMembers = (a: readonly ParsedObject[], b: readonly ParsedObject[]) =>
  a.length === b.length && a.every((obj, i) => obj === b[i]);

const flowName = (flow: FlowBase) => flow.identifier?.name ?? "";

const parametersOf = (flow: FlowBase) =>
  (flow.args ?? [])
    .map(
      (arg) =>
        `${arg.identifier?.name ?? ""}${arg.isByReference ? "&" : ""}${arg.isVararg ? "..." : ""}${arg.isDivertTarget ? ">" : ""}`,
    )
    .join(",");

/**
 * The resolver of the program path (#1607; docs/engine/binary-program.md,
 * sections 1 and 2, and What is built, The incremental passes).
 *
 * A compile with statement chunks on resolves its references here, in place
 * of the current engine's `ExportRuntime`, and builds no runtime tree. It
 * makes the passes of a cold `ExportRuntime` in its order: it declares the
 * story's constants, lists and structs, names each flow's labels, generates
 * the statements (which declares their globals and locals and reports what
 * generation reports), initializes the globals, and resolves every
 * statement's references; and it reports the same diagnostics, in the same
 * order, at the same places.
 *
 * It does so statement by statement, and visits only the statements the
 * incremental parse lowered anew and the carried statements whose resolution
 * would read otherwise: each resolution records the names it read in the
 * story's tables (`ResolutionTap`), and a statement is resolved again when a
 * statement lowered anew, or one gone, declares one of them otherwise, when
 * the flows around it changed, when a pass of the compile renamed something
 * of it, or when a position its diagnostics report belongs to a statement
 * lowered anew. For every other statement it repeats what the resolution
 * that last resolved it recorded, in the story's order: the diagnostics,
 * moved with the statement, and the globals, locals, externals and
 * auto-globals it declared, which every compile declares anew. A carried
 * statement keeps its parsed objects' resolution (`Divert.targetContent`,
 * `VariableReference.resolvedAs`), which the chunk store and the writer
 * read, from the resolve that last resolved it.
 *
 * What it still does over the whole program is bookkeeping: a walk of the
 * story's flows and of the top-level objects of their weaves, a lookup each,
 * and the story's tables, which every compile builds anew from what each
 * statement declared.
 */
export class ProgramResolver {
  /** Keeps every object a resolve generated or resolved in
   *  `visitedLastResolve`, or in `visitedOutsideLastResolve`, for the
   *  tests. */
  static traceVisits = false;
  /** Checks, after every resolve, what the resolver answers from each
   *  statement's syntax for the passes that walk the whole story (the
   *  assignments, the function values, the locals each object declares)
   *  against a walk of the story, recording any difference in
   *  `factFailures`: for the tests, as `ChunkStore.verifyBuilds`. */
  static verifyFacts = false;
  static factFailures: string[] = [];

  passesLastResolve: ResolverPasses = ProgramResolver.noPasses(true);
  /** The objects the last resolve generated or resolved for a statement. */
  visitedLastResolve = new Set<ParsedObject>();
  /** The objects it generated or resolved outside any statement's
   *  generation and resolution (`ResolverPasses.outside`). */
  visitedOutsideLastResolve = new Set<ParsedObject>();
  /** The names the last resolve found declared otherwise. */
  changedNamesLastResolve: string[] = [];
  /** What the last resolve's memo candidates reported and read, for each
   *  whose memo can hold it (`ResolveInput.memoCandidates`). */
  memoResolutionsLastResolve = new Map<StatementMemoEntry, MemoResolution>();
  /** The memos of statements served from them whose resolution the last
   *  resolve could not repeat: a name one read is declared otherwise, or the
   *  flows around it changed. The compile lowers them again. */
  staleMemosLastResolve: StatementMemoEntry[] = [];

  // The memo candidates of the resolve in progress, what each reported and
  // read, the candidates whose generation or resolution is running, and the
  // names it found declared otherwise.
  protected _candidates: ReadonlyMap<ParsedObject, MemoCandidate> | null = null;
  protected _tallies = new Map<StatementMemoEntry, MemoTally>();
  protected _frames: { obj: ParsedObject; tally: MemoTally; generated: boolean }[] = [];
  protected _staleMemos = new Set<StatementMemoEntry>();
  // The last resolve that found each name declared otherwise (`*vars` for a
  // constant's validity changing), and the last that found any, by which a
  // memo's resolution, made by an earlier resolve, reads otherwise.
  protected _changedAt = new Map<string, number>();
  protected _anyChangedAt = 0;

  protected _compile = 0;
  protected _needsCold = true;
  // A number for this resolver, which a memo's resolution names it by.
  protected readonly _id = ++lastResolverId;
  /** The resolution epoch the last cold resolve began, which the diverts
   *  this resolver keeps resolved hold their targets in (`CompileEpoch.ts`). */
  protected _epoch = 0;
  /** The constants the story could not register at the last resolve. */
  protected _unregisterable = new Set<string>();
  protected _units = new Map<object, Unit>();
  protected _order: Unit[] = [];
  protected _readers = new Map<string, Set<Unit>>();
  // The statements whose diagnostics report or print a position another
  // statement's replacement, or an edit above, may move.
  protected _positioned = new Set<Unit>();
  protected _memberUnit = new WeakMap<ParsedObject, Unit>();
  // The statement of each declaration's position, and of each global's
  // declaration, initializer and struct, which the story's own passes reach.
  protected _positionUnit = new WeakMap<DebugMetadata, Unit>();
  protected _declarationUnit = new WeakMap<object, Unit>();
  /** The locals each object a statement holds declares where an object
   *  after it reads them (`localsDeclaredIn`), read when the statement is
   *  lowered (`ResolutionTap.declaredLocals`). */
  protected _locals = new WeakMap<ParsedObject, ReadonlySet<string>>();
  /** What `definitionSite`'s walk finds under each object a statement
   *  holds at its top with no position, read once the statement is
   *  generated (`ResolutionTap.unplaced`). */
  protected _unplaced = new WeakMap<ParsedObject, ParsedObject[]>();
  /** The walk of the last resolve, in the story's order. */
  protected _root: FlowNode | null = null;
  /** The first function value naming each flow this compile, made on first
   *  use (`ResolutionTap.functionValue`). */
  protected _functionValues: Map<string, ParsedObject> | null = null;
  protected _occurrences = new WeakMap<object, object[]>();
  // Each struct's runtime definition, built when its statement was last
  // generated, with the diagnostics building it reported.
  protected _structs = new WeakMap<
    StructDefinition,
    { definition: RuntimeStructDefinition; events: ResolutionEvent[]; compile: number }
  >();

  // The resolve in progress.
  protected _story!: Story;
  protected _buffer: { message: string; type: ErrorType; metadata: SourceMetadata | null }[] = [];
  protected _recording: {
    /** The statement being generated or resolved, whose record takes what
     *  its resolution reads, or none for a struct's definition. */
    unit: Unit | null;
    record: UnitRecord | null;
    events: ResolutionEvent[];
    suppress: number;
  } | null = null;
  protected _copies = new WeakSet<DebugMetadata>();
  protected _flows = new Map<FlowBase, FlowNode | Unit>();

  static noPasses(cold: boolean): ResolverPasses {
    return {
      cold,
      units: 0,
      fresh: 0,
      invalidated: 0,
      replayed: 0,
      generated: 0,
      resolved: 0,
      loose: 0,
      outside: 0,
      initialized: 0,
      structs: 0,
      changedNames: 0,
      memoized: 0,
      stopped: false,
    };
  }

  /** Makes the next resolve resolve every statement: the story was resolved
   *  otherwise since (`ExportRuntime`, for a program that fell back). */
  invalidate(): void {
    this._needsCold = true;
  }

  /** Readies a statement to be generated and resolved anew: clears what
   *  generation and resolution left on its objects, which a statement new
   *  to the resolver can hold too (one a preview compile left out and the
   *  next compile places again, or a function whose header an edit wrote
   *  above statements that stood in a scene, which it now holds), and starts
   *  its record. */
  protected prepare(unit: Unit, shape: UnitShape): void {
    for (const member of unit.members) {
      resetSubtreeRuntime(member);
    }
    const anchor = anchorOf(unit);
    unit.next = {
      members: unit.members,
      context: unit.context,
      index: unit.index,
      anchor,
      anchorLine: anchor?.startLineNumber ?? 0,
      shape,
      gen: [],
      init: new Map(),
      resolve: [],
      reads: new Set(),
      dependsOn: new Set(),
      printed: [],
      volatile: false,
      diverts: [],
    };
  }

  /**
   * Moves the target a divert of a statement this resolve did not resolve
   * kept from the compile that resolved it onto the object that stands for
   * it in this compile's story (#656). A flow is assembled anew by every
   * compile, so a divert into another scene would otherwise hold the flow of
   * an earlier compile, and through it that compile's objects of the flow's
   * statements, as long as its statement is carried. The target is the same
   * one by name, so what the store and the statement watch read of it
   * (`targetOf`) reads the same: a flow by its path, read through the
   * story's tables without recording a read, and anything else, a label of a
   * statement lowered anew, by the divert's own path. A divert whose
   * target is gone is left to the resolve that resolves its statement again,
   * which the target's name, declared otherwise, already causes.
   */
  protected retarget(story: Story): void {
    for (const unit of this._order) {
      for (const divert of unit.record?.diverts ?? []) {
        const held = divert.heldTargetContent;
        if (!held || rootOf(held) === story || rootOf(divert) !== story) {
          continue;
        }
        divert.targetContent = held instanceof FlowBase
          ? flowAt(story, held)
          : (divert.target?.ResolveFromContext(divert) ?? null);
      }
    }
  }

  /** Makes the resolution epoch this resolver's diverts hold their targets in
   *  the current one again: another compiler can have resolved since, in an
   *  epoch of its own (`CompileEpoch.ts`). A compile calls it before it reads
   *  a divert it carried. */
  enterEpoch(): void {
    enterResolutionEpoch(this._epoch);
  }

  /** The statements the last resolve generated and resolved, by key, with
   *  why (`Unit.reason`). */
  freshLastResolve(): { key: object; kind: string; reason: string }[] {
    return this._order
      .filter((unit) => unit.fresh)
      .map((unit) => ({ key: unit.key, kind: unit.kind, reason: unit.reason! }));
  }

  /** The statement `obj` stands in, by its key, or none. */
  unitOf(obj: ParsedObject): object | undefined {
    for (let at: ParsedObject | null = obj; at; at = at.parent) {
      const unit = this._memberUnit.get(at);
      if (unit) {
        return unit.key;
      }
    }
    return undefined;
  }

  /**
   * Resolves `story`, reporting its diagnostics to `onDiagnostic`, and
   * returns the runtime story the program's engine runs on: one with the
   * story's lists, structs and constants and no content
   * (`ProgramRoot.runtimeStory`).
   */
  resolve(
    story: Story,
    input: ResolveInput,
    onDiagnostic: (
      message: string,
      type: ErrorType,
      metadata: SourceMetadata | null,
    ) => void,
  ): RuntimeStory {
    this._compile += 1;
    const cold = this._needsCold || input.cold;
    this._needsCold = false;
    this.enterEpoch();
    const passes = (this.passesLastResolve = ProgramResolver.noPasses(cold));
    this.visitedLastResolve = new Set();
    this.visitedOutsideLastResolve = new Set();
    this._story = story;
    this._buffer = [];
    this._flows = new Map();
    this._candidates = input.memoCandidates ?? null;
    this._tallies = new Map();
    this._frames = [];
    this._staleMemos = new Set();
    this.memoResolutionsLastResolve = new Map();
    this.staleMemosLastResolve = [];

    // The statements of this compile, in the story's order.
    const previous = this._order;
    this._order = [];
    const root = this.walkFlow(story, "", input);
    this._root = root;
    this._functionValues = null;
    passes.units = this._order.length;

    // Which statements to generate and resolve.
    const renamed = new Set<Unit>();
    for (const obj of input.renamed) {
      const key = this.unitOf(obj);
      const unit = key ? this._units.get(key) : undefined;
      if (unit) {
        renamed.add(unit);
      }
    }
    const fresh: Unit[] = [];
    for (const unit of this._order) {
      unit.reason = cold
        ? "cold"
        : !unit.record
          ? "new"
          : !sameMembers(unit.members, unit.record.members)
            ? "lowered"
            : unit.context !== unit.record.context
              ? "moved"
              : renamed.has(unit)
                ? "renamed"
                : null;
      unit.fresh = unit.reason !== null;
      unit.invalidated = false;
      if (unit.fresh) {
        fresh.push(unit);
        // A carried statement's objects stand in it already.
        for (const member of unit.members) {
          this._memberUnit.set(member, unit);
        }
      }
    }
    const dropped = previous.filter((unit) => unit.seen !== this._compile);
    for (const unit of dropped) {
      if (this._units.get(unit.key) === unit) {
        this._units.delete(unit.key);
      }
      this.unread(unit);
    }

    // The names declared otherwise: those a statement lowered anew or gone
    // declared, unless it declared them as its replacement does.
    const shapes = new Map<Unit, UnitShape>();
    const declared = new Map<string, string[]>();
    const declare = (defs: Map<string, string[]>, sign: "+" | "-") => {
      for (const [name, how] of defs) {
        let list = declared.get(name);
        if (!list) {
          list = [];
          declared.set(name, list);
        }
        for (const h of how) {
          list.push(`${sign}${h}`);
        }
      }
    };
    for (const unit of fresh) {
      const shape = this.shapeOf(unit);
      shapes.set(unit, shape);
      declare(shape.defs, "+");
      if (unit.record && !cold) {
        declare(unit.record.shape.defs, "-");
      }
    }
    for (const unit of dropped) {
      if (unit.record) {
        declare(unit.record.shape.defs, "-");
      }
    }
    const changed: string[] = [];
    for (const [name, list] of declared) {
      const balance = new Map<string, number>();
      for (const entry of list) {
        const how = entry.slice(1);
        balance.set(how, (balance.get(how) ?? 0) + (entry[0] === "+" ? 1 : -1));
      }
      if ([...balance.values()].some((n) => n !== 0)) {
        changed.push(name);
      }
    }
    passes.changedNames = changed.length;
    this.changedNamesLastResolve = changed;
    this.notedChanged(changed);

    // The carried statements whose resolution would read otherwise.
    if (!cold) {
      const gone = new Set<Unit>([...fresh, ...dropped]);
      const invalidate = (unit: Unit, reason: string) => {
        if (!unit.fresh && unit.seen === this._compile) {
          unit.fresh = true;
          unit.invalidated = true;
          unit.reason = reason;
          fresh.push(unit);
          shapes.set(unit, unit.record!.shape);
        }
      };
      for (const name of changed) {
        for (const unit of this._readers.get(name) ?? []) {
          invalidate(unit, `name ${name}`);
        }
      }
      if (changed.length > 0) {
        for (const unit of this._readers.get("*") ?? []) {
          invalidate(unit, "name *");
        }
      }
      for (const unit of this._positioned) {
        if (unit.fresh || !unit.record || unit.seen !== this._compile) {
          continue;
        }
        const record = unit.record;
        let moved =
          record.volatile && (!record.anchor || anchorDelta(record) !== 0);
        for (const other of record.dependsOn) {
          moved ||= gone.has(other);
        }
        for (const { metadata, printed } of record.printed) {
          moved ||= printedAt(metadata) !== printed;
        }
        if (moved) {
          invalidate(unit, "position");
        }
      }
      passes.invalidated = fresh.filter((unit) => unit.invalidated).length;
    } else {
      // Every divert finds its target again.
      bumpResolutionEpoch();
      this._epoch = currentResolutionEpoch();
    }
    passes.fresh = fresh.length;
    passes.replayed = passes.units - fresh.length;

    for (const unit of fresh) {
      this.prepare(unit, shapes.get(unit)!);
    }

    let runtimeStory: RuntimeStory;
    const tap = tapResolution(this.tap);
    const onPrinted = DebugMetadata.onPrinted;
    const onCreated = DebugMetadata.onCreated;
    DebugMetadata.onPrinted = (metadata, printed) => this.printed(metadata, printed);
    DebugMetadata.onCreated = (metadata) => {
      if (this._recording) {
        this._copies.add(metadata);
      }
    };
    try {
      story.BeginResolution(
        (message, type, metadata) => this.reported(message, type, metadata),
        true,
      );

      // The story's constants, lists and structs, which it declares ahead of
      // every other global (`ExportRuntime`), from each statement's, in the
      // story's order.
      const consts: ConstantDeclaration[] = [];
      const lists: ListDefinition[] = [];
      const structs: StructDefinition[] = [];
      for (const unit of this._order) {
        const shape = shapes.get(unit) ?? unit.record!.shape;
        for (const c of shape.consts) {
          consts.push(c);
        }
        for (const l of shape.lists) {
          lists.push(l);
        }
        for (const s of shape.structs) {
          structs.push(s);
        }
      }
      const runtimeStructs = story.DeclareStoryTables(
        consts,
        lists,
        structs,
        this.runtimeStructOf,
      );

      // A constant the story can register now and could not before, or the
      // other way round (built from a non-constant, from one that cannot be
      // registered, or in a cycle), reads otherwise for every statement that
      // asked about it, though no statement declares it otherwise: the story
      // decides it from the constants together (`RegisterConstantGlobals`),
      // and declares a global of each it registers, so the table of globals
      // reads otherwise too.
      const unregisterable = new Set(story.unregisterableConstants);
      if (!cold) {
        const before = this._unregisterable;
        const revalidated: string[] = [];
        for (const name of new Set([...unregisterable, ...before])) {
          if (unregisterable.has(name) !== before.has(name)) {
            revalidated.push(name);
          }
        }
        const invalidate = (unit: Unit, reason: string) => {
          if (!unit.fresh && unit.seen === this._compile) {
            unit.fresh = true;
            unit.invalidated = true;
            unit.reason = reason;
            fresh.push(unit);
            this.prepare(unit, unit.record!.shape);
            passes.fresh += 1;
            passes.replayed -= 1;
            passes.invalidated += 1;
          }
        };
        if (revalidated.length > 0) {
          this.notedChanged([...revalidated, "*vars"]);
        }
        for (const name of revalidated) {
          for (const unit of this._readers.get(name) ?? []) {
            invalidate(unit, `constant ${name}`);
          }
        }
        if (revalidated.length > 0) {
          for (const key of ["*vars", "*"]) {
            for (const unit of this._readers.get(key) ?? []) {
              invalidate(unit, `constant ${key}`);
            }
          }
        }
      }
      this._unregisterable = unregisterable;

      // Each flow's labels, from what its statements hold, in the order a
      // walk of its weave finds them.
      this.nameFlow(story);

      // Generation: every statement generated anew, or what generating it
      // last did done again.
      story.BeginGeneration(false);
      this.generateFlow(root);

      const implicitParentNames = story.DeclareImplicitParents(structs);
      const runtimeLists = story.PrepareGlobals(
        implicitParentNames,
        runtimeStructs,
        (value) => this.initialize(value),
        this.runtimeStructOf,
      );
      runtimeStory = story.MakeRuntimeStory(
        new RuntimeContainer(),
        runtimeLists,
        runtimeStructs,
      );

      // What the walks of the whole story that resolution makes would find
      // in each statement generated anew, as generation left it.
      for (const unit of fresh) {
        this.readFacts(unit);
      }

      // Resolution, which a throw stops as it stops `ExportRuntime`.
      story.BeginReferenceResolution();
      try {
        this.resolveFlow(root);
      } catch (e) {
        console.error(e);
        passes.stopped = true;
        // The statements after the throw were neither resolved nor replayed.
        this._needsCold = true;
      }
    } catch (e) {
      // A throw out of generation ends the compile, as one out of
      // `ExportRuntime` does.
      this._needsCold = true;
      throw e;
    } finally {
      this._recording = null;
      this._frames = [];
      tapResolution(tap);
      DebugMetadata.onPrinted = onPrinted;
      DebugMetadata.onCreated = onCreated;
    }

    // The statements generated and resolved keep what they recorded.
    for (const unit of dropped) {
      this._positioned.delete(unit);
    }
    for (const unit of fresh) {
      this.unread(unit);
      unit.record = unit.next;
      unit.next = null;
      const record = unit.record!;
      if (record.dependsOn.size > 0 || record.printed.length > 0 || record.volatile) {
        this._positioned.add(unit);
      } else {
        this._positioned.delete(unit);
      }
      for (const key of unit.record!.reads) {
        let readers = this._readers.get(key);
        if (!readers) {
          readers = new Set();
          this._readers.set(key, readers);
        }
        readers.add(unit);
      }
    }

    this.retarget(story);

    // What each memo candidate reported and read, for its memo.
    this.staleMemosLastResolve = [...this._staleMemos];
    if (!passes.stopped) {
      for (const [entry, tally] of this._tallies) {
        const resolution = this.memoResolutionOf(tally);
        if (resolution) {
          this.memoResolutionsLastResolve.set(entry, resolution);
        }
      }
    }
    this._candidates = null;
    this._tallies = new Map();
    this._frames = [];

    for (const { message, type, metadata } of this._buffer) {
      onDiagnostic(message, type, metadata);
    }
    this._buffer = [];
    if (ProgramResolver.verifyFacts) {
      this.verifyFacts(story);
    }
    return runtimeStory;
  }

  // ---- What the story's walks find, from each statement's syntax ----------

  /** Reads what the walks of the whole story that resolution makes
   *  (`Story.globalAssignmentNames`, `FlowBase.IsLocalInScope`) would find
   *  in a statement generated anew: its assignments and function values,
   *  and the locals each of its objects declares. A carried statement keeps
   *  what its last generation left, and so these. */
  protected readFacts(unit: Unit): void {
    const shape = unit.next!.shape;
    shape.assignments = [];
    shape.functionValues = [];
    for (const member of unit.members) {
      for (const obj of this.alongContent(member)) {
        this._locals.delete(obj);
        if (obj instanceof VariableAssignment) {
          shape.assignments.push(obj);
        } else if (obj instanceof DivertTarget && obj.isFunctionValue) {
          shape.functionValues.push(obj);
        }
      }
      this.localsOf(member);
      if (!(member instanceof FlowBase) && !positionOf(member)) {
        this._unplaced.set(member, unplacedUnder(member));
      } else {
        this._unplaced.delete(member);
      }
    }
  }

  /** The locals `obj` declares where an object after it reads them, and
   *  those of every object under it, read once (`_locals`). */
  protected localsOf(obj: ParsedObject): ReadonlySet<string> {
    let locals = this._locals.get(obj);
    if (!locals) {
      const content = obj.content ?? [];
      // A search from inside `obj` asks about the objects it holds.
      for (const child of content) {
        this.localsOf(child);
      }
      const found = localsDeclaredIn(content, content.length, new Set(), (child) =>
        this.localsOf(child),
      );
      locals = found.size > 0 ? found : NO_LOCALS;
      this._locals.set(obj, locals);
    }
    return locals;
  }

  /** Each item of the walk `node` begins, in the story's order: the shape
   *  of each statement, and each object the compile adds itself. */
  protected *walkItems(
    node: FlowNode,
  ): Generator<{ shape: UnitShape } | { loose: ParsedObject }> {
    for (const item of node.items) {
      switch (item.kind) {
        case "unit":
        case "function":
          yield { shape: this.shape(item.unit) };
          break;
        case "loose":
          yield { loose: item.obj };
          break;
        case "flow":
          if (item.node.header) {
            yield { shape: this.shape(item.node.header) };
          }
          yield* this.walkItems(item.node);
          break;
        case "root":
          break;
      }
    }
  }

  /** Every object along `content` under `obj`, `obj` first. */
  protected *alongContent(obj: ParsedObject): Generator<ParsedObject> {
    yield obj;
    for (const child of obj.content ?? []) {
      yield* this.alongContent(child);
    }
  }

  /** The assignments the story holds, in its order, from what each
   *  statement's syntax holds and the objects the compile adds itself. */
  protected *storyAssignments(): Generator<ParsedObject> {
    if (!this._root) {
      return;
    }
    for (const item of this.walkItems(this._root)) {
      if ("shape" in item) {
        yield* item.shape.assignments;
      } else {
        for (const obj of this.alongContent(item.loose)) {
          if (obj instanceof VariableAssignment) {
            yield obj;
          }
        }
      }
    }
  }

  /** The function values the story holds, in its order, as for
   *  `storyAssignments`. */
  protected *storyFunctionValues(): Generator<DivertTarget> {
    if (!this._root) {
      return;
    }
    for (const item of this.walkItems(this._root)) {
      if ("shape" in item) {
        yield* item.shape.functionValues;
      } else {
        for (const obj of this.alongContent(item.loose)) {
          if (obj instanceof DivertTarget && obj.isFunctionValue) {
            yield obj;
          }
        }
      }
    }
  }

  /** Under `verifyFacts`, walks the whole story as the passes the resolver
   *  answers for walk it, and records in `factFailures` any answer the
   *  statements' syntax gave otherwise. */
  protected verifyFacts(story: Story): void {
    const fail = (what: string) => {
      ProgramResolver.factFailures.push(what);
    };
    const assignments: ParsedObject[] = [];
    const functionValues: ParsedObject[] = [];
    const walk = (obj: ParsedObject) => {
      for (const child of obj.content ?? []) {
        if (child instanceof VariableAssignment) {
          assignments.push(child);
        } else if (child instanceof DivertTarget && child.isFunctionValue) {
          functionValues.push(child);
        }
        walk(child);
      }
    };
    walk(story);
    const same = (a: readonly ParsedObject[], b: readonly ParsedObject[]) =>
      a.length === b.length && a.every((obj, i) => obj === b[i]);
    if (!same(assignments, [...this.storyAssignments()])) {
      fail(`assignments: the story holds ${assignments.length}, its statements ${[...this.storyAssignments()].length}`);
    }
    if (!same(functionValues, [...this.storyFunctionValues()])) {
      fail(`function values: the story holds ${functionValues.length}, its statements ${[...this.storyFunctionValues()].length}`);
    }
    const check = (obj: ParsedObject) => {
      const known = this._locals.get(obj);
      if (known) {
        const content = obj.content ?? [];
        const now = [...localsDeclaredIn(content, content.length)].sort().join(",");
        if ([...known].sort().join(",") !== now) {
          fail(`locals of ${obj.typeName}: known ${[...known].sort().join(",")}, now ${now}`);
        }
      }
      const unplaced = this._unplaced.get(obj);
      if (unplaced && !same(unplaced, unplacedUnder(obj))) {
        fail(`objects with no position under ${obj.typeName}: known ${unplaced.length}, now ${unplacedUnder(obj).length}`);
      }
      for (const child of obj.content ?? []) {
        check(child);
      }
    };
    check(story);
  }

  // ---- The walk -----------------------------------------------------------

  /** The unit of `key` for this compile, found or made. */
  protected unitFor(
    key: object,
    kind: Unit["kind"],
    context: string,
  ): Unit {
    let unit = this._units.get(key);
    if (unit?.seen === this._compile) {
      if (kind !== "weave") {
        throw new Error("A flow stands in two places of the story");
      }
      // A block whose objects the assembly placed in two places.
      return this.unitFor(this.occurrence(key), kind, context);
    }
    if (!unit || unit.kind !== kind) {
      unit = new Unit(key, kind);
      this._units.set(key, unit);
    }
    unit.seen = this._compile;
    unit.members = [];
    unit.skipGeneration = null;
    unit.flow = null;
    unit.context = context;
    unit.index = this._order.length;
    this._order.push(unit);
    return unit;
  }

  protected walkFlow(flow: FlowBase, path: string, input: ResolveInput): FlowNode {
    const node: FlowNode = { flow, path, header: null, items: [] };
    this._flows.set(flow, node);
    if (flow.parent && input.blockOf(flow)) {
      const header = this.unitFor(flow._loweredFrom ?? flow, "header", path);
      header.flow = flow;
      node.header = header;
    }
    for (const child of flow.content ?? []) {
      if (child instanceof FlowBase) {
        if (child.isFunction) {
          const unit = this.unitFor(child._loweredFrom ?? child, "flow", path);
          unit.flow = child;
          unit.members = [child];
          this._flows.set(child, unit);
          node.items.push({ kind: "function", unit, flow: child });
        } else {
          const name = flowName(child);
          node.items.push({
            kind: "flow",
            node: this.walkFlow(child, path ? `${path}.${name}` : name, input),
          });
        }
      } else if (child instanceof Weave) {
        node.items.push({ kind: "root", weave: child });
        this.walkWeave(child.content, node, input);
      } else {
        node.items.push({ kind: "loose", obj: child });
      }
    }
    return node;
  }

  /** Lists the statements of a weave's `content`, each the objects placed
   *  for one block, in order. */
  protected walkWeave(
    content: readonly ParsedObject[],
    node: FlowNode,
    input: ResolveInput,
  ): void {
    let current: Unit | null = null;
    let block: object | undefined;
    const close = () => {
      current = null;
      block = undefined;
    };
    for (let i = 0; i < content.length; i += 1) {
      const obj = content[i]!;
      const owner = input.blockOf(obj);
      if (!owner) {
        close();
        if (obj instanceof Weave) {
          // An included script's top level, which the story places where the
          // script is included.
          this.walkWeave(obj.content, node, input);
        } else {
          node.items.push({ kind: "loose", obj });
        }
        continue;
      }
      if (owner !== block) {
        block = owner;
        current = this.unitFor(owner, "weave", node.path);
        node.items.push({ kind: "unit", unit: current });
      }
      const unit = current!;
      if (obj instanceof Weave && obj.isChooseBlock && obj.assembledFrom) {
        // A `choose` block that ends its chunk: the assembly placed a weave
        // of its own in place of the block's, which goes on to hold the
        // content of the chunks after it, as statements after the block.
        const own = obj.assembledFrom.content.length;
        for (let j = 0; j < own; j += 1) {
          unit.members.push(obj.content[j]!);
        }
        close();
        this.walkWeave(obj.content.slice(own), node, input);
        continue;
      }
      if (obj instanceof Statement) {
        // A statement generates no flow it holds.
        for (const inner of obj.content) {
          unit.members.push(inner);
          if (inner instanceof FlowBase) {
            (unit.skipGeneration ??= new Set()).add(inner);
          }
        }
        continue;
      }
      unit.members.push(obj);
    }
  }

  /** A key of its own for a later placement of `block` this compile, whose
   *  first placement is known by the block itself. */
  protected occurrence(block: object): object {
    let keys = this._occurrences.get(block);
    if (!keys) {
      keys = [];
      this._occurrences.set(block, keys);
    }
    for (const key of keys) {
      if (this._units.get(key)?.seen !== this._compile) {
        return key;
      }
    }
    const key = {};
    keys.push(key);
    return key;
  }

  // ---- What a statement declares --------------------------------------

  /** The statement's shape, read from its syntax. */
  protected shapeOf(unit: Unit): UnitShape {
    const shape: UnitShape = {
      defs: new Map(),
      consts: [],
      lists: [],
      structs: [],
      gathers: [],
      choices: [],
      naming: new Map(),
      ownReturn: null,
      ownMultiReturn: null,
      assignments: [],
      functionValues: [],
    };
    const def = (name: string | null | undefined, how: string) => {
      if (name == null) {
        return;
      }
      let list = shape.defs.get(name);
      if (!list) {
        list = [];
        shape.defs.set(name, list);
      }
      list.push(how);
    };
    const kinded = (kind: string, name: string | null | undefined, how: string) => {
      def(name, how);
      def(`*${kind}`, `${name}|${how}`);
    };
    const position = (metadata: DebugMetadata | null | undefined) => {
      if (metadata) {
        this._positionUnit.set(metadata, unit);
      }
    };
    // With the flow lowered: a resolution holds the flow it found
    // (`Divert.targetContent`), which the writer finds the flow's symbol by,
    // so a flow lowered anew under the same name declares the name otherwise.
    const flowSign = (flow: FlowBase) =>
      `flow:${flow.flowLevel}:${flow.isFunction}:${parametersOf(flow)}:${loweringOf(flow)}`;

    if (unit.kind === "header") {
      const flow = unit.flow!;
      const parent = flow.parent instanceof FlowBase ? flowName(flow.parent) : "";
      kinded(`flows:${parent}`, flowName(flow), flowSign(flow));
      for (const arg of flow.args ?? []) {
        def(arg.identifier?.name, `arg:${unit.context}`);
      }
      position(flow.ownDebugMetadata);
      position(flow.identifier?.debugMetadata);
      return shape;
    }

    // The locals still in scope after the statement, as a search from a
    // later statement finds them (`declaresLocal`).
    const openLocals = localsDeclaredIn(unit.members, unit.members.length);

    // One walk over every object under the statement, each before what it
    // holds: the names each declaration declares, with its position and its
    // statement; and, along `content` alone, which is what the passes over
    // the whole story walk (`CollectByType`, `FindAll`, `Find`), the
    // declarations those passes take of it, its labels, and its first return
    // outside any function it writes.
    const declared = (obj: ParsedObject, ...ids: (Identifier | null | undefined)[]) => {
      position(obj.ownDebugMetadata);
      for (const id of ids) {
        position(id?.debugMetadata);
      }
      this._declarationUnit.set(obj, unit);
    };
    const walk = (
      obj: ParsedObject,
      context: string,
      reached: boolean,
      inFlow: boolean,
    ) => {
      let inner = context;
      if (obj instanceof FlowBase) {
        const parent = obj.parent instanceof FlowBase ? flowName(obj.parent) : "";
        kinded(`flows:${parent}`, flowName(obj), flowSign(obj));
        inner = `${context}/${flowName(obj)}`;
        declared(obj, obj.identifier);
      } else if (obj instanceof VariableAssignment) {
        const name = obj.variableName;
        if (obj.isGlobalDeclaration) {
          const type = obj.structDefinition?.type?.name ?? "";
          const how = `global:${obj.typeName}:${obj.isDefineDeclaration}:${type}:${obj.isPreludeDeclaration}:${!!obj.expression}`;
          kinded("vars", name, how);
          if (obj.isDefineDeclaration) {
            kinded("vars", `$prelude_${name}`, how);
            kinded("vars", `$${type || name}_${name}`, how);
          }
        } else if (obj.isNewTemporaryDeclaration) {
          // With whether it is still in scope after the statement, which a
          // block written around it changes (a library-named local's reads,
          // `FlowBase.IsLocalInScope`).
          kinded(
            "vars",
            name,
            `temp:${context}@${unit.index}:${openLocals.has(name) ? "open" : "closed"}`,
          );
        } else if (!obj.isPropertyDeclaration) {
          kinded("vars", name, `bare:${context}@${unit.index}`);
        }
        declared(obj, obj.identifier);
      } else if (obj instanceof ConstantDeclaration) {
        kinded("consts", obj.constantName, "const");
        kinded("vars", obj.constantName, "const");
        declared(obj, obj.identifier);
        // The global the story makes of it initializes from its expression.
        this._declarationUnit.set(obj.expression, unit);
      } else if (obj instanceof ExternalDeclaration) {
        kinded("externals", obj.name, `external:${obj.argumentNames.length}`);
        declared(obj, obj.identifier);
      } else if (obj instanceof ListDefinition) {
        const name = obj.identifier?.name;
        kinded("lists", name, "list");
        kinded("vars", name, "list");
        for (const item of obj.itemDefinitions) {
          kinded("lists", item.name, `item:${name}`);
          declared(item, item.identifier);
        }
        declared(obj, obj.identifier);
      } else if (obj instanceof StructDefinition) {
        const key = obj.key;
        const how = `struct:${obj.type?.name ?? ""}:${!!obj.variableAssignment?.expression}`;
        kinded("structs", obj.identifier?.name, how);
        kinded("structs", key, how);
        if (key.endsWith(".$default")) {
          kinded("structs", key.slice(0, -".$default".length), how);
        }
        kinded("vars", obj.type?.name, `parent:${how}`);
        for (const prop of obj.propertyDefinitions) {
          kinded("vars", `${key}${prop.key}`, `property:${how}`);
          // The global the story makes of a property initializes from its
          // expression.
          if (prop.expression) {
            this._declarationUnit.set(prop.expression, unit);
          }
        }
        declared(obj, obj.identifier, obj.name, obj.type);
      } else if (
        (obj instanceof Gather || obj instanceof Choice) &&
        obj.identifier?.name
      ) {
        kinded("labels", obj.identifier.name, `label:${context}`);
        declared(obj, obj.identifier);
      }
      if (reached) {
        if (obj instanceof ConstantDeclaration) {
          shape.consts.push(obj);
        } else if (obj instanceof ListDefinition) {
          shape.lists.push(obj);
        } else if (obj instanceof StructDefinition) {
          shape.structs.push(obj);
        } else if (obj.identifier?.name != null) {
          if (obj instanceof Gather) {
            shape.gathers.push(obj);
          } else if (obj instanceof Choice) {
            shape.choices.push(obj);
          }
        }
        if (!inFlow) {
          if (obj instanceof ReturnType) {
            shape.ownReturn ??= obj;
          } else if (obj instanceof MultiReturnType) {
            shape.ownMultiReturn ??= obj;
          }
        }
      }
      // `parsedChildren` holds `content` first.
      const children = parsedChildren(obj);
      const content = obj.content?.length ?? 0;
      for (let i = 0; i < children.length; i += 1) {
        const child = children[i]!;
        walk(child, inner, reached && i < content, inFlow || child instanceof FlowBase);
      }
    };
    for (const member of unit.members) {
      walk(member, unit.context, true, member instanceof FlowBase);
    }

    if (unit.kind === "flow") {
      // Each weave the function's flows name, as `ResolveWeavePointNaming`
      // finds its labels.
      const name = (flow: FlowBase, key: FlowBase | null) => {
        if (flow._rootWeave) {
          shape.naming.set(key, namedPointsOf(flow._rootWeave));
        }
        for (const sub of flow._subFlowsByName.values()) {
          name(sub, sub);
        }
      };
      name(unit.flow!, null);
    }
    return shape;
  }

  // ---- Naming -------------------------------------------------------------

  /** Names the labels of `flow`'s weave and of the flows under it, in the
   *  order `FlowBase.ResolveWeavePointNaming` names them. */
  protected nameFlow(flow: FlowBase): void {
    const at = this._flows.get(flow);
    if (at instanceof Unit) {
      this.nameFunction(at, flow, null);
      return;
    }
    if (flow._rootWeave && at) {
      const gathers: ParsedObject[] = [];
      const choices: ParsedObject[] = [];
      for (const item of at.items) {
        if (item.kind === "unit") {
          const shape = this.shape(item.unit);
          gathers.push(...shape.gathers);
          choices.push(...shape.choices);
        }
      }
      flow._rootWeave.NameWeavePoints([...gathers, ...choices] as any[]);
    } else if (flow._rootWeave) {
      flow._rootWeave.ResolveWeavePointNaming();
    }
    for (const sub of flow._subFlowsByName.values()) {
      this.nameFlow(sub);
    }
  }

  protected nameFunction(unit: Unit, flow: FlowBase, key: FlowBase | null): void {
    if (flow._rootWeave) {
      const points = this.shape(unit).naming.get(key);
      flow._rootWeave.NameWeavePoints(
        (points ?? namedPointsOf(flow._rootWeave)) as any[],
      );
    }
    for (const sub of flow._subFlowsByName.values()) {
      this.nameFunction(unit, sub, sub);
    }
  }

  protected shape(unit: Unit): UnitShape {
    return (unit.next ?? unit.record)!.shape;
  }

  // ---- Generation -------------------------------------------------------

  protected generateFlow(node: FlowNode): void {
    const flow = node.flow;
    // A return written in a scene, a branch or at file scope.
    if (
      !flow.isFunction &&
      (flow.flowLevel === FlowLevel.Knot ||
        flow.flowLevel === FlowLevel.Stitch ||
        (flow.flowLevel === FlowLevel.Story && flow._rootWeave !== null))
    ) {
      let found: ParsedObject | null = null;
      for (const item of node.items) {
        if (item.kind === "unit") {
          found = this.shape(item.unit).ownReturn;
          if (found) {
            break;
          }
        }
      }
      if (!found) {
        for (const item of node.items) {
          if (item.kind === "unit") {
            found = this.shape(item.unit).ownMultiReturn;
            if (found) {
              break;
            }
          }
        }
      }
      if (found) {
        flow.ReportReturnOutsideFunction(found);
      }
    }
    const children = new Map<string, FlowBase>();
    const child = (sub: FlowBase) => {
      const name = sub.identifier?.name as string;
      const existing = children.get(name);
      if (existing) {
        flow.ReportDuplicateChildFlow(sub, existing.debugMetadata);
      }
      children.set(name, sub);
    };
    for (const item of node.items) {
      switch (item.kind) {
        case "unit":
          this.generateUnit(item.unit);
          break;
        case "function":
          this.generateUnit(item.unit);
          child(item.flow);
          break;
        case "loose":
          this.passesLastResolve.loose += 1;
          item.obj.prepare();
          break;
        case "flow":
          this.generateFlow(item.node);
          child(item.node.flow);
          break;
        case "root":
          break;
      }
    }
  }

  protected generateUnit(unit: Unit): void {
    if (!unit.fresh) {
      if (unit.record!.gen.length > 0) {
        this.replay(unit, unit.record!.gen);
      }
      return;
    }
    this.record(unit, unit.next!.gen, () => {
      for (const member of unit.members) {
        if (!unit.skipGeneration?.has(member)) {
          member.prepare();
        }
      }
    });
  }

  /** Prepares the initializer of the global `value`, which `PrepareGlobals`
   *  hands over in the order the story declared the globals. */
  protected initialize(value: VariableAssignment): void {
    // The global of a constant or of a struct's property is made anew by
    // every compile, and its initializer is the statement's own.
    const initializer = value.expression!;
    const unit =
      this._declarationUnit.get(value) ?? this._declarationUnit.get(initializer);
    if (!unit || unit.seen !== this._compile) {
      // An initializer that stands in no statement: written on every
      // resolve.
      this.passesLastResolve.initialized += 1;
      this.outside(initializer);
      initializer.PrepareIntoContainer();
      return;
    }
    if (!unit.fresh) {
      const events = unit.record!.init.get(initializer);
      if (events) {
        if (events.length > 0) {
          this.replay(unit, events);
        }
      } else {
        // A global its statement did not initialize when it was generated,
        // which a name its statement read declaring otherwise would have
        // resolved again: written, and nothing recorded.
        this.passesLastResolve.initialized += 1;
        this.outside(initializer);
        initializer.PrepareIntoContainer();
      }
      return;
    }
    this.passesLastResolve.initialized += 1;
    const events: ResolutionEvent[] = [];
    unit.next!.init.set(initializer, events);
    this.record(unit, events, () => initializer.PrepareIntoContainer());
  }

  /** The runtime definition of `struct`, which `DeclareStoryTables` and
   *  `InitializeGlobals` ask for: built when its statement is generated, and
   *  otherwise the one built then, with the diagnostics building it reported
   *  reported again. Building it a second time in one compile reports nothing,
   *  as each diagnostic of a parsed object is reported once per compile. */
  protected runtimeStructOf = (struct: StructDefinition): RuntimeStructDefinition => {
    const unit = this._declarationUnit.get(struct);
    const cached = this._structs.get(struct);
    if (cached?.compile === this._compile) {
      return cached.definition;
    }
    if (cached && unit && unit.seen === this._compile && !unit.fresh) {
      cached.compile = this._compile;
      this.replay(unit, cached.events);
      return cached.definition;
    }
    this.passesLastResolve.structs += 1;
    const events: ResolutionEvent[] = [];
    let definition!: RuntimeStructDefinition;
    this.record(null, events, () => {
      definition = struct.runtimeStructDefinition;
    });
    this._structs.set(struct, { definition, events, compile: this._compile });
    return definition;
  };

  // ---- Resolution -------------------------------------------------------

  protected resolveFlow(node: FlowNode): void {
    const story = this._story;
    for (const item of node.items) {
      switch (item.kind) {
        case "root":
          item.weave.CheckForWeavePointNamingCollisions();
          break;
        case "unit":
        case "function":
          this.resolveUnit(item.unit);
          break;
        case "loose":
          resolveChild(item.obj, story, true);
          break;
        case "flow":
          this.resolveFlow(item.node);
          break;
      }
    }
    node.flow.CheckOwnNames(story);
  }

  protected resolveUnit(unit: Unit): void {
    if (!unit.fresh) {
      if (unit.record!.resolve.length > 0) {
        this.replay(unit, unit.record!.resolve);
      }
      return;
    }
    this.record(unit, unit.next!.resolve, () => {
      for (const member of unit.members) {
        resolveChild(member, this._story, true);
      }
    });
  }

  // ---- Recording and replaying ----------------------------------------

  protected record(
    unit: Unit | null,
    events: ResolutionEvent[],
    run: () => void,
  ): void {
    const outer = this._recording;
    this._recording = { unit, record: unit?.next ?? null, events, suppress: 0 };
    try {
      run();
    } finally {
      this._recording = outer;
    }
  }

  protected replay(
    unit: Unit | null,
    events: readonly ResolutionEvent[],
  ): void {
    const story = this._story;
    for (const event of events) {
      switch (event.kind) {
        case "diagnostic":
          this.raiseAgain(unit?.record ?? null, event);
          break;
        case "declare":
          event.declaration.RegisterDeclaration();
          break;
        case "external":
          event.declaration.RegisterExternal();
          break;
        case "autoGlobal":
          if (
            !story.ResolveVariableWithName(
              event.assignment.variableName,
              event.assignment,
            ).found
          ) {
            event.assignment.RegisterAutoGlobal();
          }
          break;
        case "builtinDivert":
          story.builtinGlobalDiverts.push(event.entry);
          break;
      }
    }
  }

  protected reported(
    message: string,
    type: ErrorType,
    metadata: SourceMetadata | null,
  ): void {
    this._buffer.push({ message, type, metadata });
    // A block statement's memo reports what the statements inside it
    // report, in the order they report it.
    for (const frame of this._frames) {
      const { tally } = frame;
      const { line, endLine } = tally.candidate;
      if (
        !metadata ||
        metadata.startLineNumber < line ||
        metadata.endLineNumber > endLine
      ) {
        this.refuse(tally, "it reports a position outside itself");
        continue;
      }
      (frame.generated ? tally.generate : tally.resolve).push({
        message,
        type,
        startLine: metadata.startLineNumber - line,
        endLine: metadata.endLineNumber - line,
        startCharacter: metadata.startCharacterNumber,
        endCharacter: metadata.endCharacterNumber,
      });
    }
  }

  // ---- Statement memos ----------------------------------------------------

  protected refuse(tally: MemoTally, why: string): void {
    tally.refused ??= why;
  }

  /** Notes that this resolve found `names` declared otherwise: a constant
   *  the story can register now and could not before, or the other way
   *  round, is declared otherwise for its readers and for those that read
   *  the globals whole (`*vars`). */
  protected notedChanged(names: readonly string[]): void {
    for (const name of names) {
      this._changedAt.set(name, this._compile);
    }
    if (names.length > 0) {
      this._anyChangedAt = this._compile;
    }
  }

  /** Whether a statement whose resolution, made by this resolver's resolve
   *  `at`, looked up `name` reads otherwise now, by the rule a carried
   *  statement is resolved again by: the name was declared otherwise since,
   *  or, for `*` (a lookup that read every name), any name was. */
  protected readsOtherwise(name: string, at: number): boolean {
    return (name === "*" ? this._anyChangedAt : (this._changedAt.get(name) ?? 0)) > at;
  }

  /** The memo candidate whose objects `obj` stands among, or none. */
  protected candidateOf(obj: unknown): MemoTally | undefined {
    const candidates = this._candidates;
    if (!candidates || !(obj instanceof ParsedObject)) {
      return undefined;
    }
    for (let at: ParsedObject | null = obj; at; at = at.parent) {
      const candidate = candidates.get(at);
      if (candidate) {
        return this.tallyOf(candidate);
      }
    }
    return undefined;
  }

  protected tallyOf(candidate: MemoCandidate): MemoTally {
    let tally = this._tallies.get(candidate.entry);
    if (!tally) {
      tally = {
        candidate,
        generate: [],
        resolve: [],
        reads: new Set(),
        context: null,
        refused: null,
        autoGlobals: [],
        declares: [],
      };
      this._tallies.set(candidate.entry, tally);
    }
    return tally;
  }

  /** Refuses the memo candidate whose generation or resolution is running,
   *  or, outside any, the one that holds `concerning`: what happened reads or
   *  writes beyond the statement, so its memo could not repeat it. */
  protected refuseRunning(why: string, concerning?: unknown): void {
    const frame = this._frames[this._frames.length - 1];
    const tally = frame?.tally ?? this.candidateOf(concerning);
    if (tally) {
      this.refuse(tally, why);
    }
  }

  /** What a memo candidate's generation and resolution reported, read and
   *  declared, when its memo can repeat it: it reported only positions inside
   *  itself; it declared nothing but the locals and auto-globals of the
   *  assignments it is, which its stand-in declares and makes again
   *  (`repeatMemo`); it read no fact of another statement's that no name
   *  stands for (a function value, the story's assignments) and no name of a
   *  list or a struct, whose values the story decides from the declarations
   *  together. A constant's name it may read: a change of whether the story
   *  can register the constant declares the name otherwise for its readers
   *  (`notedChanged`), which makes the memo stale. */
  protected memoResolutionOf(tally: MemoTally): MemoResolution | undefined {
    if (tally.refused !== null || tally.context === null) {
      return undefined;
    }
    const objects = tally.candidate.objects;
    // A plain assignment stands as an assignment of its name
    // (`MemoizedAssignment`), which the passes over the whole story read as
    // they read it; what it holds they read no more of.
    // A label stands as a label of its name (`MemoizedGather`), as a plain
    // assignment as an assignment of its name.
    const only = objects.length === 1 ? objects[0]! : undefined;
    // A statement of several assignments (`& local a = 1; local b = 2`)
    // stands as a group of them, as one stands as one.
    const assignments = objects.length > 0 && objects.every(standsAsAssignment);
    const assignment =
      assignments || (only instanceof Gather && memoGatherOf(only) !== null);
    // A block statement holds the objects of the statements of its bodies,
    // which their own memos judge, and stand-ins of them when it is served.
    const nested = tally.candidate.nested;
    const walks = (obj: ParsedObject): boolean =>
      nested?.has(obj) ? false : holdsWhatTheStoryWalks(obj, nested);
    if (
      (assignments
        ? objects.some((obj) =>
            (obj instanceof MultiVariableAssignment ? obj.expressions : parsedChildren(obj)).some(walks),
          )
        : assignment
          ? parsedChildren(objects[0]!).some(walks)
          : objects.some(walks)) ||
      (!assignment && localsDeclaredIn(objects as ParsedObject[], objects.length).size > 0)
    ) {
      return undefined;
    }
    // Read without reporting the read (`RecordingMap`). A constant's
    // reader reads it as a global (`GetVar`), and a change of whether the
    // story can register it declares its name otherwise for its readers
    // (`notedChanged`), which makes the memo stale; a list's or a struct's
    // values the story decides from the declarations together.
    const tables = this._story as unknown as {
      _listDefs?: Map<string, unknown>;
      _structDefs?: Map<string, unknown>;
    };
    const has = (table: Map<string, unknown> | undefined, name: string) =>
      !!table && Map.prototype.has.call(table, name);
    for (const name of tally.reads) {
      if (has(tables._listDefs, name) || has(tables._structDefs, name)) {
        return undefined;
      }
    }
    return {
      generate: tally.generate,
      resolve: tally.resolve,
      reads: [...tally.reads],
      context: tally.context,
      resolver: this._id,
      at: this._compile,
      autoGlobals: tally.autoGlobals,
      declares: tally.declares,
    };
  }

  /** Repeats, where a statement served from its memo stands, what its
   *  generation (`generate`) or resolution reported, at its current
   *  position, and reads again the names it read, into the record of the
   *  statement whose objects hold it. A memo whose names are declared
   *  otherwise, or that stands among other flows, cannot be repeated: it is
   *  marked stale, and the compile lowers it again. */
  protected repeatMemo(
    statement: ParsedObject,
    entry: StatementMemoEntry,
    phase: "generate" | "resolve",
  ): void {
    const resolution = entry.resolution;
    const recording = this._recording;
    if (!resolution) {
      this._staleMemos.add(entry);
      return;
    }
    if (phase === "generate") {
      this.passesLastResolve.memoized += 1;
      if (
        !recording?.unit ||
        resolution.resolver !== this._id ||
        recording.unit.context !== resolution.context ||
        resolution.reads.some((name) => this.readsOtherwise(name, resolution.at))
      ) {
        this._staleMemos.add(entry);
      }
    }
    if (recording?.record) {
      for (const name of resolution.reads) {
        recording.record.reads.add(name);
      }
    }
    // A block statement lowered anew reads what a statement inside it
    // served from its memo read.
    for (const frame of this._frames) {
      for (const name of resolution.reads) {
        frame.tally.reads.add(name);
      }
    }
    const at = statement.debugMetadata;
    for (const report of phase === "generate" ? resolution.generate : resolution.resolve) {
      const position = new DebugMetadata();
      position.fileName = at?.fileName ?? null;
      position.filePath = at?.filePath ?? null;
      position.startLineNumber = (at?.startLineNumber ?? 0) + report.startLine;
      position.endLineNumber = (at?.startLineNumber ?? 0) + report.endLine;
      position.startCharacterNumber = report.startCharacter;
      position.endCharacterNumber = report.endCharacter;
      statement.Error(report.message, position, report.type === ErrorType.Warning);
    }
    // The auto-global the assignment made, made again where its resolution
    // would make it, while no name resolves the assignment's name: the
    // lookup reads the names, as the resolution's own did.
    // The locals a local declaration declared, declared again where its
    // generation would declare them, and the auto-globals an assignment
    // made, made again where its resolution would, while no name resolves
    // the name (the lookup reads the names, as the resolution's own did); a
    // block statement's stand-in does so for the statements inside it.
    for (const { assignment, made } of assignmentsOf(statement, resolution, !!entry.owner)) {
      if (phase === "generate" && made.declares.includes(assignment.variableName)) {
        this.event({ kind: "declare", declaration: assignment }, assignment.RegisterDeclaration);
      }
      if (
        phase === "resolve" &&
        made.autoGlobals.includes(assignment.variableName) &&
        !this._story.ResolveVariableWithName(assignment.variableName, assignment).found
      ) {
        this.event({ kind: "autoGlobal", assignment }, assignment.RegisterAutoGlobal);
      }
    }
  }

  /** Records a diagnostic the statement being resolved raised
   *  (`ResolutionTap.diagnostic`). A diagnostic a declaration raises as it
   *  is declared is raised again by declaring it again (`event`). */
  protected raised(
    raiser: ParsedObject | null,
    message: string,
    source: unknown,
    isWarning: boolean,
    position: DebugMetadata | null,
    emitted: boolean,
  ): void {
    const recording = this._recording;
    if (!recording || recording.suppress > 0) {
      return;
    }
    if (this._candidates) {
      const frame = this._frames[this._frames.length - 1];
      if (frame) {
        // A diagnostic the story does not report at a position of its own
        // (one only the flow around it locates), or one about an object of
        // another statement, which that statement's diagnostics decide with.
        const outside =
          (source instanceof ParsedObject && this.candidateOf(source) !== frame.tally) ||
          (!!position && !this._copies.has(position) &&
            (this._positionUnit.get(position) ?? recording.unit) !== recording.unit);
        if ((emitted && !position) || outside) {
          this.refuse(frame.tally, "it reports what another statement decides");
        }
      } else {
        // Raised outside the statement's own generation and resolution about
        // one of its objects.
        this.refuseRunning("another statement reports about it", source);
        this.refuseRunning("another statement reports about it", raiser);
      }
    }
    const copy =
      !!position &&
      this._copies.has(position) &&
      !(source instanceof ParsedObject);
    recording.events.push({ kind: "diagnostic", raiser, message, source, isWarning, position, copy });
    if (position && !this._copies.has(position)) {
      this.dependOn(position);
    }
    // A position the report made moves as far as the statement's anchor
    // moves (`raiseAgain`); a statement with no anchor is resolved again.
    if (copy && recording.record && !recording.record.anchor) {
      recording.record.volatile = true;
    }
  }

  /** Raises a recorded diagnostic again where it was raised, which reports
   *  it at its source's position as it reads now, unless an earlier
   *  diagnostic of the same source keeps it back, as in a cold compile. */
  protected raiseAgain(
    record: UnitRecord | null,
    event: Extract<ResolutionEvent, { kind: "diagnostic" }>,
  ): void {
    const story = this._story;
    let source = event.source as ParsedObject | DebugMetadata | null;
    if (event.copy && event.position) {
      // Nothing keeps back a diagnostic of a position or of a name built for
      // the report, so the position stands for it.
      const position = event.position;
      const delta =
        record?.anchor && record.anchor.filePath === position.filePath
          ? anchorDelta(record)
          : 0;
      if (delta !== 0) {
        const shifted = new DebugMetadata(position);
        shifted.startLineNumber += delta;
        shifted.endLineNumber += delta;
        source = shifted;
      } else {
        source = position;
      }
    }
    // Raised again as nothing the statements being resolved raised.
    const recording = this._recording;
    this._recording = null;
    try {
      const raiser = event.raiser;
      if (raiser && raiser !== story && raiser.story === story) {
        // The message is the one the raiser's own `Error` made (a divert's
        // prefixes `Function call`), so it is raised past that.
        ParsedObject.prototype.Error.call(
          raiser,
          event.message,
          source,
          event.isWarning,
        );
      } else {
        story.Error(event.message, source, event.isWarning, raiser ?? undefined);
      }
    } finally {
      this._recording = recording;
    }
  }

  protected printed(metadata: DebugMetadata, printed: string): void {
    const record = this._recording?.record;
    if (!record) {
      return;
    }
    if (this._frames.length > 0) {
      this.refuseRunning("it prints a position");
    }
    if (this._copies.has(metadata)) {
      record.volatile = true;
      return;
    }
    record.printed.push({ metadata, printed });
    this.dependOn(metadata);
  }

  /** Records that the statement being resolved reports or prints
   *  `position`, which, when it is another statement's, that statement's
   *  replacement may move. */
  protected dependOn(position: DebugMetadata): void {
    const recording = this._recording;
    const owner = this._positionUnit.get(position);
    if (recording?.record && owner && owner !== recording.unit) {
      recording.record.dependsOn.add(owner);
    }
  }

  /** Counts `obj`, generated or resolved outside any statement's generation
   *  and resolution. */
  protected outside(obj: ParsedObject): void {
    this.passesLastResolve.outside += 1;
    if (ProgramResolver.traceVisits) {
      this.visitedOutsideLastResolve.add(obj);
    }
  }

  protected unread(unit: Unit): void {
    for (const key of unit.record?.reads ?? []) {
      this._readers.get(key)?.delete(unit);
    }
  }

  /** What the parsed hierarchy reports to while a statement is resolved. */
  protected tap: ResolutionTap = {
    read: (key) => {
      this._recording?.record?.reads.add(key);
      // A block statement's memo reads what the statements inside it read.
      for (const frame of this._frames) {
        frame.tally.reads.add(key);
      }
    },
    declare: (declaration, register) => this.event({ kind: "declare", declaration: declaration as VariableAssignment }, register),
    external: (declaration, register) => this.event({ kind: "external", declaration: declaration as ExternalDeclaration }, register),
    autoGlobal: (assignment, register) => this.event({ kind: "autoGlobal", assignment: assignment as VariableAssignment }, register),
    builtinDivert: (entry, register) => this.event({ kind: "builtinDivert", entry: entry as Story["builtinGlobalDiverts"][number] }, register),
    diagnostic: (raiser, message, source, isWarning, position, emitted) =>
      this.raised(raiser, message, source, isWarning, position, emitted),
    // A lookup through these reads the name it looks up, or `*`, which is
    // what decides when a statement that made it reads otherwise.
    declaredLocals: (obj) => this._locals.get(obj),
    unplaced: (obj) => this._unplaced.get(obj),
    left: (obj, generated) => {
      const frame = this._frames[this._frames.length - 1];
      if (frame && frame.obj === obj && frame.generated === generated) {
        this._frames.pop();
      }
    },
    memo: (statement, phase) => {
      const entry = memoOf(statement);
      if (entry) {
        this.repeatMemo(statement, entry as StatementMemoEntry, phase);
      }
    },
    functionValue: (flowName) => {
      this.refuseRunning("it reads the function values of other statements");
      if (!this._functionValues) {
        this._functionValues = new Map();
        for (const value of this.storyFunctionValues()) {
          const name = value.divert.target?.dotSeparatedComponents;
          if (name != null && !this._functionValues.has(name)) {
            this._functionValues.set(name, value);
          }
        }
      }
      return this._functionValues.get(flowName) ?? null;
    },
    assignments: () => {
      this.refuseRunning("it reads the assignments of other statements");
      return this.storyAssignments();
    },
    visited: (obj, generated) => {
      const candidate = this._candidates?.get(obj);
      if (candidate) {
        const tally = this.tallyOf(candidate);
        tally.context ??= this._recording?.unit?.context ?? null;
        this._frames.push({ obj, tally, generated });
      }
      if (!this._recording?.unit) {
        this.outside(obj);
        return;
      }
      if (generated) {
        this.passesLastResolve.generated += 1;
      } else {
        this.passesLastResolve.resolved += 1;
        if (obj instanceof Divert) {
          this._recording.unit.next?.diverts.push(obj);
        }
      }
      if (ProgramResolver.traceVisits) {
        this.visitedLastResolve.add(obj);
      }
    },
  };

  protected event(event: ResolutionEvent, register: () => void): void {
    const frame = this._frames[this._frames.length - 1];
    // Whether `obj` is the assignment the running candidate is, or a target
    // of the assignment of several names it is.
    const own = (obj: ParsedObject): boolean => {
      const objects = frame?.tally.candidate.objects;
      return (
        !!objects &&
        objects.every(standsAsAssignment) &&
        (objects.includes(obj) ||
          (obj.parent instanceof MultiVariableAssignment && objects.includes(obj.parent)))
      );
    };
    if (event.kind === "autoGlobal" && own(event.assignment)) {
      // The plain assignment a candidate is makes the auto-global, which
      // its stand-in makes again (`repeatMemo`).
      frame!.tally.autoGlobals.push(event.assignment.variableName);
    } else if (
      event.kind === "declare" &&
      own(event.declaration) &&
      event.declaration.isNewTemporaryDeclaration
    ) {
      // The local declaration a candidate is declares its local, which its
      // stand-in declares again (`repeatMemo`).
      frame!.tally.declares.push(event.declaration.variableName);
    } else if (
      (event.kind === "autoGlobal" && standsIn(event.assignment)) ||
      (event.kind === "declare" && standsIn(event.declaration))
    ) {
      // A stand-in makes it again, as the block statement that holds it
      // will (`repeatMemo`).
    } else if (this._candidates) {
      // A statement that declares anything, which the story keeps for the
      // rest of the compile, is no statement a memo can stand for.
      const declared =
        event.kind === "declare" ? event.declaration
        : event.kind === "external" ? event.declaration
        : event.kind === "autoGlobal" ? event.assignment
        : null;
      this.refuseRunning("it declares", declared);
    }
    const recording = this._recording;
    if (!recording) {
      register();
      return;
    }
    recording.events.push(event);
    recording.suppress += 1;
    try {
      register();
    } finally {
      recording.suppress -= 1;
    }
  }
}

/** Whether `obj`, or anything under it, is what the story's passes over the
 *  whole program take of a statement (`ProgramResolver.shapeOf`,
 *  `readFacts`): a declaration of any kind, a flow, a label, a return, an
 *  assignment or a function value. A statement served from its memo holds
 *  no objects, so a statement that holds any of these is never remembered. */
const holdsWhatTheStoryWalks = (
  obj: ParsedObject,
  except?: ReadonlySet<ParsedObject>,
): boolean => {
  if (except?.has(obj)) {
    return false;
  }
  if (
    obj instanceof FlowBase ||
    obj instanceof VariableAssignment ||
    obj instanceof ConstantDeclaration ||
    obj instanceof ExternalDeclaration ||
    obj instanceof ListDefinition ||
    obj instanceof StructDefinition ||
    obj instanceof ReturnType ||
    obj instanceof MultiReturnType ||
    ((obj instanceof Gather || obj instanceof Choice) && obj.identifier?.name != null) ||
    (obj instanceof DivertTarget && obj.isFunctionValue)
  ) {
    return true;
  }
  return parsedChildren(obj).some((child) => holdsWhatTheStoryWalks(child, except));
};

/** The named gathers, then the named choices, a weave holds at any depth, as
 *  `Weave.ResolveWeavePointNaming` finds them. */
/** What `localsOf` keeps for an object that declares no local. */
const NO_LOCALS: ReadonlySet<string> = new Set();

/** An object's own position, as `definitionSite` reads it. */
const positionOf = (obj: ParsedObject) =>
  obj.ownDebugMetadata ?? obj.identifier?.debugMetadata;

/** The objects under `obj`, other than flows, that a walk entering every
 *  object with no position finds, in its order (`definitionSite`). */
const unplacedUnder = (obj: ParsedObject, into: ParsedObject[] = []): ParsedObject[] => {
  for (const child of obj.content ?? []) {
    if (child instanceof FlowBase) {
      continue;
    }
    into.push(child);
    if (!positionOf(child)) {
      unplacedUnder(child, into);
    }
  }
  return into;
};

const namedPointsOf = (weave: Weave): ParsedObject[] => [
  ...weave.FindAll<Gather>(Gather)((w) => !(w.name === null || w.name === undefined)),
  ...weave.FindAll<Choice>(Choice)((w) => !(w.name === null || w.name === undefined)),
];

/** A position of the statement that an edit above it moves in place: the
 *  first of its objects' own positions, or of the names they hold, which the
 *  compile moves as it moves the objects (a divert has no position of its
 *  own, and its target's names have theirs). */
const anchorOf = (unit: Unit): DebugMetadata | null => {
  if (unit.kind === "header") {
    return unit.flow?.ownDebugMetadata ?? null;
  }
  const find = (obj: ParsedObject): DebugMetadata | null => {
    if (obj.ownDebugMetadata) {
      return obj.ownDebugMetadata;
    }
    const named = obj as {
      identifier?: unknown;
      variableIdentifier?: unknown;
      unresolvedMember?: unknown;
      pathIdentifiers?: unknown;
    };
    const names = [
      named.identifier,
      named.variableIdentifier,
      named.unresolvedMember,
      ...(Array.isArray(named.pathIdentifiers) ? named.pathIdentifiers : []),
    ];
    for (const name of names) {
      if (name instanceof Identifier && name.debugMetadata) {
        return name.debugMetadata;
      }
    }
    for (const child of parsedChildren(obj)) {
      const found = find(child);
      if (found) {
        return found;
      }
    }
    return null;
  };
  for (const member of unit.members) {
    const found = find(member);
    if (found) {
      return found;
    }
  }
  return null;
};

/** A number for the lowering a flow came from, the same for the flow the
 *  compile assembled from it (`FlowBase._loweredFrom`) in every compile. */
const loweringOf = (flow: FlowBase): number => {
  const lowered = flow._loweredFrom ?? flow;
  let n = lowerings.get(lowered);
  if (n === undefined) {
    lastLowering += 1;
    n = lastLowering;
    lowerings.set(lowered, n);
  }
  return n;
};

const lowerings = new WeakMap<FlowBase, number>();
let lastLowering = 0;
let lastResolverId = 0;

const anchorDelta = (record: UnitRecord): number =>
  record.anchor ? record.anchor.startLineNumber - record.anchorLine : 0;

/** How `DebugMetadata.toString` prints `metadata` now, without being heard. */
const printedAt = (metadata: DebugMetadata): string => metadata.printedPosition();
