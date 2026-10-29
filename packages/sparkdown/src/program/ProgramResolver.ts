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
import {
  detachedGlobalsTableWrites,
  functionSitesUnder,
  globalsTableWrite,
  sitesNaming,
  type Story,
} from "../inkjs/compiler/Parser/ParsedHierarchy/Story";
import { ClosestFlowBase } from "../inkjs/compiler/Parser/ParsedHierarchy/Flow/ClosestFlowBase";
import {
  memoAssignmentOf,
  memoMultiOf,
} from "../inkjs/compiler/Parser/ParsedHierarchy/Variable/MemoizedAssignment";
import { MultiVariableAssignment } from "../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import { memoGatherOf } from "../inkjs/compiler/Parser/ParsedHierarchy/Gather/MemoizedGather";
import { VariableAssignment } from "../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { Weave } from "../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { DebugMetadata } from "../runtime/DebugMetadata";
import type { SourceMetadata } from "../runtime/Error";
import { structDefinitionTable } from "../runtime/StructDefinition";
import type { ProgramStoryTables } from "./ProgramRoot";
import { NUMBERED_SYNTHETIC_NAME } from "./ProgramSymbols";
import type { StructDefinition as RuntimeStructDefinition } from "../runtime/StructDefinition";
import type {
  MemoReported,
  MemoResolution,
  StatementMemoEntry,
} from "../compiler/lower/statementMemo";
import {
  MemoizedStatement,
  isHolder,
  memoOf,
} from "../inkjs/compiler/Parser/ParsedHierarchy/MemoizedStatement";
import {
  isLoopInternal,
  loopExitOf,
  loopOf,
} from "../compiler/lower/utils/statementShape";

export function parsedChildren(node: ParsedObject): ParsedObject[] {
  const content = node.content ?? [];
  if (!(node instanceof FunctionCall) || content.includes(node.proxyDivert)) {
    return content;
  }
  const args = node.args.filter((arg) => !content.includes(arg));
  return args.length > 0 ? [...content, ...args] : content;
}

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

export interface ResolverPasses {
  cold: boolean;
  units: number;
  fresh: number;
  invalidated: number;
  replayed: number;
  generated: number;
  resolved: number;
  loose: number;
  outside: number;
  initialized: number;
  structs: number;
  changedNames: number;
  memoized: number;
  stopped: boolean;
}

