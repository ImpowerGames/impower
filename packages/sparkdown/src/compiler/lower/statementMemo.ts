import type { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { AuthorWarning } from "../../inkjs/compiler/Parser/ParsedHierarchy/AuthorWarning";
import { Choice } from "../../inkjs/compiler/Parser/ParsedHierarchy/Choice";
import type { ContentList } from "../../inkjs/compiler/Parser/ParsedHierarchy/ContentList";
import { Divert } from "../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { FlowBase } from "../../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowBase";
import { Gather } from "../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import {
  MemoizedDivert,
  memoDivertOf,
  type MemoDivert,
} from "../../inkjs/compiler/Parser/ParsedHierarchy/Divert/MemoizedDivert";
import {
  MemoizedGather,
  memoGatherOf,
  type MemoGather,
} from "../../inkjs/compiler/Parser/ParsedHierarchy/Gather/MemoizedGather";
import {
  type MemoPosition,
  MemoizedStatement,
  markHolder,
  memoOf,
  placeIdentifier,
} from "../../inkjs/compiler/Parser/ParsedHierarchy/MemoizedStatement";
import {
  MemoizedAssignment,
  MemoizedMultiAssignment,
  memoAssignmentOf,
  memoMultiOf,
  type MemoAssignment,
  type MemoMultiAssignment,
} from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MemoizedAssignment";
import { MultiVariableAssignment } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import { Identifier } from "../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { VariableAssignment } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import type { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { TunnelOnwards } from "../../inkjs/compiler/Parser/ParsedHierarchy/TunnelOnwards";
import { Weave } from "../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { Wrap } from "../../inkjs/compiler/Parser/ParsedHierarchy/Wrap";
import { ControlCommand as RuntimeControlCommand } from "../../runtime/ControlCommand";
import { DebugMetadata } from "../../runtime/DebugMetadata";
import type { ErrorType } from "../../inkjs/compiler/Parser/ErrorType";
import type { ProgramChunk } from "../../program/ProgramChunk";
import type {
  CompiledBlock,
  InkDiagnostic,
} from "../classes/annotators/CompilationAnnotator";
import type { LowerContext, LoweringRead } from "./context";
import {
  rawContext,
  readsHold,
  recordLowering,
  type ContextRead,
  type ContextRecording,
} from "./recordingContext";
import { buildDebugMetadata, statementBounds } from "./utils/debugMetadata";
import type { SparkdownNodeName } from "../types/SparkdownNodeName";
import {
  isLoopInternal,
  loopExitOf,
  loopOf,
  type StatementShape,
} from "./utils/statementShape";
import { holdsCheckedBlock } from "./utils/validateBlockEnds";
import { namesHeldBy } from "../utils/syntheticNameFields";
import { parsedChildren } from "../../program/ProgramResolver";

type SparkdownNode = GrammarSyntaxNode<SparkdownNodeName>;

export class StatementMemoEntry {
  resolution?: MemoResolution;
  chunk?: ProgramChunk;
  generation = -1;
  stale = false;

  constructor(
    readonly syntax: string,
    readonly reads: readonly ContextRead[],
    readonly loweringReads: readonly MemoLoweringRead[],
    readonly diagnostics: readonly MemoDiagnostic[],
    readonly blockDiagnostics: readonly MemoDiagnostic[],
    readonly own: {
      readonly other: readonly string[];
      readonly context: string;
      readonly recorded: string | undefined;
    },
    readonly holdsBlock: boolean,
    readonly stand:
      | MemoDivert
      | MemoAssignment
      | MemoMultiAssignment
      | MemoGather
      | MemoAssignmentGroup
      | null = null,
    readonly owner: MemoOwner | null = null,
  ) {}

  get complete(): boolean {
    return this.chunk !== undefined && this.resolution !== undefined;
  }
}

export interface MemoNested {
  readonly entry: StatementMemoEntry;
  readonly node: string;
  readonly from: number;
  readonly to: number;
}

export interface MemoBody {
  readonly headStart: number;
  readonly headEnd: number;
  readonly nextStart: number;
  readonly statements: readonly MemoNested[];
}

export interface MemoOwner {
  readonly bodies: readonly MemoBody[];
  readonly reads: readonly { readonly at: number; readonly reads: readonly ContextRead[] }[];
  readonly descendants: readonly StatementMemoEntry[];
  readonly holders: readonly MemoHolder[];
  readonly scoped: boolean;
  readonly choose: boolean;
}

export interface MemoHolder {
  readonly kind: "label" | "choice" | "local" | "assign";
  readonly name: { readonly before: string; readonly shift: number | null; readonly after: string };
  readonly depth: number;
  readonly endsChooseBlock: boolean;
  readonly onceOnly: boolean;
  readonly anchor:
    | { readonly kind: "before" | "in"; readonly at: number }
    | { readonly kind: "end" };
  readonly place: MemoPlace | null;
}

