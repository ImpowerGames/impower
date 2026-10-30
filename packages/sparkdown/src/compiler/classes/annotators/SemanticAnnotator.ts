import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { namesValue } from "../../utils/alternatorDecision";
import { ChangeDesc, MapMode, Range } from "@codemirror/state";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { type SyntaxNode, Tree } from "@lezer/common";
import GRAMMAR_DEFINITION from "../../../../language/sparkdown.language-grammar.json";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import {
  VARIABLE_DEFINITION_NAMES,
  isValueListName,
  valueListAssignmentName,
} from "../../utils/variableDefinitionNames";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import {
  SparkdownAnnotator,
  type SparkdownAnnotatorSnapshot,
} from "../SparkdownAnnotator";
import {
  SemanticDependencies,
  type Binding,
  type BindingKind,
  type SemanticDependenciesSnapshot,
} from "./SemanticDependencies";

export type SemanticTokenTypes =
  | "namespace"
  | "type"
  | "class"
  | "enum"
  | "interface"
  | "struct"
  | "typeParameter"
  | "parameter"
  | "variable"
  | "property"
  | "enumMember"
  | "event"
  | "function"
  | "method"
  | "macro"
  | "keyword"
  | "modifier"
  | "comment"
  | "string"
  | "number"
  | "regexp"
  | "operator"
  | "decorator";

export type SemanticTokenModifiers =
  | "declaration"
  | "definition"
  | "readonly"
  | "static"
  | "deprecated"
  | "abstract"
  | "async"
  | "modification"
  | "documentation"
  | "defaultLibrary";

export interface SemanticInfo {
  tokenType?: SemanticTokenTypes;
  tokenModifiers?: SemanticTokenModifiers[];
  possibleDivertPath?: boolean;
}

type ScopeFrame = Map<string, { kind: BindingKind; fromStdlib: boolean }>;

const STDLIB_FUNCTIONS =
  (GRAMMAR_DEFINITION.variables.LUAU_STANDARD_LIB_FUNCTIONS as string[]) ?? [];
const STDLIB_NAMESPACES = [
  ...((GRAMMAR_DEFINITION.variables.LUAU_STANDARD_LIB_CONSTANTS as string[]) ??
    []),
  ...((GRAMMAR_DEFINITION.variables.LUAU_STANDARD_LIB_GLOBALS as string[]) ??
    []),
];

function makeGlobalScope(): ScopeFrame {
  const frame: ScopeFrame = new Map();
  for (const n of STDLIB_FUNCTIONS)
    frame.set(n, { kind: "function", fromStdlib: true });
  for (const n of STDLIB_NAMESPACES)
    frame.set(n, { kind: "namespace", fromStdlib: true });
  return frame;
}

const UNBOUND_NAME: SemanticInfo = { tokenType: "variable", tokenModifiers: [] };

function semanticInfo(binding: Binding, declaration: boolean): SemanticInfo {
  const modifiers: SemanticTokenModifiers[] = [];
  if (binding.fromStdlib) modifiers.push("defaultLibrary");
  if (binding.kind === "const-variable") modifiers.push("readonly", "static");
  if (declaration) modifiers.push("declaration");
  return {
    tokenType:
      binding.kind === "function"
        ? "function"
        : binding.kind === "namespace"
          ? "namespace"
          : "variable",
    tokenModifiers: modifiers,
  };
}

function isAtDeclarationSite(node: any): boolean {
  let cur = node?.parent;
  for (let depth = 0; depth < 6 && cur; depth++) {
    if (isExplicitRuleName(cur.name, "LuauVariableAssignment_begin")) return !isValueListName(node);
    if (cur.name === "LuauFunctionDeclarationName") return true;
    if (isExplicitRuleName(cur.name, "LuauAccessPart")) return false;
    if (isExplicitRuleName(cur.name, "LuauFunctionCall_begin")) return false;
    cur = cur.parent;
  }
  return false;
}

