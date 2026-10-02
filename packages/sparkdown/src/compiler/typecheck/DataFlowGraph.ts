// The data-flow graph, ported from Luau's `DataFlowGraph.h`/`.cpp`; Luau is
// MIT-licensed (see `LICENSE-luau.txt`).
//
// It gives every expression a def (a symbolic value) and records how defs
// flow between places: a new def at each assignment, phis where branches
// join, and the property defs of tables. The constraint generator keys
// assignment types and refinements on these defs.

import {
  AstExpr,
  AstExprBinary,
  AstExprCall,
  AstExprConstantBool,
  AstExprConstantNil,
  AstExprConstantNumber,
  AstExprConstantString,
  AstExprError,
  AstExprFunction,
  AstExprGlobal,
  AstExprGroup,
  AstExprIfElse,
  AstExprIndexExpr,
  AstExprIndexName,
  AstExprInstantiate,
  AstExprInterpString,
  AstExprLocal,
  AstExprTable,
  AstExprTypeAssertion,
  AstExprUnary,
  AstExprVarargs,
  AstLocal,
  AstStat,
  AstStatAssign,
  AstStatBlock,
  AstStatBreak,
  AstStatCompoundAssign,
  AstStatContinue,
  AstStatDeclareExternType,
  AstStatDeclareFunction,
  AstStatDeclareGlobal,
  AstStatError,
  AstStatExpr,
  AstStatFor,
  AstStatForIn,
  AstStatFunction,
  AstStatIf,
  AstStatLocal,
  AstStatLocalFunction,
  AstStatRepeat,
  AstStatReturn,
  AstStatTypeAlias,
  AstStatTypeFunction,
  AstStatWhile,
  AstType,
  AstTypeError,
  AstTypeFunction,
  AstTypeGroup,
  AstTypeIntersection,
  AstTypePack,
  AstTypePackExplicit,
  AstTypePackVariadic,
  AstTypeReference,
  AstTypeTable,
  AstTypeTypeof,
  AstTypeUnion,
  BinaryOp,
  type AstGenericType,
  type AstGenericTypePack,
  type AstTypeList,
} from "./Ast";
import { collectOperands, containsSubscriptedDefinition, DefArena, getPhi, RefinementKeyArena, type DefId, type LuauSymbol, type RefinementKey } from "./Def";
import type { Location } from "./Location";
import { sparkdownValue } from "./SparkdownReading";

export const enum ControlFlow {
  None = 0b00001,
  Returns = 0b00010,
  Throws = 0b00100,
  Breaks = 0b01000,
  Continues = 0b10000,
}

export function matches(a: ControlFlow, b: number): boolean {
  return (a & b) !== 0;
}

/** Whether a call always raises an error: `error(...)`, `assert()` or `assert(false, ...)`. */
export function doesCallError(call: AstExprCall): boolean {
  const global = call.func instanceof AstExprGlobal ? call.func : undefined;
  if (!global) return false;
  if (global.name === "error") return true;
  if (global.name === "assert") {
    if (call.args.length === 0) return true;
    const first = call.args[0];
    if (first instanceof AstExprConstantBool && !first.value) return true;
  }
  return false;
}

export function isLValue(expr: AstExpr): boolean {
  return expr instanceof AstExprLocal || expr instanceof AstExprGlobal || expr instanceof AstExprIndexName || expr instanceof AstExprIndexExpr;
}

/** `table.freeze(x)`: the call whose first argument is re-typed by the call (Luau's `matchTableFreeze`). */
export function matchTableFreeze(call: AstExprCall): boolean {
  if (call.args.length < 1) return false;
  const index = call.func instanceof AstExprIndexName ? call.func : undefined;
  if (!index || index.index !== "freeze") return false;
  return index.expr instanceof AstExprGlobal && index.expr.name === "table";
}

export function shouldTypestateForFirstArgument(call: AstExprCall): boolean {
  return matchTableFreeze(call);
}

export class DataFlowGraph {
  readonly astDefs = new Map<AstExpr, DefId>();
  readonly localDefs = new Map<AstLocal, DefId>();
  readonly declaredDefs = new Map<AstStat, DefId>();
  readonly defToSymbol = new Map<DefId, LuauSymbol>();
  readonly astRefinementKeys = new Map<AstExpr, RefinementKey>();