export interface MemoPlace {
  readonly own: MemoPosition | null;
  readonly name: MemoPosition | null;
}

const relativeTo = (first: DebugMetadata, at: DebugMetadata | null | undefined): MemoPosition | null =>
  at
    ? {
        line: at.startLineNumber - first.startLineNumber,
        endLine: at.endLineNumber - first.startLineNumber,
        start: at.startCharacterNumber,
        end: at.endCharacterNumber,
      }
    : null;

const placedAt = (first: DebugMetadata, at: MemoPosition): DebugMetadata => {
  const position = new DebugMetadata(first);
  position.startLineNumber = first.startLineNumber + at.line;
  position.endLineNumber = first.startLineNumber + at.endLine;
  position.startCharacterNumber = at.start;
  position.endCharacterNumber = at.end;
  return position;
};

export interface MemoAssignmentGroup {
  readonly kind: "group";
  readonly parts: readonly (MemoAssignment | MemoMultiAssignment)[];
}

export interface MemoLoweringRead {
  readonly kind: LoweringRead["kind"];
  readonly value: string;
  readonly node: string;
  readonly at: number;
}

export interface MemoDiagnostic {
  readonly diagnostic: InkDiagnostic;
}

export interface MemoReported {
  readonly message: string;
  readonly type: ErrorType;
  readonly startLine: number;
  readonly endLine: number;
  readonly startCharacter: number;
  readonly endCharacter: number;
}

export interface MemoResolution {
  readonly generate: readonly MemoReported[];
  readonly resolve: readonly MemoReported[];
  readonly reads: readonly string[];
  readonly context: string;
  readonly resolver: number;
  readonly at: number;
  readonly autoGlobals: readonly string[];
  readonly declares: readonly string[];
}

export class StatementMemoRetry extends Error {
  constructor(
    readonly entries: readonly StatementMemoEntry[],
    readonly reason: string,
  ) {
    super(`A statement served from its memo has to be lowered again: ${reason}`);
  }
}

export interface StatementMemoHost {
  enabled: boolean;
  usable(entry: StatementMemoEntry): boolean;
  provisional?: boolean;
}

const previewKept = new WeakMap<StatementShape, StatementMemoEntry>();

export interface MemoStats {
  lowered: number;
  served: number;
  loweredAt: number[];
  rebuilt?: { from: number; to: number };
}

export const noMemoStats = (): MemoStats => ({ lowered: 0, served: 0, loweredAt: [] });

const eachStatement = (shape: StatementShape, visit: (statement: StatementShape) => void) => {
  for (const body of shape.bodies) {
    for (const statement of body.statements) {
      visit(statement);
      eachStatement(statement, visit);
    }
  }
};

export const collectMemos = (
  shape: StatementShape | undefined,
  base: number,
  into: Map<string, StatementMemoEntry>,
): void => {
  if (!shape) {
    return;
  }
  eachStatement(shape, (statement) => {
    const entry = statement.memo;
    if (entry && !entry.stale) {
      into.set(memoKey(entry.syntax, base + statement.from), entry);
    }
    const kept = previewKept.get(statement);
    if (kept && kept !== entry && !kept.stale && kept.complete) {
      const key = memoKey(kept.syntax, base + statement.from);
      if (!into.get(key)?.complete) {
        into.set(key, kept);
      }
    }
  });
};

export const memoKey = (syntax: string, at: number): string => `${syntax}\u0001${at}`;

const ownerReads = (obj: ParsedObject, top: boolean): boolean => {
  if (
    obj instanceof Choice ||
    obj instanceof Gather ||
    obj instanceof TunnelOnwards ||
    obj instanceof AuthorWarning ||
    obj instanceof FlowBase ||
    (top && obj instanceof Weave) ||
    (obj instanceof Divert && !obj.isFunctionCall && !loopExitOf.has(obj))
  ) {
    return true;
  }
  return (obj.content ?? []).some((child) => ownerReads(child, false));
};

const TRIVIA: ReadonlySet<string> = new Set([
  "Newline",
  "Whitespace",
  "ExtraWhitespace",
  "OptionalWhitespace",
  "RequiredWhitespace",
]);

interface Pending {
  shape: StatementShape;
  syntax: string;
  recording: ContextRecording;
  block: CompiledBlock | undefined;
  from: number;
  line: number;
  endLine: number;
  holdsBlock: boolean;
  pushed?: InkDiagnostic[];
  nested?: { at: number; reads: ContextRead[] }[];
  nestedLoweringReads?: MemoLoweringRead[];
}

export class StatementMemoSession {
  readonly served: ParsedObject[] = [];
  protected _pending: Pending[] = [];
  protected _withoutBlocks = new Map<number, string>();
  protected _declined = new Set<StatementMemoEntry>();

