// Luau's type checker for non-strict mode, ported from Luau's
// `NonStrictTypeChecker.h`/`NonStrictTypeChecker.cpp`; Luau is MIT-licensed
// (see `LICENSE-luau.txt`).
//
// Besides unknown globals and malformed type annotations, non-strict mode
// reports only code that is certain to fail at runtime. The failures come
// from calls to checked functions (declared `@checked`), which raise an error
// when an argument does not have the parameter's type. The checker walks each
// block backwards and builds a context that maps each def to the type of the
// values that make the code fail: statements in sequence join their contexts
// by union, and the branches of a conditional by intersection, because only a
// failure on every path is certain. An argument whose type is a subtype of its
// def's type in the context fails at runtime, and so does a function parameter
// whose type in the context is `unknown`, which no value escapes.

import {
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
  AstTypeFunction,
  AstTypeGroup,
  AstTypeIntersection,
  AstTypePackExplicit,
  AstTypePackGeneric,
  AstTypePackVariadic,
  AstTypeReference,
  AstTypeTable,
  AstTypeTypeof,
  AstTypeUnion,
  getFunctionNameAsString,
  type AstExpr,
  type AstGenericType,
  type AstGenericTypePack,
  type AstLocal,
  type AstNode,
  type AstStat,
  type AstType,
  type AstTypeList,
  type AstTypeOrPack,
  type AstTypePack,
} from "./Ast";
import { ValueContext } from "./Constraint";
import type { DataFlowGraph } from "./DataFlowGraph";
import { collectOperands, type DefId } from "./Def";
import { copyErrors, LuauTypeError, UnknownSymbolContext, type TypeErrorData } from "./Error";
import type { Location } from "./Location";
import type { Module, SourceModule } from "./Module";
import { Normalizer, type UnifierSharedState } from "./Normalize";
import type { Scope } from "./Scope";
import { simplifyIntersection, simplifyUnion } from "./Simplify";
import { sparkdownValue } from "./SparkdownReading";
import { Subtyping } from "./Subtyping";
import {
  emplaceTypePack,
  finite,
  first,
  flatten,
  follow,
  followPack,
  freeTypePack,
  get,
  getPack,
  InternalCompilerError,
  is,
  isOptional,
  negationType,
  packSize,
  typePack,
  type BuiltinTypes,
  type TypeArena,
  type TypeId,
  type TypePackId,
} from "./Type";
import { reduceTypeFunctions, TypeFunctionContext, type TypeCheckLimits, type TypeFunctionRuntime } from "./TypeFunction";

// Luau's `LuauNonStrictTypeCheckerRecursionLimit`.
const NON_STRICT_TYPE_CHECKER_RECURSION_LIMIT = 300;


/**
 * Pushes a scope onto the end of a stack until `pop` is called, which stands
 * for the end of the lifetime of Luau's `StackPusher`. The checker uses it to
 * know which scope encloses every node it visits.
 */
class StackPusher {
  constructor(
    readonly stack: Scope[],
    readonly scope: Scope,
  ) {
    stack.push(scope);
  }

  pop(): void {
    this.stack.pop();
  }
}

/**
 * For each def, the type of the values that make the code fail at runtime: a
 * value whose type is a subtype of it is certain to raise an error. A def the
 * context lacks stands for `never`.
 */
class NonStrictContext {
  private readonly context = new Map<DefId, TypeId>();

  /** The union over the domain of keys: a def one side lacks is `never` there, and `never | T` is `T`. */
  static disjunction(builtinTypes: BuiltinTypes, arena: TypeArena, left: NonStrictContext, right: NonStrictContext): NonStrictContext {
    const disj = new NonStrictContext();

    for (const [def, leftTy] of left.context) {
      const rightTy = right.find(def);
      if (rightTy) disj.context.set(def, simplifyUnion(builtinTypes, arena, leftTy, rightTy).result);
      else disj.context.set(def, leftTy);
    }

    for (const [def, rightTy] of right.context) {
      if (!left.find(def)) disj.context.set(def, rightTy);
    }

    return disj;
  }

  /** The intersection over the defs both contexts have. */
  static conjunction(builtins: BuiltinTypes, arena: TypeArena, left: NonStrictContext, right: NonStrictContext): NonStrictContext {
    const conj = new NonStrictContext();

    for (const [def, leftTy] of left.context) {
      const rightTy = right.find(def);
      if (rightTy) conj.context.set(def, simplifyIntersection(builtins, arena, leftTy, rightTy).result);
    }

    return conj;
  }

  /** Removes the cells a def stands for, and returns whether the removal was successful. */
  remove(def: DefId): boolean {
    const defs: DefId[] = [];
    collectOperands(def, defs);
    let result = true;
    for (const d of defs) result = result && this.context.delete(d);
    return result;
  }

  find(def: DefId): TypeId | undefined {
    return this.context.get(def);
  }

  addContext(def: DefId, ty: TypeId): void {
    const defs: DefId[] = [];
    collectOperands(def, defs);
    for (const d of defs) this.context.set(d, ty);
  }
}

