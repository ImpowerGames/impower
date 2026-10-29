// Type function reduction, ported from Luau's `TypeFunction.h`/
// `TypeFunction.cpp`; Luau is MIT-licensed (see `LICENSE-luau.txt`).

import type { Constraint, ConstraintV } from "./Constraint";
import type { ConstraintSolver } from "./ConstraintSolver";
import { LuauTypeError } from "./Error";
import { Location } from "./Location";
import type { Normalizer } from "./Normalize";
import type { Scope } from "./Scope";
import type { Subtyping } from "./Subtyping";
import {
  boundType,
  boundTypePack,
  emplaceType,
  emplaceTypePack,
  follow,
  followPack,
  get,
  getPack,
  is,
  isPack,
  TypeFunctionInstanceState,
  type BuiltinTypes,
  type ExternType,
  type FunctionType,
  type GenericType,
  type GenericTypePack,
  type TypeArena,
  type TypeFunctionInstanceType,
  type TypeFunctionInstanceTypePack,
  type TypeId,
  type TypePackId,
  type TypePackVariant,
  type TypeVariant,
} from "./Type";
import { RecursionLimitError, TypeOnceVisitor } from "./VisitType";

const TYPE_FUNCTION_GRAPH_REDUCTION_MAXIMUM_STEPS = 1_000_000;

export class TypeFunctionRuntime {
  allowEvaluation = true;
  rootScope: Scope | undefined;
  messages: string[] = [];
}

export interface TypeCheckLimits {
  instantiationChildLimit?: number;
  unifierIterationLimit?: number;
}

export class TypeFunctionContext {
  readonly arena: TypeArena;
  readonly builtins: BuiltinTypes;
  readonly scope: Scope;
  readonly normalizer: Normalizer;
  readonly typeFunctionRuntime: TypeFunctionRuntime;
  readonly limits: TypeCheckLimits;
  readonly subtyping: Subtyping;
  readonly solver: ConstraintSolver | undefined;
  readonly constraint: Constraint | undefined;
  userFuncName: string | undefined;
  freshInstances: TypeId[] = [];

  constructor(options: {
    arena: TypeArena;
    builtins: BuiltinTypes;
    scope: Scope;
    normalizer: Normalizer;
    typeFunctionRuntime: TypeFunctionRuntime;
    limits?: TypeCheckLimits;
    subtyping: Subtyping;
    solver?: ConstraintSolver;
    constraint?: Constraint;
  }) {
    this.arena = options.arena;
    this.builtins = options.builtins;
    this.scope = options.scope;
    this.normalizer = options.normalizer;
    this.typeFunctionRuntime = options.typeFunctionRuntime;
    this.limits = options.limits ?? {};
    this.subtyping = options.subtyping;
    this.solver = options.solver;
    this.constraint = options.constraint;
  }

  static fromSolver(cs: ConstraintSolver, scope: Scope, constraint: Constraint, subtyping: Subtyping): TypeFunctionContext {
    return new TypeFunctionContext({
      arena: cs.arena,
      builtins: cs.builtinTypes,
      scope,
      normalizer: cs.normalizer,
      typeFunctionRuntime: cs.typeFunctionRuntime,
      limits: cs.limits,
      subtyping,
      solver: cs,
      constraint,
    });
  }

  pushConstraint(c: ConstraintV): Constraint {
    const solver = this.solver;
    if (!solver) throw new Error("pushConstraint needs a constraint solver");
    const constraint = this.constraint;
    const location = constraint ? constraint.location : new Location();
    const newConstraint = solver.pushConstraint(this.scope, location, c, constraint ? constraint.moduleName : solver.representativeModuleName);
    if (constraint) solver.inheritBlocks(constraint, newConstraint);
    return newConstraint;
  }
}

export const enum Reduction {
  MaybeOk,
  Irreducible,
  Erroneous,
}

export interface TypeFunctionReductionResult<T> {
  result: T | undefined;
  reductionStatus: Reduction;
  blockedTypes: TypeId[];
  blockedPacks: TypePackId[];
  error?: string;
  messages?: string[];
}