  constructor(
    protected readonly host: StatementMemoHost,
    protected readonly lookup: ReadonlyMap<string, StatementMemoEntry>,
    protected readonly before: (pos: number) => number,
    protected readonly rebuilt: { from: number; to: number } | null,
    protected readonly stats: MemoStats,
    protected readonly used: Set<StatementMemoEntry>,
    protected readonly askAgain: (
      kind: LoweringRead["kind"],
      node: string,
      from: number,
    ) => string | undefined,
  ) {}

  syntaxOf(node: SparkdownNode, ctx: LowerContext, to = node.to): string {
    const names: string[] = [];
    for (
      let at: SparkdownNode | null = node;
      at && at.from < to;
      at = at.nextSibling as SparkdownNode | null
    ) {
      const children: string[] = [];
      for (
        let child = at.firstChild as SparkdownNode | null;
        child;
        child = child.nextSibling as SparkdownNode | null
      ) {
        children.push(child.name);
      }
      names.push(`${at.name}(${children.join(",")})`);
      if (at.to >= to) {
        break;
      }
    }
    const ancestors: string[] = [];
    for (let at = node.parent as SparkdownNode | null; at; at = at.parent as SparkdownNode | null) {
      ancestors.push(at.name);
    }
    return [
      names.join(" "),
      ancestors.join(" "),
      ctx.characterNumber(node.from),
      ctx.read(node.from, to),
    ].join("\u0000");
  }

  lowerStatement(
    node: SparkdownNode,
    owned: LowerContext,
    shape: StatementShape,
    lower: (ctx: LowerContext) => CompiledBlock | undefined,
    to = node.to,
  ): CompiledBlock | undefined {
    if (TRIVIA.has(node.name)) {
      return lower(owned);
    }
    const ctx = rawContext(owned);
    const syntax = this.syntaxOf(node, ctx, to);
    const entry = this.find(syntax, node, to, ctx, shape);
    if (entry) {
      return this.serve(entry, node, to, ctx, shape);
    }
    const pushedBefore = ctx.diagnostics?.length ?? 0;
    const pendingBefore = this._pending.length;
    const { ctx: recorded, finish } = recordLowering(ctx, node.from, to);
    const block = lower(recorded);
    if (block?.content?.length) {
      this.stats.lowered += 1;
      this.stats.loweredAt.push(node.from);
    }
    const recording = finish();
    const inside =
      shape.bodies.length > 0
        ? this.inside(node, ctx, shape, this._pending.slice(pendingBefore))
        : undefined;
    shape.reads.recorded = JSON.stringify(
      recording.reads.map((read) => JSON.stringify(read)).sort(),
    );
    this._pending.push({
      shape,
      syntax,
      recording,
      block,
      from: node.from,
      line: ctx.lineNumber(node.from),
      endLine: ctx.lineNumber(to),
      holdsBlock: to !== node.to || holdsCheckedBlock(node),
      pushed: inside ? (ctx.diagnostics ?? []).slice(pushedBefore) : undefined,
      nested: inside?.reads,
      nestedLoweringReads: inside?.loweringReads,
    });
    return block;
  }

  protected inside(
    node: SparkdownNode,
    ctx: LowerContext,
    shape: StatementShape,
    pending: readonly Pending[],
  ):
    | { reads: { at: number; reads: ContextRead[] }[]; loweringReads: MemoLoweringRead[] }
    | undefined {
    const byShape = new Map(pending.map((p) => [p.shape, p]));
    const base = node.from - shape.from;
    const reads: { at: number; reads: ContextRead[] }[] = [];
    const loweringReads: MemoLoweringRead[] = [];
    const covered = new Set<StatementShape>();
    let known = true;
    const callable = new Map(shape.reads.callable);
    const defineType = new Map(shape.reads.defineType);
    eachStatement(shape, (statement) => {
      if (covered.has(statement)) {
        return;
      }
      const lowered = byShape.get(statement);
      const served = !lowered && memoOf(statement.objects[0]) ? statement.memo : undefined;
      if (!lowered && !served) {
        known = false;
        return;
      }
      const from = lowered ? lowered.from : base + statement.from;
      const own = lowered ? lowered.recording.reads : served!.reads;
      reads.push({
        at: from - node.from,
        reads: own.filter((read) => readsHold(ctx, from, [read])),
      });
      if (lowered) {
        for (const read of lowered.recording.loweringReads) {
          loweringReads.push({
            kind: read.kind,
            value: read.value,
            node: read.node,
            at: read.from - node.from,
          });
        }
        for (const read of lowered.nestedLoweringReads ?? []) {
          loweringReads.push({ ...read, at: from - node.from + read.at });
        }
        for (const nested of lowered.nested ?? []) {
          const at = from + nested.at;
          reads.push({
            at: at - node.from,
            reads: nested.reads.filter((read) => readsHold(ctx, at, [read])),
          });
        }
        if (lowered.nested) {
          eachStatement(statement, (inner) => covered.add(inner));
        }
      } else {
        for (const read of served!.loweringReads) {
          loweringReads.push({ ...read, at: from - node.from + read.at });
        }
        for (const nested of served!.owner?.reads ?? []) {
          const at = from + nested.at;
          reads.push({
            at: at - node.from,
            reads: nested.reads.filter((read) => readsHold(ctx, at, [read])),
          });
        }
        eachStatement(statement, (inner) => covered.add(inner));
      }
    });
    shape.reads.callable = callable;
    shape.reads.defineType = defineType;
    return known ? { reads, loweringReads } : undefined;
  }

