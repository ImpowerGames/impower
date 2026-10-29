import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { documentString } from "../../utils/documentString";
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
import type { FunctionBinding } from "../../lower/utils/functionBindings";
import type { SourceMetadata } from "../../../runtime/Error";
import { DefineTypeNameIndex } from "../DefineTypeNameIndex";
import type {
  LowerContext,
  LoweringRead,
  SiblingSubFlowInfo,
} from "../../lower/context";
import { lower } from "../../lower/lower";
import { takesOffset } from "../../lower/recordingContext";
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
import { RootLocals } from "../../utils/rootLocals";
import { scopeOf } from "../../utils/declarationOnly";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import {
  SparkdownAnnotator,
  type SparkdownAnnotatorSnapshot,
} from "../SparkdownAnnotator";

export interface InkDiagnostic {
  message: string;
  severity: ErrorType;
  source: SourceMetadata | null;
  tags?: number[];
  messageLinesInChunk?: true;
}

export interface RunOperand {
  path: string;
  written: string;
  quote: string;
  source: SourceMetadata;
  line: SourceMetadata;
}

export interface CompiledBlock {
  diagnostics?: InkDiagnostic[];
  content?: ParsedObject[];
  run?: RunOperand;
  context?: {
    [type: string]: { [name: string]: any };
  };
  sparkle?: {
    layouts?: { [name: string]: any };
    screens?: { [name: string]: any };
    components?: { [name: string]: any };
  };
  defaultDefinitions?: { [type: string]: any };
  uuid?: string;
  hoistedKnots?: ParsedObject[];
  globalCallableReads?: Map<string, boolean>;
  defineTypeReads?: Map<string, boolean>;
  node?: string;
  reads?: RecordedRead[];
  statement?: StatementShape;
  memoized?: ParsedObject[];
}

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
  recordLoweringReads?: boolean;
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

interface CompilationAnnotatorSnapshot extends SparkdownAnnotatorSnapshot {
  globalCallableNames?: Set<string>;
  globalCallableNamesTree?: unknown;
  checkedGlobalCallableNames?: Set<string>;
  checkedDefineTypeNames?: Set<string>;
  documentText: string;
  documentTextOf?: unknown;
  hasReads: boolean;
  memoStats: MemoStats;
  served: Set<StatementMemoEntry>;
  rebuilt: { from: number; to: number } | null;
  inverse?: ChangeDesc;
}

export class CompilationAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<CompiledBlock>,
  CompilationConfig