export function reductionResult<T>(
  result: T | undefined,
  reductionStatus: Reduction,
  blockedTypes: TypeId[] = [],
  blockedPacks: TypePackId[] = [],
): TypeFunctionReductionResult<T> {
  return { result, reductionStatus, blockedTypes, blockedPacks };
}

export type ReducerFunction<T> = (
  instance: T,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
) => TypeFunctionReductionResult<T>;

export interface TypeFunction {
  readonly name: string;
  readonly reducer: ReducerFunction<TypeId>;
  readonly canReduceGenerics: boolean;
}

export interface TypePackFunction {
  readonly name: string;
  readonly reducer: ReducerFunction<TypePackId>;
  readonly canReduceGenerics: boolean;
}

export class FunctionGraphReductionResult {
  errors: LuauTypeError[] = [];
  messages: LuauTypeError[] = [];
  blockedTypes = new Set<TypeId>();
  blockedPacks = new Set<TypePackId>();
  reducedTypes = new Set<TypeId>();
  reducedPacks = new Set<TypePackId>();
  irreducibleTypes = new Set<TypeId>();
}

type TypeOrTypePackId = TypeId | TypePackId;

class InstanceCollector extends TypeOnceVisitor {
  readonly recordedTys = new Set<TypeId>();
  readonly tys: TypeId[] = [];
  readonly recordedTps = new Set<TypePackId>();
  readonly tps: TypePackId[] = [];
  readonly typeFunctionInstanceStack: TypeOrTypePackId[] = [];
  readonly cyclicInstance: TypeId[] = [];

  constructor() {
    super("InstanceCollector", true);
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    if (v.kind === "TypeFunctionInstanceType") {
      this.typeFunctionInstanceStack.push(ty);
      if (!this.recordedTys.has(ty)) {
        this.recordedTys.add(ty);
        this.tys.unshift(ty);
      }
      for (const p of v.typeArguments) this.traverse(p);
      for (const p of v.packArguments) this.traversePack(p);
      this.typeFunctionInstanceStack.pop();
      return false;
    }
    if (v.kind === "ExternType") return false;
    return true;
  }

  override cycle(ty: TypeId): void {
    const t = follow(ty);
    if (get(t, "TypeFunctionInstanceType") && this.typeFunctionInstanceStack.includes(t)) this.cyclicInstance.push(t);
  }

  override visitTypePack(tp: TypePackId, v: TypePackVariant): boolean {
    if (v.kind === "TypeFunctionInstanceTypePack") {
      this.typeFunctionInstanceStack.push(tp);
      if (!this.recordedTps.has(tp)) {
        this.recordedTps.add(tp);
        this.tps.unshift(tp);
      }
      for (const p of v.typeArguments) this.traverse(p);
      for (const p of v.packArguments) this.traversePack(p);
      this.typeFunctionInstanceStack.pop();
      return false;
    }
    return true;
  }
}

class UnscopedGenericFinder extends TypeOnceVisitor {
  scopeGenTys: TypeId[] = [];
  scopeGenTps: TypePackId[] = [];
  foundUnscoped = false;

  constructor() {
    super("UnscopedGenericFinder", true);
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    switch (v.kind) {
      case "GenericType":
        return this.visitGeneric(ty, v);
      case "FunctionType":
        return this.visitFunction(v);
      case "ExternType":
        return this.visitExtern(v);
      default:
        return !this.foundUnscoped;
    }
  }

  override visitTypePack(tp: TypePackId, v: TypePackVariant): boolean {
    if (v.kind === "GenericTypePack") return this.visitGenericPack(tp, v);
    return !this.foundUnscoped;
  }

  private visitGeneric(ty: TypeId, _v: GenericType): boolean {
    if (!this.scopeGenTys.includes(ty)) this.foundUnscoped = true;
    return false;
  }

  private visitGenericPack(tp: TypePackId, _v: GenericTypePack): boolean {
    if (!this.scopeGenTps.includes(tp)) this.foundUnscoped = true;
    return false;
  }

  private visitFunction(ftv: FunctionType): boolean {
    const startTyCount = this.scopeGenTys.length;
    const startTpCount = this.scopeGenTps.length;
    this.scopeGenTys.push(...ftv.generics);
    this.scopeGenTps.push(...ftv.genericPacks);
    this.traversePack(ftv.argTypes);
    this.traversePack(ftv.retTypes);
    this.scopeGenTys.length = startTyCount;
    this.scopeGenTps.length = startTpCount;
    return false;
  }