  constructor(
    readonly defArena: DefArena,
    readonly keyArena: RefinementKeyArena,
  ) {}

  getDef(expr: AstExpr): DefId {
    const def = this.astDefs.get(expr);
    if (!def) throw new Error("DataFlowGraph: no def for an expression");
    return def;
  }

  getDefOptional(expr: AstExpr): DefId | undefined {
    return this.astDefs.get(expr);
  }

  getLocalDef(local: AstLocal): DefId {
    const def = this.localDefs.get(local);
    if (!def) throw new Error(`DataFlowGraph: no def for local ${local.name}`);
    return def;
  }

  getDeclaredDef(stat: AstStat): DefId {
    const def = this.declaredDefs.get(stat);
    if (!def) throw new Error("DataFlowGraph: no def for a declaration");
    return def;
  }

  getRefinementKey(expr: AstExpr): RefinementKey | undefined {
    return this.astRefinementKeys.get(expr);
  }

  getSymbolFromDef(def: DefId): LuauSymbol | undefined {
    return this.defToSymbol.get(def);
  }
}

const enum DfgScopeType {
  Linear,
  Loop,
  Function,
}

class DfgScope {
  readonly bindings = new Map<LuauSymbol, DefId>();
  readonly props = new Map<DefId, Map<string, DefId>>();

  constructor(
    readonly parent: DfgScope | undefined,
    readonly scopeType: DfgScopeType,
  ) {}

  lookup(symbol: LuauSymbol): DefId | undefined {
    for (let current: DfgScope | undefined = this; current; current = current.parent) {
      const def = current.bindings.get(symbol);
      if (def) return def;
    }
    return undefined;
  }

  lookupProp(def: DefId, key: string): DefId | undefined {
    for (let current: DfgScope | undefined = this; current; current = current.parent) {
      const found = current.props.get(def)?.get(key);
      if (found) return found;
    }
    return undefined;
  }

  propsOf(def: DefId): Map<string, DefId> {
    let p = this.props.get(def);
    if (!p) this.props.set(def, (p = new Map()));
    return p;
  }

  inherit(childScope: DfgScope): void {
    for (const [k, a] of childScope.bindings) {
      if (this.lookup(k)) this.bindings.set(k, a);
    }
    for (const [k1, a1] of childScope.props) {
      const mine = this.propsOf(k1);
      for (const [k2, a2] of a1) mine.set(k2, a2);
    }
  }
}

interface DataFlowResult {
  def: DefId;
  parent?: RefinementKey;
}

interface FunctionCapture {
  captureDefs: DefId[];
  allVersions: DefId[];
  versionOffset: number;
}

export class DataFlowGraphBuilder {
  private readonly graph: DataFlowGraph;
  private readonly scopeStack: DfgScope[] = [];
  private readonly captures = new Map<LuauSymbol, FunctionCapture>();

  private constructor(
    private readonly defArena: DefArena,
    private readonly keyArena: RefinementKeyArena,
  ) {
    this.graph = new DataFlowGraph(defArena, keyArena);
  }

  static build(block: AstStatBlock, defArena = new DefArena(), keyArena = new RefinementKeyArena()): DataFlowGraph {
    const builder = new DataFlowGraphBuilder(defArena, keyArena);
    const moduleScope = new DfgScope(undefined, DfgScopeType.Linear);
    builder.scopeStack.push(moduleScope);
    builder.visitBlockWithoutChildScope(block);
    builder.resolveCaptures();
    return builder.graph;
  }

  private capture(symbol: LuauSymbol): FunctionCapture {
    let c = this.captures.get(symbol);
    if (!c) this.captures.set(symbol, (c = { captureDefs: [], allVersions: [], versionOffset: 0 }));
    return c;
  }

  private resolveCaptures(): void {
    for (const capture of this.captures.values()) {
      const operands: DefId[] = [];
      for (let i = capture.versionOffset; i < capture.allVersions.length; ++i) {
        collectOperands(capture.allVersions[i]!, operands);
      }
      for (const captureDef of capture.captureDefs) {
        const phi = getPhi(captureDef)!;
        phi.operands = operands;
      }
    }
  }

  private currentScope(): DfgScope {
    return this.scopeStack[this.scopeStack.length - 1]!;
  }