  servedWithoutBlocks(node: SparkdownNode): boolean {
    return this._withoutBlocks.get(node.from) === `${node.name}:${node.to}`;
  }

  protected servable(node: SparkdownNode, to: number, ctx: LowerContext): boolean {
    if ((ctx as { inChoosePreamble?: boolean }).inChoosePreamble === true) {
      return false;
    }
    const rebuilt = this.rebuilt;
    return !rebuilt || to <= rebuilt.from || node.from > rebuilt.to;
  }

  protected find(
    syntax: string,
    node: SparkdownNode,
    to: number,
    ctx: LowerContext,
    shape: StatementShape,
  ): StatementMemoEntry | undefined {
    if (!this.host.enabled || !this.servable(node, to, ctx)) {
      return undefined;
    }
    const entry = this.lookup.get(memoKey(syntax, this.before(node.from)));
    if (!entry || this.used.has(entry)) {
      return undefined;
    }
    this.used.add(entry);
    this._declined.add(entry);
    if (
      entry.stale ||
      !entry.complete ||
      !this.host.usable(entry)
    ) {
      return undefined;
    }
    const callable = new Map(shape.reads.callable);
    const defineType = new Map(shape.reads.defineType);
    const holds =
      readsHold(ctx, node.from, entry.reads) &&
      entry.loweringReads.every(
        (read) => this.askAgain(read.kind, read.node, node.from + read.at) === read.value,
      );
    if (!holds || (entry.owner && !this.insideHolds(entry.owner, node, ctx, shape))) {
      shape.reads.callable = callable;
      shape.reads.defineType = defineType;
      return undefined;
    }
    for (const read of entry.loweringReads) {
      ctx.recordRead?.({
        kind: read.kind,
        value: read.value,
        node: read.node,
        from: node.from + read.at,
      });
    }
    return entry;
  }

  protected insideHolds(
    owner: MemoOwner,
    node: SparkdownNode,
    ctx: LowerContext,
    shape: StatementShape,
  ): boolean {
    if (owner.descendants.some((entry) => entry.stale || !entry.complete || !this.host.usable(entry))) {
      return false;
    }
    const callable = new Map(shape.reads.callable);
    const defineType = new Map(shape.reads.defineType);
    const holds = owner.reads.every(({ at, reads }) => readsHold(ctx, node.from + at, reads));
    shape.reads.callable = callable;
    shape.reads.defineType = defineType;
    return holds;
  }

  protected standIn(entry: StatementMemoEntry, from: number, to: number, ctx: LowerContext): ParsedObject {
    const statement =
      entry.stand?.kind === "divert"
        ? new MemoizedDivert(entry, entry.stand)
        : entry.stand?.kind === "assignment"
          ? new MemoizedAssignment(entry, entry.stand)
          : entry.stand?.kind === "multi"
            ? new MemoizedMultiAssignment(entry, entry.stand)
          : entry.stand?.kind === "gather"
            ? new MemoizedGather(entry, entry.stand)
            : new MemoizedStatement(entry);
    const range = statementBounds(from, to, ctx);
    statement.debugMetadata = buildDebugMetadata(range.from, range.to, ctx);
    if (statement instanceof MultiVariableAssignment && entry.stand?.kind === "multi") {
      placeTargets(statement, entry.stand);
    } else if (entry.stand?.kind === "group") {
      for (const part of entry.stand.parts) {
        const assignment =
          part.kind === "multi"
            ? new MultiVariableAssignment(
                part.names.map((name) => new Identifier(name)),
                [],
                part.local,
              )
            : new VariableAssignment({
                variableIdentifier: new Identifier(part.name),
                isTemporaryNewDeclaration: part.local,
              });
        statement.AddContent(assignment);
        assignment.debugMetadata = statement.ownDebugMetadata;
        if (assignment instanceof MultiVariableAssignment && part.kind === "multi") {
          placeTargets(assignment, part);
        } else if (part.kind === "assignment") {
          placeIdentifier(assignment, part.at);
        }
      }
    } else if (entry.stand && entry.stand.kind !== "divert" && entry.stand.kind !== "multi") {
      placeIdentifier(statement, entry.stand.at);
    }
    return statement;
  }