  private visitExtern(_v: ExternType): boolean {
    return false;
  }
}

const enum SkipTestResult {
  CyclicTypeFunction,
  Irreducible,
  Stuck,
  Generic,
  Defer,
  Okay,
}

class TypeFunctionReducer {
  readonly irreducible = new Set<TypeOrTypePackId>();
  readonly result = new FunctionGraphReductionResult();

  constructor(
    readonly queuedTys: TypeId[],
    readonly queuedTps: TypePackId[],
    readonly cyclicTypeFunctions: TypeId[],
    readonly location: Location,
    readonly ctx: TypeFunctionContext,
    readonly force = false,
  ) {}

  testForSkippability(ty: TypeId): SkipTestResult {
    const queue: TypeId[] = [follow(ty)];
    const seen = new Set<TypeId>();
    while (queue.length) {
      const t = queue.shift()!;
      if (seen.has(t)) continue;
      const tfit = get(t, "TypeFunctionInstanceType");
      if (tfit) {
        if (tfit.state === TypeFunctionInstanceState.Stuck) return SkipTestResult.Stuck;
        else if (tfit.state === TypeFunctionInstanceState.Solved) return SkipTestResult.Generic;
        for (const cyclicTy of this.cyclicTypeFunctions) if (t === cyclicTy) return SkipTestResult.CyclicTypeFunction;
        if (!this.irreducible.has(t)) return SkipTestResult.Defer;
        return SkipTestResult.Irreducible;
      } else if (is(t, "GenericType")) {
        return SkipTestResult.Generic;
      } else {
        const it = get(t, "IntersectionType");
        if (it) for (const part of it.parts) queue.push(follow(part));
      }
      seen.add(t);
    }
    return SkipTestResult.Okay;
  }

  testForSkippabilityPack(tp: TypePackId): SkipTestResult {
    tp = followPack(tp);
    if (isPack(tp, "TypeFunctionInstanceTypePack")) {
      return this.irreducible.has(tp) ? SkipTestResult.Irreducible : SkipTestResult.Defer;
    } else if (isPack(tp, "GenericTypePack")) {
      return SkipTestResult.Generic;
    }
    return SkipTestResult.Okay;
  }

  private replaceType(subject: TypeId, replacement: TypeId): void {
    if (subject.owningArena !== this.ctx.arena) {
      this.result.errors.push(
        new LuauTypeError(this.location, { kind: "InternalError", message: "Attempting to modify a type function instance from another arena" }),
      );
      return;
    }
    emplaceType(subject, boundType(replacement));
    this.result.reducedTypes.add(subject);
  }

  private replacePack(subject: TypePackId, replacement: TypePackId): void {
    if (subject.owningArena !== this.ctx.arena) {
      this.result.errors.push(
        new LuauTypeError(this.location, { kind: "InternalError", message: "Attempting to modify a type function instance from another arena" }),
      );
      return;
    }
    emplaceTypePack(subject, boundTypePack(replacement));
    this.result.reducedPacks.add(subject);
  }

  private getState(ty: TypeId): TypeFunctionInstanceState {
    return get(ty, "TypeFunctionInstanceType")!.state;
  }

  private setState(ty: TypeId, state: TypeFunctionInstanceState): void {
    if (ty.owningArena !== this.ctx.arena) return;
    get(ty, "TypeFunctionInstanceType")!.state = state;
  }