  private makeChildScope(scopeType = DfgScopeType.Linear): DfgScope {
    return new DfgScope(this.currentScope(), scopeType);
  }

  private withScope<T>(scope: DfgScope, f: () => T): T {
    const previousSize = this.scopeStack.length;
    this.scopeStack.push(scope);
    try {
      return f();
    } finally {
      this.scopeStack.length = previousSize;
    }
  }

  private join(p: DfgScope, a: DfgScope, b: DfgScope): void {
    this.joinBindings(p, a, b);
    this.joinProps(p, a, b);
  }

  private joinBindings(p: DfgScope, a: DfgScope, b: DfgScope): void {
    const join = (sym: LuauSymbol, def1: DefId, def2: DefId) => {
      // Refinements are keyed on defs, so a trivial phi would break them.
      if (def1 === def2) p.bindings.set(sym, def1);
      else p.bindings.set(sym, this.defArena.phi([def1, def2]));
    };
    for (const [sym, def1] of [...a.bindings]) {
      const def2 = b.bindings.get(sym);
      if (def2) join(sym, def1, def2);
      else {
        const def3 = p.lookup(sym);
        if (def3) join(sym, def1, def3);
      }
    }
    for (const [sym, def1] of [...b.bindings]) {
      const def2 = p.lookup(sym);
      if (def2) join(sym, def1, def2);
    }
  }

  private joinProps(result: DfgScope, a: DfgScope, b: DfgScope): void {
    const phinodify = (scope: DfgScope, pa: Map<string, DefId>, pb: Map<string, DefId>, parent: DefId) => {
      const p = scope.propsOf(parent);
      for (const [k, defA] of [...pa]) {
        const inB = pb.get(k);
        const inP = p.get(k);
        if (inB) p.set(k, this.defArena.phi([inB, defA]));
        else if (inP) p.set(k, this.defArena.phi([inP, defA]));
        else {
          const def2 = scope.lookupProp(parent, k);
          p.set(k, def2 ? this.defArena.phi([def2, defA]) : defA);
        }
      }
      for (const [k, defB] of [...pb]) {
        if (pa.has(k)) continue;
        const inP = p.get(k);
        if (inP) p.set(k, this.defArena.phi([inP, defB]));
        else {
          const def2 = scope.lookupProp(parent, k);
          p.set(k, def2 ? this.defArena.phi([def2, defB]) : defB);
        }
      }
    };
    for (const [def, a1] of [...a.props]) {
      if (!result.props.has(def)) result.props.set(def, new Map());
      const a2 = b.props.get(def);
      if (a2) phinodify(result, a1, a2, def);
      else {
        const r = result.props.get(def);
        if (r) phinodify(result, a1, r, def);
      }
    }
    for (const [def, a1] of [...b.props]) {
      if (!result.props.has(def)) result.props.set(def, new Map());
      if (a.props.has(def)) continue;
      const r = result.props.get(def);
      if (r) phinodify(result, a1, r, def);
    }
  }

  private lookup(symbol: LuauSymbol, location: Location): DefId {
    const scope = this.currentScope();
    // Whether any of the scopes considered is a loop.
    let outsideLoopScope = false;
    for (let current: DfgScope | undefined = scope; current; current = current.parent) {
      outsideLoopScope = outsideLoopScope || current.scopeType === DfgScopeType.Loop;
      const found = current.bindings.get(symbol);
      if (found) return found;
      if (current.scopeType === DfgScopeType.Function) {
        const capture = this.capture(symbol);
        const captureDef = this.defArena.phi([]);
        capture.captureDefs.push(captureDef);
        // Outside a loop the new phi is never populated, so uses are not bound to it.
        if (!outsideLoopScope) scope.bindings.set(symbol, captureDef);
        return captureDef;
      }
    }
    const result = this.defArena.freshCell(symbol, location);
    scope.bindings.set(symbol, result);
    this.capture(symbol).allVersions.push(result);
    return result;
  }

