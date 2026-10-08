import type { SyntaxNode } from "@lezer/common";
import type { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { AuthorWarning } from "../../inkjs/compiler/Parser/ParsedHierarchy/AuthorWarning";
import { Choice } from "../../inkjs/compiler/Parser/ParsedHierarchy/Choice";
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
  MemoizedStatement,
  memoOf,
} from "../../inkjs/compiler/Parser/ParsedHierarchy/MemoizedStatement";
import {
  MemoizedAssignment,
  memoAssignmentOf,
  type MemoAssignment,
} from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MemoizedAssignment";
import { VariableAssignment } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import type { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { TunnelOnwards } from "../../inkjs/compiler/Parser/ParsedHierarchy/TunnelOnwards";
import { Weave } from "../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import type { ErrorType } from "../../inkjs/compiler/Parser/ErrorType";
import type { StatementChunk } from "../../program/StatementChunk";
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
import type { StatementShape } from "./utils/statementShape";
import { holdsCheckedBlock } from "./utils/validateBlockEnds";

/** A node of the Sparkdown grammar (LOWERING.md, section 5.0). */
type SparkdownNode = GrammarSyntaxNode<SparkdownNodeName>;

/**
 * The statement memo (#656; docs/engine/binary-program.md, section 1,
 * Identity, and What is built, The statement memo).
 *
 * The compilation annotator lowers a top-level node whole whenever the
 * incremental parse rebuilt any of it, so an edit to one line of a long block
 * statement (a `choose` block whose `then` clause holds the rest of a scene)
 * lowered every statement of the block again. With statement chunks on, each
 * statement of a block's body that lowers from its own node is lowered with a
 * context that records what the lowering read (`recordLowering`), and is
 * remembered under its syntax: the node's name, its parent's name, the
 * column it starts at, the names of its children and its text. A later
 * lowering of the block serves a statement the parse did not rebuild from
 * its memo while every read reads the same, without lowering it: the
 * statement stands in the block as a `MemoizedStatement`, which holds no
 * object of the statement, and keeps the program chunk the memo holds.
 *
 * What a memo holds is no parsed object: the statement's chunk, which holds
 * the symbols it exports and refers to; the reads its lowering made; the
 * diagnostics its lowering reported; and what its resolution reported and
 * read (`MemoResolution`). A statement is remembered only when nothing else
 * reads its parsed objects: its lowering wrote nothing into the context but
 * its diagnostics, it is no block statement, and its owner's lowering and the
 * story's weave read nothing of it (no choice, gather, weave, divert other
 * than a call's, tunnel return, author warning or flow). The resolver and the
 * chunk store complete the memo once the compile that lowered the statement
 * has resolved it and committed its chunk, and leave it incomplete when the
 * statement declares anything, reads a table whole, or reports a position
 * outside itself (`ProgramResolver`, `ChunkStore.memoChunk`).
 */
export class StatementMemoEntry {
  /** What the compile completes the memo with, or nothing while it is not
   *  complete (`complete`). */
  resolution?: MemoResolution;
  chunk?: StatementChunk;
  /** The table generation of the chunk's ids, and the compiler's memo epoch
   *  when it was completed (`StatementMemoHost.usable`). */
  generation = -1;
  epoch = -1;
  /** Set when a compile found the memo cannot be served: a name its
   *  resolution read is declared otherwise, or its chunk cannot be kept. */
  stale = false;

  constructor(
    /** The statement's syntax (`syntaxOf`). */
    readonly syntax: string,
    /** What its lowering read of the context (`recordLowering`). */
    readonly reads: readonly ContextRead[],
    /** The `LoweringRead`s its lowering reported, each by the node that read
     *  it and where that node starts relative to the statement's start. */
    readonly loweringReads: readonly MemoLoweringRead[],
    /** The diagnostics its lowering pushed onto the context, and those it
     *  returned with its block, lines relative to its own first line. */
    readonly diagnostics: readonly MemoDiagnostic[],
    readonly blockDiagnostics: readonly MemoDiagnostic[],
    /** What its lowering wrote into its own record beside the names it
     *  consulted, which the chunk store compares (`StatementReads`). */
    readonly own: {
      readonly other: readonly string[];
      readonly context: string;
      readonly recorded: string | undefined;
    },
    /** Whether its node holds a block `validateBlockEnds` checks, which
     *  then walks it when it is served, as when it is lowered. */
    readonly holdsBlock: boolean,
    /** For a statement whose objects another pass reads for what they are,
     *  what it stands as when it is served: a divert (`MemoizedDivert`), a
     *  plain assignment (`MemoizedAssignment`). Null for one that stands as
     *  a `MemoizedStatement`. */
    readonly stand: MemoDivert | MemoAssignment | MemoGather | null = null,
    /** For a block statement, its bodies and the memos of the statements in
     *  them, with what their lowerings read of the context outside the
     *  block statement (`MemoOwner`). */
    readonly owner: MemoOwner | null = null,
  ) {}

  /** Whether the compile completed the memo, so it can be served. */
  get complete(): boolean {
    return this.chunk !== undefined && this.resolution !== undefined;
  }
}

/** A statement of a body of a block statement remembered with it: its memo,
 *  its node's name, and where it starts and ends, relative to the start of
 *  the block statement. */
export interface MemoNested {
  readonly entry: StatementMemoEntry;
  readonly node: string;
  readonly from: number;
  readonly to: number;
}

/** A body of a block statement remembered with it, the parts around it
 *  relative to the start of the block statement (`BodyShape`). */
export interface MemoBody {
  readonly headStart: number;
  readonly headEnd: number;
  readonly nextStart: number;
  readonly statements: readonly MemoNested[];
}

/**
 * What the memo of a block statement holds beside a statement's: its bodies,
 * each with the memos of its statements, and what the lowerings of the
 * statements at any depth inside it read of the context as the block
 * statement found it, each from where its statement starts, relative to the
 * block statement's start. A read of what the block statement's own
 * lowering set up for its bodies (the scopes and the stacks it pushed) is
 * not among them: the block statement's own reads decide it, with its
 * syntax, which is the text of its bodies too.
 */
export interface MemoOwner {
  readonly bodies: readonly MemoBody[];
  readonly reads: readonly { readonly at: number; readonly reads: readonly ContextRead[] }[];
  /** The memos of the statements at any depth inside it, in order. */
  readonly descendants: readonly StatementMemoEntry[];
}

export interface MemoLoweringRead {
  readonly kind: LoweringRead["kind"];
  readonly value: string;
  readonly node: string;
  readonly at: number;
}

/** A lowering diagnostic, its lines relative to the statement's first line. */
export interface MemoDiagnostic {
  readonly diagnostic: InkDiagnostic;
}

/** A diagnostic the statement's resolution reported, its lines relative to
 *  the statement's first line. */
export interface MemoReported {
  readonly message: string;
  readonly type: ErrorType;
  readonly startLine: number;
  readonly endLine: number;
  readonly startCharacter: number;
  readonly endCharacter: number;
}

/** What a statement's generation and resolution reported and read. */
export interface MemoResolution {
  readonly generate: readonly MemoReported[];
  readonly resolve: readonly MemoReported[];
  /** The names it looked up in the story's tables. */
  readonly reads: readonly string[];
  /** The flows around it, as the resolver names them (`Unit.context`). */
  readonly context: string;
  /** The resolver that resolved it, by its number, and which of its
   *  resolves: a name declared otherwise since makes the memo stale. */
  readonly resolver: number;
  readonly at: number;
  /** Whether its resolution made a global of the name the plain assignment
   *  it is assigns, which no name resolved (an auto-global), which its
   *  stand-in makes again while the name is still undeclared. */
  readonly autoGlobal: boolean;
}

/** Thrown when a compile meets a statement its memo served that it cannot
 *  compile without the statement's parsed objects: the compile lowers the
 *  blocks that hold them again without those memos, and compiles again. */
export class StatementMemoRetry extends Error {
  constructor(
    readonly entries: readonly StatementMemoEntry[],
    readonly reason: string,
    /** Whether the compile needs every statement's objects, so that every
     *  statement the blocks were served is lowered again. */
    readonly all = false,
  ) {
    super(`A statement served from its memo has to be lowered again: ${reason}`);
  }
}

/** What the compiler tells the annotator about the memos it may serve. */
export interface StatementMemoHost {
  /** Whether memos are kept and served at all. */
  enabled: boolean;
  /** Whether a complete memo can be served now: its chunk is one the
   *  store's current root holds, of the table's current generation. */
  usable(entry: StatementMemoEntry): boolean;
}

/** How many statements inside blocks' bodies the last update of a document
 *  lowered, and how many it served from their memos. */
export interface MemoStats {
  lowered: number;
  served: number;
  /** Where each statement lowered starts in its document, in order: a
   *  statement lowered twice (a compile that lowered its block again) is
   *  there twice. */
  loweredAt: number[];
  /** The range the incremental parse rebuilt, whose statements are lowered
   *  whatever their memos say. */
  rebuilt?: { from: number; to: number };
}

/** No statement lowered or served yet. */
export const noMemoStats = (): MemoStats => ({ lowered: 0, served: 0, loweredAt: [] });

// The statements of `shape`'s bodies at any depth.
const eachStatement = (shape: StatementShape, visit: (statement: StatementShape) => void) => {
  for (const body of shape.bodies) {
    for (const statement of body.statements) {
      visit(statement);
      eachStatement(statement, visit);
    }
  }
};

/** The memos of the statements of `shape`'s bodies, by syntax, in order. */
export const collectMemos = (
  shape: StatementShape | undefined,
  into: Map<string, StatementMemoEntry[]>,
): void => {
  if (!shape) {
    return;
  }
  eachStatement(shape, (statement) => {
    const entry = statement.memo;
    if (entry && !entry.stale) {
      let list = into.get(entry.syntax);
      if (!list) {
        list = [];
        into.set(entry.syntax, list);
      }
      list.push(entry);
    }
  });
};

/** Whether `obj`, or anything it holds, is something the lowering of its
 *  owner or the story's weave reads of a statement's objects: a weave point
 *  (a choice, a gather), a weave the owner unwraps, a divert or a tunnel
 *  return that ends a weave point's content, an author warning, or a flow
 *  (`Weave.ConstructWeaveHierarchyFromIndentation`, `WeavePointHasLooseEnd`,
 *  `ContentThatFollowsWeavePoint`, `lowerSparkdownChooseBlock`). */
const ownerReads = (obj: ParsedObject, top: boolean): boolean => {
  if (
    obj instanceof Choice ||
    obj instanceof Gather ||
    obj instanceof TunnelOnwards ||
    obj instanceof AuthorWarning ||
    obj instanceof FlowBase ||
    (top && obj instanceof Weave) ||
    (obj instanceof Divert && !obj.isFunctionCall)
  ) {
    return true;
  }
  return (obj.content ?? []).some((child) => ownerReads(child, false));
};

// The nodes between a body's statements, which lower to nothing.
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
  /** For a block statement: the diagnostics pushed onto the context while
   *  it was lowered, its bodies' included, in order, and what the
   *  statements inside it read of the context as it found it. */
  pushed?: InkDiagnostic[];
  nested?: { at: number; reads: ContextRead[] }[];
  nestedLoweringReads?: MemoLoweringRead[];
}

