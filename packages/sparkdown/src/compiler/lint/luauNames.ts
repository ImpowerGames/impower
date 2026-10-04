import {
  AstExpr, AstExprError, AstExprFunction, AstExprGlobal, AstExprIndexName, AstExprLocal,
  AstStatBlock, getFunctionNameAsString,
  AstStatAssign, AstStatCompoundAssign, AstStatFor, AstStatForIn,
  AstStatFunction, AstStatLocal, AstStatLocalFunction, visitAst,
  type AstLocal, type AstNode,
} from "../typecheck/Ast";
import type { Location } from "../typecheck/Location";

export interface NameRange { from: number; to: number }
export interface LuauNameReference extends NameRange {
  name: string;
  node: AstExprGlobal | AstExprLocal;
  /** The converter's binding identity; absent for runtime globals, including const. */
  local?: AstLocal;
  access: "read" | "write" | "readwrite";
  enclosingFunction?: AstExprFunction;
}
export interface LuauNameDeclaration extends NameRange {
  name: string;
  local: AstLocal;
  kind: "local" | "parameter" | "loop" | "function";
  enclosingFunction?: AstExprFunction;
  function?: AstExprFunction;
  scope?: AstStatBlock;
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
}
export interface NameRoot {
  root: AstNode;
  offsets: { range(location: Location): NameRange };
}

/** Missing identifiers have this recovery name in the converter, never in authored code. */
export function isAuthoredLuauName(name: string): boolean {
  return !name.includes("%error-id%");
}

/** Names over the existing converter AST. The walk classifies assignment
 * targets without treating their receivers/indexes as written, and keeps
 * AstLocal identity rather than resolving names with another scope reader. */