class NonStrictTypeChecker {
  readonly builtinTypes: BuiltinTypes;
  readonly typeFunctionRuntime: TypeFunctionRuntime;
  readonly arena: TypeArena;
  readonly module: Module;
  readonly normalizer: Normalizer;
  readonly subtyping: Subtyping;
  readonly dfg: DataFlowGraph;
  readonly noTypeFunctionErrors = new Set<TypeId>();
  readonly stack: Scope[] = [];
  readonly cachedNegations = new Map<TypeId, TypeId>();

  readonly limits: TypeCheckLimits;

  private nonStrictRecursionCount = 0;

  constructor(
    arena: TypeArena,
    builtinTypes: BuiltinTypes,
    typeFunctionRuntime: TypeFunctionRuntime,
    unifierState: UnifierSharedState,
    dfg: DataFlowGraph,
    limits: TypeCheckLimits,
    module: Module,
  ) {
    this.builtinTypes = builtinTypes;
    this.typeFunctionRuntime = typeFunctionRuntime;
    this.arena = arena;
    this.module = module;
    this.normalizer = new Normalizer(arena, builtinTypes, unifierState, /* cacheInhabitance */ true);
    this.subtyping = new Subtyping(builtinTypes, arena, this.normalizer, typeFunctionRuntime);
    this.dfg = dfg;
    this.limits = limits;
  }

  /** Pushes the scope a node creates, when it creates one; the caller pops it once it is done with the node. */
  pushStack(node: AstNode): StackPusher | undefined {
    const scope = this.module.astScopes.get(node);
    if (scope) return new StackPusher(this.stack, scope);
    else return undefined;
  }

  visitTypeArguments(typeArguments: AstTypeOrPack[]): void {
    for (const typeArgument of typeArguments) {
      if (typeArgument.type) this.visitType(typeArgument.type);
      else this.visitTypePack(typeArgument.typePack);
    }
  }

  flattenPack(pack: TypePackId): TypeId {
    pack = followPack(pack);

    const fst = first(pack, /* ignoreHiddenVariadics */ false);
    if (fst) return fst;
    const ftp = getPack(pack, "FreeTypePack");
    if (ftp) {
      const result = this.arena.freshType(this.builtinTypes, ftp.scope);
      const freeTail = this.arena.addTypePack(freeTypePack(ftp.scope));

      emplaceTypePack(pack, typePack([result], freeTail));

      return result;
    } else if (getPack(pack, "ErrorTypePack")) return this.builtinTypes.errorType;
    // `(f())` where `f()` returns no values is coerced into `nil`.
    else if (finite(pack) && packSize(pack) === 0) return this.builtinTypes.nilType;
    else throw new InternalCompilerError("flattenPack got a weird pack!");
  }

  /** Reduces the type functions under a type; the reduction binds the instances it reduces, and its errors are not reported. */
  checkForTypeFunctionInhabitance(instance: TypeId, location: Location): TypeId {
    if (this.noTypeFunctionErrors.has(instance)) return instance;

    const context = new TypeFunctionContext({
      arena: this.arena,
      builtins: this.builtinTypes,
      scope: this.stack[this.stack.length - 1]!,
      normalizer: this.normalizer,
      typeFunctionRuntime: this.typeFunctionRuntime,
      limits: this.limits,
      subtyping: this.subtyping,
    });
    const errors = reduceTypeFunctions(instance, location, context, true).errors;

    if (errors.length === 0) this.noTypeFunctionErrors.add(instance);
    return instance;
  }

  lookupType(expr: AstExpr): TypeId {
    const ty = this.module.astTypes.get(expr);
    if (ty) return this.checkForTypeFunctionInhabitance(follow(ty), expr.location);

    const tp = this.module.astTypePacks.get(expr);
    if (tp) return this.checkForTypeFunctionInhabitance(this.flattenPack(tp), expr.location);
    return this.builtinTypes.anyType;
  }

  // -------------------------------------------------------------------------
  // Statements
  // -------------------------------------------------------------------------

  visitStat(stat: AstStat): NonStrictContext {
    const pusher = this.pushStack(stat);
    try {
      if (stat instanceof AstStatBlock) return this.visitStatBlock(stat);
      else if (stat instanceof AstStatIf) return this.visitStatIf(stat);
      else if (stat instanceof AstStatWhile) return this.visitStatWhile(stat);
      else if (stat instanceof AstStatRepeat) return this.visitStatRepeat(stat);
      else if (stat instanceof AstStatBreak) return this.visitStatBreak(stat);
      else if (stat instanceof AstStatContinue) return this.visitStatContinue(stat);
      else if (stat instanceof AstStatReturn) return this.visitStatReturn(stat);
      else if (stat instanceof AstStatExpr) return this.visitStatExpr(stat);
      else if (stat instanceof AstStatLocal) return this.visitStatLocal(stat);
      else if (stat instanceof AstStatFor) return this.visitStatFor(stat);
      else if (stat instanceof AstStatForIn) return this.visitStatForIn(stat);
      else if (stat instanceof AstStatAssign) return this.visitStatAssign(stat);
      else if (stat instanceof AstStatCompoundAssign) return this.visitStatCompoundAssign(stat);
      else if (stat instanceof AstStatFunction) return this.visitStatFunction(stat);
      else if (stat instanceof AstStatLocalFunction) return this.visitStatLocalFunction(stat);
      else if (stat instanceof AstStatTypeAlias) return this.visitStatTypeAlias(stat);
      // Non-strict mode leaves a type function's body unchecked.
      else if (stat instanceof AstStatTypeFunction) return new NonStrictContext();
      else if (stat instanceof AstStatDeclareFunction) return this.visitStatDeclareFunction(stat);
      else if (stat instanceof AstStatDeclareGlobal) return this.visitStatDeclareGlobal(stat);
      else if (stat instanceof AstStatDeclareExternType) return this.visitStatDeclareExternType(stat);
      else if (stat instanceof AstStatError) return this.visitStatError(stat);
      else throw new InternalCompilerError("NonStrictTypeChecker encountered an unknown statement type");
    } finally {
      pusher?.pop();
    }
  }