  protected bodiesOf(
    owner: MemoOwner,
    start: number,
    base: number,
    ctx: LowerContext,
    placed: ParsedObject[],
    items: Placed[] | null,
  ): StatementShape["bodies"] {
    return owner.bodies.map((body) => ({
      headStart: start + body.headStart,
      headEnd: start + body.headEnd,
      nextStart: start + body.nextStart,
      statements: body.statements.map((nested): StatementShape => {
        const from = start + nested.from;
        const to = base + start + nested.to;
        const statement = this.standIn(nested.entry, base + from, to, ctx);
        placed.push(statement);
        this.used.add(nested.entry);
        if (items) {
          items.push({ key: keyAt(base + from, 1, ctx), obj: statement });
          if (nested.entry.owner) {
            holdersInto(nested.entry.owner, base + from, to, statement, ctx, items);
          }
        }
        return {
          node: nested.node,
          from,
          to: start + nested.to,
          objects: [statement],
          bodies: nested.entry.owner
            ? this.bodiesOf(nested.entry.owner, from, base, ctx, placed, items)
            : [],
          reads: {
            callable: new Map(),
            defineType: new Map(),
            other: [...nested.entry.own.other],
            context: nested.entry.own.context,
            recorded: nested.entry.own.recorded,
          },
          memo: nested.entry,
        };
      }),
    }));
  }

  protected serve(
    entry: StatementMemoEntry,
    node: SparkdownNode,
    to: number,
    ctx: LowerContext,
    shape: StatementShape,
  ): CompiledBlock {
    this._declined.delete(entry);
    const statement = this.standIn(entry, node.from, to, ctx);
    if (!entry.holdsBlock && to === node.to) {
      this._withoutBlocks.set(node.from, `${node.name}:${node.to}`);
    }
    shape.memo = entry;
    shape.reads.other = [...entry.own.other];
    shape.reads.context = entry.own.context;
    shape.reads.recorded = entry.own.recorded;
    if (entry.owner) {
      const placed: ParsedObject[] = [];
      const items: Placed[] | null = [entry, ...entry.owner.descendants].some(
        ({ owner }) => !!owner && (owner.holders.length > 0 || owner.scoped),
      )
        ? []
        : null;
      if (items) {
        holdersInto(entry.owner, node.from, to, statement, ctx, items);
      }
      shape.bodies = this.bodiesOf(
        entry.owner,
        shape.from,
        node.from - shape.from,
        ctx,
        placed,
        items,
      );
      statement.AddContent(items ? placeInOrder(items) : placed);
      this.served.push(...placed);
      this.stats.served += placed.length;
    }
    const line = ctx.lineNumber(node.from);
    for (const { diagnostic } of entry.diagnostics) {
      ctx.diagnostics?.push(shifted(diagnostic, line));
    }
    this.served.push(statement);
    this.stats.served += 1;
    return entry.blockDiagnostics.length > 0
      ? {
          content: [statement],
          diagnostics: entry.blockDiagnostics.map(({ diagnostic }) => shifted(diagnostic, line)),
        }
      : { content: [statement] };
  }

  finish(top: StatementShape): boolean {
    const inBodies = new Set<StatementShape>();
    eachStatement(top, (statement) => inBodies.add(statement));
    const servedShapes = new Set<StatementShape>();
    eachStatement(top, (statement) => {
      if (memoOf(statement.objects[0])) {
        servedShapes.add(statement);
      }
    });
    if (servedShapes.size !== this.served.length) {
      return false;
    }
    if (this.host.provisional) {
      this.keepPrevious();
    }
    for (const pending of this._pending) {
      const entry = remember(pending, inBodies);
      if (entry) {
        pending.shape.memo = entry;
      }
    }
    this._pending = [];
    return true;
  }

  protected keepPrevious(): void {
    const taken = (entry: StatementMemoEntry) =>
      this.used.has(entry) && !this._declined.has(entry);
    let byPlace: Map<number, StatementMemoEntry[]> | undefined;
    const at = (place: number): StatementMemoEntry[] => {
      if (!byPlace) {
        byPlace = new Map();
        for (const [key, entry] of this.lookup) {
          const where = Number(key.slice(key.lastIndexOf("\u0001") + 1));
          const list = byPlace.get(where);
          if (list) {
            list.push(entry);
          } else {
            byPlace.set(where, [entry]);
          }
        }
      }
      return byPlace.get(place) ?? [];
    };
    for (const pending of this._pending) {
      const place = this.before(pending.from);
      const there = at(place);
      const previous =
        this.lookup.get(memoKey(pending.syntax, place)) ??
        (there.length === 1 ? there[0] : undefined);
      if (previous && previous.complete && !previous.stale && !taken(previous)) {
        previewKept.set(pending.shape, previous);
      }
    }
  }
}