  private handleTypeReduction(subject: TypeId, reduction: TypeFunctionReductionResult<TypeId>): void {
    for (const message of reduction.messages ?? []) {
      this.result.messages.push(new LuauTypeError(this.location, { kind: "UserDefinedTypeFunctionError", message }));
    }
    if (reduction.result) {
      this.replaceType(subject, reduction.result);
      for (const ty of this.ctx.freshInstances) {
        this.queuedTys.push(ty);
        if (this.ctx.solver) this.ctx.pushConstraint({ kind: "ReduceConstraint", ty });
      }
    } else {
      this.irreducible.add(subject);
      if (reduction.error !== undefined) {
        this.result.errors.push(new LuauTypeError(this.location, { kind: "UserDefinedTypeFunctionError", message: reduction.error }));
      }
      if (reduction.reductionStatus !== Reduction.MaybeOk || this.force) {
        if (this.getState(subject) === TypeFunctionInstanceState.Unsolved) {
          if (reduction.reductionStatus === Reduction.Erroneous) this.setState(subject, TypeFunctionInstanceState.Stuck);
          else if (reduction.reductionStatus === Reduction.Irreducible) this.setState(subject, TypeFunctionInstanceState.Solved);
          else this.setState(subject, TypeFunctionInstanceState.Stuck);
        }
        const tf = get(subject, "TypeFunctionInstanceType");
        if (tf && tf.function !== this.ctx.builtins.typeFunctions.userFunc) {
          this.result.errors.push(new LuauTypeError(this.location, { kind: "UninhabitedTypeFunction", ty: subject }));
        }
      } else {
        for (const b of reduction.blockedTypes) this.result.blockedTypes.add(b);
        for (const b of reduction.blockedPacks) this.result.blockedPacks.add(b);
      }
    }
    this.ctx.freshInstances = [];
  }

  private handlePackReduction(subject: TypePackId, reduction: TypeFunctionReductionResult<TypePackId>): void {
    for (const message of reduction.messages ?? []) {
      this.result.messages.push(new LuauTypeError(this.location, { kind: "UserDefinedTypeFunctionError", message }));
    }
    if (reduction.result) {
      this.replacePack(subject, reduction.result);
      for (const ty of this.ctx.freshInstances) {
        this.queuedTys.push(ty);
        if (this.ctx.solver) this.ctx.pushConstraint({ kind: "ReduceConstraint", ty });
      }
    } else {
      this.irreducible.add(subject);
      if (reduction.error !== undefined) {
        this.result.errors.push(new LuauTypeError(this.location, { kind: "UserDefinedTypeFunctionError", message: reduction.error }));
      }
      if (reduction.reductionStatus !== Reduction.MaybeOk || this.force) {
        this.result.errors.push(new LuauTypeError(this.location, { kind: "UninhabitedTypePackFunction", tp: subject }));
      } else {
        for (const b of reduction.blockedTypes) this.result.blockedTypes.add(b);
        for (const b of reduction.blockedPacks) this.result.blockedPacks.add(b);
      }
    }
    this.ctx.freshInstances = [];
  }

  done(): boolean {
    return this.queuedTys.length === 0 && this.queuedTps.length === 0;
  }

  private testParameters(
    subject: TypeOrTypePackId,
    isType: boolean,
    tfit: TypeFunctionInstanceType | TypeFunctionInstanceTypePack,
  ): boolean {
    for (const p of tfit.typeArguments) {
      const skip = this.testForSkippability(p);
      if (skip === SkipTestResult.Stuck) {
        this.irreducible.add(subject);
        if (isType) this.setState(subject as TypeId, TypeFunctionInstanceState.Stuck);
        return false;
      }
      if (skip === SkipTestResult.Irreducible || (skip === SkipTestResult.Generic && !tfit.function.canReduceGenerics)) {
        this.irreducible.add(subject);
        if (skip === SkipTestResult.Generic && isType) this.setState(subject as TypeId, TypeFunctionInstanceState.Solved);
        return false;
      } else if (skip === SkipTestResult.Defer) {
        if (isType) this.queuedTys.push(subject as TypeId);
        else this.queuedTps.push(subject as TypePackId);
        return false;
      }
    }
    for (const p of tfit.packArguments) {
      const skip = this.testForSkippabilityPack(p);
      if (skip === SkipTestResult.Irreducible || (skip === SkipTestResult.Generic && !tfit.function.canReduceGenerics)) {
        this.irreducible.add(subject);
        return false;
      } else if (skip === SkipTestResult.Defer) {
        if (isType) this.queuedTys.push(subject as TypeId);
        else this.queuedTps.push(subject as TypePackId);
        return false;
      }
    }
    return true;
  }