  visitStatBlock(block: AstStatBlock): NonStrictContext {
    // Luau's `RecursionCounter`: the count rises on entry and falls on exit.
    this.nonStrictRecursionCount++;
    try {
      const limit = this.limits.nonStrictRecursionLimit ?? NON_STRICT_TYPE_CHECKER_RECURSION_LIMIT;
      if ((this.limits.addRecursionCounterToNonStrictTypeChecker ?? true) && limit > 0 && this.nonStrictRecursionCount >= limit) {
        return new NonStrictContext();
      }

      const pusher = this.pushStack(block);
      try {
        let ctx = new NonStrictContext();

        for (let i = block.body.length - 1; i >= 0; i--) {
          const stat = block.body[i]!;
          if (stat instanceof AstStatLocal) {
            // Iterating in reverse order, `local x; B` generates the context of B without x.
            this.visitStatLocal(stat);
            for (const local of stat.vars) {
              ctx.remove(this.dfg.getLocalDef(local));

              this.visitType(local.annotation);
            }
          } else ctx = NonStrictContext.disjunction(this.builtinTypes, this.arena, this.visitStat(stat), ctx);
        }
        return ctx;
      } finally {
        pusher?.pop();
      }
    } finally {
      this.nonStrictRecursionCount--;
    }
  }

  visitStatIf(ifStatement: AstStatIf): NonStrictContext {
    const condB = this.visitExpr(ifStatement.condition, ValueContext.RValue);
    let branchContext = new NonStrictContext();

    const thenBody = this.visitStatBlock(ifStatement.thenbody);
    if (ifStatement.elsebody) {
      const elseBody = this.visitStat(ifStatement.elsebody);
      branchContext = NonStrictContext.conjunction(this.builtinTypes, this.arena, thenBody, elseBody);
    }

    return NonStrictContext.disjunction(this.builtinTypes, this.arena, condB, branchContext);
  }

  visitStatWhile(whileStatement: AstStatWhile): NonStrictContext {
    const condition = this.visitExpr(whileStatement.condition, ValueContext.RValue);
    const body = this.visitStatBlock(whileStatement.body);
    return NonStrictContext.disjunction(this.builtinTypes, this.arena, condition, body);
  }

  visitStatRepeat(repeatStatement: AstStatRepeat): NonStrictContext {
    const body = this.visitStatBlock(repeatStatement.body);
    const condition = this.visitExpr(repeatStatement.condition, ValueContext.RValue);
    return NonStrictContext.disjunction(this.builtinTypes, this.arena, body, condition);
  }

  visitStatBreak(_breakStatement: AstStatBreak): NonStrictContext {
    return new NonStrictContext();
  }

  visitStatContinue(_continueStatement: AstStatContinue): NonStrictContext {
    return new NonStrictContext();
  }

  visitStatReturn(returnStatement: AstStatReturn): NonStrictContext {
    // The returned expressions are checked, and their contexts are discarded.
    for (const expr of returnStatement.list) this.visitExpr(expr, ValueContext.RValue);

    return new NonStrictContext();
  }

  visitStatExpr(expr: AstStatExpr): NonStrictContext {
    return this.visitExpr(expr.expr, ValueContext.RValue);
  }

  visitStatLocal(local: AstStatLocal): NonStrictContext {
    for (const rhs of local.values) this.visitExpr(rhs, ValueContext.RValue);
    return new NonStrictContext();
  }

  visitStatFor(forStatement: AstStatFor): NonStrictContext {
    this.visitType(forStatement.variable.annotation);

    // The contexts of the loop's bounds are discarded.
    if (forStatement.from) this.visitExpr(forStatement.from, ValueContext.RValue);
    if (forStatement.to) this.visitExpr(forStatement.to, ValueContext.RValue);
    if (forStatement.step) this.visitExpr(forStatement.step, ValueContext.RValue);
    return this.visitStatBlock(forStatement.body);
  }

  visitStatForIn(forInStatement: AstStatForIn): NonStrictContext {
    for (const v of forInStatement.vars) this.visitType(v.annotation);

    for (const rhs of forInStatement.values) this.visitExpr(rhs, ValueContext.RValue);
    return this.visitStatBlock(forInStatement.body);
  }

  visitStatAssign(assign: AstStatAssign): NonStrictContext {
    for (const lhs of assign.vars) this.visitExpr(lhs, ValueContext.LValue);
    for (const rhs of assign.values) this.visitExpr(rhs, ValueContext.RValue);

    return new NonStrictContext();
  }

  visitStatCompoundAssign(compoundAssign: AstStatCompoundAssign): NonStrictContext {
    this.visitExpr(compoundAssign.variable, ValueContext.LValue);
    this.visitExpr(compoundAssign.value, ValueContext.RValue);

    return new NonStrictContext();
  }

