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
 * A statement whose objects another pass reads for what they are stands as
 * an object of that class built from what its memo recorded (`memoOf`,
 * #1676): a divert with no arguments (`MemoizedDivert`), a plain assignment
 * or a local declaration (`MemoizedAssignment`), a label (`MemoizedGather`).
 * An `if` block, a loop and a `choose` block are remembered with the memos
 * of the statements of their bodies and what their lowerings read of the
 * context as they found it (`MemoOwner`), and are served with them; a loop's
 * labels and locals and a `choose` block's named choices and labelled `then`
 * clause are held again by its stand-in (`MemoHolder`, #1683).
 *
 * What a memo holds is no parsed object: the statement's chunk, which holds
 * the symbols it exports and refers to; the reads its lowering made; the
 * diagnostics its lowering reported; and what its resolution reported, read
 * and declared (`MemoResolution`). A statement is remembered only when what
 * else reads its parsed objects reads nothing its memo cannot stand for: its
 * lowering wrote nothing into the context but its diagnostics, and its own
 * objects hold no choice, gather, weave, divert other than a call's, tunnel
 * return, author warning or flow, but those the stand-ins above stand for
 * and the holders hold, and a loop's `break` or `continue`. The resolver and
 * the chunk store complete the memo once the compile that lowered the
 * statement has resolved it and committed its chunk, and leave it
 * incomplete when the statement declares
 * anything the whole program keeps (a global, a constant, a list, a struct,
 * an external, a flow), reads the story's assignments or function values,
 * or reports a position outside itself (`ProgramResolver.memoResolutionOf`,
 * `ChunkStore.memoChunk`). A name its resolution read that is declared
 * otherwise since makes it stale (`ProgramResolver.readsOtherwise`).
 */
export class StatementMemoEntry {
  /** What the compile completes the memo with, or nothing while it is not
   *  complete (`complete`). */
  resolution?: MemoResolution;
  chunk?: ProgramChunk;
  /** The table generation of the chunk's ids, which the store's current
   *  one must be for the memo to be served (`StatementMemoHost.usable`). */
  generation = -1;
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
    readonly stand:
      | MemoDivert
      | MemoAssignment
      | MemoMultiAssignment
      | MemoGather
      | MemoAssignmentGroup
      | null = null,
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
  /** The parts of its own objects that the passes over the whole story read
   *  for what they are, which its stand-in holds again (#1683): a loop's
   *  labels, locals and assignments, a `choose` block's named choices and
   *  labelled `then` clause. */
  readonly holders: readonly MemoHolder[];
  /** Whether its stand-in holds everything inside it in a scope of its own,
   *  as a loop's objects are: a local declared inside it is in scope for no
   *  statement after it. */
  readonly scoped: boolean;
  /** Whether it is a `choose` block, whose chunk raises its choices and
   *  exports the labels of its named choices and its `then` clause, which
   *  its holders name (`ChunkStore.memoChunk`). */
  readonly choose: boolean;
}

/**
 * A part of a block statement's own objects that the passes over the whole
 * story read for what it is, which its stand-in holds again as an object of
 * that class (a holder), never generated or resolved as itself (#1683):
 *
 * - a loop's label (`__while_..._loop`), which the story names in the
 *   flow's weave and counts among its labels;
 * - a loop's local, a hidden temporary or a loop variable, which the flow
 *   declares (`FlowBase.variableDeclarations`), and the assignment of a
 *   hidden temporary, which the census of the flow's names counts;
 * - a `choose` block's named choice and its labelled `then` clause, which
 *   other statements divert to and read the counts of.
 *
 * A name the lowering made from the loop's place in the document
 * (`syntheticId`) is held as its text around the place (`before`, `after`)
 * and the place's distance from the statement's start (`shift`), so that a
 * holder of a loop an edit moved is named as the loop's lowering names it
 * where it stands now, and the compile numbers it
 * (`SparkdownCompiler.canonicalizeSyntheticFlowNames`) as a cold compile
 * numbers the loop's. The holders stand where their names first stood in
 * the order the compile numbers names (`anchor`): before a statement inside
 * the block statement, inside one (a loop's label a `break` in its body
 * names first), or after them all, so each name of a served statement takes
 * the number its lowering's would take and every other statement's are a
 * cold compile's. `place` is where the part stood relative to the
 * statement, which a choice's or a label's range and name are placed at.
 */
export interface MemoHolder {
  readonly kind: "label" | "choice" | "local" | "assign";
  readonly name: { readonly before: string; readonly shift: number | null; readonly after: string };
  readonly depth: number;
  readonly endsChooseBlock: boolean;
  readonly onceOnly: boolean;
  /** Where the part's name first stands among the statements inside the
   *  block statement: before the one that starts `at` from the block
   *  statement's start, inside it, or after them all. */
  readonly anchor:
    | { readonly kind: "before" | "in"; readonly at: number }
    | { readonly kind: "end" };
  readonly place: MemoPlace | null;
}

/** Where a holder's part stood relative to its statement's first object:
 *  its own range, or null for a part that took its range from what holds
 *  it, and its name's (`MemoPosition`), lines counted from the first
 *  object's first line. */
export interface MemoPlace {
  readonly own: MemoPosition | null;
  readonly name: MemoPosition | null;
}

/** Where `at` stands relative to `first` (`MemoPlace`). */
const relativeTo = (first: DebugMetadata, at: DebugMetadata | null | undefined): MemoPosition | null =>
  at
    ? {
        line: at.startLineNumber - first.startLineNumber,
        endLine: at.endLineNumber - first.startLineNumber,
        start: at.startCharacterNumber,
        end: at.endCharacterNumber,
      }
    : null;

/** A position `at` places relative to `first` (`relativeTo`). */
const placedAt = (first: DebugMetadata, at: MemoPosition): DebugMetadata => {
  const position = new DebugMetadata(first);
  position.startLineNumber = first.startLineNumber + at.line;
  position.endLineNumber = first.startLineNumber + at.endLine;
  position.startCharacterNumber = at.start;
  position.endCharacterNumber = at.end;
  return position;
};

/** What a statement's memo records of a statement of several assignments
 *  (`& local a = 1; local b = 2`): each, as one is recorded. */
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
  /** The names its resolution made globals of, which no name resolved (an
   *  auto-global), which its stand-in makes again while each is still
   *  undeclared. */
  readonly autoGlobals: readonly string[];
  /** The locals its generation declared, which its stand-in declares
   *  again. */
  readonly declares: readonly string[];
}

/** Thrown when a compile meets a statement its memo served that it cannot
 *  compile without the statement's parsed objects: the compile lowers the
 *  blocks that hold them again without those memos, and compiles again. */
export class StatementMemoRetry extends Error {
  constructor(
    readonly entries: readonly StatementMemoEntry[],
    readonly reason: string,
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
  /** Set while a preview compile's updates lower (the suggestion's, its
   *  compile's and the one that puts the text back), whose memos no compile
   *  completes: a statement such a lowering lowers anew keeps the complete
   *  memo that stood where it stands, for the lowerings after it
   *  (`previewKept`, #1757). */
  provisional?: boolean;
}

/**
 * The complete memo a statement a preview's lowering lowered anew keeps, by
 * its shape: the memo that stood where the statement stands before that
 * lowering, of its syntax or, when none is, the only one there (#1757). A
 * preview compile's root is dropped with it, so what it records itself is
 * never completed, and without this the memos a real compile completed went
 * with the shapes the preview's lowering replaced: every statement the
 * preview's parse rebuilt (the whole block, on the first incremental parse
 * after a cold one) and the statement the suggestion changed, which the
 * update that puts the text back lowers again, were lowered again by every
 * later lowering until a real compile. Only the next lowering's lookup reads
 * it (`collectMemos`), which serves it as it serves any memo, only when it is
 * complete and usable and every read it recorded reads the same; the chunk
 * store and the compile know the statement by its own memo, as before.
 */
const previewKept = new WeakMap<StatementShape, StatementMemoEntry>();

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
    // The memo a preview's lowering left the statement, under its own
    // syntax, unless a complete memo is known there already.
    const kept = previewKept.get(statement);
    if (kept && kept !== entry && !kept.stale && kept.complete) {
      const key = memoKey(kept.syntax, base + statement.from);
      if (!into.get(key)?.complete) {
        into.set(key, kept);
      }
    }
  });
};