  private lookupProp(def: DefId, key: string, location: Location): DefId {
    const scope = this.currentScope();
    for (let current: DfgScope | undefined = scope; current; current = current.parent) {
      const props = current.props.get(def);
      if (props) {
        const found = props.get(key);
        if (found) return found;
      } else {
        const phi = getPhi(def);
        if (phi && phi.operands.length === 0 && current.scopeType === DfgScopeType.Function) {
          const result = this.defArena.freshCell(def.name, location);
          scope.propsOf(def).set(key, result);
          return result;
        }
      }
    }
    const phi = getPhi(def);
    if (phi) {
      const defs = phi.operands.map((operand) => this.lookupProp(operand, key, location));
      const result = this.defArena.phi(defs);
      scope.propsOf(def).set(key, result);
      return result;
    }
    const result = this.defArena.freshCell(def.name, location);
    scope.propsOf(def).set(key, result);
    return result;
  }

  private visitBlock(b: AstStatBlock): ControlFlow {
    const child = this.makeChildScope();
    const cf = this.withScope(child, () => this.visitBlockWithoutChildScope(b));
    this.currentScope().inherit(child);
    return cf;
  }

  private visitBlockWithoutChildScope(b: AstStatBlock): ControlFlow {
    let firstControlFlow: ControlFlow | undefined;
    for (const stat of b.body) {
      const cf = this.visitStat(stat);
      if (cf !== ControlFlow.None && firstControlFlow === undefined) firstControlFlow = cf;
    }
    return firstControlFlow ?? ControlFlow.None;
  }

  private visitStat(s: AstStat): ControlFlow {
    if (s instanceof AstStatBlock) return this.visitBlock(s);
    if (s instanceof AstStatIf) return this.visitIf(s);
    if (s instanceof AstStatWhile) return this.visitWhile(s);
    if (s instanceof AstStatRepeat) return this.visitRepeat(s);
    if (s instanceof AstStatBreak) return ControlFlow.Breaks;
    if (s instanceof AstStatContinue) return ControlFlow.Continues;
    if (s instanceof AstStatReturn) {
      for (const e of s.list) this.visitExpr(e);
      return ControlFlow.Returns;
    }
    if (s instanceof AstStatExpr) {
      this.visitExpr(s.expr);
      if (s.expr instanceof AstExprCall && doesCallError(s.expr)) return ControlFlow.Throws;
      return ControlFlow.None;
    }
    if (s instanceof AstStatLocal) return this.visitLocal(s);
    if (s instanceof AstStatFor) return this.visitFor(s);
    if (s instanceof AstStatForIn) return this.visitForIn(s);
    if (s instanceof AstStatAssign) return this.visitAssign(s);
    if (s instanceof AstStatCompoundAssign) {
      this.visitExpr(s.value);
      this.visitExpr(s.variable);
      return ControlFlow.None;
    }
    if (s instanceof AstStatFunction) return this.visitFunctionStat(s);
    if (s instanceof AstStatLocalFunction) {
      const def = this.defArena.freshCell(s.name, s.location);
      this.graph.localDefs.set(s.name, def);
      this.currentScope().bindings.set(s.name, def);
      this.capture(s.name).allVersions.push(def);
      this.visitExpr(s.func);
      return ControlFlow.None;
    }
    if (s instanceof AstStatTypeAlias) {
      this.withScope(this.makeChildScope(), () => {
        this.visitGenerics(s.generics);
        this.visitGenericPacks(s.genericPacks);
        this.visitType(s.type);
      });
      return ControlFlow.None;
    }
    if (s instanceof AstStatTypeFunction) {
      this.withScope(this.makeChildScope(), () => this.visitExpr(s.body));
      return ControlFlow.None;
    }
    if (s instanceof AstStatDeclareGlobal) {
      const def = this.defArena.freshCell(s.name, s.nameLocation);
      this.graph.declaredDefs.set(s, def);
      this.currentScope().bindings.set(s.name, def);
      this.capture(s.name).allVersions.push(def);
      this.visitType(s.type);
      return ControlFlow.None;
    }
    if (s instanceof AstStatDeclareFunction) {
      const def = this.defArena.freshCell(s.name, s.nameLocation);
      this.graph.declaredDefs.set(s, def);
      this.currentScope().bindings.set(s.name, def);
      this.capture(s.name).allVersions.push(def);
      this.withScope(this.makeChildScope(), () => {
        this.visitGenerics(s.generics);
        this.visitGenericPacks(s.genericPacks);
        this.visitTypeList(s.params);
        this.visitTypePack(s.retTypes);
      });
      return ControlFlow.None;
    }
    if (s instanceof AstStatDeclareExternType) {
      this.withScope(this.makeChildScope(), () => {
        for (const prop of s.props) this.visitType(prop.ty);
      });
      return ControlFlow.None;
    }
    if (s instanceof AstStatError) {
      this.withScope(this.makeChildScope(), () => {
        for (const st of s.statements) this.visitStat(st);
        for (const e of s.expressions) this.visitExpr(e);
      });
      return ControlFlow.None;
    }
    throw new Error(`Unknown AstStat in DataFlowGraphBuilder: ${s.kind}`);
  }