interface Placed {
  key: readonly [number, number, number];
  obj: ParsedObject;
}

const keyAt = (at: number, rank: number, ctx: LowerContext): Placed["key"] => [
  ctx.lineNumber(at) + 1,
  ctx.characterNumber(at) + 1,
  rank,
];

const placeInOrder = (items: Placed[]): ParsedObject[] =>
  items
    .map((item, i) => ({ item, i }))
    .sort(
      (a, b) =>
        a.item.key[0] - b.item.key[0] ||
        a.item.key[1] - b.item.key[1] ||
        a.item.key[2] - b.item.key[2] ||
        a.i - b.i,
    )
    .map(({ item }) => item.obj);

const holdersInto = (
  owner: MemoOwner,
  from: number,
  to: number,
  statement: ParsedObject,
  ctx: LowerContext,
  items: Placed[],
): void => {
  if (owner.holders.length === 0 && !owner.scoped) {
    return;
  }
  const own = statement.ownDebugMetadata;
  if (owner.scoped) {
    items.push({ key: keyAt(from, 0, ctx), obj: new Wrap(RuntimeControlCommand.BeginScope()) });
    items.push({ key: keyAt(to, 3, ctx), obj: new Wrap(RuntimeControlCommand.EndScope()) });
  }
  for (const holder of owner.holders) {
    const { before, shift, after } = holder.name;
    const name = new Identifier(`${before}${shift === null ? "" : from + shift}${after}`);
    let obj: ParsedObject;
    switch (holder.kind) {
      case "label": {
        const gather = new Gather(name, holder.depth);
        gather.endsChooseBlock = holder.endsChooseBlock;
        obj = gather;
        break;
      }
      case "choice": {
        const choice = new Choice(
          null as unknown as ContentList,
          null as unknown as ContentList,
          null as unknown as ContentList,
        );
        choice.identifier = name;
        choice.indentationDepth = holder.depth;
        choice.onceOnly = holder.onceOnly;
        obj = choice;
        break;
      }
      default:
        obj = new VariableAssignment({
          variableIdentifier: name,
          isTemporaryNewDeclaration: holder.kind === "local",
        });
    }
    markHolder(obj);
    const place = holder.place;
    if (own && place?.own) {
      obj.debugMetadata = placedAt(own, place.own);
    }
    if (own && place?.name && obj.identifier) {
      obj.identifier.debugMetadata = placedAt(own, place.name);
    }
    const { anchor } = holder;
    items.push({
      key:
        anchor.kind === "end"
          ? keyAt(to, 2, ctx)
          : keyAt(from + anchor.at, anchor.kind === "before" ? 0 : 1, ctx),
      obj,
    });
  }
};

const shifted = (diagnostic: InkDiagnostic, line: number): InkDiagnostic =>
  diagnostic.source
    ? {
        ...diagnostic,
        source: {
          ...diagnostic.source,
          startLineNumber: diagnostic.source.startLineNumber + line,
          endLineNumber: diagnostic.source.endLineNumber + line,
        },
      }
    : { ...diagnostic };

const relative = (
  diagnostics: readonly InkDiagnostic[] | undefined,
  line: number,
  endLine: number,
): MemoDiagnostic[] | undefined => {
  const out: MemoDiagnostic[] = [];
  for (const diagnostic of diagnostics ?? []) {
    const source = diagnostic.source;
    if (source) {
      const start = source.startLineNumber - 1 - line;
      const end = source.endLineNumber - 1 - line;
      if (start < 0 || end > endLine - line) {
        return undefined;
      }
    }
    out.push({ diagnostic: shifted(diagnostic, -line) });
  }
  return out;
};

