import {
  AstExpr, AstExprError, AstExprFunction, AstExprGlobal, AstExprIndexName, AstExprLocal,
  AstStatBlock, getFunctionNameAsString,
  AstStatAssign, AstStatCompoundAssign, AstStatFor, AstStatForIn,
  AstStatFunction, AstStatIf, AstStatLocal, AstStatLocalFunction, AstStatRepeat, AstStatSparkdownStore, AstStatWhile,
  AstType, AstTypePack, visitAst,
  type AstLocal, type AstNode,
} from "../typecheck/Ast";
import type { Location } from "../typecheck/Location";

export interface NameRange { from: number; to: number }
export interface LuauNameReference extends NameRange {
  name: string;
  node: AstExprGlobal | AstExprLocal;
  /** The runtime local's converter identity; absent for global accesses. Const
   * checking bindings can shadow this identity without declaring a local. */
  local?: AstLocal;
  access: "read" | "write" | "readwrite";
  enclosingFunction?: AstExprFunction;
  /** Every authored function around the reference, outermost first;
   * `enclosingFunction` is the last. */
  enclosingFunctions: readonly AstExprFunction[];
  /** A global read (a compound write included) that a plain write of the
   * global earlier in `enclosingFunction` always precedes, as Luau's
   * GlobalUsedAsLocal tracks it: a write inside an `if`, a loop or a nested
   * function does not count, nor one by the statement whose values hold the
   * read. */
  dominated?: boolean;
  /** Written in a type (`typeof(x)`), which Luau's linter does not walk. */
  inType?: boolean;
}
export interface LuauNameDeclaration extends NameRange {
  name: string;
  local: AstLocal;
  kind: "local" | "parameter" | "loop" | "function";
  enclosingFunction?: AstExprFunction;
  function?: AstExprFunction;
  scope?: AstStatBlock;
  /** Declared in its unit's outermost block, outside every authored
   * function, nested block and Sparkle handler body, so later units can
   * still see it. */
  outermost?: boolean;
  /** The document offset where `scope` ends; absent without a scope. */
  scopeTo?: number;
}
export interface LuauGlobalDefinition extends NameRange {
  name: string;
  kind: "assignment" | "function" | "store" | "const";
  node: AstNode;
  enclosingFunction?: AstExprFunction;
  function?: AstExprFunction;
  scope?: AstStatBlock;
}
/** An authored function statement; receiver/member definitions do not write
 * their receiver's global. Scope is AST block identity, so separate branch
 * arms are distinguishable without reconstructing a scope system. */
export interface LuauFunctionDefinition extends NameRange {
  name: string;
  target: AstExpr | AstLocal;
  local?: AstLocal;
  receiver?: AstExpr;
  method: boolean;
  function: AstExprFunction;
  node: AstStatFunction | AstStatLocalFunction;
  scope?: AstStatBlock;
  enclosingFunction?: AstExprFunction;
}
export interface LuauNameFacts {
  declarations: LuauNameDeclaration[];
  references: LuauNameReference[];
  globals: LuauGlobalDefinition[];
  functions: LuauFunctionDefinition[];
  /** Syntax occurrences absent from the AST. They establish no read, write
   * or binding; absence-based conclusions must conservatively consult them. */
  uncertainNames: LuauUncertainName[];
  /** The document offset where each authored function begins. */
  functionStarts: Map<AstExprFunction, number>;
}
export interface LuauUncertainName extends NameRange {
  name: string;
  reason: "grammar-keyword";
}
export interface NameRoot {
  root: AstNode;
  offsets: { range(location: Location): NameRange };
  /** The converter's flow wrapper, identified by unit provenance, never by name. */
  syntheticFunction?: AstStatLocalFunction;
  /** The root is the body of a function (a Sparkle handler's statements), so a `const` in it is a local, never the story's published constant. */
  functionBody?: boolean;
}