  private visitIf(i: AstStatIf): ControlFlow {
    this.visitExpr(i.condition);
    const thenScope = this.makeChildScope();
    const elseScope = this.makeChildScope();
    const thencf = this.withScope(thenScope, () => this.visitBlock(i.thenbody));
    let elsecf = ControlFlow.None;
    if (i.elsebody) {
      const elsebody = i.elsebody;
      elsecf = this.withScope(elseScope, () => this.visitStat(elsebody));
    }
    const scope = this.currentScope();
    // When one branch leaves, the other is the one taken.
    if (thencf !== ControlFlow.None && elsecf === ControlFlow.None) scope.inherit(elseScope);
    else if (thencf === ControlFlow.None && elsecf !== ControlFlow.None) scope.inherit(thenScope);
    else if ((thencf | elsecf) === ControlFlow.None) this.join(scope, thenScope, elseScope);

    if (thencf === elsecf) return thencf;
    if (matches(thencf, ControlFlow.Returns | ControlFlow.Throws) && matches(elsecf, ControlFlow.Returns | ControlFlow.Throws)) {
      return ControlFlow.Returns;
    }
    return ControlFlow.None;
  }

  private visitWhile(w: AstStatWhile): ControlFlow {
    const whileScope = this.makeChildScope(DfgScopeType.Loop);
    const cf = this.withScope(whileScope, () => {
      this.visitExpr(w.condition);
      return this.visitBlock(w.body);
    });
    const scope = this.currentScope();
    if (!matches(cf, ControlFlow.Returns | ControlFlow.Throws)) this.join(scope, scope, whileScope);
    return ControlFlow.None;
  }

  private visitRepeat(r: AstStatRepeat): ControlFlow {
    const repeatScope = this.makeChildScope(DfgScopeType.Loop);
    const cf = this.withScope(repeatScope, () => {
      const c = this.visitBlockWithoutChildScope(r.body);
      this.visitExpr(r.condition);
      return c;
    });
    this.currentScope().inherit(repeatScope);
    return matches(cf, ControlFlow.Breaks | ControlFlow.Continues) ? ControlFlow.None : cf;
  }

  private visitLocal(l: AstStatLocal): ControlFlow {
    const defs = l.values.map((e) => this.visitExpr(e).def);
    l.vars.forEach((local, i) => {
      if (local.annotation) this.visitType(local.annotation);
      // A new def avoids alias tracking, but keeps whether the value was subscripted.
      const subscripted = i < defs.length && containsSubscriptedDefinition(defs[i]!);
      let def = this.defArena.freshCell(local, local.location, subscripted);
      const e = l.values[i];
      if (e instanceof AstExprTable) def = defs[i]!;
      this.graph.localDefs.set(local, def);
      this.currentScope().bindings.set(local, def);
      this.capture(local).allVersions.push(def);
    });
    return ControlFlow.None;
  }

  private visitFor(f: AstStatFor): ControlFlow {
    const forScope = this.makeChildScope(DfgScopeType.Loop);
    this.visitExpr(f.from);
    this.visitExpr(f.to);
    if (f.step) this.visitExpr(f.step);
    const cf = this.withScope(forScope, () => {
      if (f.variable.annotation) this.visitType(f.variable.annotation);
      const def = this.defArena.freshCell(f.variable, f.variable.location);
      this.graph.localDefs.set(f.variable, def);
      this.currentScope().bindings.set(f.variable, def);
      this.capture(f.variable).allVersions.push(def);
      return this.visitBlock(f.body);
    });
    const scope = this.currentScope();
    if (!matches(cf, ControlFlow.Returns | ControlFlow.Throws)) this.join(scope, scope, forScope);
    return ControlFlow.None;
  }