const remember = (
  pending: Pending,
  inBodies: ReadonlySet<StatementShape>,
): StatementMemoEntry | undefined => {
  const { shape, recording } = pending;
  const only = shape.objects.length === 1 ? shape.objects[0] : undefined;
  const stand =
    only instanceof Divert
      ?
        loopExitOf.has(only)
        ? null
        : memoDivertOf(only)
      : only instanceof VariableAssignment
        ? memoAssignmentOf(only)
        : only instanceof MultiVariableAssignment
          ? memoMultiOf(only)
        : only instanceof Gather
          ? memoGatherOf(only)
          : shape.objects.length > 1
            ? memoGroupOf(shape.objects)
            : null;
  if (
    recording.unkeyable !== null ||
    !inBodies.has(shape) ||
    shape.objects.length === 0
  ) {
    return undefined;
  }
  let owner: MemoOwner | null = null;
  if (shape.bodies.length > 0) {
    owner = ownerOf(pending);
    if (!owner) {
      return undefined;
    }
  } else if (!stand && shape.objects.some((obj) => ownerReads(obj, true))) {
    return undefined;
  }
  const diagnostics = relative(
    owner ? pending.pushed : recording.diagnostics,
    pending.line,
    pending.endLine,
  );
  const blockDiagnostics = relative(pending.block?.diagnostics, pending.line, pending.endLine);
  if (!diagnostics || !blockDiagnostics) {
    return undefined;
  }
  return new StatementMemoEntry(
    pending.syntax,
    recording.reads,
    [
      ...recording.loweringReads.map((read) => ({
        kind: read.kind,
        value: read.value,
        node: read.node,
        at: read.from - pending.from,
      })),
      ...(owner ? pending.nestedLoweringReads! : []),
    ],
    diagnostics,
    blockDiagnostics,
    {
      other: [...shape.reads.other],
      context: shape.reads.context,
      recorded: shape.reads.recorded,
    },
    pending.holdsBlock,
    stand,
    owner,
  );
};

const ownerOf = (pending: Pending): MemoOwner | null => {
  const { shape } = pending;
  if (!pending.nested || !pending.nestedLoweringReads || !pending.pushed) {
    return null;
  }
  const nestedObjects = new Set<ParsedObject>();
  const descendants: StatementMemoEntry[] = [];
  let remembered = true;
  eachStatement(shape, (statement) => {
    if (!statement.memo) {
      remembered = false;
      return;
    }
    descendants.push(statement.memo);
    for (const obj of statement.objects) {
      nestedObjects.add(obj);
    }
  });
  const loop = loopOf.has(shape.objects[0]!);
  const declaresLocal =
    !loop &&
    descendants.some(
      (entry) =>
        ((entry.stand?.kind === "assignment" || entry.stand?.kind === "multi") && entry.stand.local) ||
        (entry.stand?.kind === "group" && entry.stand.parts.some((part) => part.local)),
    );
  const only = shape.objects.length === 1 ? shape.objects[0] : undefined;
  const choose = only instanceof Weave && only.isChooseBlock;
  const held = (obj: ParsedObject) =>
    loop ? isLoopInternal(obj) : choose && (obj instanceof Choice || obj instanceof Gather);
  if (
    !remembered ||
    declaresLocal ||
    shape.objects.some((obj) => ownerReadsOwn(obj, nestedObjects, held))
  ) {
    return null;
  }
  const holders = holdersOf(pending, nestedObjects, held);
  if (!holders) {
    return null;
  }
  const at = (offset: number) => offset - shape.from;
  return {
    bodies: shape.bodies.map((body) => ({
      headStart: at(body.headStart),
      headEnd: at(body.headEnd),
      nextStart: at(body.nextStart),
      statements: body.statements.map((statement) => ({
        entry: statement.memo!,
        node: statement.node,
        from: at(statement.from),
        to: at(statement.to),
      })),
    })),
    reads: pending.nested,
    descendants,
    holders,
    scoped: loop,
    choose,
  };
};