> {
  private _globalCallableNames?: Set<string>;
  private _globalCallableNamesTree?: unknown;
  private _checkedGlobalCallableNames?: Set<string>;
  private _checkedDefineTypeNames?: Set<string>;

  private _defineTypeNameIndex?: DefineTypeNameIndex;

  constructor(config?: CompilationConfig, defineTypeNames?: DefineTypeNameIndex) {
    super(config);
    this._defineTypeNameIndex = defineTypeNames;
  }

  private _documentText = "";
  private _documentTextOf?: unknown;

  private documentText(): string {
    if (this._documentTextOf !== this.text) {
      this._documentTextOf = this.text;
      this._documentText = this.text ? documentString(this.text) : "";
    }
    return this._documentText;
  }

  override snapshot(): SparkdownAnnotatorSnapshot {
    const snapshot: CompilationAnnotatorSnapshot = {
      ...super.snapshot(),
      globalCallableNames: this._globalCallableNames,
      globalCallableNamesTree: this._globalCallableNamesTree,
      checkedGlobalCallableNames: this._checkedGlobalCallableNames,
      checkedDefineTypeNames: this._checkedDefineTypeNames,
      documentText: this._documentText,
      documentTextOf: this._documentTextOf,
      hasReads: this._hasReads,
      memoStats: this.memoStats,
      served: this._served,
      rebuilt: this._rebuilt,
      inverse: this._inverse,
    };
    return snapshot;
  }

  override restore(snapshot: SparkdownAnnotatorSnapshot): void {
    super.restore(snapshot);
    const compilation = snapshot as CompilationAnnotatorSnapshot;
    this._globalCallableNames = compilation.globalCallableNames;
    this._globalCallableNamesTree = compilation.globalCallableNamesTree;
    this._checkedGlobalCallableNames = compilation.checkedGlobalCallableNames;
    this._checkedDefineTypeNames = compilation.checkedDefineTypeNames;
    this._documentText = compilation.documentText;
    this._documentTextOf = compilation.documentTextOf;
    this._hasReads = compilation.hasReads;
    this.memoStats = compilation.memoStats;
    this._served = compilation.served;
    this._rebuilt = compilation.rebuilt;
    this._inverse = compilation.inverse;
  }

  private computeGlobalCallableNames(): Set<string> {
    if (this.tree === this._globalCallableNamesTree && this._globalCallableNames) {
      return this._globalCallableNames;
    }
    const set = new Set<string>();
    const tree = this.tree;
    if (tree) {
      const cursor = tree.cursor();
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

  private _hasReads = false;

  private loweringReadsDisagree(reads: RecordedRead[], from: number): boolean {
    return reads.some(
      (read) => this.loweringReadAt(read.kind, read.node, from + read.at) !== read.value,
    );
  }

  markDocumentNamesChecked(): void {
    this._checkedGlobalCallableNames = this.computeGlobalCallableNames();
    this._checkedDefineTypeNames = new Set(this.computeDefineTypeNames());
  }

  private computeDefineTypeNames(): ReadonlySet<string> {
    return this._defineTypeNameIndex?.names ?? new Set<string>();
  }

  private rootLocals(): RootLocals | undefined {
    const tree = this.tree;
    if (!tree) return undefined;
    if (this._rootLocalsTree !== tree || !this._rootLocals) {
      this._rootLocals = new RootLocals(tree.topNode, (a, b) => this.read(a, b));
      this._rootLocalsTree = tree;
    }
    return this._rootLocals;
  }

  private _rootLocals?: RootLocals;
  private _rootLocalsTree?: unknown;

  private rootLocalsForLowering(): LowerContext["rootLocals"] {
    const locals = this.rootLocals();
    if (!locals) return undefined;
    return {
      answer: takesOffset((name: string, at: number) => locals.answer(name, at)),
      answerIgnoringBlocks: takesOffset((name: string, at: number) => locals.answerIgnoringBlocks(name, at)),
      blockLocal: takesOffset((name: string, at: number) => locals.blockLocal(name, at)),
      declared: takesOffset((name: string, at: number) => locals.declared(name, at)),
    };
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
      if (scopeOf(node, (from, to) => this.read(from, to)) === "local") return;
      const found = this.findDescendant(node, "LuauFunctionName");
      if (found) set.add(this.read(found.from, found.to).trim());
      return;
    }
    if (VARIABLE_DEFINITION_NAMES.has(node.name)) {
      if (/^local\b/.test(this.read(node.from, node.to).trimStart())) return;
      let cur = node.firstChild;
      while (cur) {
        if (VARIABLE_DEFINITION_CONTENT_NAMES.has(cur.name)) {
          let inner = cur.firstChild;
          while (inner) {
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
        lowered = this.lowerTopLevel(nodeRef, undefined);
      }
      if (lowered !== undefined && lowered !== null) {
        annotations.push(
          SparkdownAnnotation.mark(lowered).range(nodeRef.from, nodeRef.to),
        );
      }
    }
    return annotations;
  }

  memoStats: MemoStats = noMemoStats();

  protected _served = new Set<StatementMemoEntry>();

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

  settle(relower = false): void {
    this._inverse = undefined;
    this.rebuilt = null;
    if (relower) {
      this._served = new Set();
    }
  }

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

  protected before(pos: number): number {
    return this._inverse ? this._inverse.mapPos(pos, 1) : pos;
  }

  protected lowerTopLevel(
    nodeRef: SparkdownSyntaxNodeRef,
    host: StatementMemoHost | undefined,
  ): CompiledBlock | undefined | null {
    {
      const text = this.text;
      const chunkStartLine0 = text ? text.lineAt(nodeRef.from).number - 1 : 0;
      const hoistedKnots: ParsedObject[] = [];
      const functionScopeStack: ParsedObject[][] = [];
      const loopStack: { continueLabel: string; breakLabel: string }[] = [];
      const chunkDiagnostics: InkDiagnostic[] = [];
      const declaredLocalsStack: Set<string>[] = [];
      const functionBindingsStack: FunctionBinding[][] = [];
      const siblingSubFlowNamesStack: Map<string, SiblingSubFlowInfo>[] = [];
      const callableNames = this.computeGlobalCallableNames();
      const globalCallableReads = new Map<string, boolean>();
      const typeNames = this.computeDefineTypeNames();
      const defineTypeReads = new Map<string, boolean>();
      const reads: RecordedRead[] = [];
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
              if (read.kind !== "unreachable") {
                innermost()?.reads.other.push(`${read.kind}:${read.value}`);
              }
            }
          : undefined,
        statementStack,
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
        rootLocals: this.rootLocalsForLowering(),
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
        functionBindingsStack,
        siblingSubFlowNamesStack,
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
        lowered.diagnostics = [
          ...(lowered.diagnostics ?? []),
          ...chunkDiagnostics,
        ];
      }
      if (lowered !== undefined) {
        lowered.node = nodeRef.name;
        if (isExplicitRuleName(nodeRef.name, "Tags")) {
          lowered.uuid = "tags";
        }
      }
      return lowered;
    }
  }

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
    if (kind === "rootLocal" || kind === "rootDeclaration" || kind === "rootLocalIgnoringBlocks") {
      const locals = this.rootLocals();
      const answer =
        kind === "rootLocal"
          ? (locals?.answer(name, from) ?? "")
          : kind === "rootLocalIgnoringBlocks"
            ? (locals?.answerIgnoringBlocks(name, from) ?? "")
            : (locals?.declared(name, from) ?? "");
      return `${name}=${answer}`;
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