  visitStatFunction(statFn: AstStatFunction): NonStrictContext {
    return this.visitExpr(statFn.func, ValueContext.RValue);
  }

  visitStatLocalFunction(localFn: AstStatLocalFunction): NonStrictContext {
    return this.visitExpr(localFn.func, ValueContext.RValue);
  }

  visitStatTypeAlias(typeAlias: AstStatTypeAlias): NonStrictContext {
    this.visitGenerics(typeAlias.generics, typeAlias.genericPacks);
    this.visitType(typeAlias.type);

    return new NonStrictContext();
  }

  visitStatDeclareFunction(declFn: AstStatDeclareFunction): NonStrictContext {
    this.visitGenerics(declFn.generics, declFn.genericPacks);
    this.visitTypeList(declFn.params);
    this.visitTypePack(declFn.retTypes);

    return new NonStrictContext();
  }

  visitStatDeclareGlobal(declGlobal: AstStatDeclareGlobal): NonStrictContext {
    this.visitType(declGlobal.type);

    return new NonStrictContext();
  }

  visitStatDeclareExternType(declClass: AstStatDeclareExternType): NonStrictContext {
    if (declClass.indexer) {
      this.visitType(declClass.indexer.indexType);
      this.visitType(declClass.indexer.resultType);
    }

    for (const prop of declClass.props) this.visitType(prop.ty);

    return new NonStrictContext();
  }

  visitStatError(error: AstStatError): NonStrictContext {
    for (const stat of error.statements) this.visitStat(stat);
    for (const expr of error.expressions) this.visitExpr(expr, ValueContext.RValue);

    return new NonStrictContext();
  }

  // -------------------------------------------------------------------------
  // Expressions
  // -------------------------------------------------------------------------

  visitExpr(expr: AstExpr, context: ValueContext): NonStrictContext {
    // Luau's `RecursionCounter`: the count rises on entry and falls on exit.
    this.nonStrictRecursionCount++;
    try {
      const limit = this.limits.nonStrictRecursionLimit ?? NON_STRICT_TYPE_CHECKER_RECURSION_LIMIT;
      if ((this.limits.addRecursionCounterToNonStrictTypeChecker ?? true) && limit > 0 && this.nonStrictRecursionCount >= limit) {
        return new NonStrictContext();
      }

      const pusher = this.pushStack(expr);
      try {
        if (expr instanceof AstExprGroup) return this.visitExprGroup(expr, context);
        else if (expr instanceof AstExprConstantNil) return this.visitExprConstantNil(expr);
        else if (expr instanceof AstExprConstantBool) return this.visitExprConstantBool(expr);
        else if (expr instanceof AstExprConstantNumber) return this.visitExprConstantNumber(expr);
        else if (expr instanceof AstExprConstantString) return this.visitExprConstantString(expr);
        else if (expr instanceof AstExprLocal) return this.visitExprLocal(expr, context);
        else if (expr instanceof AstExprGlobal) return this.visitExprGlobal(expr, context);
        else if (expr instanceof AstExprVarargs) return this.visitExprVarargs(expr);
        else if (expr instanceof AstExprCall) return this.visitExprCall(expr);
        else if (expr instanceof AstExprIndexName) return this.visitExprIndexName(expr, context);
        else if (expr instanceof AstExprIndexExpr) return this.visitExprIndexExpr(expr, context);
        else if (expr instanceof AstExprFunction) return this.visitExprFunction(expr);
        else if (expr instanceof AstExprTable) return this.visitExprTable(expr);
        else if (expr instanceof AstExprUnary) return this.visitExprUnary(expr);
        else if (expr instanceof AstExprBinary) return this.visitExprBinary(expr);
        else if (expr instanceof AstExprTypeAssertion) return this.visitExprTypeAssertion(expr);
        else if (expr instanceof AstExprIfElse) return this.visitExprIfElse(expr);
        else if (expr instanceof AstExprInterpString) return this.visitExprInterpString(expr);
        else if (expr instanceof AstExprError) return this.visitExprError(expr);
        else if (expr instanceof AstExprInstantiate) return this.visitExprInstantiate(expr);
        // Not part of Luau: one of Sparkdown's own expressions (`SparkdownReading.ts`).
        else if (sparkdownValue(expr)) {
          for (const operand of sparkdownValue(expr)!.operands) this.visitExpr(operand, ValueContext.RValue);
          return new NonStrictContext();
        } else throw new InternalCompilerError("NonStrictTypeChecker encountered an unknown expression type");
      } finally {
        pusher?.pop();
      }
    } finally {
      this.nonStrictRecursionCount--;
    }
  }

  visitExprGroup(group: AstExprGroup, context: ValueContext): NonStrictContext {
    return this.visitExpr(group.expr, context);
  }

  visitExprConstantNil(_expr: AstExprConstantNil): NonStrictContext {
    return new NonStrictContext();
  }

  visitExprConstantBool(_expr: AstExprConstantBool): NonStrictContext {
    return new NonStrictContext();
  }

  visitExprConstantNumber(_expr: AstExprConstantNumber): NonStrictContext {
    return new NonStrictContext();
  }

  visitExprConstantString(_expr: AstExprConstantString): NonStrictContext {
    return new NonStrictContext();
  }