function topLevelStart(tree: Tree, pos: number): number {
  const clamped = Math.max(0, Math.min(pos, tree.length));
  let node: SyntaxNode | null = tree.resolveInner(clamped, -1);
  let outermost: SyntaxNode | null = null;
  while (node?.parent) {
    outermost = node;
    node = node.parent;
  }
  return outermost ? Math.min(outermost.from, clamped) : clamped;
}

type PrimedScopes = {
  blockStart: number;
  upTo: number;
  frames: ScopeFrame[];
  pendingDeclKind: "variable" | "const-variable" | null;
} | null;

interface SemanticAnnotatorSnapshot extends SparkdownAnnotatorSnapshot {
  dependencies: SemanticDependenciesSnapshot;
  globalDecls: { from: number; name: string; kind: BindingKind }[];
  primed: PrimedScopes;
  windowFrom: number;
  windowTo: number;
}

export class SemanticAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<SemanticInfo>
> {
  private dependencies = new SemanticDependencies();
  private bindingNode: SyntaxNode | null = null;
  scopeStack: ScopeFrame[] = [makeGlobalScope()];

  pendingDeclKind: "variable" | "const-variable" | null = null;

  protected priming = false;

  protected globalDecls: {
    from: number;
    name: string;
    kind: BindingKind;
  }[] = [];

  protected windowFrom = 0;
  protected windowTo = 0;

  protected primed: PrimedScopes = null;

  override snapshot(): SparkdownAnnotatorSnapshot {
    const snapshot: SemanticAnnotatorSnapshot = {
      ...super.snapshot(),
      dependencies: this.dependencies.snapshot(),
      globalDecls: this.globalDecls,
      primed: this.primed,
      windowFrom: this.windowFrom,
      windowTo: this.windowTo,
    };
    return snapshot;
  }

  override restore(snapshot: SparkdownAnnotatorSnapshot): void {
    super.restore(snapshot);
    const semantic = snapshot as SemanticAnnotatorSnapshot;
    this.dependencies.restore(semantic.dependencies);
    this.globalDecls = semantic.globalDecls;
    this.primed = semantic.primed;
    this.windowFrom = semantic.windowFrom;
    this.windowTo = semantic.windowTo;
  }

  override begin(iterateFrom: number, iterateTo: number): void {
    if (iterateFrom === 0 && iterateTo === this.tree?.length) {
      this.dependencies = new SemanticDependencies();
    }
    this.dependencies.begin();
    this.scopeStack = [makeGlobalScope()];
    this.pendingDeclKind = null;
    this.windowFrom = iterateFrom;
    this.windowTo = iterateTo;
    if (iterateFrom > 0 && this.tree) {
      this.primeScopes(this.tree, iterateFrom);
    }
  }

  override end(): void {
    const replaced = new Set<string>();
    const add: Range<SparkdownAnnotation<SemanticInfo>>[] = [];
    this.globalDecls = this.dependencies.finish(
      this.windowFrom,
      this.windowTo,
      makeGlobalScope(),
      (site, binding) => {
        replaced.add(`${site.from}:${site.to}`);
        if (binding) {
          add.push(
            SparkdownAnnotation.mark(semanticInfo(binding, site.declaration))
              .range(site.from, site.to),
          );
        } else if (site.nameFallback) {
          add.push(SparkdownAnnotation.mark(UNBOUND_NAME).range(site.from, site.to));
        }
      },
    );
    if (replaced.size) {
      this.current = this.current.update({
        filter: (from, to, value) =>
          !replaced.has(`${from}:${to}`) ||
          !!value.type?.possibleDivertPath ||
          value.type?.tokenType === "class",
        add,
        sort: true,
      });
    }
  }

  override mapState(changes: ChangeDesc): void {
    this.dependencies.map(changes);
    if (this.primed) {
      const upTo = this.primed.upTo;
      let reachedBehind = false;
      changes.iterChangedRanges((fromA, _toA, fromB) => {
        if (fromA < upTo || fromB < upTo) {
          reachedBehind = true;
        }
      });
      if (reachedBehind) {
        this.primed = null;
      }
    }
    const mapped: typeof this.globalDecls = [];
    for (const decl of this.globalDecls) {
      const from = changes.mapPos(decl.from, -1, MapMode.TrackDel);
      if (from != null) {
        mapped.push({ ...decl, from });
      }
    }
    this.globalDecls = mapped;
  }

  protected primeScopes(tree: Tree, upTo: number): void {
    const globals = this.scopeStack[0]!;
    for (const decl of this.globalDecls) {
      if (decl.from >= upTo) {
        break;
      }
      globals.set(decl.name, { kind: decl.kind, fromStdlib: false });
    }
    const from = topLevelStart(tree, upTo);
    if (from >= upTo) {
      return;
    }
    if (this.primed?.upTo === upTo && this.primed.blockStart === from) {
      this.scopeStack = this.primed.frames.map((frame) => new Map(frame));
      this.pendingDeclKind = this.primed.pendingDeclKind;
      return;
    }
    const discard: Range<SparkdownAnnotation<SemanticInfo>>[] = [];
    this.priming = true;
    try {
      this.replayScopes(tree, from, upTo, discard);
    } finally {
      this.priming = false;
    }
    this.primed = {
      blockStart: from,
      upTo,
      frames: this.scopeStack.map((frame) => new Map(frame)),
      pendingDeclKind: this.pendingDeclKind,
    };
  }

  private replayScopes(
    tree: Tree,
    startAt: number,
    upTo: number,
    discard: Range<SparkdownAnnotation<SemanticInfo>>[],
  ): void {
    tree.iterate({
      from: startAt,
      to: upTo,
      enter: (nodeRef) => {
        this.enter(discard, nodeRef as SparkdownSyntaxNodeRef);
        discard.length = 0;
        if (nodeRef.to > upTo) {
          return undefined;
        }
        if (
          nodeRef.name === "LuauFunctionDefinition" &&
          this.pendingDeclKind === null
        ) {
          this.leave(discard, nodeRef as SparkdownSyntaxNodeRef);
          discard.length = 0;
          return false;
        }
        return undefined;
      },
      leave: (nodeRef) => {
        if (nodeRef.to > upTo) {
          return;
        }
        this.leave(discard, nodeRef as SparkdownSyntaxNodeRef);
        discard.length = 0;
      },
    });
  }

  lookupBinding(
    name: string,
  ): { kind: BindingKind; fromStdlib: boolean } | null {
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const v = this.scopeStack[i]!.get(name);
      if (v) return v;
    }
    return null;
  }

  bindInCurrentScope(name: string, kind: BindingKind): void {
    if (!name) return;
    const frame = this.scopeStack[this.scopeStack.length - 1];
    if (!frame) return;
    frame.set(name, { kind, fromStdlib: false });
    if (!this.priming && this.bindingNode) {
      this.dependencies.bind(this.bindingNode, name, kind);
    }
  }

  override enter(
    annotations: Range<SparkdownAnnotation<SemanticInfo>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<SemanticInfo>>[] {
    this.bindingNode = nodeRef.node;
    if (nodeRef.name === "LuauFunctionDefinition") {
      const declName = getDescendent(
        "LuauFunctionDeclarationName",
        nodeRef.node,
      );
      if (declName) {
        const nameNode = getDescendent("LuauFunctionName", declName);
        if (nameNode) {
          const name = this.read(nameNode.from, nameNode.to).trim();
          if (name) this.bindInCurrentScope(name, "function");
        }
      }
      this.scopeStack.push(new Map());
    }
    if (nodeRef.name === "LuauFunctionTypeDeclaration") {
      this.scopeStack.push(new Map());
    }
    if (nodeRef.name === "LuauFunctionParameter") {
      const name = this.read(nodeRef.from, nodeRef.to).trim();
      if (name) this.bindInCurrentScope(name, "variable");
    }
    if (VARIABLE_DEFINITION_NAMES.has(nodeRef.name)) {
      const scopeNode = getDescendent("LuauScopeModifier", nodeRef.node);
      const scopeText = scopeNode
        ? this.read(scopeNode.from, scopeNode.to).trim()
        : "";
      this.pendingDeclKind =
        scopeText === "const" ? "const-variable" : "variable";
    }
    if (
      isExplicitRuleName(nodeRef.name, "LuauVariableAssignment") &&
      this.pendingDeclKind &&
      !valueListAssignmentName(nodeRef.node)
    ) {
      const nameNode = getDescendent("LuauVariableName", nodeRef.node);
      if (nameNode) {
        const name = this.read(nameNode.from, nameNode.to).trim();
        if (name) {
          let kind: BindingKind = this.pendingDeclKind;
          const fnLiteral = getDescendent(
            "LuauFunctionDefinition",
            nodeRef.node,
          );
          if (fnLiteral) kind = "function";
          this.bindInCurrentScope(name, kind);
        }
      }
    }
    if (this.priming) {
      return annotations;
    }
    if (
      nodeRef.name === "LuauStdLibFunctions" ||
      nodeRef.name === "LuauStdLibConstants" ||
      nodeRef.name === "LuauVariableName" ||
      nodeRef.name === "LuauFunctionName"
    ) {
      const name = this.read(nodeRef.from, nodeRef.to).trim();
      const binding = this.lookupBinding(name);
      const declaration =
        (nodeRef.name === "LuauVariableName" ||
          nodeRef.name === "LuauFunctionName") &&
        isAtDeclarationSite(nodeRef.node);
      this.dependencies.reference(nodeRef.node, name, declaration);
      if (binding) {
        annotations.push(
          SparkdownAnnotation.mark(semanticInfo(binding, declaration)).range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
      }
    }
    if (nodeRef.name === "LuauControlKeyword" && namesValue(nodeRef.node)) {
      const name = this.read(nodeRef.from, nodeRef.to).trim();
      const binding = this.lookupBinding(name);
      this.dependencies.reference(nodeRef.node, name, false, true);
      annotations.push(
        SparkdownAnnotation.mark<SemanticInfo>(
          binding ? semanticInfo(binding, false) : UNBOUND_NAME,
        ).range(nodeRef.from, nodeRef.to),
      );
    }
    if (
      nodeRef.name === "SceneDeclarationName" ||
      nodeRef.name === "BranchDeclarationName" ||
      nodeRef.name === "LabelDeclarationName"
    ) {
      annotations.push(
        SparkdownAnnotation.mark<SemanticInfo>({
          tokenType: "class",
          tokenModifiers: ["declaration"],
        }).range(nodeRef.from, nodeRef.to),
      );
    }
    if (nodeRef.name === "DivertPart") {
      annotations.push(
        SparkdownAnnotation.mark<SemanticInfo>({
          possibleDivertPath: true,
        }).range(nodeRef.from, nodeRef.to),
      );
    }
    if (nodeRef.name === "LuauSparkleEventHandlerName") {
      annotations.push(
        SparkdownAnnotation.mark<SemanticInfo>({
          possibleDivertPath: true,
        }).range(nodeRef.from, nodeRef.to),
      );
    }
    return annotations;
  }

  override leave(
    annotations: Range<SparkdownAnnotation<SemanticInfo>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<SemanticInfo>>[] {
    if (
      (nodeRef.name === "LuauFunctionDefinition" ||
        nodeRef.name === "LuauFunctionTypeDeclaration") &&
      this.scopeStack.length > 1
    ) {
      this.scopeStack.pop();
    }
    if (VARIABLE_DEFINITION_NAMES.has(nodeRef.name)) {
      this.pendingDeclKind = null;
    }
    return annotations;
  }
}