/** Missing identifiers have this recovery name in the converter, never in authored code. */
export function isAuthoredLuauName(name: string): boolean {
  return !name.includes("%error-id%");
}

/** Names over the existing converter AST. The walk classifies assignment
 * targets without treating their receivers/indexes as written, and keeps
 * AstLocal identity rather than resolving names with another scope reader. */
export function collectNameFacts(roots: NameRoot[], text: string): LuauNameFacts {
  const facts: LuauNameFacts = { declarations: [], references: [], globals: [], functions: [], uncertainNames: [], functionStarts: new Map() };
  const seen = new Set<AstNode>();
  const locals = new Set<AstLocal>();
  // The consts declared outside every function, the story's published
  // constants (`lower/utils/publishesConst.ts`), each declared before any
  // name that reads it.
  const published = new Set<AstLocal>();
  for (const { root, offsets, syntheticFunction, functionBody } of roots) {
    let enclosingFunction: AstExprFunction | undefined;
    let enclosingFunctions: readonly AstExprFunction[] = [];
    // The globals plain writes of `enclosingFunction` have written so far,
    // and whether the walk is inside one of its `if`s or loops, whose
    // writes may not run (Luau's `dominatedGlobals`, `conditionalExecution`).
    let written: Set<string> | undefined;
    let conditional = false;
    let inType = false;
    let scope: AstStatBlock | undefined;
    // Blocks entered below the unit's own (its root or its flow wrapper's body).
    let nested = 0;
    const unitBlocks = new Set<AstNode>([root]);
    if (syntheticFunction) unitBlocks.add(syntheticFunction.func.body);
    // A flow's checking wrapper has no runtime binding. Keep the original
    // expression node while classifying accesses to that exact binding as
    // globals; a real authored local of the same spelling remains local.
    const binding = (node: AstExprLocal | AstExprGlobal): AstLocal | undefined => {
      let local = node instanceof AstExprLocal ? node.local : undefined;
      // A const outside every function is global at runtime. Its
      // checking-only local preserves the binding it shadows, which still
      // wins over that global at runtime. A const in a function is a local.
      while (local && published.has(local)) local = local.shadow;
      return local === syntheticFunction?.name ? undefined : local;
    };
    const declaration = (local: AstLocal, kind: LuauNameDeclaration["kind"], fn?: AstExprFunction, stat?: AstNode, declarationScope = scope) => {
      if (!isAuthoredLuauName(local.name)) return;
      if (locals.has(local)) return;
      locals.add(local);
      if (local.isConst && !enclosingFunction && !functionBody) {
        published.add(local);
        facts.globals.push({ name: local.name, kind: "const", ...offsets.range(local.location), node: stat ?? fn ?? root, enclosingFunction, function: fn, scope: declarationScope });
      }
      else facts.declarations.push({ name: local.name, local, kind, ...offsets.range(local.location), enclosingFunction, function: fn, scope: declarationScope, outermost: !enclosingFunction && !functionBody && nested === 0 && (kind === "local" || kind === "function"), scopeTo: declarationScope && offsets.range(declarationScope.location).to });
    };
    const reference = (node: AstExprGlobal | AstExprLocal, access: LuauNameReference["access"]) => {
      const local = binding(node);
      const name = node instanceof AstExprLocal ? node.local.name : node.name;
      if (!isAuthoredLuauName(name)) return;
      const found: LuauNameReference = { name, node, local, access, ...offsets.range(node.location), enclosingFunction, enclosingFunctions };
      if (!local && access !== "write" && written?.has(name)) found.dominated = true;
      if (inType) found.inType = true;
      facts.references.push(found);
    };
    const target = (expr: AstExpr, access: "write" | "readwrite", stat: AstNode, fn?: AstExprFunction, explicitStore = false): void => {
      if (expr instanceof AstExprError && expr.expressions.length === 1) return target(expr.expressions[0]!, access, stat, fn, explicitStore);
      if (expr instanceof AstExprLocal || expr instanceof AstExprGlobal) {
        if (!isAuthoredLuauName(expr instanceof AstExprLocal ? expr.local.name : expr.name)) return;
        reference(expr, access);
        if (!binding(expr)) {
          const range = offsets.range(expr.location);
          // Store lowering retains the original statement location; the
          // store-function form likewise starts at its authored keyword.
          const start = offsets.range(stat.location).from;
          const store = explicitStore || /^store\b/.test(text.slice(start, start + 6));
          facts.globals.push({ name: expr instanceof AstExprGlobal ? expr.name : expr.local.name, kind: store ? "store" : fn ? "function" : "assignment", node: stat, ...range, enclosingFunction, function: fn, scope });
        }
      } else visitAst(expr, visitor);
    };
    /** The global a plain assignment target names, if it names one. */
    const globalTarget = (expr: AstExpr): string | undefined => {
      if (expr instanceof AstExprError && expr.expressions.length === 1) return globalTarget(expr.expressions[0]!);
      if (expr instanceof AstExprGlobal) return expr.name;
      if (expr instanceof AstExprLocal && !binding(expr)) return expr.local.name;
      return undefined;
    };
    const visitor = {
      visit(node: AstNode): boolean {
        // A type, and an `if` or a loop in a function, are walked again
        // with their flag set, before `seen` records them.
        if ((node instanceof AstType || node instanceof AstTypePack) && !inType && !seen.has(node)) {
          inType = true;
          visitAst(node, visitor);
          inType = false;
          return false;
        }
        if (written && !conditional && !seen.has(node) && (node instanceof AstStatIf || node instanceof AstStatWhile || node instanceof AstStatRepeat || node instanceof AstStatFor || node instanceof AstStatForIn)) {
          conditional = true;
          visitAst(node, visitor);
          conditional = false;
          return false;
        }
        if (seen.has(node)) return false;
        seen.add(node);
        if (node instanceof AstStatBlock) {
          const outer = scope;
          const inner = !unitBlocks.has(node);
          scope = node;
          if (inner) nested++;
          for (const stat of node.body) visitAst(stat, visitor);
          if (inner) nested--;
          scope = outer;
          return false;
        }
        if (node instanceof AstExprFunction) {
          const outer = { enclosingFunction, enclosingFunctions, written, conditional };
          if (node !== syntheticFunction?.func) {
            enclosingFunction = node;
            enclosingFunctions = [...enclosingFunctions, node];
            written = new Set();
            conditional = false;
            facts.functionStarts.set(node, offsets.range(node.location).from);
          }
          if (node.self) declaration(node.self, "parameter", undefined, node, node.body);
          for (const local of node.args) declaration(local, "parameter", undefined, node, node.body);
          for (const local of node.args) if (local.annotation) visitAst(local.annotation, visitor);
          if (node.varargAnnotation) visitAst(node.varargAnnotation, visitor);
          if (node.returnAnnotation) visitAst(node.returnAnnotation, visitor);
          visitAst(node.body, visitor);
          ({ enclosingFunction, enclosingFunctions, written, conditional } = outer);
          return false;
        }
        if (node instanceof AstStatLocal) for (let i = 0; i < node.vars.length; i++) declaration(node.vars[i]!, "local", node.values[i] instanceof AstExprFunction ? node.values[i] as AstExprFunction : undefined, node);
        else if (node instanceof AstStatLocalFunction && node !== syntheticFunction) {
          declaration(node.name, "function", node.func, node);
          if (isAuthoredLuauName(node.name.name)) facts.functions.push({ name: node.name.name, target: node.name, local: node.name.isConst && !enclosingFunction && !functionBody ? undefined : node.name, method: false, function: node.func, node, scope, enclosingFunction, ...offsets.range(node.name.location) });
        }
        else if (node instanceof AstStatFor) declaration(node.variable, "loop", undefined, node, node.body);
        else if (node instanceof AstStatForIn) for (const local of node.vars) declaration(local, "loop", undefined, node, node.body);
        else if (node instanceof AstStatAssign || node instanceof AstStatSparkdownStore) {
          for (let i = 0; i < node.vars.length; i++) target(node.vars[i]!, "write", node, node.values[i] instanceof AstExprFunction ? node.values[i] as AstExprFunction : undefined, node instanceof AstStatSparkdownStore);
          if (node instanceof AstStatSparkdownStore) for (const annotation of node.annotations) if (annotation) visitAst(annotation, visitor);
          for (const value of node.values) visitAst(value, visitor);
          // Luau marks the targets written before it reads the values; they
          // are marked after, so `x = x + 1` still reads `x` first.
          if (node instanceof AstStatAssign && written && !conditional) {
            for (const variable of node.vars) {
              const name = globalTarget(variable);
              if (name) written.add(name);
            }
          }
          return false;
        } else if (node instanceof AstStatCompoundAssign) {
          target(node.variable, "readwrite", node);
          visitAst(node.value, visitor);
          return false;
        } else if (node instanceof AstStatFunction) {
          const name = getFunctionNameAsString(node.name);
          if (name && isAuthoredLuauName(name)) facts.functions.push({ name, target: node.name, local: node.name instanceof AstExprLocal ? binding(node.name) : undefined, receiver: node.name instanceof AstExprIndexName ? node.name.expr : undefined, method: !!node.func.self, function: node.func, node, scope, enclosingFunction, ...offsets.range(node.name.location) });
          target(node.name, "write", node, node.func);
          visitAst(node.func, visitor);
          return false;
        } else if (node instanceof AstExprLocal || node instanceof AstExprGlobal) reference(node, "read");
        return true;
      },
    };
    visitAst(root, visitor);
  }
  facts.references.sort((a, b) => a.from - b.from || a.to - b.to);
  facts.globals.sort((a, b) => a.from - b.from || a.to - b.to);
  return facts;
}