const holdersOf = (
  pending: Pending,
  nested: ReadonlySet<ParsedObject>,
  held: (obj: ParsedObject) => boolean,
): MemoHolder[] | null => {
  const { shape } = pending;
  const first = shape.objects[0]?.ownDebugMetadata ?? null;
  let failed = false;
  const nameOf = (name: string): MemoHolder["name"] => {
    // value-level: the name of a label or a local its lowering made
    if (!name.includes("$")) {
      return { before: name, shift: null, after: "" };
    }
    // value-level: the name of a label or a local its lowering made
    const parts = /^([^$]*\$)(\d+)(\D[^$]*)?$/.exec(name);
    if (!parts) {
      failed = true;
      return { before: name, shift: null, after: "" };
    }
    return {
      before: parts[1]!,
      shift: Number(parts[2]) - pending.from,
      after: parts[3] ?? "",
    };
  };
  const parts: { obj: ParsedObject; name: string }[] = [];
  const collect = (obj: ParsedObject) => {
    if (nested.has(obj)) {
      return;
    }
    const name =
      obj instanceof Gather || obj instanceof Choice
        ? obj.name
        : obj instanceof VariableAssignment
          ? obj.variableName
          : null;
    if (held(obj) && name) {
      parts.push({ obj, name });
    }
    for (const child of obj.content ?? []) {
      collect(child);
    }
  };
  shape.objects.forEach(collect);
  // value-level: the name of a label or a local its lowering made
  const placed = (name: string) => name.includes("$");
  const names = new Set(parts.filter(({ name }) => placed(name)).map(({ name }) => name));
  const objects = new Set(parts.map(({ obj }) => obj));
  const statementOf = new Map<ParsedObject, StatementShape>();
  eachStatement(shape, (statement) => {
    for (const obj of statement.objects) {
      statementOf.set(obj, statement);
    }
  });
  type At = { order: number; inside: StatementShape | null; entered: number };
  const entered: StatementShape[] = [];
  const seen = new Set<StatementShape>();
  const nameAt = new Map<string, At>();
  const objectAt = new Map<ParsedObject, At>();
  let step = 0;
  const walk = (obj: ParsedObject, inside: StatementShape | null) => {
    const statement = statementOf.get(obj) ?? inside;
    if (statement && !seen.has(statement)) {
      seen.add(statement);
      entered.push(statement);
    }
    if (objects.has(obj)) {
      objectAt.set(obj, { order: step++, inside: statement, entered: entered.length });
    }
    for (const name of namesHeldBy(obj)) {
      if (names.has(name) && !nameAt.has(name)) {
        nameAt.set(name, { order: step++, inside: statement, entered: entered.length });
      }
    }
    for (const child of parsedChildren(obj)) {
      walk(child, statement);
    }
  };
  shape.objects.forEach((obj) => walk(obj, null));
  const atOf = ({ obj, name }: { obj: ParsedObject; name: string }) =>
    placed(name) ? nameAt.get(name) : objectAt.get(obj);
  const anchorOf = (at: At | undefined): MemoHolder["anchor"] => {
    if (at?.inside) {
      return { kind: "in", at: at.inside.from - shape.from };
    }
    const next = at ? entered[at.entered] : undefined;
    return next ? { kind: "before", at: next.from - shape.from } : { kind: "end" };
  };
  const order = (part: { obj: ParsedObject; name: string }) => atOf(part)?.order ?? step;
  const out = parts
    .map((part, i) => ({ part, i }))
    .sort((a, b) => order(a.part) - order(b.part) || a.i - b.i)
    .map(({ part }): MemoHolder => {
      const { obj, name } = part;
      return {
        kind:
          obj instanceof Gather
            ? "label"
            : obj instanceof Choice
              ? "choice"
              : (obj as VariableAssignment).isNewTemporaryDeclaration
                ? "local"
                : "assign",
        name: nameOf(name),
        depth: obj instanceof Gather || obj instanceof Choice ? obj.indentationDepth : 0,
        endsChooseBlock: obj instanceof Gather && obj.endsChooseBlock,
        onceOnly: obj instanceof Choice && obj.onceOnly,
        anchor: anchorOf(atOf(part)),
        place: first
          ? {
              own: relativeTo(first, obj.ownDebugMetadata),
              name: relativeTo(first, obj.identifier?.debugMetadata),
            }
          : null,
      };
    });
  return failed ? null : out;
};

const memoGroupOf = (objects: readonly ParsedObject[]): MemoAssignmentGroup | null => {
  const parts: (MemoAssignment | MemoMultiAssignment)[] = [];
  for (const obj of objects) {
    const part =
      obj instanceof VariableAssignment
        ? memoAssignmentOf(obj)
        : obj instanceof MultiVariableAssignment
          ? memoMultiOf(obj)
          : null;
    if (!part) {
      return null;
    }
    parts.push(part);
  }
  return { kind: "group", parts };
};

const placeTargets = (assignment: MultiVariableAssignment, recorded: MemoMultiAssignment) => {
  assignment.targetAssignments.forEach((target, i) => {
    target.debugMetadata = assignment.ownDebugMetadata;
    placeIdentifier(target, recorded.at[i] ?? null);
  });
};

const ownerReadsOwn = (
  obj: ParsedObject,
  nested: ReadonlySet<ParsedObject>,
  held: (obj: ParsedObject) => boolean,
): boolean => {
  if (nested.has(obj)) {
    return false;
  }
  if (
    !held(obj) &&
    (obj instanceof Choice ||
    obj instanceof Gather ||
    obj instanceof TunnelOnwards ||
    obj instanceof AuthorWarning ||
    obj instanceof FlowBase ||
    (obj instanceof Divert && !obj.isFunctionCall))
  ) {
    return true;
  }
  return (obj.content ?? []).some((child) => ownerReadsOwn(child, nested, held));
};

export const memosOf = (
  shape: StatementShape | undefined,
): { served: StatementShape[]; lowered: StatementShape[] } => {
  const served: StatementShape[] = [];
  const lowered: StatementShape[] = [];
  if (shape) {
    eachStatement(shape, (statement) => {
      if (!statement.memo) {
        return;
      }
      (memoOf(statement.objects[0]) ? served : lowered).push(statement);
    });
  }
  return { served, lowered };
};

export const nestedObjects = (shape: StatementShape): Set<ParsedObject> => {
  const out = new Set<ParsedObject>();
  eachStatement(shape, (statement) => {
    for (const obj of statement.objects) {
      out.add(obj);
    }
  });
  return out;
};