  private visitForIn(f: AstStatForIn): ControlFlow {
    const forScope = this.makeChildScope(DfgScopeType.Loop);
    const cf = this.withScope(forScope, () => {
      for (const local of f.vars) {
        if (local.annotation) this.visitType(local.annotation);
        const def = this.defArena.freshCell(local, local.location);
        this.graph.localDefs.set(local, def);
        this.currentScope().bindings.set(local, def);
        this.capture(local).allVersions.push(def);
      }
      for (const e of f.values) this.visitExpr(e);
      return this.visitBlock(f.body);
    });
    const scope = this.currentScope();
    if (!matches(cf, ControlFlow.Returns | ControlFlow.Throws)) this.join(scope, scope, forScope);
    return ControlFlow.None;
  }

  private visitAssign(a: AstStatAssign): ControlFlow {
    const defs = a.values.map((e) => this.visitExpr(e).def);
    a.vars.forEach((v, i) => {
      this.visitLValue(v, i < defs.length ? defs[i]! : this.defArena.freshCell(undefined, v.location));
    });
    return ControlFlow.None;
  }

  private visitFunctionStat(f: AstStatFunction): ControlFlow {
    // As in the old solver, the function's own name inside its body refers to the function.
    this.visitLValue(f.name, this.defArena.freshCell(undefined, f.name.location));

    // A reference to the function from inside its own body (a global, or one
    // property of a local) uses the ungeneralized function type.
    const signatureScope = this.makeChildScope(DfgScopeType.Function);
    this.withScope(signatureScope, () => {
      if (f.name instanceof AstExprGlobal) {
        signatureScope.bindings.set(f.name.name, this.graph.getDef(f.name));
      } else if (f.name instanceof AstExprIndexName && f.name.expr instanceof AstExprLocal) {
        const receiver = f.name.expr.local;
        signatureScope.propsOf(this.lookup(receiver, f.func.location)).set(f.name.index, this.graph.getDef(f.name));
      }
      this.visitFunction(f.func, signatureScope);
    });

    if (f.name instanceof AstExprLocal) {
      // A recursive reference sees only this version of the local and later ones.
      const capture = this.capture(f.name.local);
      capture.versionOffset = capture.allVersions.length - 1;
    }
    return ControlFlow.None;
  }

  visitExpr(e: AstExpr): DataFlowResult {
    // An expression can be visited twice; the second visit reuses the first's def.
    const existing = this.graph.astDefs.get(e);
    if (existing) return { def: existing, parent: this.graph.astRefinementKeys.get(e) };

    const { def, parent } = this.visitExprInner(e);
    if (!this.graph.astDefs.has(e)) {
      this.graph.astDefs.set(e, def);
      if (parent) this.graph.astRefinementKeys.set(e, parent);
    }
    return { def, parent };
  }