type ResolutionEvent =
  | {
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

interface UnitShape {
  defs: Map<string, string[]>;
  consts: ConstantDeclaration[];
  structs: StructDefinition[];
  gathers: ParsedObject[];
  choices: ParsedObject[];
  naming: Map<FlowBase | null, ParsedObject[]>;
  ownReturn: ParsedObject | null;
  ownMultiReturn: ParsedObject | null;
  assignments: ParsedObject[];
  functionValues: DivertTarget[];
}

interface UnitRecord {
  members: ParsedObject[];
  context: string;
  index: number;
  anchor: DebugMetadata | null;
  anchorLine: number;
  shape: UnitShape;
  gen: ResolutionEvent[];
  init: Map<ParsedObject, ResolutionEvent[]>;
  resolve: ResolutionEvent[];
  reads: Set<string>;
  dependsOn: Set<Unit>;
  printed: { metadata: DebugMetadata; printed: string }[];
  volatile: boolean;
  diverts: Divert[];
  at: number;
}

const standsIn = (obj: ParsedObject): boolean => {
  for (let at: ParsedObject | null = obj, depth = 0; at && depth < 3; at = at.parent, depth += 1) {
    if (memoOf(at)) {
      return true;
    }
  }
  return false;
};

const standsAsAssignment = (obj: ParsedObject): boolean =>
  (obj instanceof VariableAssignment && memoAssignmentOf(obj) !== null) ||
  (obj instanceof MultiVariableAssignment && memoMultiOf(obj) !== null);

const isAssignmentFact = (obj: ParsedObject): boolean =>
  obj instanceof VariableAssignment || globalsTableWrite(obj) !== null;

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

const rootOf = (obj: ParsedObject): ParsedObject => {
  let at = obj;
  while (at.parent) {
    at = at.parent;
  }
  return at;
};

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

class Unit {
  members: ParsedObject[] = [];
  skipGeneration: Set<ParsedObject> | null = null;
  flow: FlowBase | null = null;
  block: object | null = null;
  context = "";
  index = 0;
  record: UnitRecord | null = null;
  next: UnitRecord | null = null;
  fresh = false;
  invalidated = false;
  reason: string | null = null;
  seen = -1;

  constructor(
    readonly key: object,
    readonly kind: "weave" | "flow" | "header",
  ) {}
}

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

export interface ResolveInput {
  blockOf(obj: ParsedObject): object | undefined;
  renamed: Iterable<ParsedObject>;
  cold: boolean;
  memoCandidates?: ReadonlyMap<ParsedObject, MemoCandidate>;
  carriedMemos?(blocks: ReadonlySet<object>): void;
}

export interface MemoCandidate {
  readonly entry: StatementMemoEntry;
  readonly objects: readonly ParsedObject[];
  readonly line: number;
  readonly endLine: number;
  readonly nested?: ReadonlySet<ParsedObject>;
}

interface MemoTally {
  readonly candidate: MemoCandidate;
  generate: MemoReported[];
  resolve: MemoReported[];
  reads: Set<string>;
  context: string | null;
  refused: string | null;
  autoGlobals: string[];
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

export class ProgramResolver {
  static traceVisits = false;
  static verifyFacts = false;
  static factFailures: string[] = [];

  passesLastResolve: ResolverPasses = ProgramResolver.noPasses(true);
  visitedLastResolve = new Set<ParsedObject>();
  visitedOutsideLastResolve = new Set<ParsedObject>();
  changedNamesLastResolve: string[] = [];
  memoResolutionsLastResolve = new Map<StatementMemoEntry, MemoResolution>();
  staleMemosLastResolve: StatementMemoEntry[] = [];

  protected _candidates: ReadonlyMap<ParsedObject, MemoCandidate> | null = null;
  protected _owners = new Map<ParsedObject, MemoCandidate[]>();
  protected _tallies = new Map<StatementMemoEntry, MemoTally>();
  protected _frames: { obj: ParsedObject; tally: MemoTally; generated: boolean }[] = [];
  protected _staleMemos = new Set<StatementMemoEntry>();
  protected _changedAt = new Map<string, number>();
  protected _anyChangedAt = 0;
  protected _committed = 0;

  protected _compile = 0;
  protected _needsCold = true;
  protected readonly _id = ++lastResolverId;
  protected _epoch = 0;
  protected _unregisterable = new Set<string>();
  protected _units = new Map<object, Unit>();
  protected _order: Unit[] = [];
  protected _readers = new Map<string, Set<Unit>>();
  protected _positioned = new Set<Unit>();
  protected _memberUnit = new WeakMap<ParsedObject, Unit>();
  protected _positionUnit = new WeakMap<DebugMetadata, Unit>();
  protected _declarationUnit = new WeakMap<object, Unit>();
  protected _locals = new WeakMap<ParsedObject, ReadonlySet<string>>();
  protected _unplaced = new WeakMap<ParsedObject, ParsedObject[]>();
  protected _root: FlowNode | null = null;
  protected _functionValues: Map<string, ParsedObject> | null = null;
  protected _globalWrites: Set<string> | null = null;
  protected _occurrences = new WeakMap<object, object[]>();
  protected _structs = new WeakMap<
    StructDefinition,
    { definition: RuntimeStructDefinition; events: ResolutionEvent[]; compile: number }
  >();

  protected _story!: Story;
  protected _buffer: { message: string; type: ErrorType; metadata: SourceMetadata | null }[] = [];
  protected _recording: {
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

  invalidate(): void {
    this._needsCold = true;
  }

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
      at: this._compile,
    };
  }

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

  enterEpoch(): void {
    enterResolutionEpoch(this._epoch);
  }

  freshLastResolve(): { key: object; kind: string; reason: string }[] {
    return this._order
      .filter((unit) => unit.fresh)
      .map((unit) => ({ key: unit.key, kind: unit.kind, reason: unit.reason! }));
  }

  unitOf(obj: ParsedObject): object | undefined {
    for (let at: ParsedObject | null = obj; at; at = at.parent) {
      const unit = this._memberUnit.get(at);
      if (unit) {
        return unit.key;
      }
    }
    return undefined;
  }

  resolve(
    story: Story,
    input: ResolveInput,
    onDiagnostic: (
      message: string,
      type: ErrorType,
      metadata: SourceMetadata | null,
    ) => void,
  ): ProgramStoryTables {
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
    this._owners = ProgramResolver.ownersOf(this._candidates);
    this._tallies = new Map();
    this._frames = [];
    this._staleMemos = new Set();
    this.memoResolutionsLastResolve = new Map();
    this.staleMemosLastResolve = [];

    const previous = this._order;
    this._order = [];
    const root = this.walkFlow(story, "", input);
    this._root = root;
    this._functionValues = null;
    this._globalWrites = null;
    passes.units = this._order.length;

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
      shapes.set(unit, this.shapeOf(unit));
    }
    this.decideWrites(fresh, shapes);
    for (const unit of fresh) {
      const shape = shapes.get(unit)!;
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
      for (const unit of this._order) {
        if (unit.record && unit.record.at > this._committed) {
          invalidate(unit, "uncommitted");
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
      this.decideWrites(
        fresh.filter((unit) => unit.invalidated),
        null,
      );
    } else {
      bumpResolutionEpoch();
      this._epoch = currentResolutionEpoch();
    }
    passes.fresh = fresh.length;
    passes.replayed = passes.units - fresh.length;

    for (const unit of fresh) {
      this.prepare(unit, shapes.get(unit)!);
    }

    let tables: ProgramStoryTables;
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
      story.BeginResolution((message, type, metadata) =>
        this.reported(message, type, metadata),
      );

      const consts: ConstantDeclaration[] = [];
      const structs: StructDefinition[] = [];
      for (const unit of this._order) {
        const shape = shapes.get(unit) ?? unit.record!.shape;
        for (const c of shape.consts) {
          consts.push(c);
        }
        for (const s of shape.structs) {
          structs.push(s);
        }
      }
      const runtimeStructs = story.DeclareStoryTables(
        consts,
        structs,
        this.runtimeStructOf,
      );

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

      this.noteCarriedMemos(fresh, input);

      this.nameFlow(story);

      story.BeginPreparation();
      this.generateFlow(root);

      const implicitParentNames = story.DeclareImplicitParents(structs);
      story.PrepareGlobals(
        implicitParentNames,
        runtimeStructs,
        (value) => this.initialize(value),
        this.runtimeStructOf,
      );
      tables = {
        structDefinitions: structDefinitionTable(runtimeStructs),
        constantNames: story.RegisteredConstantNames(),
      };

      for (const unit of fresh) {
        this.readFacts(unit);
      }

      story.BeginReferenceResolution();
      try {
        this.resolveFlow(root);
      } catch (e) {
        console.error(e);
        passes.stopped = true;
        this._needsCold = true;
      }
    } catch (e) {
      this._needsCold = true;
      throw e;
    } finally {
      this._recording = null;
      this._frames = [];
      tapResolution(tap);
      DebugMetadata.onPrinted = onPrinted;
      DebugMetadata.onCreated = onCreated;
    }

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
    this._owners = new Map();
    this._tallies = new Map();
    this._frames = [];

    for (const { message, type, metadata } of this._buffer) {
      onDiagnostic(message, type, metadata);
    }
    this._buffer = [];
    if (ProgramResolver.verifyFacts) {
      this.verifyFacts(story);
    }
    return tables;
  }

  protected readFacts(unit: Unit): void {
    const shape = unit.next!.shape;
    shape.assignments = [];
    shape.functionValues = [];
    for (const member of unit.members) {
      for (const obj of this.alongContent(member)) {
        this._locals.delete(obj);
        if (isAssignmentFact(obj)) {
          shape.assignments.push(obj);
        } else if (obj instanceof DivertTarget && obj.isFunctionValue) {
          shape.functionValues.push(obj);
        }
        shape.assignments.push(...detachedGlobalsTableWrites(obj));
      }
      this.localsOf(member);
      if (!(member instanceof FlowBase) && !positionOf(member)) {
        this._unplaced.set(member, unplacedUnder(member));
      } else {
        this._unplaced.delete(member);
      }
    }
  }

  protected decideWrites(
    units: readonly Unit[],
    shapes: Map<Unit, UnitShape> | null,
  ): void {
    if (units.length === 0) {
      return;
    }
    const tap = tapResolution(this.tap);
    try {
      this.decideWritesTapped(units, shapes);
    } finally {
      tapResolution(tap);
    }
  }

  protected decideWritesTapped(
    units: readonly Unit[],
    shapes: Map<Unit, UnitShape> | null,
  ): void {
    const deciding = new Set(units);
    const declareWrite = (unit: Unit, name: string, bound: boolean) => {
      const shape = shapes?.get(unit);
      if (shape) {
        const how = `write:${bound ? "local" : "global"}:${unit.context}@${unit.index}`;
        for (const key of [name, "*vars"]) {
          const list = shape.defs.get(key) ?? [];
          list.push(key === "*vars" ? `${name}|${how}` : how);
          shape.defs.set(key, list);
        }
      }
    };
    let storyValues: Map<string, ParsedObject[]> | null = null;
    const topLevelValues = (): Map<string, ParsedObject[]> => {
      if (!storyValues) {
        storyValues = new Map();
        const add = (value: ParsedObject) => {
          const name =
            value instanceof DivertTarget
              ? value.divert.target?.dotSeparatedComponents
              : null;
          if (name) {
            const list = storyValues!.get(name) ?? [];
            list.push(value);
            storyValues!.set(name, list);
          }
        };
        for (const unit of this._order) {
          if (deciding.has(unit)) {
            for (const member of unit.members) {
              for (const obj of this.alongContent(member)) {
                if (obj instanceof DivertTarget && obj.isFunctionValue) {
                  add(obj);
                }
              }
            }
          } else {
            for (const value of unit.record?.shape.functionValues ?? []) {
              add(value);
            }
          }
        }
      }
      return storyValues;
    };
    for (const unit of units) {
      for (const member of unit.members) {
        for (const obj of this.alongContent(member)) {
          for (const held of detachedGlobalsTableWrites(obj)) {
            declareWrite(unit, globalsTableWrite(held)!, false);
          }
          const throughGlobals = globalsTableWrite(obj);
          if (throughGlobals !== null) {
            declareWrite(unit, throughGlobals, false);
            continue;
          }
          if (!(obj instanceof VariableAssignment) || obj.isDeclaration) {
            continue;
          }
          const story = obj.story;
          const bound = story.IsBoundLocallyAt(obj.variableName, obj, (flow) => {
            const around = flow.parent ? ClosestFlowBase(flow) : null;
            const name = flowName(flow);
            const candidates =
              around instanceof FlowBase && around !== story
                ? (functionSitesUnder(around).get(name) ?? [])
                : (topLevelValues().get(name) ?? []);
            return sitesNaming(flow, candidates);
          });
          obj.boundLocally = bound;
          declareWrite(unit, obj.variableName, bound);
        }
      }
    }
  }

  protected localsOf(obj: ParsedObject): ReadonlySet<string> {
    let locals = this._locals.get(obj);
    if (!locals) {
      const content = obj.content ?? [];
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

  protected *alongContent(obj: ParsedObject): Generator<ParsedObject> {
    yield obj;
    for (const child of obj.content ?? []) {
      yield* this.alongContent(child);
    }
  }

  protected *storyAssignments(): Generator<ParsedObject> {
    if (!this._root) {
      return;
    }
    for (const item of this.walkItems(this._root)) {
      if ("shape" in item) {
        yield* item.shape.assignments;
      } else {
        for (const obj of this.alongContent(item.loose)) {
          if (isAssignmentFact(obj)) {
            yield obj;
          }
          yield* detachedGlobalsTableWrites(obj);
        }
      }
    }
  }

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

  protected verifyFacts(story: Story): void {
    const fail = (what: string) => {
      ProgramResolver.factFailures.push(what);
    };
    const assignments: ParsedObject[] = [];
    const functionValues: ParsedObject[] = [];
    const walk = (obj: ParsedObject) => {
      for (const child of obj.content ?? []) {
        if (isAssignmentFact(child)) {
          assignments.push(child);
        } else if (child instanceof DivertTarget && child.isFunctionValue) {
          functionValues.push(child);
        }
        assignments.push(...detachedGlobalsTableWrites(child));
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
    unit.block = null;
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
          this.walkWeave(obj.content, node, input);
        } else {
          node.items.push({ kind: "loose", obj });
        }
        continue;
      }
      if (owner !== block) {
        block = owner;
        current = this.unitFor(owner, "weave", node.path);
        current.block = owner;
        node.items.push({ kind: "unit", unit: current });
      }
      const unit = current!;
      if (obj instanceof Weave && obj.isChooseBlock && obj.assembledFrom) {
        const own = obj.assembledFrom.content.length;
        for (let j = 0; j < own; j += 1) {
          unit.members.push(obj.content[j]!);
        }
        close();
        this.walkWeave(obj.content.slice(own), node, input);
        continue;
      }
      if (obj instanceof Statement) {
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

  protected shapeOf(unit: Unit): UnitShape {
    const shape: UnitShape = {
      defs: new Map(),
      consts: [],
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

    const openLocals = localsDeclaredIn(unit.members, unit.members.length);

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
        this._declarationUnit.set(obj.expression, unit);
      } else if (obj instanceof ExternalDeclaration) {
        kinded("externals", obj.name, `external:${obj.argumentNames.length}`);
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

  protected generateFlow(node: FlowNode): void {
    const flow = node.flow;
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

  protected initialize(value: VariableAssignment): void {
    const initializer = value.expression!;
    const prepare = () => {
      initializer.PrepareIntoContainer();
      for (const discarded of value.discarded) discarded.PrepareIntoContainer();
    };
    const unit =
      this._declarationUnit.get(value) ?? this._declarationUnit.get(initializer);
    if (!unit || unit.seen !== this._compile) {
      this.passesLastResolve.initialized += 1;
      this.outside(initializer);
      prepare();
      return;
    }
    if (!unit.fresh) {
      const events = unit.record!.init.get(initializer);
      if (events) {
        if (events.length > 0) {
          this.replay(unit, events);
        }
      } else {
        this.passesLastResolve.initialized += 1;
        this.outside(initializer);
        prepare();
      }
      return;
    }
    this.passesLastResolve.initialized += 1;
    const events: ResolutionEvent[] = [];
    unit.next!.init.set(initializer, events);
    this.record(unit, events, prepare);
  }

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
          resolveChild(item.obj, story);
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
        resolveChild(member, this._story);
      }
    });
  }

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

  protected refuse(tally: MemoTally, why: string): void {
    tally.refused ??= why;
  }

  protected notedChanged(names: readonly string[]): void {
    for (const name of names) {
      this._changedAt.set(name, this._compile);
    }
    if (names.length > 0) {
      this._anyChangedAt = this._compile;
    }
  }

  protected readsOtherwise(name: string, at: number): boolean {
    return (name === "*" ? this._anyChangedAt : (this._changedAt.get(name) ?? 0)) > at;
  }

  protected noteCarriedMemos(fresh: readonly Unit[], input: ResolveInput): void {
    const candidates = this._candidates;
    if (!input.carriedMemos || !candidates) {
      return;
    }
    const blocks = new Set<object>();
    for (const unit of fresh) {
      const block = unit.block ?? (unit.flow ? input.blockOf(unit.flow) : undefined);
      if (block) {
        blocks.add(block);
      }
    }
    if (blocks.size === 0) {
      return;
    }
    input.carriedMemos(blocks);
    this._owners = ProgramResolver.ownersOf(candidates);
  }

  committed(): void {
    this._committed = this._compile;
  }

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

  protected static ownersOf(
    candidates: ReadonlyMap<ParsedObject, MemoCandidate> | null,
  ): Map<ParsedObject, MemoCandidate[]> {
    const owners = new Map<ParsedObject, MemoCandidate[]>();
    for (const candidate of new Set(candidates?.values() ?? [])) {
      for (const obj of candidate.nested ?? []) {
        let list = owners.get(obj);
        if (!list) {
          list = [];
          owners.set(obj, list);
        }
        list.push(candidate);
      }
    }
    return owners;
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

  protected refuseRunning(why: string, concerning?: unknown): void {
    const frame = this._frames[this._frames.length - 1];
    const tally = frame?.tally ?? this.candidateOf(concerning);
    if (tally) {
      this.refuse(tally, why);
    }
  }

  protected memoResolutionOf(tally: MemoTally): MemoResolution | undefined {
    if (tally.refused !== null || tally.context === null) {
      return undefined;
    }
    const objects = tally.candidate.objects;
    const only = objects.length === 1 ? objects[0]! : undefined;
    const assignments = objects.length > 0 && objects.every(standsAsAssignment);
    const assignment =
      assignments || (only instanceof Gather && memoGatherOf(only) !== null);
    const nested = tally.candidate.nested;
    const held = heldPartsOf(objects);
    const walks = (obj: ParsedObject): boolean =>
      nested?.has(obj) ? false : holdsWhatTheStoryWalks(obj, nested, held);
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
    const tables = this._story as unknown as {
      _structDefs?: Map<string, unknown>;
    };
    const has = (table: Map<string, unknown> | undefined, name: string) =>
      !!table && Map.prototype.has.call(table, name);
    for (const name of tally.reads) {
      if (has(tables._structDefs, name)) {
        return undefined;
      }
    }
    const own = ownNumberedNames(objects, nested);
    return {
      generate: tally.generate,
      resolve: tally.resolve,
      reads: own.size > 0 ? [...tally.reads].filter((name) => !own.has(name)) : [...tally.reads],
      context: tally.context,
      resolver: this._id,
      at: this._compile,
      autoGlobals: tally.autoGlobals,
      declares: tally.declares,
    };
  }

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
    if (phase === "generate" && entry.owner) {
      for (const held of statement.content) {
        if (isHolder(held) && held instanceof VariableAssignment && held.isNewTemporaryDeclaration) {
          this.event({ kind: "declare", declaration: held }, held.RegisterDeclaration);
        }
      }
    }
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
        const outside =
          (source instanceof ParsedObject && this.candidateOf(source) !== frame.tally) ||
          (!!position && !this._copies.has(position) &&
            (this._positionUnit.get(position) ?? recording.unit) !== recording.unit);
        if ((emitted && !position) || outside) {
          this.refuse(frame.tally, "it reports what another statement decides");
        }
      } else {
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
    if (copy && recording.record && !recording.record.anchor) {
      recording.record.volatile = true;
    }
  }

  protected raiseAgain(
    record: UnitRecord | null,
    event: Extract<ResolutionEvent, { kind: "diagnostic" }>,
  ): void {
    const story = this._story;
    let source = event.source as ParsedObject | DebugMetadata | null;
    if (event.copy && event.position) {
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
    const recording = this._recording;
    this._recording = null;
    try {
      const raiser = event.raiser;
      if (raiser && raiser !== story && raiser.story === story) {
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

  protected dependOn(position: DebugMetadata): void {
    const recording = this._recording;
    const owner = this._positionUnit.get(position);
    if (recording?.record && owner && owner !== recording.unit) {
      recording.record.dependsOn.add(owner);
    }
  }

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

  protected tap: ResolutionTap = {
    read: (key) => {
      this._recording?.record?.reads.add(key);
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
    declaredLocals: (obj) => this._locals.get(obj),
    unplaced: (obj) => this._unplaced.get(obj),
    left: (obj, generated) => {
      for (
        let frame = this._frames[this._frames.length - 1];
        frame && frame.obj === obj && frame.generated === generated;
        frame = this._frames[this._frames.length - 1]
      ) {
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
    globalWrite: (name) => {
      if (!this._globalWrites) {
        this._globalWrites = new Set();
        for (const obj of this.storyAssignments()) {
          const written = obj.story.globalWriteName(obj);
          if (written !== null) {
            this._globalWrites.add(written);
          }
        }
      }
      return this._globalWrites.has(name);
    },
    visited: (obj, generated) => {
      const candidate = this._candidates?.get(obj);
      for (const owner of this._owners.get(obj) ?? []) {
        const tally = this.tallyOf(owner);
        if (owner !== candidate && !this._frames.some((frame) => frame.tally === tally)) {
          tally.context ??= this._recording?.unit?.context ?? null;
          this._frames.push({ obj, tally, generated });
        }
      }
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
      frame!.tally.autoGlobals.push(event.assignment.variableName);
    } else if (
      event.kind === "declare" &&
      own(event.declaration) &&
      event.declaration.isNewTemporaryDeclaration
    ) {
      frame!.tally.declares.push(event.declaration.variableName);
    } else if (
      (event.kind === "autoGlobal" && standsIn(event.assignment)) ||
      (event.kind === "declare" && standsIn(event.declaration))
    ) {
    } else if (
      event.kind === "declare" &&
      isLoopInternal(event.declaration) &&
      !!frame &&
      loopOf.has(frame.tally.candidate.objects[0]!)
    ) {
    } else if (this._candidates) {
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

const inFunctionBody = (obj: ParsedObject): boolean =>
  !!(ClosestFlowBase(obj) as FlowBase | null)?.isFunction;

const holdsWhatTheStoryWalks = (
  obj: ParsedObject,
  except?: ReadonlySet<ParsedObject>,
  held?: (obj: ParsedObject) => boolean,
): boolean => {
  if (except?.has(obj)) {
    return false;
  }
  if (held?.(obj)) {
    return parsedChildren(obj).some((child) => holdsWhatTheStoryWalks(child, except, held));
  }
  if (
    obj instanceof FlowBase ||
    obj instanceof VariableAssignment ||
    obj instanceof ConstantDeclaration ||
    obj instanceof ExternalDeclaration ||
    obj instanceof StructDefinition ||
    ((obj instanceof ReturnType || obj instanceof MultiReturnType) && !inFunctionBody(obj)) ||
    ((obj instanceof Gather || obj instanceof Choice) && obj.identifier?.name != null) ||
    (obj instanceof DivertTarget && obj.isFunctionValue) ||
    globalsTableWrite(obj) !== null ||
    detachedGlobalsTableWrites(obj).length > 0
  ) {
    return true;
  }
  return parsedChildren(obj).some((child) => holdsWhatTheStoryWalks(child, except, held));
};

const heldPartsOf = (
  objects: readonly ParsedObject[],
): ((obj: ParsedObject) => boolean) => {
  const first = objects[0];
  if (first && loopOf.has(first)) {
    return isLoopInternal;
  }
  if (objects.length === 1 && first instanceof Weave && first.isChooseBlock) {
    return (obj) => obj instanceof Choice || obj instanceof Gather;
  }
  return () => false;
};

const ownNumberedNames = (
  objects: readonly ParsedObject[],
  nested: ReadonlySet<ParsedObject> | undefined,
): Set<string> => {
  const out = new Set<string>();
  const visit = (obj: ParsedObject) => {
    if (nested?.has(obj)) {
      return;
    }
    if (isLoopInternal(obj) || loopExitOf.has(obj)) {
      const name =
        obj instanceof Gather
          ? obj.name
          : obj instanceof VariableAssignment
            ? obj.variableName
            : obj instanceof Divert
              ? (obj.pathIdentifiers?.[0]?.name ?? null)
              : null;
      if (name && NUMBERED_SYNTHETIC_NAME.test(name)) {
        out.add(name);
      }
    }
    parsedChildren(obj).forEach(visit);
  };
  objects.forEach(visit);
  return out;
};

const NO_LOCALS: ReadonlySet<string> = new Set();

const positionOf = (obj: ParsedObject) =>
  obj.ownDebugMetadata ?? obj.identifier?.debugMetadata;

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

const printedAt = (metadata: DebugMetadata): string => metadata.printedPosition();