  visitExprLocal(_local: AstExprLocal, _context: ValueContext): NonStrictContext {
    return new NonStrictContext();
  }

  visitExprGlobal(global: AstExprGlobal, context: ValueContext): NonStrictContext {
    // Unknown symbols are not reported for lvalues.
    if (context === ValueContext.LValue) return new NonStrictContext();

    const scope = this.stack[this.stack.length - 1]!;
    if (!scope.lookup(global.name)) {
      this.reportError({ kind: "UnknownSymbol", name: global.name, context: UnknownSymbolContext.Binding }, global.location);
    }

    return new NonStrictContext();
  }

  visitExprVarargs(_varargs: AstExprVarargs): NonStrictContext {
    return new NonStrictContext();
  }

  visitExprCall(call: AstExprCall): NonStrictContext {
    this.visitExpr(call.func, ValueContext.RValue);
    this.visitTypeArguments(call.typeArguments);
    for (const arg of call.args) this.visitExpr(arg, ValueContext.RValue);

    const fresh = new NonStrictContext();
    const originalCallTy = this.module.astOriginalCallTypes.get(call.func);
    if (!originalCallTy) return fresh;

    const fnTy = originalCallTy;
    const fn = get(follow(fnTy), "FunctionType");
    if (fn && fn.isCheckedFunction) {
      // The type of a checked function reads as
      //   (S1, ..., SN) -> T &
      //   (~S1, unknown^N-1) -> error &
      //   (unknown, ~S2, unknown^N-2) -> error &
      //   ... &
      //   (unknown^N-1, ~S_N) -> error
      const argExprs: AstExpr[] = [];
      if (call.self) {
        if (call.func instanceof AstExprIndexName) argExprs.push(call.func.expr);
        else throw new InternalCompilerError("method call expression has no 'self'");
      }
      argExprs.push(...call.args);

      const argTypes: TypeId[] = [];

      // Move all the types over from the argument pack of `fn`.
      const { head, tail: argTail } = flatten(fn.argTypes);
      for (const ty of head) argTypes.push(ty);

      // Pad out the rest with the variadic as needed.
      if (argTail) {
        const vtp = getPack(followPack(argTail), "VariadicTypePack");
        if (vtp) {
          while (argTypes.length < argExprs.length) {
            argTypes.push(vtp.ty);
          }
        }
      }

      const functionName = getFunctionNameAsString(call.func) ?? "";
      if (argExprs.length > argTypes.length) {
        // More arguments are passed than the function expects, which is an error.
        this.reportError({ kind: "CheckedFunctionIncorrectArgs", functionName, expected: argTypes.length, actual: argExprs.length }, call.location);
        return fresh;
      }

      for (let i = 0; i < argExprs.length; i++) {
        // For example, when the argument is "hi", its actual type is string; when the expected type is number, the
        // type of the argument in the overload that errors is ~number, and string is compared with ~number.
        const arg = argExprs[i]!;
        const expectedArgType = argTypes[i]!;
        const norm = this.normalizer.normalize(expectedArgType);
        const def = this.dfg.getDef(arg);
        let runTimeErrorTy: TypeId;
        // Negating any would make every subtype test fail, yet a function that takes any accepts anything, so never
        // goes into the context and the runtime test always passes.
        if (!norm) this.reportError({ kind: "NormalizationTooComplex" }, arg.location);

        if (norm && get(norm.tops, "AnyType")) runTimeErrorTy = this.builtinTypes.neverType;
        else runTimeErrorTy = this.getOrCreateNegation(expectedArgType);
        fresh.addContext(def, runTimeErrorTy);
      }

      // With the context populated, test each argument of the call against it.
      const scope = this.findInnermostScope(call.location);
      for (let i = 0; i < argExprs.length; i++) {
        const arg = argExprs[i]!;
        const runTimeFailureType = this.willRunTimeError(arg, fresh, scope);
        if (runTimeFailureType) {
          this.reportError(
            {
              kind: "CheckedFunctionCallError",
              expected: argTypes[i]!,
              passed: runTimeFailureType,
              checkedFunctionName: functionName,
              argumentIndex: i,
            },
            arg.location,
          );
        }
      }
      if (argExprs.length < argTypes.length) {
        // Fewer arguments are passed than the function expects, so the remaining parameters must be optional.
        let remainingArgsOptional = true;
        for (let i = argExprs.length; i < argTypes.length; i++) remainingArgsOptional = remainingArgsOptional && isOptional(argTypes[i]!);

        if (!remainingArgsOptional) {
          this.reportError(
            { kind: "CheckedFunctionIncorrectArgs", functionName, expected: argTypes.length, actual: argExprs.length },
            call.location,
          );
          return fresh;
        }
      }
    }

    return fresh;
  }

  visitExprIndexName(indexName: AstExprIndexName, context: ValueContext): NonStrictContext {
    return this.visitExpr(indexName.expr, context);
  }

  visitExprIndexExpr(indexExpr: AstExprIndexExpr, context: ValueContext): NonStrictContext {
    const expr = this.visitExpr(indexExpr.expr, context);
    const index = this.visitExpr(indexExpr.index, ValueContext.RValue);
    return NonStrictContext.disjunction(this.builtinTypes, this.arena, expr, index);
  }