/**
 * The memo while one top-level node is lowered: the memos of the statements
 * the node's previous lowering held (`lookup`), which it serves, and the
 * statements it lowers, which it remembers once the node is lowered
 * (`finish`).
 */
export class StatementMemoSession {
  /** The statements served, in order. */
  readonly served: ParsedObject[] = [];
  protected _pending: Pending[] = [];
  // The nodes of the statements served that hold no block, by where each
  // starts, as `name:to` (`servedWithoutBlocks`).
  protected _withoutBlocks = new Map<number, string>();
  // For each syntax, where `find` looks for its next memo.
  protected _cursors = new Map<string, number>();

  constructor(
    protected readonly host: StatementMemoHost,
    protected readonly lookup: ReadonlyMap<string, readonly StatementMemoEntry[]>,
    /** The range the incremental parse rebuilt, whose statements are lowered
     *  however they read, or null. */
    protected readonly rebuilt: { from: number; to: number } | null,
    protected readonly stats: MemoStats,
    /** The memos served since the document was last updated, which no other
     *  statement is served from: each stands for one statement. */
    protected readonly used: Set<StatementMemoEntry>,
    /** What the document now answers a `LoweringRead` of the node named
     *  `node` that starts at `from`, or undefined when no such node starts
     *  there. */
    protected readonly askAgain: (
      kind: LoweringRead["kind"],
      node: string,
      from: number,
    ) => string | undefined,
  ) {}