  private visitExprInner(e: AstExpr): DataFlowResult {
    if (e instanceof AstExprGroup) return this.visitExpr(e.expr);
    if (
      e instanceof AstExprConstantNil ||
      e instanceof AstExprConstantBool ||
      e instanceof AstExprConstantNumber ||
      e instanceof AstExprConstantString ||
      e instanceof AstExprVarargs
    ) {
      return { def: this.defArena.freshCell(undefined, e.location) };
    }
    if (e instanceof AstExprLocal) {
      const def = this.lookup(e.local, e.local.location);
      this.graph.defToSymbol.set(def, e.local);
      return { def, parent: this.keyArena.leaf(def) };
    }
    if (e instanceof AstExprGlobal) {
      const def = this.lookup(e.name, e.location);
      this.graph.defToSymbol.set(def, e.name);
      return { def, parent: this.keyArena.leaf(def) };
    }
    if (e instanceof AstExprCall) return this.visitCall(e);
    if (e instanceof AstExprIndexName) {
      const { def: parentDef, parent: parentKey } = this.visitExpr(e.expr);
      const def = this.lookupProp(parentDef, e.index, e.location);
      return { def, parent: this.keyArena.node(parentKey, def, e.index) };
    }
    if (e instanceof AstExprIndexExpr) {
      const { def: parentDef, parent: parentKey } = this.visitExpr(e.expr);
      this.visitExpr(e.index);
      if (e.index instanceof AstExprConstantString) {
        const index = e.index.value;
        const def = this.lookupProp(parentDef, index, e.location);
        return { def, parent: this.keyArena.node(parentKey, def, index) };
      }
      return { def: this.defArena.freshCell(undefined, e.location, true) };
    }
    if (e instanceof AstExprFunction) {
      const signatureScope = this.makeChildScope(DfgScopeType.Function);
      return this.withScope(signatureScope, () => this.visitFunction(e, signatureScope));
    }
    if (e instanceof AstExprTable) {
      const tableCell = this.defArena.freshCell(undefined, e.location);
      this.currentScope().props.set(tableCell, new Map());
      for (const item of e.items) {
        const result = this.visitExpr(item.value);
        if (item.key) {
          this.visitExpr(item.key);
          if (item.key instanceof AstExprConstantString) {
            this.currentScope().propsOf(tableCell).set(item.key.value, result.def);
          }
        }
      }
      return { def: tableCell };
    }
    if (e instanceof AstExprUnary) {
      this.visitExpr(e.expr);
      return { def: this.defArena.freshCell(undefined, e.location) };
    }
    if (e instanceof AstExprBinary) {
      const left = this.visitExpr(e.left);
      const right = this.visitExpr(e.right);
      const subscripted =
        (e.op === BinaryOp.And || e.op === BinaryOp.Or) &&
        (containsSubscriptedDefinition(left.def) || containsSubscriptedDefinition(right.def));
      return { def: this.defArena.freshCell(undefined, e.location, subscripted) };
    }
    if (e instanceof AstExprTypeAssertion) {
      const result = this.visitExpr(e.expr);
      this.visitType(e.annotation);
      return result;
    }
    if (e instanceof AstExprIfElse) {
      this.visitExpr(e.condition);
      this.visitExpr(e.trueExpr);
      this.visitExpr(e.falseExpr);
      return { def: this.defArena.freshCell(undefined, e.location) };
    }
    if (e instanceof AstExprInterpString) {
      for (const x of e.expressions) this.visitExpr(x);
      return { def: this.defArena.freshCell(undefined, e.location) };
    }
    if (e instanceof AstExprInstantiate) {
      for (const t of e.typeArguments) {
        if (t.type) this.visitType(t.type);
        else if (t.typePack) this.visitTypePack(t.typePack);
      }
      return this.visitExpr(e.expr);
    }
    if (e instanceof AstExprError) {
      return this.withScope(this.makeChildScope(), () => {
        for (const x of e.expressions) this.visitExpr(x);
        return { def: this.defArena.freshCell(undefined, e.location) };
      });
    }
    // Not part of Luau: one of Sparkdown's own expressions (`SparkdownReading.ts`).
    const sparkdown = sparkdownValue(e);
    if (sparkdown) {
      for (const x of sparkdown.operands) this.visitExpr(x);
      return { def: this.defArena.freshCell(undefined, e.location) };
    }
    throw new Error(`Unknown AstExpr in DataFlowGraphBuilder: ${e.kind}`);
  }

  private visitCall(c: AstExprCall): DataFlowResult {
    this.visitExpr(c.func);
    for (const t of c.typeArguments) {
      if (t.type) this.visitType(t.type);
      else if (t.typePack) this.visitTypePack(t.typePack);
    }
    for (const arg of c.args) this.visitExpr(arg);

    const firstArg = c.args[0];
    if (shouldTypestateForFirstArgument(c) && c.args.length > 1 && firstArg && isLValue(firstArg)) {
      const result = this.visitExpr(firstArg);
      const child = this.makeChildScope();
      this.scopeStack.push(child);
      if (!this.graph.astDefs.has(firstArg)) {
        this.graph.astDefs.set(firstArg, result.def);
        if (result.parent) this.graph.astRefinementKeys.set(firstArg, result.parent);
      }
      this.visitLValue(firstArg, result.def);
    }
    // A call may return a subscripted value, so its result counts as subscripted.
    return { def: this.defArena.freshCell(undefined, c.location, true) };
  }