  visitExprFunction(exprFn: AstExprFunction): NonStrictContext {
    const pusher = this.pushStack(exprFn);
    try {
      const remainder = this.visitStatBlock(exprFn.body);
      const scope = pusher ? pusher.scope : this.module.getModuleScope();
      for (const local of exprFn.args) {
        const ty = this.willRunTimeErrorFunctionDefinition(local, scope, remainder);
        if (ty) {
          const debugname = exprFn.debugname;
          this.reportError(
            { kind: "NonStrictFunctionDefinitionError", functionName: debugname ? debugname : "", argument: local.name, argumentType: ty },
            local.location,
          );
        }
        remainder.remove(this.dfg.getLocalDef(local));

        this.visitType(local.annotation);
      }
      this.visitGenerics(exprFn.generics, exprFn.genericPacks);

      this.visitTypePack(exprFn.returnAnnotation);

      if (exprFn.varargAnnotation) this.visitTypePack(exprFn.varargAnnotation);

      return remainder;
    } finally {
      pusher?.pop();
    }
  }

  visitExprTable(table: AstExprTable): NonStrictContext {
    // Luau's `RecursionCounter`: the count rises on entry and falls on exit.
    this.nonStrictRecursionCount++;
    try {
      const limit = this.limits.nonStrictRecursionLimit ?? NON_STRICT_TYPE_CHECKER_RECURSION_LIMIT;
      if ((this.limits.addRecursionCounterToNonStrictTypeChecker ?? true) && limit > 0 && this.nonStrictRecursionCount >= limit) {
        return new NonStrictContext();
      }

      for (const { key, value } of table.items) {
        if (key) this.visitExpr(key, ValueContext.RValue);
        this.visitExpr(value, ValueContext.RValue);
      }

      return new NonStrictContext();
    } finally {
      this.nonStrictRecursionCount--;
    }
  }

  visitExprUnary(unary: AstExprUnary): NonStrictContext {
    return this.visitExpr(unary.expr, ValueContext.RValue);
  }

  visitExprBinary(binary: AstExprBinary): NonStrictContext {
    const lhs = this.visitExpr(binary.left, ValueContext.RValue);
    const rhs = this.visitExpr(binary.right, ValueContext.RValue);
    return NonStrictContext.disjunction(this.builtinTypes, this.arena, lhs, rhs);
  }

  visitExprTypeAssertion(typeAssertion: AstExprTypeAssertion): NonStrictContext {
    this.visitType(typeAssertion.annotation);

    return this.visitExpr(typeAssertion.expr, ValueContext.RValue);
  }

  visitExprIfElse(ifElse: AstExprIfElse): NonStrictContext {
    const condB = this.visitExpr(ifElse.condition, ValueContext.RValue);
    const thenB = this.visitExpr(ifElse.trueExpr, ValueContext.RValue);
    const elseB = this.visitExpr(ifElse.falseExpr, ValueContext.RValue);
    return NonStrictContext.disjunction(
      this.builtinTypes,
      this.arena,
      condB,
      NonStrictContext.conjunction(this.builtinTypes, this.arena, thenB, elseB),
    );
  }

  visitExprInterpString(interpString: AstExprInterpString): NonStrictContext {
    for (const expr of interpString.expressions) this.visitExpr(expr, ValueContext.RValue);

    return new NonStrictContext();
  }

  visitExprError(error: AstExprError): NonStrictContext {
    for (const expr of error.expressions) this.visitExpr(expr, ValueContext.RValue);

    return new NonStrictContext();
  }

  visitExprInstantiate(instantiate: AstExprInstantiate): NonStrictContext {
    this.visitTypeArguments(instantiate.typeArguments);

    return this.visitExpr(instantiate.expr, ValueContext.RValue);
  }

  // -------------------------------------------------------------------------
  // Type annotations
  // -------------------------------------------------------------------------

  visitType(ty: AstType | undefined): void {
    // A missing node is skipped.
    if (!ty) return;

    if (ty instanceof AstTypeReference) this.visitTypeReference(ty);
    else if (ty instanceof AstTypeTable) this.visitTypeTable(ty);
    else if (ty instanceof AstTypeFunction) this.visitTypeFunction(ty);
    else if (ty instanceof AstTypeTypeof) this.visitTypeTypeof(ty);
    else if (ty instanceof AstTypeUnion) this.visitTypeUnion(ty);
    else if (ty instanceof AstTypeIntersection) this.visitTypeIntersection(ty);
    else if (ty instanceof AstTypeGroup) this.visitType(ty.type);
  }