/** How a memo is found: by its statement's syntax and where the statement
 *  started in the document when the memo was last lowered or served. */
export const memoKey = (syntax: string, at: number): string => `${syntax}\u0001${at}`;

/** Whether `obj`, or anything it holds, is something the lowering of its
 *  owner or the story's weave reads of a statement's objects: a weave point
 *  (a choice, a gather), a weave the owner unwraps, a divert or a tunnel
 *  return that ends a weave point's content, an author warning, or a flow
 *  (`Weave.ConstructWeaveHierarchyFromIndentation`,
 *  `lowerSparkdownChooseBlock`). Before #705 the current engine's loose-end
 *  check (`Weave.WeavePointHasLooseEnd`, `ContentThatFollowsWeavePoint`)
 *  read the diverts, tunnel returns and author warnings too. */
const ownerReads = (obj: ParsedObject, top: boolean): boolean => {
  if (
    obj instanceof Choice ||
    obj instanceof Gather ||
    obj instanceof TunnelOnwards ||
    obj instanceof AuthorWarning ||
    obj instanceof FlowBase ||
    (top && obj instanceof Weave) ||
    // A loop's `break` or `continue` is a jump within the loop's blocks, no
    // jump to a label, which nothing but the writer reads (#1683).
    (obj instanceof Divert && !obj.isFunctionCall && !loopExitOf.has(obj))
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

  constructor(
    protected readonly host: StatementMemoHost,
    /** The memos of the statements the node's previous lowering held, by
     *  their syntax and where each started (`memoKey`). */
    protected readonly lookup: ReadonlyMap<string, StatementMemoEntry>,
    /** Where a position of the document stood before the update. */
    protected readonly before: (pos: number) => number,
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
   * The memo the statement is served from, or nothing when it is lowered:
   * the memo of its syntax that stood where it stood before the update
   * (`memoKey`), when the parse did not rebuild it, the memo is complete
   * and usable, and every read it recorded reads the same.
   */
  protected find(
    syntax: string,
    node: SparkdownNode,
    to: number,
    ctx: LowerContext,
    shape: StatementShape,
  ): StatementMemoEntry | undefined {
    // A statement the parse rebuilt takes no memo, and the others take the
    // memo of the statement of their syntax that stood where they stood
    // before the update: statements that read alike (the same line written
    // twice) each find their own, whatever an edit wrote or took away
    // between them.
    if (!this.host.enabled || !this.servable(node, to, ctx)) {
      return undefined;
    }
    const entry = this.lookup.get(memoKey(syntax, this.before(node.from)));
    if (!entry || this.used.has(entry)) {
      return undefined;
    }
    this.used.add(entry);
    if (
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
      // A statement of several assignments stands as a group that holds an
      // assignment of each, placed as the statement, whose generation and
      // resolution go through the group's memo.
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
      // over the whole story find what they read of them, and with the
      // holders of its own objects and of every block statement inside it
      // (`MemoHolder`), each where its part stood, a loop's inside the scope
      // of the loop.
      const placed: ParsedObject[] = [];
      // With no holder at any depth, the stand-ins stand in the order they
      // were placed.
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
    if (this.host.provisional) {
      this.keepPrevious(servedShapes);
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

  /** For a preview's lowering, gives each statement it lowered anew the
   *  complete memo that stood where it stands (`previewKept`): of its
   *  syntax, or the only one there, when no statement this lowering served
   *  holds it. */
  protected keepPrevious(servedShapes: ReadonlySet<StatementShape>): void {
    const served = new Set<StatementMemoEntry>();
    for (const shape of servedShapes) {
      served.add(shape.memo!);
    }
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
      if (previous && previous.complete && !previous.stale && !served.has(previous)) {
        previewKept.set(pending.shape, previous);
      }
    }
  }
}

/** An object a block statement's stand-in holds, with where it stands: the
 *  line and the column, 1-based, of the statement it stands for or stands
 *  before, then whether it opens a loop's scope or stands before the
 *  statement (0), stands for or inside it (1), stands after every statement
 *  of a block statement (2), or closes the scope (3). Objects that stand at
 *  one place stand in the order they were placed. */
interface Placed {
  key: readonly [number, number, number];
  obj: ParsedObject;
}

const keyAt = (at: number, rank: number, ctx: LowerContext): Placed["key"] => [
  ctx.lineNumber(at) + 1,
  ctx.characterNumber(at) + 1,
  rank,
];

/** The objects of `items` in the order their parts and statements stand,
 *  those that stand at one place in the order they were placed. */
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

/**
 * Places the holders of the block statement `owner` is the memo of, which
 * stands from `from` to `to` in the document as `statement` (`MemoHolder`):
 * each an object of its part's class, holding nothing, named as its part
 * is named where the statement stands now, and placed where its part stood;
 * a loop's inside a scope of its own (`MemoOwner.scoped`), which holds what
 * the loop holds.
 */
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
    // A part with no range of its own takes the statement's, as the part
    // took its own statement's.
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
      ? // A loop's `break` or `continue` stands as a statement: its target is
        // a label its loop's lowering named by its place (#1683).
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
  // Its stand-in holds the stand-ins of its bodies' statements with none of
  // the scopes its branches open, so a local declared inside it would be
  // found in scope after it: such a block statement is lowered, and its
  // bodies' statements served inside it.
  // A loop's stand-in holds them in a scope of its own, as its objects do
  // (#1683).
  const loop = loopOf.has(shape.objects[0]!);
  const declaresLocal =
    !loop &&
    descendants.some(
      (entry) =>
        ((entry.stand?.kind === "assignment" || entry.stand?.kind === "multi") && entry.stand.local) ||
        (entry.stand?.kind === "group" && entry.stand.parts.some((part) => part.local)),
    );
  // The parts of its own objects its stand-in holds again (`MemoHolder`): a
  // loop's labels, the diverts to them and its locals; a `choose` block's
  // choices and the gather that ends it.
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

/**
 * The holders of the block statement `pending` lowered (`MemoHolder`), in
 * the order their names first stand in the order the compile numbers names
 * (`canonicalizeSyntheticFlowNames`: each object's names, then what it
 * holds), or null when a part's name was made from a place in the document
 * in a form its holder cannot name again.
 */
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
    // `syntheticId`: the document's tag, `$`, then the place.
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
  // The parts, from the block statement's own objects.
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
  // Where each part stands, walking the block statement's objects, the
  // statements inside it among them, as the compile walks them: a name made
  // from the loop's place where the compile first meets it, which decides
  // the number it takes (a `break` in the loop's body can name the loop's
  // exit first), and any other part where its object stands, which decides
  // the order the story names the block's labels in.
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

/** What a statement's memo records of a statement of several assignments, or
 *  null when one of its objects is no assignment a memo can stand for. */
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

/** Places the targets' names of an assignment of several names where they
 *  stood (`MemoMultiAssignment.at`). */
const placeTargets = (assignment: MultiVariableAssignment, recorded: MemoMultiAssignment) => {
  assignment.targetAssignments.forEach((target, i) => {
    target.debugMetadata = assignment.ownDebugMetadata;
    placeIdentifier(target, recorded.at[i] ?? null);
  });
};

/** `ownerReads` of a block statement's own objects, leaving out the objects
 *  of the statements of its bodies (`nested`), which their memos judge, and
 *  the parts of its own its stand-in holds again (`held`, `MemoHolder`). */
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