export type ProgramNameReference = LuauNameReference & { uri: string };
export type ProgramGlobalDefinition = LuauGlobalDefinition & { uri: string };
export type ProgramUncertainName = LuauUncertainName & { uri: string };
export interface ProgramGlobalName {
  definitions: ProgramGlobalDefinition[];
  reads: ProgramNameReference[];
  writes: ProgramNameReference[];
}
export interface LuauProgramNames {
  scripts: Map<string, LuauNameFacts>;
  globals: Map<string, ProgramGlobalName>;
  functions: (LuauFunctionDefinition & { uri: string })[];
  /** Kept separate: an uncertain occurrence cannot establish a global use. */
  uncertainNames: Map<string, ProgramUncertainName[]>;
}

/** Recombine the current script set each time: no removed script/use survives
 * an edit, and unchanged scripts retain their cached AST/binding identities. */
export function indexProgramNames(scripts: Iterable<{ uri: string; names: LuauNameFacts }>): LuauProgramNames {
  const index: LuauProgramNames = { scripts: new Map(), globals: new Map(), functions: [], uncertainNames: new Map() };
  const global = (name: string) => {
    let found = index.globals.get(name);
    if (!found) index.globals.set(name, found = { definitions: [], reads: [], writes: [] });
    return found;
  };
  for (const { uri, names } of scripts) {
    index.scripts.set(uri, names);
    for (const occurrence of names.uncertainNames) {
      let list = index.uncertainNames.get(occurrence.name);
      if (!list) index.uncertainNames.set(occurrence.name, list = []);
      list.push({ ...occurrence, uri });
    }
    for (const definition of names.functions) index.functions.push({ ...definition, uri });
    for (const definition of names.globals) global(definition.name).definitions.push({ ...definition, uri });
    for (const reference of names.references) {
      if (reference.local) continue;
      const entry = global(reference.name);
      const located = { ...reference, uri };
      if (reference.access !== "write") entry.reads.push(located);
      if (reference.access !== "read") entry.writes.push(located);
    }
  }
  return index;
}