  visitTypeReference(ty: AstTypeReference): void {
    // NonStrictTypeChecker.cpp:927–937 at 7d5f733. This is an actual
    // checker diagnostic, not a fixture-supplied expected result.
    if (this.limits.debugMagicTypes && ty.name === "_luau_force_constraint_solving_incomplete") {
      this.reportError({ kind: "ConstraintSolvingIncompleteError" }, ty.location);
      return;
    }
    for (const param of ty.parameters) {
      if (param.type) this.visitType(param.type);
      else this.visitTypePack(param.typePack);
    }

    const scope = this.findInnermostScope(ty.location);

    const alias = ty.prefix !== undefined ? scope.lookupImportedType(ty.prefix, ty.name) : scope.lookupType(ty.name);

    if (alias) {
      // A generic default is resolved before its type parameter is added to the alias's scope, but the constraint
      // generator has already added the parameter here, so a scope lookup would find the parameter and accept a
      // self-reference as a default. The lookup failures the constraint generator recorded decide instead.
      if (ty.prefix === undefined && this.module.astTypeReferenceLookupFailures.has(ty)) {
        this.reportError({ kind: "UnknownSymbol", name: ty.name, context: UnknownSymbolContext.Type }, ty.location);
        return;
      }

      const typesRequired = alias.typeParams.length;
      const packsRequired = alias.typePackParams.length;

      const hasDefaultTypes = alias.typeParams.some((el) => el.defaultValue !== undefined);

      const hasDefaultPacks = alias.typePackParams.some((el) => el.defaultValue !== undefined);

      if (!ty.hasParameterList) {
        if ((alias.typeParams.length !== 0 && !hasDefaultTypes) || (alias.typePackParams.length !== 0 && !hasDefaultPacks)) {
          this.reportError({ kind: "GenericError", message: "Type parameter list is required" }, ty.location);
        }
      }

      let typesProvided = 0;
      let extraTypes = 0;
      let packsProvided = 0;

      for (const p of ty.parameters) {
        if (p.type) {
          if (packsProvided !== 0) {
            this.reportError({ kind: "GenericError", message: "Type parameters must come before type pack parameters" }, ty.location);
            continue;
          }

          if (typesProvided < typesRequired) typesProvided += 1;
          else extraTypes += 1;
        } else if (p.typePack) {
          const tp = this.lookupPackAnnotation(p.typePack);
          if (tp === undefined) continue;

          if (typesProvided < typesRequired && packSize(tp) === 1 && finite(tp) && first(tp) !== undefined) typesProvided += 1;
          else packsProvided += 1;
        }
      }

      if (extraTypes !== 0 && packsProvided === 0) {
        // Extra types are only collected into a pack if a pack is expected.
        if (packsRequired !== 0) packsProvided += 1;
        else typesProvided += extraTypes;
      }

      for (let i = typesProvided; i < typesRequired; ++i) {
        if (alias.typeParams[i]!.defaultValue) typesProvided += 1;
      }

      for (let i = packsProvided; i < packsRequired; ++i) {
        if (alias.typePackParams[i]!.defaultValue) packsProvided += 1;
      }

      if (extraTypes === 0 && packsProvided + 1 === packsRequired) packsProvided += 1;

      if (typesProvided !== typesRequired || packsProvided !== packsRequired) {
        this.reportError(
          {
            kind: "IncorrectGenericParameterCount",
            name: ty.name,
            typeFun: alias,
            actualParameters: typesProvided,
            actualPackParameters: packsProvided,
          },
          ty.location,
        );
      }
    } else {
      if (scope.lookupPack(ty.name)) {
        this.reportError({ kind: "SwappedGenericTypeParameter", name: ty.name, genericKind: "Type" }, ty.location);
      } else {
        let symbol = "";
        if (ty.prefix !== undefined) {
          symbol += ty.prefix;
          symbol += ".";
        }
        symbol += ty.name;

        this.reportError({ kind: "UnknownSymbol", name: symbol, context: UnknownSymbolContext.Type }, ty.location);
      }
    }
  }

  visitTypeTable(table: AstTypeTable): void {
    if (table.indexer) {
      this.visitType(table.indexer.indexType);
      this.visitType(table.indexer.resultType);
    }

    for (const prop of table.props) this.visitType(prop.type);
  }

  visitTypeFunction(func: AstTypeFunction): void {
    this.visitTypeList(func.argTypes);
    this.visitTypePack(func.returnTypes);
  }

  visitTypeTypeof(typeOf: AstTypeTypeof): void {
    this.visitExpr(typeOf.expr, ValueContext.RValue);
  }

  visitTypeUnion(unionType: AstTypeUnion): void {
    for (const typ of unionType.types) this.visitType(typ);
  }

  visitTypeIntersection(intersectionType: AstTypeIntersection): void {
    for (const typ of intersectionType.types) this.visitType(typ);
  }

  visitTypeList(list: AstTypeList): void {
    for (const typ of list.types) this.visitType(typ);
    if (list.tailType) this.visitTypePack(list.tailType);
  }

  visitTypePack(pack: AstTypePack | undefined): void {
    // A missing node is skipped.
    if (!pack) return;

    if (pack instanceof AstTypePackExplicit) this.visitTypePackExplicit(pack);
    else if (pack instanceof AstTypePackVariadic) this.visitTypePackVariadic(pack);
    else if (pack instanceof AstTypePackGeneric) this.visitTypePackGeneric(pack);
  }

  visitTypePackExplicit(tp: AstTypePackExplicit): void {
    for (const type of tp.typeList.types) this.visitType(type);

    if (tp.typeList.tailType) this.visitTypePack(tp.typeList.tailType);
  }

  visitTypePackVariadic(tp: AstTypePackVariadic): void {
    this.visitType(tp.variadicType);
  }

