import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { type ChangeDesc, Range, type Text } from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";
import {
  collectMemos,
  noMemoStats,
  StatementMemoSession,
  type MemoStats,
  type StatementMemoEntry,
  type StatementMemoHost,
} from "../../lower/statementMemo";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import type { SourceMetadata } from "../../../runtime/Error";
import { DefineTypeNameIndex } from "../DefineTypeNameIndex";
import type {
  LowerContext,
  LoweringRead,
  SiblingSubFlowInfo,
} from "../../lower/context";
import { lower } from "../../lower/lower";
import { continuationRoutingRead } from "../../lower/lowerers/lowerDisplay";
import { unreachableRead } from "../../lower/lowerers/lowerDoneOrFin";
import {
  topLevelShape,
  type StatementShape,
} from "../../lower/utils/statementShape";
import { validateBlockEnds } from "../../lower/utils/validateBlockEnds";
import { type SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import {
  VARIABLE_DEFINITION_CONTENT_NAMES,
  VARIABLE_DEFINITION_NAMES,
  valueListAssignmentName,
} from "../../utils/variableDefinitionNames";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export interface InkDiagnostic {
  message: string;
  severity: ErrorType;
  source: SourceMetadata | null;
  // Optional LSP `DiagnosticTag` values (1 = Unnecessary, 2 = Deprecated).
  // The Unnecessary tag is what VS Code uses to render diagnostics
  // faded out — used here for unreachable code after `done` / `fin`.
  tags?: number[];
}

export interface CompiledBlock {
  diagnostics?: InkDiagnostic[];
  content?: ParsedObject[];
  include?: string;
  // Path (without `.luau` extension) for a `run "path"` statement.
  // Compiler resolves the file, wraps its body in a function-call
  // knot, and emits an invocation. See SparkdownCompiler's `run`
  // handling.
  run?: string;
  context?: {
    [type: string]: { [name: string]: any };
  };
  // Reactive Sparkle UI AST contributed by a layout/screen/component block,
  // merged into `program.sparkle` (docs/sparkle/reactive-sparkle-spec.md §6).
  sparkle?: {
    layouts?: { [name: string]: any };
    screens?: { [name: string]: any };
    components?: { [name: string]: any };
  };
  defaultDefinitions?: { [type: string]: any };
  uuid?: string;
  // Synthetic top-level knots produced by anonymous function literals
  // inside this chunk. The compile pipeline appends them to the
  // story's `topLevelFlowBaseObjs` so the `DivertTarget(__anon_fn_…)`
  // references emitted at the literal's source position can resolve.
  hoistedKnots?: ParsedObject[];
  // Every name this chunk's lowering looked up in the document's global
  // callable names, with the answer it got. A chunk the incremental parse
  // carries keeps what it lowered, so when an edit elsewhere changes one of
  // these answers the chunk is lowered again (see `staleRanges`).
  globalCallableReads?: Map<string, boolean>;
  // The same record for the document's define type names, which decide the
  // shadow warning a `store` or `const` of a type's name raises.
  defineTypeReads?: Map<string, boolean>;
  // The name of the syntax node the block was lowered from. With the node's
  // text, it is what a statement chunk compares when the reparse window
  // lowers an unchanged statement again (`ChunkStore`).
  node?: string;
  // The other reads of the chunk's lowering outside its own syntax, with the
  // answers they got (`LoweringRead`). The chunk is lowered again when the
  // document answers one differently (see `staleRanges`).
  reads?: RecordedRead[];
  // The chunk's statement as its lowering found it: the bodies of a block
  // statement with the statements inside them, and what each statement's
  // lowering read. Kept only with `recordLoweringReads`, for the binary
  // program's chunk store.
  statement?: StatementShape;
  // The statements of its bodies its lowering served from their memos
  // (`statementMemo.ts`), which hold none of their objects.
  memoized?: ParsedObject[];
}

// A lowering read as its chunk keeps it: the node that read it by name and by
// its start relative to the chunk's start, which stays true while the chunk
// is carried across edits above it.
export interface RecordedRead {
  kind: LoweringRead["kind"];
  value: string;
  node: string;
  at: number;
}

export interface CompilationConfig {
  definitions?: {
    builtins?: {
      [type: string]: {
        [name: string]: any;
      };
    };
  };
  // Whether a chunk's lowering keeps the reads it makes outside its own
  // syntax (`CompiledBlock.reads`), which the binary program's chunk store
  // needs; the compiler always sets it.
  recordLoweringReads?: boolean;
  // The statement memo's host, which the compiler gives when statement
  // chunks are on: statements of blocks' bodies are remembered and served
  // from their memos (`statementMemo.ts`).
  statementMemo?: StatementMemoHost;
}

function sameNames(
  checked: ReadonlySet<string> | undefined,
  names: ReadonlySet<string>,
): boolean {
  if (checked === names) {
    return true;
  }
  if (!checked || checked.size !== names.size) {
    return false;
  }
  for (const name of names) {
    if (!checked.has(name)) {
      return false;
    }
  }
  return true;
}

function readsDisagree(
  reads: Map<string, boolean> | undefined,
  names: ReadonlySet<string>,
): boolean {
  if (reads) {
    for (const [name, found] of reads) {
      if (names.has(name) !== found) {
        return true;
      }
    }
  }
  return false;
}

// The node named `name` that starts at `pos`, or null.
function nodeStartingAt(
  tree: Tree,
  pos: number,
  name: string,
): SyntaxNode | null {
  let node: SyntaxNode | null = tree.resolveInner(pos, 1);
  while (node && node.from === pos) {
    if (node.name === name) {
      return node;
    }
    node = node.parent;
  }
  return null;
}

export class CompilationAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<CompiledBlock>,
  CompilationConfig
> {
  // Cache the globally-addressable callable names per parse tree.
  // Computed lazily by walking the top-level statements once: every
  // `LuauExternalDeclaration` and every top-level `LuauFunctionDefinition`
  // / variable definition lands in the set. Used by
  // `scanFreeVariables` in `lowerExpression.ts` to skip these when
  // collecting closure upvals — they're already reachable from any
  // nested-function call site via the regular divert resolver, so
  // routing them through closure dispatch would waste a frame slot
  // and (for externals) break the call entirely.
  //
  // Keyed on the Tree reference: the SparkdownAnnotator base class
  // reassigns `this.tree` whenever an incremental parse produces a
  // new top-node, so identity-based comparison correctly invalidates
  // the cache on real structural changes.
  private _globalCallableNames?: Set<string>;
  private _globalCallableNamesTree?: unknown;
  // The callable names and define type names every chunk was last confirmed
  // to agree with (see `markDocumentNamesChecked`).
  private _checkedGlobalCallableNames?: Set<string>;
  private _checkedDefineTypeNames?: Set<string>;

  /**
   * The document's define TYPE names — every `define`/`animation`/`theme`
   * PARENT (`LuauDefineParentName`) and every `new <Class>()` target
   * (`LuauNewClassName`). These names keep their bare global; `lowerLuauDefine`
   * scopes only LEAF-instance defines (typed, never used as a type) to a
   * synthetic `$<type>_<name>` key.
   *
   * The index is owned by `SparkdownCombinedAnnotator`, which keeps it current
   * across edits by re-walking only the region the parser rebuilt. Constructing
   * this annotator without one (a test driving it directly) leaves the set
   * empty.
   */
  private _defineTypeNameIndex?: DefineTypeNameIndex;

  constructor(config?: CompilationConfig, defineTypeNames?: DefineTypeNameIndex) {
    super(config);
    this._defineTypeNameIndex = defineTypeNames;
  }

  // The document's text as one string, which the lowerers read Luau from
  // (`LowerContext.documentText`), converted once per version of the document.
  private _documentText = "";
  private _documentTextOf?: unknown;

  private documentText(): string {
    if (this._documentTextOf !== this.text) {
      this._documentTextOf = this.text;
      this._documentText = this.text?.toString() ?? "";
    }
    return this._documentText;
  }

  private computeGlobalCallableNames(): Set<string> {
    if (this.tree === this._globalCallableNamesTree && this._globalCallableNames) {
      return this._globalCallableNames;
    }
    const set = new Set<string>();
    const tree = this.tree;
    if (tree) {
      const cursor = tree.cursor();
      // Only walk top-level children — nested declarations are scoped
      // inside their parent function and don't need to be in the
      // global skip-set. `cursor.firstChild()` descends to the first
      // child of the root; `cursor.nextSibling()` iterates the rest.
      if (cursor.firstChild()) {
        do {
          this.collectGlobalNameAt(cursor.node, set);
        } while (cursor.nextSibling());
      }
    }
    this._globalCallableNames = set;
    this._globalCallableNamesTree = this.tree;
    return set;
  }

  /**
   * The ranges of chunks whose lowering read a global callable name or a
   * define type name the current document answers differently. An
   * incremental pass lowers only the chunks its reparse rebuilt, so a carried
   * chunk keeps the answers (and the diagnostics) it got when it was lowered;
   * the caller lowers these again and then calls `markDocumentNamesChecked`.
   *
   * Every chunk agrees with the sets last marked as checked, so when both sets
   * are unchanged since then nothing can be stale and the walk is skipped.
   */
  staleRanges(): { from: number; to: number }[] {
    const callableNames = this.computeGlobalCallableNames();
    const typeNames = this.computeDefineTypeNames();
    const callableNamesChanged = !sameNames(
      this._checkedGlobalCallableNames,
      callableNames,
    );
    const typeNamesChanged = !sameNames(
      this._checkedDefineTypeNames,
      typeNames,
    );
    // Any edit can change the line a continuation continues, or the
    // statements a `done` leaves unreachable, so a document whose chunks hold
    // a read checks those reads on every update.
    if (!callableNamesChanged && !typeNamesChanged && !this._hasReads) {
      return [];
    }
    const stale: { from: number; to: number }[] = [];
    let hasReads = false;
    const iter = this.current.iter();
    while (iter.value) {
      const block = iter.value.type;
      hasReads ||= block.reads !== undefined;
      if (
        (callableNamesChanged &&
          readsDisagree(block.globalCallableReads, callableNames)) ||
        (typeNamesChanged && readsDisagree(block.defineTypeReads, typeNames)) ||
        (block.reads && this.loweringReadsDisagree(block.reads, iter.from))
      ) {
        stale.push({ from: iter.from, to: iter.to });
      }
      iter.next();
    }
    this._hasReads = hasReads;
    return stale;
  }

  // Whether a chunk of the document may hold a `LoweringRead`: set when one is
  // lowered with reads, and cleared by a walk that finds none.
  private _hasReads = false;

  /** Whether the document answers a read of the chunk that starts at `from`
   *  differently from the answer its lowering got, asking the node that read
   *  it. A node no longer found where the read says it starts disagrees. */
  private loweringReadsDisagree(reads: RecordedRead[], from: number): boolean {
    return reads.some(
      (read) => this.loweringReadAt(read.kind, read.node, from + read.at) !== read.value,
    );
  }

  /**
   * Record that every chunk now agrees with the document's current callable
   * names and define type names: after a full rebuild, or after the chunks
   * `staleRanges` returned have been lowered again.
   */
  markDocumentNamesChecked(): void {
    this._checkedGlobalCallableNames = this.computeGlobalCallableNames();
    // The index may replace or refill its set, so keep a copy.
    this._checkedDefineTypeNames = new Set(this.computeDefineTypeNames());
  }

  private computeDefineTypeNames(): ReadonlySet<string> {
    return this._defineTypeNameIndex?.names ?? new Set<string>();
  }

  private collectGlobalNameAt(
    node: import("@lezer/common").SyntaxNode,
    set: Set<string>,
  ): void {
    if (node.name === "LuauExternalDeclaration") {
      const content = node.getChild("LuauExternalDeclaration_content");
      const target = content ?? node;
      const found = this.findDescendant(target, "LuauFunctionName");
      if (found) set.add(this.read(found.from, found.to).trim());
      return;
    }
    if (node.name === "LuauFunctionDefinition") {
      const found = this.findDescendant(node, "LuauFunctionName");
      if (found) set.add(this.read(found.from, found.to).trim());
      return;
    }
    if (VARIABLE_DEFINITION_NAMES.has(node.name)) {
      // Top-level `store NAME = …` / `const NAME = …` — collect the
      // declared identifier(s). Each `LuauVariableAssignment` carries
      // one name in `LuauVariableName` under `_begin_c1`.
      let cur = node.firstChild;
      while (cur) {
        if (VARIABLE_DEFINITION_CONTENT_NAMES.has(cur.name)) {
          let inner = cur.firstChild;
          while (inner) {
            // A value in the list (`x` in `store a, b = 1, x`) declares nothing.
            if (isExplicitRuleName(inner.name, "LuauVariableAssignment") && !valueListAssignmentName(inner)) {
              const nameNode = this.findDescendant(inner, "LuauVariableName");
              if (nameNode) set.add(this.read(nameNode.from, nameNode.to).trim());
            }
            inner = inner.nextSibling;
          }
        }
        cur = cur.nextSibling;
      }
    }
  }

  private findDescendant(
    node: import("@lezer/common").SyntaxNode,
    name: string,
  ): import("@lezer/common").SyntaxNode | null {
    let result: import("@lezer/common").SyntaxNode | null = null;
    const cursor = node.cursor();
    if (!cursor.firstChild()) return null;
    do {
      if (cursor.name === name) {
        result = cursor.node;
        break;
      }
      const found = this.findDescendant(cursor.node, name);
      if (found) {
        result = found;
        break;
      }
    } while (cursor.nextSibling());
    return result;
  }

  override enter(
    annotations: Range<SparkdownAnnotation<CompiledBlock>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<CompiledBlock>>[] {
    if (
      nodeRef.node.parent?.type.isTop &&
      nodeRef.name !== "Newline" &&
      nodeRef.name !== "Whitespace" &&
      nodeRef.name !== "ExtraWhitespace" &&
      nodeRef.name !== "OptionalWhitespace" &&
      nodeRef.name !== "RequiredWhitespace" &&
      nodeRef.name !== "FrontMatter"
    ) {
      const host = this.config?.recordLoweringReads
        ? this.config.statementMemo
        : undefined;
      let lowered = this.lowerTopLevel(nodeRef, host);
      if (lowered === null) {
        // A statement the memo served is code of its owner's own, which needs
        // its objects: the node is lowered again without the memo.
        lowered = this.lowerTopLevel(nodeRef, undefined);
      }
      if (lowered !== undefined && lowered !== null) {
        annotations.push(
          SparkdownAnnotation.mark(lowered).range(nodeRef.from, nodeRef.to),
        );
      }
      // Chunks the lowerer doesn't recognize are silently dropped.
      // There is no parser fallback for unrecognized chunks (the
      // grammar+lowerers are the only path); dropping them avoids
      // re-interpreting Luau-tagged source as legacy ink (e.g. `{ a = 1 }`
      // table literals look like ink `{interpolation}` blocks) and the
      // misleading diagnostics that would follow. If a chunk shape needs
      // handling, add a lowerer for it in `src/compiler/lower/lower.ts`.
    }
    return annotations;
  }

  /** How many statements of blocks' bodies the last update lowered, and how
   *  many it served from their memos (`statementMemo.ts`). */
  memoStats: MemoStats = noMemoStats();

  // The memos served since the last update (`StatementMemoSession.used`).
  protected _served = new Set<StatementMemoEntry>();

  /** The range the incremental parse rebuilt in the update in progress,
   *  whose statements are lowered whatever their memos say, set by the
   *  combined annotator around the update's own window. */
  get rebuilt(): { from: number; to: number } | null {
    return this._rebuilt;
  }
  set rebuilt(window: { from: number; to: number } | null) {
    this._rebuilt = window;
    if (window) {
      this.memoStats.rebuilt = window;
    }
  }
  protected _rebuilt: { from: number; to: number } | null = null;

  // The edit of the update in progress, inverted, which maps a range of the
  // new document to the old one, where the annotations of the previous
  // lowering still stand while the update's window is lowered.
  protected _inverse?: ChangeDesc;

  override update(tree: Tree, text: Text, uri?: string): void {
    super.update(tree, text, uri);
    this.memoStats = noMemoStats();
    this._served = new Set();
    this._inverse = undefined;
    this.rebuilt = null;
  }

  override mapState(changes: ChangeDesc): void {
    this._inverse = this.config?.statementMemo?.enabled
      ? changes.invertedDesc
      : undefined;
  }

  /** Marks the annotations as current: after the update's own window is
   *  lowered they are mapped to the new document. `relower` starts a
   *  lowering of blocks of the compiler's (`relowerCompilations`), whose
   *  memos may be served again. */
  settle(relower = false): void {
    this._inverse = undefined;
    this.rebuilt = null;
    if (relower) {
      this._served = new Set();
    }
  }

  /** The memos of the statements the previous lowering of the node at
   *  `[from, to)` held, by syntax. */
  protected memoLookup(from: number, to: number): Map<string, StatementMemoEntry> {
    const lookup = new Map<string, StatementMemoEntry>();
    const inverse = this._inverse;
    const oldFrom = inverse ? inverse.mapPos(from, -1) : from;
    const oldTo = inverse ? inverse.mapPos(to, 1) : to;
    this.current.between(oldFrom, oldTo, (f, _t, value) => {
      collectMemos(value.type.statement, f, lookup);
    });
    return lookup;
  }

  /** Where a position of the document stood before the update the
   *  annotator is making. */
  protected before(pos: number): number {
    return this._inverse ? this._inverse.mapPos(pos, 1) : pos;
  }

  /**
   * Lowers a top-level node, through the statement memo when `host` is
   * given. Returns null when a statement the memo served became code of its
   * owner's own (`StatementMemoSession.finish`).
   */
  protected lowerTopLevel(
    nodeRef: SparkdownSyntaxNodeRef,
    host: StatementMemoHost | undefined,
  ): CompiledBlock | undefined | null {
    {
      // Snapshot the chunk's absolute start line so the lowerer can produce
      // chunk-relative debug metadata. `text.lineAt(pos).number` is 1-based,
      // so subtract 1 to get a 0-based absolute line. The 0-based chunk-
      // relative line is `(absolute-line) - (chunk-start-absolute-line)`.
      // Compiler's `offsetDebugMetadata` later re-adds the chunk offset.
      const text = this.text;
      const chunkStartLine0 = text ? text.lineAt(nodeRef.from).number - 1 : 0;
      // Fresh per-chunk hoist list — accumulated synthetic knots from
      // anonymous-function literals during this chunk's lowering. Each
      // chunk's `enter` reruns from scratch (rebuilt on edit), so a
      // chunk-local list naturally tracks the chunk's current state.
      // Names come from the document and the source position within it
      // (`syntheticId`) rather than a counter, so they stay unique across
      // chunks and files.
      const hoistedKnots: ParsedObject[] = [];
      // Stack of nested-callable buffers. Starts empty (top-level
      // scope). Function-definition lowerers push/pop their own buffer
      // so nested callables (anonymous fns, nested named fns) live at
      // their lexical position instead of hoisting to top-level.
      const functionScopeStack: ParsedObject[][] = [];
      // Stack of break/continue targets used by `break` and
      // `continue` lowerers to emit the right `Divert`. Each loop
      // pushes/pops its own entry.
      const loopStack: { continueLabel: string; breakLabel: string }[] = [];
      // Diagnostics collected by lowerers nested below the chunk's
      // dispatch level. They're attached to the chunk's annotation
      // after lowering completes. A site that unwraps a nested block and
      // discards it moves the block's diagnostics here through
      // `forwardBlockDiagnostics`, and some lowerers push to it directly.
      const chunkDiagnostics: InkDiagnostic[] = [];
      // Fresh per-chunk stack of declared-locals frames. Pushed/popped
      // by `lowerLuauFunctionDefinition` (and the anonymous-fn lowerer)
      // so nested-scope scans of free variables can detect shadowing
      // of stdlib-named identifiers by enclosing-scope locals.
      const declaredLocalsStack: Set<string>[] = [];
      // Per-chunk stack of hoist buffers — one entry pushed per
      // enclosing function-definition lowering. Bare `function NAME end`
      // nested inside another function pre-declares a `local NAME = nil`
      // here so it lands at the enclosing function's body top, surviving
      // any do/while/for/if block scopes that wrap the in-place
      // assignment.
      const hoistedNestedFnDeclsStack: ParsedObject[][] = [];
      // Per-chunk stack of "sibling subflow" names — nested function
      // declarations that route through `lowerNestedAsSubFlow` (variadic
      // fns) rather than emitting a local-binding closure. References to
      // these names from inner closures skip upval capture, as the names
      // are no variables: the call site reaches the subflow by path.
      const siblingSubFlowNamesStack: Map<string, SiblingSubFlowInfo>[] = [];
      // Per-chunk stack of the blocks being lowered, each with what its end
      // undoes (`LowerContext.blockEndStack`).
      const blockEndStack: (() => void)[][] = [];
      const callableNames = this.computeGlobalCallableNames();
      const globalCallableReads = new Map<string, boolean>();
      const typeNames = this.computeDefineTypeNames();
      const defineTypeReads = new Map<string, boolean>();
      const reads: RecordedRead[] = [];
      // The statements whose lowering is running, for the binary program's
      // chunk store (`StatementShape`): this node's statement at the bottom,
      // and the statements of a block's bodies above it while they lower.
      // Each read is recorded on the innermost one as well.
      const recording = !!this.config?.recordLoweringReads;
      const statement = recording
        ? topLevelShape(nodeRef.name, nodeRef.from, nodeRef.to)
        : undefined;
      const statementStack = statement ? [statement] : undefined;
      const innermost = () => statementStack?.[statementStack.length - 1];
      const ctx: LowerContext = {
        recordRead: recording
          ? (read: LoweringRead) => {
              reads.push({
                kind: read.kind,
                value: read.value,
                node: read.node,
                at: read.from - nodeRef.from,
              });
              // An `unreachable` read sizes a hint, not the statement's code,
              // so its statement keeps its chunk whatever it answers.
              if (read.kind !== "unreachable") {
                innermost()?.reads.other.push(`${read.kind}:${read.value}`);
              }
            }
          : undefined,
        statementStack,
        // The document being lowered. Absent here until now, which made
        // `ctx.filePath` undefined on the PRODUCTION path — so anything
        // deriving identity from it silently fell back to nothing. Binding
        // evaluator names did exactly that and collided across files.
        filePath: this.uri,
        chunkFrom: nodeRef.from,
        read: (from, to) => this.read(from, to),
        documentText: () => this.documentText(),
        lineNumber: (pos) =>
          text ? text.lineAt(pos).number - 1 - chunkStartLine0 : 0,
        characterNumber: (pos) => {
          if (!text) return 0;
          const line = text.lineAt(pos);
          return pos - line.from;
        },
        config: this.config,
        hoistedKnots,
        functionScopeStack,
        loopStack,
        diagnostics: chunkDiagnostics,
        globalCallableNames: {
          has: (name) => {
            const found = callableNames.has(name);
            globalCallableReads.set(name, found);
            innermost()?.reads.callable.set(name, found);
            return found;
          },
        },
        defineTypeNames: {
          has: (name) => {
            const found = typeNames.has(name);
            defineTypeReads.set(name, found);
            innermost()?.reads.defineType.set(name, found);
            return found;
          },
        },
        declaredLocalsStack,
        hoistedNestedFnDeclsStack,
        siblingSubFlowNamesStack,
        blockEndStack,
        // The depth of the scoped blocks open around the statement being
        // lowered, which a block statement raises and puts back: starting it
        // at 0, as every reader reads it unset, leaves the context as a block
        // statement found it (`recordLowering`, #656).
        scopeDepth: 0,
      };
      const session =
        statement && host?.enabled
          ? new StatementMemoSession(
              host,
              this.memoLookup(nodeRef.from, nodeRef.to),
              (pos) => this.before(pos),
              this.rebuilt,
              this.memoStats,
              this._served,
              (kind, node, from) => this.loweringReadAt(kind, node, from),
            )
          : undefined;
      ctx.statementMemo = session;
      let lowered = lower(nodeRef, ctx);
      if (session && statement && !session.finish(statement)) {
        return null;
      }
      // The Luau blocks this chunk's own nodes show to be left open. A chunk
      // with no lowerer (a root-level type function) carries them on an empty
      // block.
      const unclosed = validateBlockEnds(
        nodeRef.node,
        ctx,
        session ? (node) => session.servedWithoutBlocks(node) : undefined,
      );
      if (unclosed.length > 0) {
        lowered ??= {};
        chunkDiagnostics.push(...unclosed);
      }
      if (lowered && statement) {
        lowered.statement = statement;
      }
      if (lowered && session && session.served.length > 0) {
        lowered.memoized = session.served;
      }
      if (lowered && hoistedKnots.length > 0) {
        lowered.hoistedKnots = hoistedKnots;
      }
      if (lowered && globalCallableReads.size > 0) {
        lowered.globalCallableReads = globalCallableReads;
      }
      if (lowered && defineTypeReads.size > 0) {
        lowered.defineTypeReads = defineTypeReads;
      }
      if (lowered && reads.length > 0) {
        lowered.reads = reads;
        this._hasReads = true;
      }
      if (lowered && chunkDiagnostics.length > 0) {
        // Merge any deep-nested-lowerer diagnostics with whatever
        // diagnostics the chunk-level lowerer attached directly.
        lowered.diagnostics = [
          ...(lowered.diagnostics ?? []),
          ...chunkDiagnostics,
        ];
      }
      if (lowered !== undefined) {
        lowered.node = nodeRef.name;
        // Tag-only chunks need a stable per-chunk container so the
        // runtime's `TagsForContentAtPath` walker stops at the right
        // boundary. The `uuid` field tells `SparkdownCompiler` to
        // wrap the chunk's content in a `Statement` — without that
        // wrap, the tag-triplet would land flat in the enclosing
        // container alongside the next chunk's line-type tag, and the
        // walker would over-collect into the next line's metadata.
        // `SparkdownCompiler.canonicalizeSyntheticFlowNames` numbers the
        // containers in document order on every compile, so the value set
        // here only marks the chunk.
        if (isExplicitRuleName(nodeRef.name, "Tags")) {
          lowered.uuid = "tags";
        }
      }
      return lowered;
    }
  }

  /** What the document now answers a `LoweringRead` of the node named
   *  `name` that starts at `from`, or undefined when none starts there. */
  protected loweringReadAt(
    kind: LoweringRead["kind"],
    name: string,
    from: number,
  ): string | undefined {
    const text = this.text;
    const tree = this.tree;
    if (!text || !tree) {
      return undefined;
    }
    const node = nodeStartingAt(tree, from, name);
    if (!node) {
      return undefined;
    }
    const ctx = {
      read: (a: number, b: number) => this.read(a, b),
      lineNumber: (pos: number) => text.lineAt(pos).number - 1,
      characterNumber: (pos: number) => pos - text.lineAt(pos).from,
    };
    return kind === "unreachable"
      ? unreachableRead(node, ctx)
      : continuationRoutingRead(node, ctx);
  }
}