  private visitFunction(f: AstExprFunction, signatureScope: DfgScope): DataFlowResult {
    if (f.self) {
      const def = this.defArena.freshCell(f.debugname, f.location);
      this.graph.localDefs.set(f.self, def);
      signatureScope.bindings.set(f.self, def);
      this.capture(f.self).allVersions.push(def);
    }
    for (const param of f.args) {
      if (param.annotation) this.visitType(param.annotation);
      const def = this.defArena.freshCell(param, param.location);
      this.graph.localDefs.set(param, def);
      signatureScope.bindings.set(param, def);
      this.capture(param).allVersions.push(def);
    }
    if (f.varargAnnotation) this.visitTypePack(f.varargAnnotation);
    if (f.returnAnnotation) this.visitTypePack(f.returnAnnotation);
    this.visitBlock(f.body);
    return { def: this.defArena.freshCell(f.debugname, f.location) };
  }

  private visitLValue(e: AstExpr, incomingDef: DefId): void {
    const go = (): DefId => {
      if (e instanceof AstExprLocal) {
        // Clip the reference to the parent def, to avoid alias tracking.
        if (!e.upvalue) {
          const updated = this.defArena.freshCell(e.local, e.location, containsSubscriptedDefinition(incomingDef));
          this.currentScope().bindings.set(e.local, updated);
          this.capture(e.local).allVersions.push(updated);
          return updated;
        }
        return this.visitExpr(e).def;
      }
      if (e instanceof AstExprGlobal) {
        const updated = this.defArena.freshCell(e.name, e.location, containsSubscriptedDefinition(incomingDef));
        this.currentScope().bindings.set(e.name, updated);
        this.capture(e.name).allVersions.push(updated);
        return updated;
      }
      if (e instanceof AstExprIndexName) {
        const parentDef = this.visitExpr(e.expr).def;
        const updated = this.defArena.freshCell(e.index, e.location, containsSubscriptedDefinition(incomingDef));
        this.currentScope().propsOf(parentDef).set(e.index, updated);
        return updated;
      }
      if (e instanceof AstExprIndexExpr) {
        const parentDef = this.visitExpr(e.expr).def;
        this.visitExpr(e.index);
        if (e.index instanceof AstExprConstantString) {
          const updated = this.defArena.freshCell(undefined, e.location, containsSubscriptedDefinition(incomingDef));
          this.currentScope().propsOf(parentDef).set(e.index.value, updated);
          return updated;
        }
        return this.defArena.freshCell(undefined, e.location, true);
      }
      if (e instanceof AstExprError) return this.visitExpr(e).def;
      throw new Error(`Unknown AstExpr in DataFlowGraphBuilder.visitLValue: ${e.kind}`);
    };
    if (!this.graph.astDefs.has(e)) this.graph.astDefs.set(e, go());
  }

  private visitType(t: AstType): void {
    if (t instanceof AstTypeReference) {
      for (const param of t.parameters) {
        if (param.type) this.visitType(param.type);
        else if (param.typePack) this.visitTypePack(param.typePack);
      }
    } else if (t instanceof AstTypeTable) {
      for (const p of t.props) this.visitType(p.type);
      if (t.indexer) {
        this.visitType(t.indexer.indexType);
        this.visitType(t.indexer.resultType);
      }
    } else if (t instanceof AstTypeFunction) {
      this.visitGenerics(t.generics);
      this.visitGenericPacks(t.genericPacks);
      this.visitTypeList(t.argTypes);
      this.visitTypePack(t.returnTypes);
    } else if (t instanceof AstTypeTypeof) {
      this.visitExpr(t.expr);
    } else if (t instanceof AstTypeUnion || t instanceof AstTypeIntersection || t instanceof AstTypeError) {
      for (const x of t.types) this.visitType(x);
    } else if (t instanceof AstTypeGroup) {
      this.visitType(t.type);
    }
  }

  private visitTypePack(p: AstTypePack): void {
    if (p instanceof AstTypePackExplicit) this.visitTypeList(p.typeList);
    else if (p instanceof AstTypePackVariadic) this.visitType(p.variadicType);
  }

  private visitTypeList(l: AstTypeList): void {
    for (const t of l.types) this.visitType(t);
    if (l.tailType) this.visitTypePack(l.tailType);
  }

  private visitGenerics(g: AstGenericType[]): void {
    for (const generic of g) if (generic.defaultValue) this.visitType(generic.defaultValue);
  }

  private visitGenericPacks(g: AstGenericTypePack[]): void {
    for (const generic of g) if (generic.defaultValue) this.visitTypePack(generic.defaultValue);
  }
}