  visitTypePackGeneric(tp: AstTypePackGeneric): void {
    const scope = this.findInnermostScope(tp.location);

    const alias = scope.lookupPack(tp.genericName);
    if (alias) {
      // As for a type reference, the scope already holds the generic pack being defined, so the lookup failures
      // the constraint generator recorded decide whether the name is unknown.
      if (this.module.astTypePackReferenceLookupFailures.has(tp)) {
        this.reportError({ kind: "UnknownSymbol", name: tp.genericName, context: UnknownSymbolContext.Type }, tp.location);
        return;
      }

      return;
    }

    if (scope.lookupType(tp.genericName)) {
      this.reportError({ kind: "SwappedGenericTypeParameter", name: tp.genericName, genericKind: "Pack" }, tp.location);
      return;
    }

    this.reportError({ kind: "UnknownSymbol", name: tp.genericName, context: UnknownSymbolContext.Type }, tp.location);
  }

  visitGenerics(generics: AstGenericType[], genericPacks: AstGenericTypePack[]): void {
    const seen = new Set<string>();

    for (const g of generics) {
      if (seen.has(g.name)) this.reportError({ kind: "DuplicateGenericParameter", parameterName: g.name }, g.location);
      else seen.add(g.name);

      if (g.defaultValue) this.visitType(g.defaultValue);
    }

    for (const g of genericPacks) {
      if (seen.has(g.name)) this.reportError({ kind: "DuplicateGenericParameter", parameterName: g.name }, g.location);
      else seen.add(g.name);

      if (g.defaultValue) this.visitTypePack(g.defaultValue);
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  findInnermostScope(location: Location): Scope {
    let bestScope = this.module.getModuleScope();

    let didNarrow: boolean;
    do {
      didNarrow = false;
      for (const scope of bestScope.children) {
        if (scope.location.encloses(location)) {
          bestScope = scope;
          didNarrow = true;
          break;
        }
      }
    } while (didNarrow && bestScope.children.length > 0);

    return bestScope;
  }

  lookupPackAnnotation(annotation: AstTypePack): TypePackId | undefined {
    const tp = this.module.astResolvedTypePacks.get(annotation);
    if (tp !== undefined) return followPack(tp);
    return undefined;
  }

  reportError(data: TypeErrorData, location: Location): void {
    this.module.errors.push(new LuauTypeError(location, data, this.module.name));
  }

  /** The type of an expression when the context makes it certain to fail at runtime. */
  willRunTimeError(fragment: AstExpr, context: NonStrictContext, scope: Scope): TypeId | undefined {
    const def = this.dfg.getDef(fragment);
    const defs: DefId[] = [];
    collectOperands(def, defs);
    for (const d of defs) {
      const contextTy = context.find(d);
      if (contextTy) {
        const actualType = this.lookupType(fragment);
        if (this.shouldSkipRuntimeErrorTesting(actualType)) continue;
        const r = this.subtyping.isSubtype(actualType, contextTy, scope);
        if (r.normalizationTooComplex) this.reportError({ kind: "NormalizationTooComplex" }, fragment.location);
        // A subtype test that passes without an error-suppressing type gives the type that errors at runtime.
        if (r.isSubtype && !r.isErrorSuppressing) return actualType;
      }
    }

    return undefined;
  }

  /** `unknown` when the context makes every value of a function parameter fail at runtime. */
  willRunTimeErrorFunctionDefinition(fragment: AstLocal, scope: Scope, context: NonStrictContext): TypeId | undefined {
    const def = this.dfg.getLocalDef(fragment);
    const defs: DefId[] = [];
    collectOperands(def, defs);
    for (const d of defs) {
      const contextTy = context.find(d);
      if (contextTy) {
        const r1 = this.subtyping.isSubtype(this.builtinTypes.unknownType, contextTy, scope);
        const r2 = this.subtyping.isSubtype(contextTy, this.builtinTypes.unknownType, scope);
        if (r1.normalizationTooComplex || r2.normalizationTooComplex) this.reportError({ kind: "NormalizationTooComplex" }, fragment.location);
        const isUnknown = r1.isSubtype && r2.isSubtype;
        if (isUnknown) return this.builtinTypes.unknownType;
      }
    }
    return undefined;
  }

  private getOrCreateNegation(baseType: TypeId): TypeId {
    let cachedResult = this.cachedNegations.get(baseType);
    if (!cachedResult) {
      cachedResult = this.arena.addType(negationType(baseType));
      this.cachedNegations.set(baseType, cachedResult);
    }
    return cachedResult;
  }

  private shouldSkipRuntimeErrorTesting(test: TypeId): boolean {
    const t = follow(test);
    return is(t, "NeverType", "TypeFunctionInstanceType");
  }
}

export function checkNonStrict(
  builtinTypes: BuiltinTypes,
  typeFunctionRuntime: TypeFunctionRuntime,
  unifierState: UnifierSharedState,
  dfg: DataFlowGraph,
  limits: TypeCheckLimits,
  sourceModule: SourceModule,
  module: Module,
): void {
  const typeChecker = new NonStrictTypeChecker(module.internalTypes, builtinTypes, typeFunctionRuntime, unifierState, dfg, limits, module);
  typeChecker.visitStatBlock(sourceModule.root);
  copyErrors(module.errors, module.interfaceTypes, builtinTypes);

  // Non-strict mode does not report unknown requires.
  const errors = module.errors;
  let kept = 0;
  for (const err of errors) {
    if (err.data.kind !== "UnknownRequire") errors[kept++] = err;
  }
  errors.length = kept;
}