  /** The statement's syntax: the names of its nodes (the node it begins in,
   *  and those it runs on into up to `to`) and of their children, the names
   *  of the nodes it stands in up to the top (a lowering asks some of them,
   *  as whether it stands in a function's body), the column it starts at and
   *  its text. */
  syntaxOf(node: SparkdownNode, ctx: LowerContext, to = node.to): string {
    const names: string[] = [];
    for (let at: SyntaxNode | null = node; at && at.from < to; at = at.nextSibling) {
      const children: string[] = [];
      for (let child = at.firstChild; child; child = child.nextSibling) {
        children.push(child.name);
      }
      names.push(`${at.name}(${children.join(",")})`);
      if (at.to >= to) {
        break;
      }
    }
    const ancestors: string[] = [];
    for (let at = node.parent; at; at = at.parent) {
      ancestors.push(at.name);
    }
    return [
      names.join(" "),
      ancestors.join(" "),
      ctx.characterNumber(node.from),
      ctx.read(node.from, to),
    ].join("\u0000");
  }

  /**
   * Lowers the statement of a block's body that begins in the node `node`
   * and runs to `to`, whose shape is open on the statement stack, with
   * `lower`, or serves it from its memo: then it lowers to a
   * `MemoizedStatement`, and reports again the diagnostics its lowering
   * reported.
   */
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
    // The chunk store keeps the statement's chunk while these read the same
    // (`readsKey`), as the memo serves the statement while they do: the
    // reads as a set, in no order of the lowering's own.
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
      // A statement that runs on past its node is walked whatever it holds.
      holdsBlock: to !== node.to || holdsCheckedBlock(node),
      pushed: inside ? (ctx.diagnostics ?? []).slice(pushedBefore) : undefined,
      nested: inside?.reads,
      nestedLoweringReads: inside?.loweringReads,
    });
    return block;
  }

  /**
   * What the statements inside the block statement `shape` the node `node`
   * was just lowered to read, lowered or served, as the block statement
   * found the context, which is how the context stands again now that it is
   * lowered: each read that reads the same now, from where its statement
   * starts, relative to the block statement's start, and the `LoweringRead`s
   * they reported. A read that reads otherwise now read what the block
   * statement set up for its bodies. Undefined when a statement inside it
   * was lowered without the memo.
   */
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
    // The statements inside a statement served from its memo, which its
    // memo's reads hold.
    const covered = new Set<StatementShape>();
    let known = true;
    // Asking a read again records the names it consulted on the statement
    // being lowered, which are not this statement's own.
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

  /** Whether `node` is the node of a statement the session served that
   *  holds no block `validateBlockEnds` checks, which need not walk it. */
  servedWithoutBlocks(node: SparkdownNode): boolean {
    return this._withoutBlocks.get(node.from) === `${node.name}:${node.to}`;
  }

  // A statement of a `choose` block's preamble is the block's own code, and
  // one the parse rebuilt is lowered whatever it reads.
  protected servable(node: SparkdownNode, to: number, ctx: LowerContext): boolean {
    if ((ctx as { inChoosePreamble?: boolean }).inChoosePreamble === true) {
      return false;
    }
    const rebuilt = this.rebuilt;
    // A node that ends where the rebuilt range starts (`to` is past its last
    // character) holds nothing the parse rebuilt.
    return !rebuilt || to <= rebuilt.from || node.from > rebuilt.to;
  }

  /**
   * The memo the statement is served from, or nothing when it is lowered.
   * The memos of one syntax are taken in the order the node's previous
   * lowering held them, each by one statement, so that statements that read
   * alike (the same line written twice) each find the memo of the one at
   * their place: a statement takes the first memo of its syntax no statement
   * took, and is served from it when the parse did not rebuild it, the memo
   * is complete and every read it recorded reads the same.
   */
  protected find(
    syntax: string,
    node: SparkdownNode,
    to: number,
    ctx: LowerContext,
    shape: StatementShape,
  ): StatementMemoEntry | undefined {
    // Where the search for the syntax's next memo starts: the memos before
    // it are taken, and stay taken, so statements that read alike take the
    // memos of their syntax in one pass over them.
    const candidates = this.lookup.get(syntax);
    let at = this._cursors.get(syntax) ?? 0;
    while (candidates && at < candidates.length && this.used.has(candidates[at]!)) {
      at += 1;
    }
    const entry = candidates?.[at];
    if (!entry) {
      return undefined;
    }
    this._cursors.set(syntax, at + 1);
    this.used.add(entry);
    if (
      !this.host.enabled ||
      !this.servable(node, to, ctx) ||
      entry.stale ||
      !entry.complete ||
      !this.host.usable(entry)
    ) {
      return undefined;
    }
    // Asking a read again records it on the statement being lowered, as its
    // lowering would; a memo that reads otherwise leaves nothing.
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

  /** Whether a block statement's memo can stand for the statements inside
   *  it: each of their memos is complete and usable, and each read their
   *  lowerings made of the context as the block statement found it reads
   *  the same. The names those reads consulted are not recorded on the block
   *  statement, whose own reads are its record's. */
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

  /** The object a statement served from `entry` stands as, placed at
   *  `from` to `to` as `stampStatement` places a statement's objects. */
  protected standIn(entry: StatementMemoEntry, from: number, to: number, ctx: LowerContext): ParsedObject {
    const statement =
      entry.stand?.kind === "divert"
        ? new MemoizedDivert(entry, entry.stand)
        : entry.stand?.kind === "assignment"
          ? new MemoizedAssignment(entry, entry.stand)
          : entry.stand?.kind === "gather"
            ? new MemoizedGather(entry, entry.stand)
            : new MemoizedStatement(entry);
    const range = statementBounds(from, to, ctx);
    statement.debugMetadata = buildDebugMetadata(range.from, range.to, ctx);
    return statement;
  }

  /** The bodies of a block statement served from its memo, whose shape
   *  starts at `start`, relative to the top-level node, and at `base` +
   *  `start` in the document: each statement's shape, known by its memo,
   *  and its stand-in, which `placed` collects in order. */
  protected bodiesOf(
    owner: MemoOwner,
    start: number,
    base: number,
    ctx: LowerContext,
    placed: ParsedObject[],
  ): StatementShape["bodies"] {
    return owner.bodies.map((body) => ({
      headStart: start + body.headStart,
      headEnd: start + body.headEnd,
      nextStart: start + body.nextStart,
      statements: body.statements.map((nested): StatementShape => {
        const from = start + nested.from;
        const statement = this.standIn(nested.entry, base + from, base + start + nested.to, ctx);
        placed.push(statement);
        this.used.add(nested.entry);
        return {
          node: nested.node,
          from,
          to: start + nested.to,
          objects: [statement],
          bodies: nested.entry.owner
            ? this.bodiesOf(nested.entry.owner, from, base, ctx, placed)
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
    const statement = this.standIn(entry, node.from, to, ctx);
    if (!entry.holdsBlock && to === node.to) {
      this._withoutBlocks.set(node.from, `${node.name}:${node.to}`);
    }
    shape.memo = entry;
    shape.reads.other = [...entry.own.other];
    shape.reads.context = entry.own.context;
    shape.reads.recorded = entry.own.recorded;
    if (entry.owner) {
      // A block statement stands with the statements of its bodies, each as
      // its memo's stand-in, which its stand-in holds, so that the passes
      // over the whole story find what they read of them.
      const placed: ParsedObject[] = [];
      shape.bodies = this.bodiesOf(entry.owner, shape.from, node.from - shape.from, ctx, placed);
      statement.AddContent(placed);
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

  /**
   * Remembers each statement the node's lowering lowered that nothing else
   * reads the objects of, once the node is lowered, whose shape is `top`.
   * Returns false when a statement the session served is no statement of a
   * body of the node's statement: an owner made it its own code, which
   * needs its objects, so the node is lowered again without the memo.
   */
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
    for (const pending of this._pending) {
      const entry = remember(pending, inBodies);
      if (entry) {
        pending.shape.memo = entry;
      }
    }
    this._pending = [];
    return true;
  }
}

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
      // 1-based, counting from the statement's own first line.
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
  // A divert statement stands as a divert to the same target, which is what
  // the weave and the flow's checks read of it, and a plain assignment as an
  // assignment of the same name, which is what the story's passes over the
  // whole program read of it.
  const only = shape.objects.length === 1 ? shape.objects[0] : undefined;
  const stand =
    only instanceof Divert
      ? memoDivertOf(only)
      : only instanceof VariableAssignment
        ? memoAssignmentOf(only)
        : only instanceof Gather
          ? memoGatherOf(only)
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
  // A block statement's diagnostics are every one pushed while it was
  // lowered, its bodies' included, in order.
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
      // A block statement's memo asks again what the statements inside it
      // asked, as it reads again what they read.
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

/**
 * What the memo of the block statement `pending` lowered holds of its
 * bodies (`MemoOwner`), or null when it cannot stand for them: a statement
 * inside it was not remembered, its own objects (those that are not a
 * statement's of its bodies) hold what the weave or the story's passes read
 * of a statement's objects, or it writes a function (`ownerReads`).
 */
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
  if (!remembered || shape.objects.some((obj) => ownerReadsOwn(obj, nestedObjects))) {
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
  };
};

/** `ownerReads` of a block statement's own objects, leaving out the objects
 *  of the statements of its bodies (`nested`), which their memos judge. */
const ownerReadsOwn = (obj: ParsedObject, nested: ReadonlySet<ParsedObject>): boolean => {
  if (nested.has(obj)) {
    return false;
  }
  if (
    obj instanceof Choice ||
    obj instanceof Gather ||
    obj instanceof TunnelOnwards ||
    obj instanceof AuthorWarning ||
    obj instanceof FlowBase ||
    (obj instanceof Divert && !obj.isFunctionCall)
  ) {
    return true;
  }
  return (obj.content ?? []).some((child) => ownerReadsOwn(child, nested));
};

/** The statements of a body that a block's lowering served from their
 *  memos, and the memos of those it lowered, for the compiler. */
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

/** The objects the statements of a block statement's bodies hold at their
 *  tops, at any depth (`MemoCandidate.nested`). */
export const nestedObjects = (shape: StatementShape): Set<ParsedObject> => {
  const out = new Set<ParsedObject>();
  eachStatement(shape, (statement) => {
    for (const obj of statement.objects) {
      out.add(obj);
    }
  });
  return out;
};
