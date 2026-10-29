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
  local?: AstLocal;
  access: "read" | "write" | "readwrite";
  enclosingFunction?: AstExprFunction;
  enclosingFunctions: readonly AstExprFunction[];
  dominated?: boolean;
  inType?: boolean;
}
export interface LuauNameDeclaration extends NameRange {
  name: string;
  local: AstLocal;
  kind: "local" | "parameter" | "loop" | "function";
  enclosingFunction?: AstExprFunction;
  function?: AstExprFunction;
  scope?: AstStatBlock;
  outermost?: boolean;
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
  uncertainNames: LuauUncertainName[];
  functionStarts: Map<AstExprFunction, number>;
}
export interface LuauUncertainName extends NameRange {
  name: string;
  reason: "grammar-keyword";
}
export interface NameRoot {
  root: AstNode;
  offsets: { range(location: Location): NameRange };
  syntheticFunction?: AstStatLocalFunction;
  functionBody?: boolean;
}

export function isAuthoredLuauName(name: string): boolean {
  return !name.includes("%error-id%");
}

export function collectNameFacts(roots: NameRoot[], text: string): LuauNameFacts {
  const facts: LuauNameFacts = { declarations: [], references: [], globals: [], functions: [], uncertainNames: [], functionStarts: new Map() };
  const seen = new Set<AstNode>();
  const locals = new Set<AstLocal>();
  const published = new Set<AstLocal>();
  for (const { root, offsets, syntheticFunction, functionBody } of roots) {
    let enclosingFunction: AstExprFunction | undefined;
    let enclosingFunctions: readonly AstExprFunction[] = [];
    let written: Set<string> | undefined;
    let conditional = false;
    let inType = false;
    let scope: AstStatBlock | undefined;
    let nested = 0;
    const unitBlocks = new Set<AstNode>([root]);
    if (syntheticFunction) unitBlocks.add(syntheticFunction.func.body);
    const binding = (node: AstExprLocal | AstExprGlobal): AstLocal | undefined => {
      let local = node instanceof AstExprLocal ? node.local : undefined;
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
          const start = offsets.range(stat.location).from;
          const store = explicitStore || /^store\b/.test(text.slice(start, start + 6));
          facts.globals.push({ name: expr instanceof AstExprGlobal ? expr.name : expr.local.name, kind: store ? "store" : fn ? "function" : "assignment", node: stat, ...range, enclosingFunction, function: fn, scope });
        }
      } else visitAst(expr, visitor);
    };
    const globalTarget = (expr: AstExpr): string | undefined => {
      if (expr instanceof AstExprError && expr.expressions.length === 1) return globalTarget(expr.expressions[0]!);
      if (expr instanceof AstExprGlobal) return expr.name;
      if (expr instanceof AstExprLocal && !binding(expr)) return expr.local.name;
      return undefined;
    };
    const visitor = {
      visit(node: AstNode): boolean {
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
  uncertainNames: Map<string, ProgramUncertainName[]>;
}

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