  private stepType(): void {
    const subject = follow(this.queuedTys.shift()!);
    if (this.irreducible.has(subject)) return;
    const tfit = get(subject, "TypeFunctionInstanceType");
    if (!tfit) return;
    if (tfit.function.name === "user") {
      const finder = new UnscopedGenericFinder();
      finder.traverse(subject);
      if (finder.foundUnscoped) {
        this.irreducible.add(subject);
        this.result.irreducibleTypes.add(subject);
        if (this.getState(subject) === TypeFunctionInstanceState.Unsolved) this.setState(subject, TypeFunctionInstanceState.Solved);
        return;
      }
    }
    const testCyclic = this.testForSkippability(subject);
    if (!this.testParameters(subject, true, tfit) && testCyclic !== SkipTestResult.CyclicTypeFunction) return;
    this.ctx.userFuncName = tfit.userFuncName;
    const result = tfit.function.reducer(subject, tfit.typeArguments, tfit.packArguments, this.ctx);
    this.handleTypeReduction(subject, result);
  }

  private stepPack(): void {
    const subject = followPack(this.queuedTps.shift()!);
    if (this.irreducible.has(subject)) return;
    const tfit = getPack(subject, "TypeFunctionInstanceTypePack");
    if (!tfit) return;
    if (!this.testParameters(subject, false, tfit)) return;
    const result = tfit.function.reducer(subject, tfit.typeArguments, tfit.packArguments, this.ctx);
    this.handlePackReduction(subject, result);
  }

  step(): void {
    if (this.queuedTys.length) this.stepType();
    else if (this.queuedTps.length) this.stepPack();
  }
}

function reduceFunctionsInternal(
  queuedTys: TypeId[],
  queuedTps: TypePackId[],
  cyclics: TypeId[],
  location: Location,
  ctx: TypeFunctionContext,
  force: boolean,
): FunctionGraphReductionResult {
  const reducer = new TypeFunctionReducer(queuedTys, queuedTps, cyclics, location, ctx, force);
  let iterationCount = 0;
  const sharedState = ctx.normalizer.sharedState;
  if (sharedState.reentrantTypeReduction) return new FunctionGraphReductionResult();
  sharedState.reentrantTypeReduction = true;
  try {
    while (!reducer.done()) {
      reducer.step();
      ++iterationCount;
      if (iterationCount > TYPE_FUNCTION_GRAPH_REDUCTION_MAXIMUM_STEPS) {
        reducer.result.errors.push(new LuauTypeError(location, { kind: "CodeTooComplex" }));
        break;
      }
    }
  } finally {
    sharedState.reentrantTypeReduction = false;
  }
  return reducer.result;
}

export function reduceTypeFunctions(entrypoint: TypeId, location: Location, ctx: TypeFunctionContext, force = false): FunctionGraphReductionResult {
  const collector = new InstanceCollector();
  try {
    collector.traverse(entrypoint);
  } catch (e) {
    if (e instanceof RecursionLimitError) return new FunctionGraphReductionResult();
    throw e;
  }
  if (!collector.tys.length && !collector.tps.length) return new FunctionGraphReductionResult();
  return reduceFunctionsInternal(collector.tys, collector.tps, collector.cyclicInstance, location, ctx, force);
}

export function reduceTypeFunctionsPack(
  entrypoint: TypePackId,
  location: Location,
  ctx: TypeFunctionContext,
  force = false,
): FunctionGraphReductionResult {
  const collector = new InstanceCollector();
  try {
    collector.traversePack(entrypoint);
  } catch (e) {
    if (e instanceof RecursionLimitError) return new FunctionGraphReductionResult();
    throw e;
  }
  if (!collector.tys.length && !collector.tps.length) return new FunctionGraphReductionResult();
  return reduceFunctionsInternal(collector.tys, collector.tps, collector.cyclicInstance, location, ctx, force);
}

export function isPending(ty: TypeId, solver: ConstraintSolver | undefined): boolean {
  const tfit = get(ty, "TypeFunctionInstanceType");
  if (tfit && tfit.state === TypeFunctionInstanceState.Unsolved) return true;
  return is(ty, "BlockedType", "PendingExpansionType") || (solver !== undefined && solver.hasUnresolvedConstraints(ty));
}