export function collectNameFacts(roots: NameRoot[], text: string): LuauNameFacts {
  const facts: LuauNameFacts = { declarations: [], references: [], globals: [], functions: [] };
  const seen = new Set<AstNode>();
  const locals = new Set<AstLocal>();
  for (const { root, offsets } of roots) {
    let enclosingFunction: AstExprFunction | undefined;
    let scope: AstStatBlock | undefined;
    const declaration = (local: AstLocal, kind: LuauNameDeclaration["kind"], fn?: AstExprFunction, stat?: AstNode, declarationScope = scope) => {
      if (!isAuthoredLuauName(local.name)) return;
      if (locals.has(local)) return;
      locals.add(local);
      if (local.isConst) facts.globals.push({ name: local.name, kind: "const", ...offsets.range(local.location), node: stat ?? fn ?? root, enclosingFunction, function: fn, scope: declarationScope });
      else facts.declarations.push({ name: local.name, local, kind, ...offsets.range(local.location), enclosingFunction, function: fn, scope: declarationScope });
    };
    const reference = (node: AstExprGlobal | AstExprLocal, access: LuauNameReference["access"]) => {
      const local = node instanceof AstExprLocal && !node.local.isConst ? node.local : undefined;
      const name = node instanceof AstExprLocal ? node.local.name : node.name;
      if (!isAuthoredLuauName(name)) return;
      facts.references.push({ name, node, local, access, ...offsets.range(node.location), enclosingFunction });
    };
    const target = (expr: AstExpr, access: "write" | "readwrite", stat: AstNode, fn?: AstExprFunction): void => {
      if (expr instanceof AstExprError && expr.expressions.length === 1) return target(expr.expressions[0]!, access, stat, fn);
      if (expr instanceof AstExprLocal || expr instanceof AstExprGlobal) {
        if (!isAuthoredLuauName(expr instanceof AstExprLocal ? expr.local.name : expr.name)) return;
        reference(expr, access);
        if (expr instanceof AstExprGlobal || expr.local.isConst) {
          const range = offsets.range(expr.location);
          // Store lowering retains the original statement location; the
          // store-function form likewise starts at its authored keyword.
          const start = offsets.range(stat.location).from;
          const store = /^store\b/.test(text.slice(start, start + 6));
          facts.globals.push({ name: expr instanceof AstExprGlobal ? expr.name : expr.local.name, kind: store ? "store" : fn ? "function" : "assignment", node: stat, ...range, enclosingFunction, function: fn, scope });
        }
      } else visitAst(expr, visitor);
    };
    const visitor = {
      visit(node: AstNode): boolean {
        if (seen.has(node)) return false;
        seen.add(node);
        if (node instanceof AstStatBlock) {
          const outer = scope;
          scope = node;
          for (const stat of node.body) visitAst(stat, visitor);
          scope = outer;
          return false;
        }
        if (node instanceof AstExprFunction) {
          const outer = enclosingFunction;
          enclosingFunction = node;
          if (node.self) declaration(node.self, "parameter", undefined, node, node.body);
          for (const local of node.args) declaration(local, "parameter", undefined, node, node.body);
          for (const local of node.args) if (local.annotation) visitAst(local.annotation, visitor);
          if (node.varargAnnotation) visitAst(node.varargAnnotation, visitor);
          if (node.returnAnnotation) visitAst(node.returnAnnotation, visitor);
          visitAst(node.body, visitor);
          enclosingFunction = outer;
          return false;
        }
        if (node instanceof AstStatLocal) for (let i = 0; i < node.vars.length; i++) declaration(node.vars[i]!, "local", node.values[i] instanceof AstExprFunction ? node.values[i] as AstExprFunction : undefined, node);
        else if (node instanceof AstStatLocalFunction) {
          declaration(node.name, "function", node.func, node);
          if (isAuthoredLuauName(node.name.name)) facts.functions.push({ name: node.name.name, target: node.name, local: node.name.isConst ? undefined : node.name, method: false, function: node.func, node, scope, enclosingFunction, ...offsets.range(node.name.location) });
        }
        else if (node instanceof AstStatFor) declaration(node.variable, "loop", undefined, node, node.body);
        else if (node instanceof AstStatForIn) for (const local of node.vars) declaration(local, "loop", undefined, node, node.body);
        else if (node instanceof AstStatAssign) {
          for (let i = 0; i < node.vars.length; i++) target(node.vars[i]!, "write", node, node.values[i] instanceof AstExprFunction ? node.values[i] as AstExprFunction : undefined);
          for (const value of node.values) visitAst(value, visitor);
          return false;
        } else if (node instanceof AstStatCompoundAssign) {
          target(node.variable, "readwrite", node);
          visitAst(node.value, visitor);
          return false;
        } else if (node instanceof AstStatFunction) {
          const name = getFunctionNameAsString(node.name);
          if (name && isAuthoredLuauName(name)) facts.functions.push({ name, target: node.name, local: node.name instanceof AstExprLocal ? node.name.local : undefined, receiver: node.name instanceof AstExprIndexName ? node.name.expr : undefined, method: !!node.func.self, function: node.func, node, scope, enclosingFunction, ...offsets.range(node.name.location) });
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
export interface ProgramGlobalName {
  definitions: ProgramGlobalDefinition[];
  reads: ProgramNameReference[];
  writes: ProgramNameReference[];
}
export interface LuauProgramNames {
  scripts: Map<string, LuauNameFacts>;
  globals: Map<string, ProgramGlobalName>;
  functions: (LuauFunctionDefinition & { uri: string })[];
}

/** Recombine the current script set each time: no removed script/use survives
 * an edit, and unchanged scripts retain their cached AST/binding identities. */
export function indexProgramNames(scripts: Iterable<{ uri: string; names: LuauNameFacts }>): LuauProgramNames {
  const index: LuauProgramNames = { scripts: new Map(), globals: new Map(), functions: [] };
  const global = (name: string) => {
    let found = index.globals.get(name);
    if (!found) index.globals.set(name, found = { definitions: [], reads: [], writes: [] });
    return found;
  };
  for (const { uri, names } of scripts) {
    index.scripts.set(uri, names);
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
