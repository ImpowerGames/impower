// The builtin type functions, such as `add`, `index` and `refine`, ported from
// Luau's `BuiltinTypeFunctions.h`/`BuiltinTypeFunctions.cpp`, with the reducer
// of `user` from `UserDefinedTypeFunction.cpp`; Luau is MIT-licensed (see
// `LICENSE-luau.txt`).
//
// A reducer receives a type function instance and its arguments, and reduces
// the instance to a type, declares it erroneous, or names the types it waits
// on. `TypeFunctionContext` and its `pushConstraint`, which Luau defines in
// this file, live in `TypeFunction.ts`.
//
// `BuiltinTypes.typeFunctions` creates the functions through the factory this
// module registers with `Type.ts` as it loads.

import type { LuauTypeError } from "./Error";
import { instantiate2Pack } from "./Instantiation2";
import { Location } from "./Location";
import { NormalizationResult, type Normalizer } from "./Normalize";
import { OverloadResolver } from "./OverloadResolver";
import type { Scope } from "./Scope";
import { intersectWithSimpleDiscriminant, simplifyIntersection, simplifyUnion } from "./Simplify";
import { Substitution } from "./Substitution";
import { Subtyping } from "./Subtyping";
import {
  boundType,
  compareNames,
  emplaceType,
  first,
  flatOptions,
  follow,
  functionType,
  genericType,
  get,
  getPack,
  getSingleton,
  InternalCompilerError,
  intersectionType,
  is,
  isNil,
  isNumber,
  isString,
  metatableType,
  Polarity,
  PrimitiveKind,
  registerBuiltinTypeFunctions,
  stringSingleton,
  TypeFun,
  TypeFunctionInstanceState,
  typeFunctionInstanceType,
  unionType,
  type BuiltinTypes,
  type GenericTypeDefinition,
  type Props,
  type TableIndexer,
  type TypeArena,
  type TypeId,
  type TypePackId,
  type TypeVariant,
  type UnionType,
} from "./Type";
import {
  isPending,
  Reduction,
  reductionResult,
  type ReducerFunction,
  type TypeFunction,
  type TypeFunctionContext,
  type TypeFunctionReductionResult,
  type TypeFunctionRuntime,
} from "./TypeFunction";
import { TypeIds } from "./TypeIds";
import {
  addUnion,
  extendTypePack,
  findMetatableEntry,
  getApproximateReturnTypeForFunctionCall,
  isApproximatelyFalsyType,
  isApproximatelyTruthyType,
  trackInteriorFreeType,
  trackInteriorFreeTypePack,
} from "./TypeUtils";
import { Unifier2, UnifyResult } from "./Unifier2";
import { RecursionLimitError, TypeOnceVisitor } from "./VisitType";

// Luau's `LuauTypeFamilyApplicationCartesianProductLimit`.
const TYPE_FAMILY_APPLICATION_CARTESIAN_PRODUCT_LIMIT = 5_000;
// Luau's `LuauStepRefineRecursionLimit`.
const STEP_REFINE_RECURSION_LIMIT = 64;

// ---------------------------------------------------------------------------
// Shared machinery
// ---------------------------------------------------------------------------

/**
 * Distributes a type function over its first union argument:
 * `op (a | b) (c | d)` is `(op a (c | d)) | (op b (c | d))`, which is
 * `(op a c) | (op a d) | (op b c) | (op b d)`. Returns undefined when no
 * argument is a union.
 */
function tryDistributeTypeFunctionApp<Args extends unknown[]>(
  f: (
    instance: TypeId,
    typeParams: TypeId[],
    packParams: TypePackId[],
    ctx: TypeFunctionContext,
    ...args: Args
  ) => TypeFunctionReductionResult<TypeId>,
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
  ...args: Args
): TypeFunctionReductionResult<TypeId> | undefined {
  let reductionStatus = Reduction.MaybeOk;
  const blockedTypes: TypeId[] = [];
  const results: TypeId[] = [];
  let cartesianProductSize = 1;

  let firstUnion: UnionType | undefined;
  let unionIndex = 0;

  const typeArguments = [...typeParams];
  for (let i = 0; i < typeArguments.length; ++i) {
    const ut = get(follow(typeArguments[i]!), "UnionType");
    if (!ut) continue;

    // Only the first union is distributed here. `f` is recursive, and
    // receives each of its options in its place, so it distributes any union
    // after it by the same rule.
    if (!firstUnion && ut) {
      firstUnion = ut;
      unionIndex = i;
    }

    cartesianProductSize *= flatOptions(ut).length;

    if (TYPE_FAMILY_APPLICATION_CARTESIAN_PRODUCT_LIMIT <= cartesianProductSize) {
      return reductionResult<TypeId>(undefined, Reduction.Erroneous);
    }
  }

  // Without a union argument, there is nothing to distribute.
  if (!firstUnion) return undefined;

  for (const option of flatOptions(firstUnion)) {
    typeArguments[unionIndex] = option;

    const result = f(instance, typeArguments, packParams, ctx, ...args);
    blockedTypes.push(...result.blockedTypes);
    if (result.reductionStatus !== Reduction.MaybeOk) reductionStatus = result.reductionStatus;

    if (reductionStatus !== Reduction.MaybeOk || !result.result) break;
    else results.push(result.result);
  }

  if (reductionStatus !== Reduction.MaybeOk || blockedTypes.length !== 0) {
    return reductionResult<TypeId>(undefined, reductionStatus, blockedTypes);
  }

  if (results.length !== 0) {
    if (results.length === 1) return reductionResult(results[0]!, Reduction.MaybeOk);

    const resultTy = ctx.arena.addType(typeFunctionInstanceType(ctx.builtins.typeFunctions.unionFunc, results, []));

    ctx.freshInstances.push(resultTy);
    return reductionResult(resultTy, Reduction.MaybeOk);
  }

  return undefined;
}

/**
 * The return pack of a call to `fnTy` with `argsPack`, through overload
 * resolution and unification, or undefined when no overload fits.
 */
function solveFunctionCall(ctx: TypeFunctionContext, location: Location, fnTy: TypeId, argsPack: TypePackId): TypePackId | undefined {
  const resolver = new OverloadResolver(ctx.builtins, ctx.arena, ctx.normalizer, ctx.typeFunctionRuntime, ctx.scope, ctx.limits, location);

  const uniqueTypes = new Set<TypeId>();
  const resolution = resolver.resolveOverload(fnTy, argsPack, location, uniqueTypes, /* useFreeTypeBounds */ false);

  if (resolution.ok.length === 0 && resolution.potentialOverloads.length === 0) return undefined;

  const selected = resolution.getUnambiguousOverload();

  if (selected.overload === undefined) return undefined;

  let retPack = ctx.arena.freshTypePack(ctx.scope, Polarity.Positive);
  const prospectiveFunction = ctx.arena.addType(functionType(argsPack, retPack));

  // The unifier computes the return pack here. The constraints and generic
  // substitutions the overload implies would give it directly.
  const unifier = new Unifier2(ctx.arena, ctx.builtins, ctx.scope);

  const unifyResult = unifier.unify(selected.overload, prospectiveFunction);

  switch (unifyResult) {
    case UnifyResult.Ok:
      break;
    case UnifyResult.OccursCheckFailed:
      return undefined;
    case UnifyResult.TooComplex:
      return undefined;
  }

  if (unifier.genericSubstitutions.size !== 0 || unifier.genericPackSubstitutions.size !== 0) {
    const newRetTp = getApproximateReturnTypeForFunctionCall(selected.overload) ?? ctx.builtins.errorTypePack;

    const subst = instantiate2Pack(
      ctx.arena,
      unifier.genericSubstitutions,
      unifier.genericPackSubstitutions,
      ctx.subtyping,
      ctx.scope,
      newRetTp,
    );

    if (!subst) return undefined;

    retPack = subst;
  }

  // A generic metamethod's instantiation can mint free types. They are
  // recorded so that they are generalized later, rather than reaching type
  // checking free.
  for (const ty of unifier.newFreshTypes) trackInteriorFreeType(ctx.scope, ty);

  for (const tp of unifier.newFreshTypePacks) trackInteriorFreeTypePack(ctx.scope, tp);

  return retPack;
}

// ---------------------------------------------------------------------------
// Unary operators
// ---------------------------------------------------------------------------

function notTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 1 || packParams.length !== 0) {
    throw new InternalCompilerError("not type function: encountered a type function instance without the required argument structure");
  }

  const ty = follow(typeParams[0]!);

  if (ty === instance) return reductionResult(ctx.builtins.neverType, Reduction.MaybeOk);

  if (isPending(ty, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [ty]);

  const result = tryDistributeTypeFunctionApp(notTypeFunction, instance, typeParams, packParams, ctx);
  if (result) return result;

  // `not` operates on anything and always returns a `boolean`.
  return reductionResult(ctx.builtins.booleanType, Reduction.MaybeOk);
}

function lenTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 1 || packParams.length !== 0) {
    throw new InternalCompilerError("len type function: encountered a type function instance without the required argument structure");
  }

  const operandTy = follow(typeParams[0]!);

  if (operandTy === instance) return reductionResult(ctx.builtins.neverType, Reduction.MaybeOk);

  // The operand must be resolved enough to reduce; `typeFromNormal` below
  // also needs local types resolved.
  if (isPending(operandTy, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [operandTy]);

  const normTy = ctx.normalizer.normalize(operandTy);
  const inhabited = ctx.normalizer.isInhabitedNormal(normTy);

  // if the type failed to normalize, we can't reduce, but know nothing about inhabitance.
  if (!normTy || inhabited === NormalizationResult.HitLimits) return reductionResult<TypeId>(undefined, Reduction.MaybeOk);

  // if the operand type is error suppressing, we can immediately reduce to `number`.
  if (normTy.shouldSuppressErrors()) return reductionResult(ctx.builtins.numberType, Reduction.MaybeOk);

  // `#` always returns a number, even if its operand is never, and the length
  // of a string is fine.
  if (inhabited === NormalizationResult.False || normTy.isSubtypeOfString()) {
    return reductionResult(ctx.builtins.numberType, Reduction.MaybeOk);
  }

  // The normalized operand stands in for an intersection or a union.
  const normalizedOperand = follow(ctx.normalizer.typeFromNormal(normTy));
  if (normTy.hasTopTable() || get(normalizedOperand, "TableType")) return reductionResult(ctx.builtins.numberType, Reduction.MaybeOk);

  const result = tryDistributeTypeFunctionApp(lenTypeFunction, instance, typeParams, packParams, ctx);
  if (result) return result;

  // `findMetatableEntry` reports errors, which the reducers discard.
  const dummy: LuauTypeError[] = [];

  let mmType = findMetatableEntry(ctx.builtins, dummy, operandTy, "__len", new Location());
  if (!mmType) {
    // A metatable without `__len` leaves the table its default length.
    if (get(normalizedOperand, "MetatableType")) return reductionResult(ctx.builtins.numberType, Reduction.MaybeOk);

    return reductionResult<TypeId>(undefined, Reduction.Erroneous);
  }

  mmType = follow(mmType);
  if (isPending(mmType, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [mmType]);

  // Only whether the metamethod can be called matters, not what it returns.
  if (!solveFunctionCall(ctx, ctx.constraint ? ctx.constraint.location : new Location(), mmType, ctx.arena.addTypePack([operandTy]))) {
    return reductionResult<TypeId>(undefined, Reduction.Erroneous);
  }

  // `len` must return a `number`.
  return reductionResult(ctx.builtins.numberType, Reduction.MaybeOk);
}

function unmTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 1 || packParams.length !== 0) {
    throw new InternalCompilerError("unm type function: encountered a type function instance without the required argument structure");
  }

  let operandTy = follow(typeParams[0]!);

  if (operandTy === instance) return reductionResult(ctx.builtins.neverType, Reduction.MaybeOk);

  // check to see if the operand type is resolved enough, and wait to reduce if not
  if (isPending(operandTy, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [operandTy]);

  operandTy = follow(operandTy);

  const normTy = ctx.normalizer.normalize(operandTy);

  // if the operand failed to normalize, we can't reduce, but know nothing about inhabitance.
  if (!normTy) return reductionResult<TypeId>(undefined, Reduction.MaybeOk);

  // if the operand is error suppressing, we can just go ahead and reduce.
  if (normTy.shouldSuppressErrors()) return reductionResult(operandTy, Reduction.MaybeOk);

  // if we have a `never`, we can never observe that the operation didn't work.
  if (is(operandTy, "NeverType")) return reductionResult(ctx.builtins.neverType, Reduction.MaybeOk);

  // If the type is exactly `number`, we can reduce now.
  if (normTy.isExactlyNumber()) return reductionResult(ctx.builtins.numberType, Reduction.MaybeOk);

  const result = tryDistributeTypeFunctionApp(unmTypeFunction, instance, typeParams, packParams, ctx);
  if (result) return result;

  const dummy: LuauTypeError[] = [];

  let mmType = findMetatableEntry(ctx.builtins, dummy, operandTy, "__unm", new Location());
  if (!mmType) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

  mmType = follow(mmType);
  if (isPending(mmType, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [mmType]);

  const retPack = solveFunctionCall(ctx, ctx.constraint ? ctx.constraint.location : new Location(), mmType, ctx.arena.addTypePack([operandTy]));
  if (!retPack) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

  const ret = first(retPack);
  if (ret) return reductionResult(ret, Reduction.MaybeOk);
  else return reductionResult<TypeId>(undefined, Reduction.Erroneous);
}

// ---------------------------------------------------------------------------
// Arithmetic and concatenation
// ---------------------------------------------------------------------------

function numericBinopTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
  metamethod: string,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("encountered a type function instance without the required argument structure");
  }

  const lhsTy = follow(typeParams[0]!);
  const rhsTy = follow(typeParams[1]!);

  // `isPending` is true of an operand that cycles back to the instance, which
  // needs a different answer.
  if (lhsTy === instance || rhsTy === instance) return reductionResult(ctx.builtins.neverType, Reduction.MaybeOk);

  // if we have a `never`, we can never observe that the math operator is unreachable.
  if (is(lhsTy, "NeverType") || is(rhsTy, "NeverType")) return reductionResult(ctx.builtins.neverType, Reduction.MaybeOk);

  const location = ctx.constraint ? ctx.constraint.location : new Location();

  // check to see if both operand types are resolved enough, and wait to reduce if not
  if (isPending(lhsTy, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [lhsTy]);
  else if (isPending(rhsTy, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [rhsTy]);

  const normLhsTy = ctx.normalizer.normalize(lhsTy);
  const normRhsTy = ctx.normalizer.normalize(rhsTy);

  // if either failed to normalize, we can't reduce, but know nothing about inhabitance.
  if (!normLhsTy || !normRhsTy) return reductionResult<TypeId>(undefined, Reduction.MaybeOk);

  // An error-suppressing operand reduces the operation to `any`, which
  // suppresses errors in the use of the result.
  if (normLhsTy.shouldSuppressErrors() || normRhsTy.shouldSuppressErrors()) return reductionResult(ctx.builtins.anyType, Reduction.MaybeOk);

  // if we're adding two `number` types, the result is `number`.
  if (normLhsTy.isExactlyNumber() && normRhsTy.isExactlyNumber()) return reductionResult(ctx.builtins.numberType, Reduction.MaybeOk);

  const result = tryDistributeTypeFunctionApp(numericBinopTypeFunction, instance, typeParams, packParams, ctx, metamethod);
  if (result) return result;

  const dummy: LuauTypeError[] = [];

  let mmType = findMetatableEntry(ctx.builtins, dummy, lhsTy, metamethod, location);
  let reversed = false;
  if (!mmType) {
    mmType = findMetatableEntry(ctx.builtins, dummy, rhsTy, metamethod, location);
    reversed = true;
  }

  if (!mmType) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

  mmType = follow(mmType);
  if (isPending(mmType, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [mmType]);

  const argPack = ctx.arena.addTypePack([lhsTy, rhsTy]);

  if (reversed) {
    const p = getPack(argPack, "TypePack")!;
    const front = p.head[0]!;
    p.head[0] = p.head[p.head.length - 1]!;
    p.head[p.head.length - 1] = front;
  }

  const retPack = solveFunctionCall(ctx, location, mmType, argPack);
  if (retPack === undefined) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

  const extracted = extendTypePack(ctx.arena, ctx.builtins, retPack, 1);
  if (extracted.head.length === 0) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

  return reductionResult(extracted.head[0]!, Reduction.MaybeOk);
}

function addTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("add type function: encountered a type function instance without the required argument structure");
  }

  return numericBinopTypeFunction(instance, typeParams, packParams, ctx, "__add");
}

function subTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("sub type function: encountered a type function instance without the required argument structure");
  }

  return numericBinopTypeFunction(instance, typeParams, packParams, ctx, "__sub");
}

function mulTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("mul type function: encountered a type function instance without the required argument structure");
  }

  return numericBinopTypeFunction(instance, typeParams, packParams, ctx, "__mul");
}

function divTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("div type function: encountered a type function instance without the required argument structure");
  }

  return numericBinopTypeFunction(instance, typeParams, packParams, ctx, "__div");
}

function idivTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError(
      "integer div type function: encountered a type function instance without the required argument structure",
    );
  }

  return numericBinopTypeFunction(instance, typeParams, packParams, ctx, "__idiv");
}

function powTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("pow type function: encountered a type function instance without the required argument structure");
  }

  return numericBinopTypeFunction(instance, typeParams, packParams, ctx, "__pow");
}

function modTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("modulo type function: encountered a type function instance without the required argument structure");
  }

  return numericBinopTypeFunction(instance, typeParams, packParams, ctx, "__mod");
}

function concatTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("concat type function: encountered a type function instance without the required argument structure");
  }

  const lhsTy = follow(typeParams[0]!);
  const rhsTy = follow(typeParams[1]!);

  // `isPending` is true of an operand that cycles back to the instance, which
  // needs a different answer.
  if (lhsTy === instance || rhsTy === instance) return reductionResult(ctx.builtins.neverType, Reduction.MaybeOk);

  // check to see if both operand types are resolved enough, and wait to reduce if not
  if (isPending(lhsTy, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [lhsTy]);
  else if (isPending(rhsTy, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [rhsTy]);

  const normLhsTy = ctx.normalizer.normalize(lhsTy);
  const normRhsTy = ctx.normalizer.normalize(rhsTy);

  // if either failed to normalize, we can't reduce, but know nothing about inhabitance.
  if (!normLhsTy || !normRhsTy) return reductionResult<TypeId>(undefined, Reduction.MaybeOk);

  // An error-suppressing operand reduces the operation to `any`, which
  // suppresses errors in the use of the result.
  if (normLhsTy.shouldSuppressErrors() || normRhsTy.shouldSuppressErrors()) return reductionResult(ctx.builtins.anyType, Reduction.MaybeOk);

  // if we have a `never`, we can never observe that the operator didn't work.
  if (is(lhsTy, "NeverType") || is(rhsTy, "NeverType")) return reductionResult(ctx.builtins.neverType, Reduction.MaybeOk);

  // Concatenating strings or numbers gives a `string`.
  if (
    (normLhsTy.isSubtypeOfString() || normLhsTy.isExactlyNumber()) &&
    (normRhsTy.isSubtypeOfString() || normRhsTy.isExactlyNumber())
  ) {
    return reductionResult(ctx.builtins.stringType, Reduction.MaybeOk);
  }

  const result = tryDistributeTypeFunctionApp(concatTypeFunction, instance, typeParams, packParams, ctx);
  if (result) return result;

  const dummy: LuauTypeError[] = [];

  let mmType = findMetatableEntry(ctx.builtins, dummy, lhsTy, "__concat", new Location());
  let reversed = false;
  if (!mmType) {
    mmType = findMetatableEntry(ctx.builtins, dummy, rhsTy, "__concat", new Location());
    reversed = true;
  }

  if (!mmType) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

  mmType = follow(mmType);
  if (isPending(mmType, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [mmType]);

  let inferredArgs: TypeId[];
  if (!reversed) inferredArgs = [lhsTy, rhsTy];
  else inferredArgs = [rhsTy, lhsTy];

  const retPack = solveFunctionCall(ctx, ctx.constraint ? ctx.constraint.location : new Location(), mmType, ctx.arena.addTypePack(inferredArgs));
  if (!retPack) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

  const extracted = extendTypePack(ctx.arena, ctx.builtins, retPack, 1);
  if (extracted.head.length === 0) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

  return reductionResult(extracted.head[0]!, Reduction.MaybeOk);
}

// ---------------------------------------------------------------------------
// Logical operators and comparisons
// ---------------------------------------------------------------------------

function isBlockedOrUnsolvedType(ty: TypeId): boolean {
  const tfit = get(ty, "TypeFunctionInstanceType");
  if (tfit && tfit.state === TypeFunctionInstanceState.Unsolved) return true;
  return is(ty, "BlockedType", "PendingExpansionType");
}

function andTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("and type function: encountered a type function instance without the required argument structure");
  }

  const lhsTy = follow(typeParams[0]!);
  const rhsTy = follow(typeParams[1]!);

  // t1 = and<lhs, t1> ~> lhs
  if (follow(rhsTy) === instance && lhsTy !== rhsTy) return reductionResult(lhsTy, Reduction.MaybeOk);
  // t1 = and<t1, rhs> ~> rhs
  if (follow(lhsTy) === instance && lhsTy !== rhsTy) return reductionResult(rhsTy, Reduction.MaybeOk);

  // check to see if both operand types are resolved enough, and wait to reduce if not
  if (isPending(lhsTy, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [lhsTy]);
  else if (isPending(rhsTy, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [rhsTy]);

  // `and` evaluates to the falsy part of the LHS when the LHS is falsy, and to the RHS type when it is truthy.
  const filteredLhs = simplifyIntersection(ctx.builtins, ctx.arena, lhsTy, ctx.builtins.falsyType);
  const overallResult = simplifyUnion(ctx.builtins, ctx.arena, rhsTy, filteredLhs.result);
  const blockedTypes: TypeId[] = [];
  for (const ty of filteredLhs.blockedTypes) blockedTypes.push(ty);
  for (const ty of overallResult.blockedTypes) blockedTypes.push(ty);
  return reductionResult(overallResult.result, Reduction.MaybeOk, blockedTypes);
}

function orTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("or type function: encountered a type function instance without the required argument structure");
  }

  const lhsTy = follow(typeParams[0]!);
  const rhsTy = follow(typeParams[1]!);

  // t1 = or<lhs, t1> ~> lhs
  if (follow(rhsTy) === instance && lhsTy !== rhsTy) return reductionResult(lhsTy, Reduction.MaybeOk);
  // t1 = or<t1, rhs> ~> rhs
  if (follow(lhsTy) === instance && lhsTy !== rhsTy) return reductionResult(rhsTy, Reduction.MaybeOk);

  // check to see if both operand types are resolved enough, and wait to reduce if not
  if (isBlockedOrUnsolvedType(lhsTy)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [lhsTy]);
  else if (isBlockedOrUnsolvedType(rhsTy)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [rhsTy]);

  // `or` evaluates to the LHS type when the LHS is truthy, and to the RHS type when it is falsy.
  const filteredLhs = simplifyIntersection(ctx.builtins, ctx.arena, lhsTy, ctx.builtins.truthyType);
  const overallResult = simplifyUnion(ctx.builtins, ctx.arena, rhsTy, filteredLhs.result);
  const blockedTypes: TypeId[] = [];
  for (const ty of filteredLhs.blockedTypes) blockedTypes.push(ty);
  for (const ty of overallResult.blockedTypes) blockedTypes.push(ty);
  return reductionResult(overallResult.result, Reduction.MaybeOk, blockedTypes);
}

function comparisonTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
  metamethod: string,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("encountered a type function instance without the required argument structure");
  }

  let lhsTy = follow(typeParams[0]!);
  let rhsTy = follow(typeParams[1]!);

  if (lhsTy === instance || rhsTy === instance) return reductionResult(ctx.builtins.neverType, Reduction.MaybeOk);

  if (isBlockedOrUnsolvedType(lhsTy)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [lhsTy]);
  else if (isBlockedOrUnsolvedType(rhsTy)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [rhsTy]);

  // The comparison type functions reduce algebraically. Comparing to `never`
  // says nothing about the other operand, so `lt<'a, never>` and
  // `lt<never, 'a>` continue. `lt<'a, t>` (or `lt<t, 'a>`) solves `'a` to be
  // `t`, and then `lt<t, t>` reduces to `boolean`.
  const canSubmitConstraint = ctx.solver !== undefined && ctx.constraint !== undefined;
  const lhsFree = get(lhsTy, "FreeType") !== undefined;
  const rhsFree = get(rhsTy, "FreeType") !== undefined;
  if (canSubmitConstraint) {
    // The comparison type functions are injective: `lt<number, t>` and
    // `lt<t, number>` imply that `t` is `number`.
    if (lhsFree && isNumber(rhsTy)) emplaceType(lhsTy, boundType(ctx.builtins.numberType));
    else if (rhsFree && isNumber(lhsTy)) emplaceType(rhsTy, boundType(ctx.builtins.numberType));
  }

  // Binding above may have rebound the operands, so they are followed again.
  lhsTy = follow(lhsTy);
  rhsTy = follow(rhsTy);

  const normLhsTy = ctx.normalizer.normalize(lhsTy);
  const normRhsTy = ctx.normalizer.normalize(rhsTy);
  const lhsInhabited = ctx.normalizer.isInhabitedNormal(normLhsTy);
  const rhsInhabited = ctx.normalizer.isInhabitedNormal(normRhsTy);

  // if either failed to normalize, we can't reduce, but know nothing about inhabitance.
  if (!normLhsTy || !normRhsTy || lhsInhabited === NormalizationResult.HitLimits || rhsInhabited === NormalizationResult.HitLimits) {
    return reductionResult<TypeId>(undefined, Reduction.MaybeOk);
  }

  // if one of the types is error suppressing, we can just go ahead and reduce.
  if (normLhsTy.shouldSuppressErrors() || normRhsTy.shouldSuppressErrors()) return reductionResult(ctx.builtins.booleanType, Reduction.MaybeOk);

  // if we have an uninhabited type (e.g. `never`), we can never observe that the comparison didn't work.
  if (lhsInhabited === NormalizationResult.False || rhsInhabited === NormalizationResult.False) {
    return reductionResult(ctx.builtins.booleanType, Reduction.MaybeOk);
  }

  // If both types are some strict subset of `string`, we can reduce now.
  if (normLhsTy.isSubtypeOfString() && normRhsTy.isSubtypeOfString()) return reductionResult(ctx.builtins.booleanType, Reduction.MaybeOk);

  // If both types are exactly `number`, we can reduce now.
  if (normLhsTy.isExactlyNumber() && normRhsTy.isExactlyNumber()) return reductionResult(ctx.builtins.booleanType, Reduction.MaybeOk);

  const result = tryDistributeTypeFunctionApp(comparisonTypeFunction, instance, typeParams, packParams, ctx, metamethod);
  if (result) return result;

  const dummy: LuauTypeError[] = [];

  let mmType = findMetatableEntry(ctx.builtins, dummy, lhsTy, metamethod, new Location());
  if (!mmType) mmType = findMetatableEntry(ctx.builtins, dummy, rhsTy, metamethod, new Location());

  if (!mmType) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

  mmType = follow(mmType);
  if (isPending(mmType, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [mmType]);

  // Only whether the metamethod can be called matters, not what it returns.
  if (!solveFunctionCall(ctx, ctx.constraint ? ctx.constraint.location : new Location(), mmType, ctx.arena.addTypePack([lhsTy, rhsTy]))) {
    return reductionResult<TypeId>(undefined, Reduction.Erroneous);
  }

  return reductionResult(ctx.builtins.booleanType, Reduction.MaybeOk);
}

function ltTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("lt type function: encountered a type function instance without the required argument structure");
  }

  return comparisonTypeFunction(instance, typeParams, packParams, ctx, "__lt");
}

function leTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("le type function: encountered a type function instance without the required argument structure");
  }

  return comparisonTypeFunction(instance, typeParams, packParams, ctx, "__le");
}

/**
 * The reducer of an `eq` type function. Luau defines it, but
 * `BuiltinTypeFunctions` has no `eq` type function that uses it.
 */
export function eqTypeFunction(
  _instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("eq type function: encountered a type function instance without the required argument structure");
  }

  const lhsTy = follow(typeParams[0]!);
  const rhsTy = follow(typeParams[1]!);

  // check to see if both operand types are resolved enough, and wait to reduce if not
  if (isPending(lhsTy, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [lhsTy]);
  else if (isPending(rhsTy, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [rhsTy]);

  const normLhsTy = ctx.normalizer.normalize(lhsTy);
  const normRhsTy = ctx.normalizer.normalize(rhsTy);
  const lhsInhabited = ctx.normalizer.isInhabitedNormal(normLhsTy);
  const rhsInhabited = ctx.normalizer.isInhabitedNormal(normRhsTy);

  // if either failed to normalize, we can't reduce, but know nothing about inhabitance.
  if (!normLhsTy || !normRhsTy || lhsInhabited === NormalizationResult.HitLimits || rhsInhabited === NormalizationResult.HitLimits) {
    return reductionResult<TypeId>(undefined, Reduction.MaybeOk);
  }

  // if one of the types is error suppressing, we can just go ahead and reduce.
  if (normLhsTy.shouldSuppressErrors() || normRhsTy.shouldSuppressErrors()) return reductionResult(ctx.builtins.booleanType, Reduction.MaybeOk);

  // if we have a `never`, we can never observe that the comparison didn't work.
  if (lhsInhabited === NormalizationResult.False || rhsInhabited === NormalizationResult.False) {
    return reductionResult(ctx.builtins.booleanType, Reduction.MaybeOk);
  }

  const dummy: LuauTypeError[] = [];

  let mmType = findMetatableEntry(ctx.builtins, dummy, lhsTy, "__eq", new Location());
  if (!mmType) mmType = findMetatableEntry(ctx.builtins, dummy, rhsTy, "__eq", new Location());

  // Without an `__eq` metamethod on either side, the comparison is allowed
  // when the intersection of the operands is inhabited.
  const intersectInhabited = ctx.normalizer.isIntersectionInhabited(lhsTy, rhsTy);
  if (!mmType) {
    // if it's inhabited, everything is okay!
    if (intersectInhabited === NormalizationResult.True) return reductionResult(ctx.builtins.booleanType, Reduction.MaybeOk);

    // Some comparisons without a common inhabitant are still accepted.
    if (intersectInhabited === NormalizationResult.False) {
      // Subtypes of `string` with no common intersection compare, but always to `false`.
      if (normLhsTy.isSubtypeOfString() && normRhsTy.isSubtypeOfString()) return reductionResult(ctx.builtins.falseType, Reduction.MaybeOk);

      // Subtypes of `boolean` with no common intersection compare, but always to `false`.
      if (normLhsTy.isSubtypeOfBooleans() && normRhsTy.isSubtypeOfBooleans()) return reductionResult(ctx.builtins.falseType, Reduction.MaybeOk);
    }

    // Otherwise, the type function is irreducible.
    return reductionResult<TypeId>(undefined, Reduction.Erroneous);
  }

  mmType = follow(mmType);
  if (isPending(mmType, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [mmType]);

  if (!solveFunctionCall(ctx, ctx.constraint ? ctx.constraint.location : new Location(), mmType, ctx.arena.addTypePack([lhsTy, rhsTy]))) {
    return reductionResult<TypeId>(undefined, Reduction.Erroneous);
  }

  return reductionResult(ctx.builtins.booleanType, Reduction.MaybeOk);
}

// ---------------------------------------------------------------------------
// Visitors and substitutions
// ---------------------------------------------------------------------------

/** Collects the types that prevent reducing a particular refinement. */
class FindRefinementBlockers extends TypeOnceVisitor {
  readonly found = new Set<TypeId>();

  constructor() {
    super("FindRefinementBlockers", /* skipBoundTypes */ true);
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    switch (v.kind) {
      case "BlockedType":
      case "PendingExpansionType":
        this.found.add(ty);
        return false;
      case "ExternType":
        return false;
      default:
        return this.visit(ty);
    }
  }
}

/** Whether a type contains any type worth refining against. */
class ContainsRefinableType extends TypeOnceVisitor {
  found = false;

  constructor() {
    super("ContainsRefinableType", /* skipBoundTypes */ true);
  }

  override visit(_ty: TypeId): boolean {
    // Any type worth refining against makes the whole type refinable.
    this.found = true;
    return false;
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    switch (v.kind) {
      case "NoRefineType":
        // `*no-refine*` is not worth refining against.
        return false;
      case "TableType":
      case "MetatableType":
      case "FunctionType":
      case "UnionType":
      case "IntersectionType":
      case "NegationType":
        return !this.found;
      default:
        return this.visit(ty);
    }
  }
}

/**
 * Removes `needle` from the unions and intersections it is a member of, and
 * replaces it with `unknown` where it stands alone.
 */
class RefineTypeScrubber extends Substitution {
  constructor(
    readonly ctx: TypeFunctionContext,
    readonly needle: TypeId,
  ) {
    super(ctx.arena);
  }

  isDirtyPack(_tp: TypePackId): boolean {
    return false;
  }

  override ignoreChildrenPack(_tp: TypePackId): boolean {
    return false;
  }

  cleanPack(tp: TypePackId): TypePackId {
    return tp;
  }

  isDirty(ty: TypeId): boolean {
    const ut = get(ty, "UnionType");
    if (ut) {
      for (const option of flatOptions(ut)) {
        if (option === this.needle) return true;
      }
    } else {
      const it = get(ty, "IntersectionType");
      if (it) {
        for (const part of flatOptions(it)) {
          if (part === this.needle) return true;
        }
      }
    }
    return ty === this.needle;
  }

  override ignoreChildren(ty: TypeId): boolean {
    return !is(ty, "UnionType", "IntersectionType");
  }

  clean(ty: TypeId): TypeId {
    const ut = get(ty, "UnionType");
    if (ut) {
      const newOptions = new TypeIds();
      for (const option of flatOptions(ut)) {
        if (option !== this.needle && !is(option, "NeverType")) newOptions.insert(option);
      }
      if (newOptions.empty()) return this.ctx.builtins.neverType;
      else if (newOptions.size === 1) return newOptions.front();
      else return this.ctx.arena.addType(unionType(newOptions.take()));
    }
    const it = get(ty, "IntersectionType");
    if (it) {
      const newParts = new TypeIds();
      for (const part of flatOptions(it)) {
        if (part !== this.needle && !is(part, "UnknownType")) newParts.insert(part);
      }
      if (newParts.empty()) return this.ctx.builtins.unknownType;
      else if (newParts.size === 1) return newParts.front();
      else return this.ctx.arena.addType(intersectionType(newParts.take()));
    }
    if (ty === this.needle) return this.ctx.builtins.unknownType;
    return ty;
  }
}

/**
 * Collects the members of a `union` instance, through nested unions and
 * nested `union` instances, and the members it must wait on.
 */
class CollectUnionTypeOptions extends TypeOnceVisitor {
  readonly options = new Set<TypeId>();
  readonly blockingTypes = new Set<TypeId>();

  constructor(readonly ctx: TypeFunctionContext) {
    super("CollectUnionTypeOptions", /* skipBoundTypes */ true);
  }

  override visit(ty: TypeId): boolean {
    this.options.add(ty);
    if (isPending(ty, this.ctx.solver)) this.blockingTypes.add(ty);
    return false;
  }

  override visitPack(_tp: TypePackId): boolean {
    return false;
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    switch (v.kind) {
      case "UnionType":
        // `union<A | B, C | D>` is taken to be `union<A, B, C, D>`.
        return true;
      case "TypeFunctionInstanceType":
        if (v.function.name !== this.ctx.builtins.typeFunctions.unionFunc.name) {
          this.options.add(ty);
          this.blockingTypes.add(ty);
          return false;
        }
        return true;
      default:
        return this.visit(ty);
    }
  }
}

/** Collects the pending types under a user-defined type function's arguments (from `UserDefinedTypeFunction.cpp`). */
class FindUserTypeFunctionBlockers extends TypeOnceVisitor {
  readonly blockingTypeMap = new Set<TypeId>();
  readonly blockingTypes: TypeId[] = [];

  constructor(readonly ctx: TypeFunctionContext) {
    super("FindUserTypeFunctionBlockers", /* skipBoundTypes */ true);
  }

  override visit(ty: TypeId): boolean {
    if (isPending(ty, this.ctx.solver)) {
      if (!this.blockingTypeMap.has(ty)) {
        this.blockingTypeMap.add(ty);
        this.blockingTypes.push(ty);
      }
    }
    return true;
  }

  override visitPack(_tp: TypePackId): boolean {
    return true;
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    if (v.kind === "ExternType") return false;
    return this.visit(ty);
  }
}


// ---------------------------------------------------------------------------
// Refinement and set operations
// ---------------------------------------------------------------------------

function isTruthyOrFalsyType(ty: TypeId): boolean {
  ty = follow(ty);
  return isApproximatelyTruthyType(ty) || isApproximatelyFalsyType(ty);
}

/** Whether `needle` is `haystack` or one of its union options. */
function occurs(haystack: TypeId, needle: TypeId, seen = new Set<TypeId>()): boolean {
  if (needle === haystack) return true;

  if (seen.has(haystack)) return false;

  seen.add(haystack);

  const ut = get(haystack, "UnionType");
  if (ut) {
    for (const option of flatOptions(ut)) if (occurs(option, needle, seen)) return true;
  }

  // As in Luau, this second walk is over the union again, not an
  // intersection; its options are all seen by now.
  const it = get(haystack, "UnionType");
  if (it) {
    for (const part of flatOptions(it)) if (occurs(part, needle, seen)) return true;
  }

  return false;
}

function refineTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length < 2 || packParams.length !== 0) {
    throw new InternalCompilerError("refine type function: encountered a type function instance without the required argument structure");
  }


  let targetTy = follow(typeParams[0]!);

  // A refine type such as `t1 where t1 = refine<T | t1, Y>` would make the
  // degenerate set type `t1 where t1 = (T | t1) & Y`, so the recursive part
  // is clipped: `refine<T | t1, Y>` becomes `refine<T, Y>`.
  if (occurs(targetTy, instance)) {
    const rts = new RefineTypeScrubber(ctx, instance);
    const result = rts.substitute(targetTy);
    if (result) targetTy = result;
  }

  const discriminantTypes: TypeId[] = [];
  for (let i = 1; i < typeParams.length; i++) {
    const discriminant = follow(typeParams[i]!);

    // Filter out any top level types that are meaningless to refine against.
    if (is(discriminant, "UnknownType", "NoRefineType")) continue;

    // A discriminant that is only `*no-refine*` (covered above), or tables,
    // metatables, unions, intersections, functions or negations containing
    // it, is not worth refining against.
    const crt = new ContainsRefinableType();
    crt.traverse(discriminant);

    if (crt.found) discriminantTypes.push(discriminant);
  }

  // Without any real refinement (all `*no-refine*`), the reduction is immediate.
  if (discriminantTypes.length === 0) return reductionResult(targetTy, Reduction.MaybeOk);

  const targetIsPending = isBlockedOrUnsolvedType(targetTy);

  // check to see if both operand types are resolved enough, and wait to reduce if not
  if (targetIsPending) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [targetTy]);
  else {
    for (const t of discriminantTypes) {
      if (isPending(t, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [t]);
    }
  }

  let stepRefineCount = 0;

  // Refines a target type by one discriminant, giving the result or the types to block on.
  const stepRefine = (target: TypeId, discriminant: TypeId): [TypeId | undefined, TypeId[]] => {
    ++stepRefineCount;
    try {
      if (STEP_REFINE_RECURSION_LIMIT > 0 && stepRefineCount > STEP_REFINE_RECURSION_LIMIT) {
        throw new RecursionLimitError("BuiltInTypeFunctions::stepRefine");
      }

      // The discriminant in particular needs a deeper check for blockers.
      const frb = new FindRefinementBlockers();
      frb.traverse(discriminant);

      if (frb.found.size !== 0) return [undefined, [...frb.found]];

      const simple = intersectWithSimpleDiscriminant(ctx.builtins, ctx.arena, target, discriminant);
      if (simple) return [simple, []];

      // This refines too early in some cases.
      const negation = get(discriminant, "NegationType");
      if (negation) {
        const primitive = get(follow(negation.ty), "PrimitiveType");
        if (primitive && primitive.type === PrimitiveKind.NilType) {
          const result = simplifyIntersection(ctx.builtins, ctx.arena, target, discriminant);
          return [result.result, []];
        }
      }

      // Simplification refines a table target properly, since the
      // discriminant is then only ever an (arbitrarily nested) table of a
      // single property type. It also handles the simple discriminants
      // `false?` and `~(false?)`: the falsy and truthy types.
      if (is(target, "TableType") || isTruthyOrFalsyType(discriminant)) {
        const result = simplifyIntersection(ctx.builtins, ctx.arena, target, discriminant);
        // Simplification considers free and generic types to be blocking,
        // which does not suit `refine`: blocked only on those, the
        // simplification is a success.
        if ([...result.blockedTypes].every((v) => is(follow(v), "FreeType", "GenericType"))) {
          return [result.result, []];
        } else return [undefined, [...result.blockedTypes]];
      }

      // In the general case, we'll still use normalization though.
      const intersection = ctx.arena.addType(intersectionType([target, discriminant]));
      const normIntersection = ctx.normalizer.normalize(intersection);
      const normType = ctx.normalizer.normalize(target);

      // if the intersection failed to normalize, we can't reduce, but know nothing about inhabitance.
      if (!normIntersection || !normType) return [undefined, []];

      const blockedTypes: TypeId[] = [];

      for (const tyvar of normIntersection.tyvars.keys()) {
        const followed = follow(tyvar);
        if (is(followed, "BlockedType")) blockedTypes.push(followed);
      }

      if (blockedTypes.length !== 0) return [undefined, blockedTypes];

      let resultTy = ctx.normalizer.typeFromNormal(normIntersection);
      // include the error type if the target type is error-suppressing and the intersection we computed is not
      if (normType.shouldSuppressErrors() && !normIntersection.shouldSuppressErrors()) {
        resultTy = addUnion(ctx.arena, ctx.builtins, [resultTy, ctx.builtins.errorType]);
      }

      return [resultTy, []];
    } finally {
      --stepRefineCount;
    }
  };

  // Refine the target by each discriminant in turn, in reverse of insertion
  // order. Blocked, the reduction waits; refined by all, the result is the
  // refined target.
  let target = targetTy;
  while (discriminantTypes.length !== 0) {
    let discriminant = discriminantTypes[discriminantTypes.length - 1]!;

    discriminant = follow(discriminant);

    // first, we'll see if simplifying the discriminant alone will solve our problem...
    const discriminantUnion = get(discriminant, "UnionType");
    if (discriminantUnion) {
      let workingType = ctx.builtins.neverType;

      for (const optionAsDiscriminant of discriminantUnion.options) {
        const simplified = simplifyUnion(ctx.builtins, ctx.arena, workingType, optionAsDiscriminant);

        if (simplified.blockedTypes.size !== 0) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [...simplified.blockedTypes]);

        workingType = simplified.result;
      }

      discriminant = workingType;
    }

    // if not, we try distributivity: a & (b | c) <=> (a & b) | (a & c)
    const distributedUnion = get(discriminant, "UnionType");
    if (distributedUnion) {
      let finalRefined = ctx.builtins.neverType;

      for (const optionAsDiscriminant of distributedUnion.options) {
        const [refined, blocked] = stepRefine(target, follow(optionAsDiscriminant));

        if (blocked.length === 0 && refined === undefined) return reductionResult<TypeId>(undefined, Reduction.MaybeOk);

        if (blocked.length !== 0) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, blocked);

        const simplified = simplifyUnion(ctx.builtins, ctx.arena, finalRefined, refined!);

        if (simplified.blockedTypes.size !== 0) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [...simplified.blockedTypes]);

        finalRefined = simplified.result;
      }

      target = finalRefined;
      discriminantTypes.pop();

      continue;
    }

    const [refined, blocked] = stepRefine(target, discriminant);

    if (blocked.length === 0 && refined === undefined) return reductionResult<TypeId>(undefined, Reduction.MaybeOk);

    if (blocked.length !== 0) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, blocked);

    target = refined!;
    discriminantTypes.pop();
  }
  return reductionResult(target, Reduction.MaybeOk);
}

function singletonTypeFunction(
  _instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 1 || packParams.length !== 0) {
    throw new InternalCompilerError("singleton type function: encountered a type function instance without the required argument structure");
  }

  const type = follow(typeParams[0]!);

  // check to see if both operand types are resolved enough, and wait to reduce if not
  if (isPending(type, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [type]);

  let followed = type;
  // we want to follow through a negation here as well.
  const negation = get(followed, "NegationType");
  if (negation) followed = follow(negation.ty);

  // if we have a singleton type or `nil`, which is its own singleton type...
  if (get(followed, "SingletonType") || isNil(followed)) return reductionResult(type, Reduction.MaybeOk);

  // otherwise, we'll return the top type, `unknown`.
  return reductionResult(ctx.builtins.unknownType, Reduction.MaybeOk);
}

function unionTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (packParams.length !== 0) {
    throw new InternalCompilerError("union type function: encountered a type function instance without the required argument structure");
  }

  // if we only have one parameter, there's nothing to do.
  if (typeParams.length === 1) return reductionResult(follow(typeParams[0]!), Reduction.MaybeOk);

  const collector = new CollectUnionTypeOptions(ctx);
  collector.traverse(instance);

  if (collector.blockingTypes.size !== 0) {
    const blockingTypes = [...collector.blockingTypes];
    return reductionResult<TypeId>(undefined, Reduction.MaybeOk, blockingTypes);
  }

  let resultTy = ctx.builtins.neverType;
  for (const ty of collector.options) {
    const result = simplifyUnion(ctx.builtins, ctx.arena, resultTy, ty);
    // A free type deep in a nested union or intersection argument can still
    // block here, after the blocked types collected above.
    if (result.blockedTypes.size !== 0) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [...result.blockedTypes]);

    resultTy = result.result;
  }

  return reductionResult(resultTy, Reduction.MaybeOk);
}

function intersectTypeFunction(
  _instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (packParams.length !== 0) {
    throw new InternalCompilerError("intersect type function: encountered a type function instance without the required argument structure");
  }

  // if we only have one parameter, there's nothing to do.
  if (typeParams.length === 1) return reductionResult(follow(typeParams[0]!), Reduction.MaybeOk);

  // we need to follow all of the type parameters.
  const types: TypeId[] = [];
  for (const ty of typeParams) types.push(follow(ty));

  // if we only have two parameters and one is `*no-refine*`, we're all done.
  if (types.length === 2 && get(types[1], "NoRefineType")) return reductionResult(types[0]!, Reduction.MaybeOk);
  else if (types.length === 2 && get(types[0], "NoRefineType")) return reductionResult(types[1]!, Reduction.MaybeOk);

  // Wait on any operand not resolved enough. A `never` operand makes the
  // intersection `never`, which reduces directly.
  for (const ty of types) {
    if (isPending(ty, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [ty]);
    else if (get(ty, "NeverType")) return reductionResult(ctx.builtins.neverType, Reduction.MaybeOk);
  }

  // fold over the types with `simplifyIntersection`
  let resultTy = ctx.builtins.unknownType;
  // collect types which caused intersection to return never
  const unintersectableTypes = new Set<TypeId>();
  for (const ty of types) {
    // skip any `*no-refine*` types.
    if (get(ty, "NoRefineType")) continue;

    const simpleResult = intersectWithSimpleDiscriminant(ctx.builtins, ctx.arena, resultTy, ty);
    if (simpleResult) {
      if (get(simpleResult, "NeverType")) unintersectableTypes.add(follow(ty));
      else resultTy = simpleResult;
      continue;
    }

    const result = simplifyIntersection(ctx.builtins, ctx.arena, resultTy, ty);

    // A `never` intersection records the type intersected, and the fold
    // continues with the rest.
    if (get(result.result, "NeverType")) {
      unintersectableTypes.add(follow(ty));
      continue;
    }
    for (const blockedType of result.blockedTypes) {
      if (!get(blockedType, "GenericType")) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [...result.blockedTypes]);
    }

    resultTy = result.result;
  }

  if (unintersectableTypes.size !== 0) {
    unintersectableTypes.add(resultTy);
    if (unintersectableTypes.size > 1) {
      const intersection = ctx.arena.addType(intersectionType([...unintersectableTypes]));
      return reductionResult(intersection, Reduction.MaybeOk);
    } else {
      return reductionResult([...unintersectableTypes][0]!, Reduction.MaybeOk);
    }
  }
  // A `never` result makes for poor autocomplete, so the intersection is
  // produced plainly instead.
  if (get(resultTy, "NeverType")) {
    const intersection = ctx.arena.addType(intersectionType([...typeParams]));
    return reductionResult(intersection, Reduction.MaybeOk);
  }

  return reductionResult(resultTy, Reduction.MaybeOk);
}

// ---------------------------------------------------------------------------
// keyof and rawkeyof
// ---------------------------------------------------------------------------

/**
 * Adds the keys of `ty` to `result`, following `__index` metamethods unless
 * `isRaw`. Returns false when `result` is to be ignored because the answer is
 * all strings.
 */
function computeKeysOf(ty: TypeId, result: Set<string | undefined>, seen: Set<TypeId>, isRaw: boolean, ctx: TypeFunctionContext): boolean {
  // if the type is the top table type, the answer is just "all strings"
  if (get(ty, "PrimitiveType")) return false;

  // if we've already seen this type, we can do nothing
  if (seen.has(ty)) return true;
  seen.add(ty);

  // if we have a particular table type, we can insert the keys
  const tableTy = get(ty, "TableType");
  if (tableTy) {
    if (tableTy.indexer) {
      // if we have a string indexer, the answer is, again, "all strings"
      if (isString(tableTy.indexer.indexType)) return false;
    }

    for (const [key] of tableTy.props) result.add(key);
    return true;
  }

  // otherwise, we have a metatable to deal with
  const metatableTy = get(ty, "MetatableType");
  if (metatableTy) {
    let res = true;

    if (!isRaw) {
      const dummy: LuauTypeError[] = [];

      const mmType = findMetatableEntry(ctx.builtins, dummy, ty, "__index", new Location());
      if (mmType) res = res && computeKeysOf(mmType, result, seen, isRaw, ctx);
    }

    res = res && computeKeysOf(metatableTy.table, result, seen, isRaw, ctx);

    return res;
  }

  const classTy = get(ty, "ExternType");
  if (classTy) {
    for (const [key] of classTy.props) result.add(key);

    let res = true;
    if (classTy.metatable && !isRaw) {
      const dummy: LuauTypeError[] = [];

      const mmType = findMetatableEntry(ctx.builtins, dummy, ty, "__index", new Location());
      if (mmType) res = res && computeKeysOf(mmType, result, seen, isRaw, ctx);
    }

    if (classTy.parent) res = res && computeKeysOf(follow(classTy.parent), result, seen, isRaw, ctx);

    return res;
  }

  // Normalization leaves only tables and extern types here.
  return false;
}

function keyofFunctionImpl(
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
  isRaw: boolean,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 1 || packParams.length !== 0) {
    throw new InternalCompilerError("keyof type function: encountered a type function instance without the required argument structure");
  }

  const operandTy = follow(typeParams[0]!);

  const normTy = ctx.normalizer.normalize(operandTy);

  // if the operand failed to normalize, we can't reduce, but know nothing about inhabitance.
  if (!normTy) return reductionResult<TypeId>(undefined, Reduction.MaybeOk);

  // Keys come only from just tables or just extern types.
  if (normTy.hasTables() === normTy.hasExternTypes()) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

  // Reject any type that has not normalized to a table or a union of tables.
  if (
    normTy.hasTops() ||
    normTy.hasBooleans() ||
    normTy.hasErrors() ||
    normTy.hasNils() ||
    normTy.hasNumbers() ||
    normTy.hasStrings() ||
    normTy.hasThreads() ||
    normTy.hasBuffers() ||
    normTy.hasFunctions() ||
    normTy.hasTyvars()
  ) {
    return reductionResult<TypeId>(undefined, Reduction.Erroneous);
  }

  // The keys are collected here. Luau's set holds optional strings, which
  // tell the empty string apart from no string.
  const keys = new Set<string | undefined>();

  // computing the keys for extern types
  if (normTy.hasExternTypes()) {
    // seen set for key computation for extern types
    const seen = new Set<TypeId>();

    const externTypes = normTy.externTypes.ordering;

    // collect all the properties from the first class type
    if (!computeKeysOf(externTypes[0]!, keys, seen, isRaw, ctx)) {
      // if it failed, we have a top type!
      return reductionResult(ctx.builtins.stringType, Reduction.MaybeOk);
    }

    // we need to look at each class to remove any keys that are not common amongst them all
    for (let i = 1; i < externTypes.length; i++) {
      seen.clear(); // we'll reuse the same seen set

      const localKeys = new Set<string | undefined>();

      // we can skip to the next class if this one is a top type
      if (!computeKeysOf(externTypes[i]!, localKeys, seen, isRaw, ctx)) continue;

      for (const key of keys) {
        // remove any keys that are not present in each class
        if (!localKeys.has(key)) keys.delete(key);
      }
    }
  }

  // computing the keys for tables
  if (normTy.hasTables()) {
    // seen set for key computation for tables
    const seen = new Set<TypeId>();

    const tables = normTy.tables.toArray();

    // collect all the properties from the first table type
    if (!computeKeysOf(tables[0]!, keys, seen, isRaw, ctx)) {
      // if it failed, we have the top table type!
      return reductionResult(ctx.builtins.stringType, Reduction.MaybeOk);
    }

    // we need to look at each tables to remove any keys that are not common amongst them all
    for (let i = 1; i < tables.length; i++) {
      seen.clear(); // we'll reuse the same seen set

      const localKeys = new Set<string | undefined>();

      // we can skip to the next table if this one is the top table type
      if (!computeKeysOf(tables[i]!, localKeys, seen, isRaw, ctx)) continue;

      for (const key of keys) {
        // remove any keys that are not present in each table
        if (!localKeys.has(key)) keys.delete(key);
      }
    }
  }

  // if the set of keys is empty, `keyof<T>` is `never`
  if (keys.size === 0) return reductionResult(ctx.builtins.neverType, Reduction.MaybeOk);

  // everything is validated, we need only construct our big union of singletons now!
  const singletons: TypeId[] = [];

  // but first, we'll sort it to keep the union at the end in lexicographic ordering
  const sortedKeys: string[] = [];

  for (const key of keys) {
    if (key !== undefined) sortedKeys.push(key);
  }

  sortedKeys.sort(compareNames);

  for (const key of sortedKeys) singletons.push(ctx.arena.addType(stringSingleton(key)));

  // A single key needs no union; its singleton is already in the arena.
  if (singletons.length === 1) return reductionResult(singletons[0]!, Reduction.MaybeOk);

  return reductionResult(ctx.arena.addType(unionType(singletons)), Reduction.MaybeOk);
}

function keyofTypeFunction(
  _instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 1 || packParams.length !== 0) {
    throw new InternalCompilerError("keyof type function: encountered a type function instance without the required argument structure");
  }

  return keyofFunctionImpl(typeParams, packParams, ctx, /* isRaw */ false);
}

function rawkeyofTypeFunction(
  _instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 1 || packParams.length !== 0) {
    throw new InternalCompilerError("rawkeyof type function: encountered a type function instance without the required argument structure");
  }

  return keyofFunctionImpl(typeParams, packParams, ctx, /* isRaw */ true);
}

// ---------------------------------------------------------------------------
// index and rawget
// ---------------------------------------------------------------------------

/** Luau's `isSubtype` from `Normalize.cpp`: a subtype test with a fresh `Subtyping`. */
function isSubtype(
  subTy: TypeId,
  superTy: TypeId,
  arena: TypeArena,
  builtinTypes: BuiltinTypes,
  scope: Scope,
  normalizer: Normalizer,
  typeFunctionRuntime: TypeFunctionRuntime,
): boolean {
  const subtyping = new Subtyping(builtinTypes, arena, normalizer, typeFunctionRuntime);

  return subtyping.isSubtype(subTy, superTy, scope).isSubtype;
}

/**
 * Looks for the property `ty` names among a table's or extern type's
 * properties and indexer. When it is found, adds its type (or the options of
 * its union type) to `result` and returns true.
 */
function searchPropsAndIndexer(
  ty: TypeId,
  tblProps: Props,
  tblIndexer: TableIndexer | undefined,
  result: Set<TypeId>,
  ctx: TypeFunctionContext,
): boolean {
  ty = follow(ty);

  // index into tbl's properties
  const stringSingleton = getSingleton(ty, "StringSingleton");
  if (stringSingleton) {
    if (tblProps.has(stringSingleton.value)) {
      const prop = tblProps.get(stringSingleton.value)!;

      let propTy: TypeId;
      if (prop.readTy) propTy = follow(prop.readTy);
      else if (prop.writeTy) propTy = follow(prop.writeTy);
      // found the property, but there was no type associated with it
      else return false;

      // property is a union type -> we need to extend our reduction type
      const propUnionTy = get(propTy, "UnionType");
      if (propUnionTy) {
        for (const option of propUnionTy.options) {
          result.add(follow(option));
        }
      }
      // property is a singular type or intersection type -> we can simply append
      else result.add(propTy);

      return true;
    }
  }

  // index into tbl's indexer
  if (tblIndexer) {
    let indexType = follow(tblIndexer.indexType);

    const tfit = get(indexType, "TypeFunctionInstanceType");
    if (tfit) {
      // An `index` instance here means a cycle; tying the knot shows whether it is well-founded.
      if (tfit.function === ctx.builtins.typeFunctions.indexFunc) indexType = follow(tblIndexer.indexResultType);
    }

    if (isSubtype(ty, indexType, ctx.arena, ctx.builtins, ctx.scope, ctx.normalizer, ctx.typeFunctionRuntime)) {
      const idxResultTy = follow(tblIndexer.indexResultType);

      // indexResultType is a union type -> we need to extend our reduction type
      const idxResUnionTy = get(idxResultTy, "UnionType");
      if (idxResUnionTy) {
        for (const option of idxResUnionTy.options) {
          result.add(follow(option));
        }
      }
      // indexResultType is a singular type or intersection type -> we can simply append
      else result.add(idxResultTy);

      return true;
    }
  }

  return false;
}

function tblIndexIntoSeen(
  indexer: TypeId,
  indexee: TypeId,
  result: Set<TypeId>,
  seenSet: Set<TypeId>,
  ctx: TypeFunctionContext,
  isRaw: boolean,
): boolean {
  indexer = follow(indexer);
  indexee = follow(indexee);

  if (seenSet.has(indexee)) return false;
  seenSet.add(indexee);

  const unionTy = get(indexee, "UnionType");
  if (unionTy) {
    let res = true;
    for (const component of flatOptions(unionTy)) {
      // A component already seen, other than the indexee itself, was met in
      // an earlier component of the union.
      if (seenSet.has(component) && component !== indexee) continue;

      res = res && tblIndexIntoSeen(indexer, component, result, seenSet, ctx, isRaw);
    }
    return res;
  }

  if (get(indexee, "FunctionType")) {
    const argPack = ctx.arena.addTypePack([indexer]);

    const retPack = solveFunctionCall(ctx, ctx.scope.location, indexee, argPack);

    if (retPack === undefined) return false;

    const extracted = extendTypePack(ctx.arena, ctx.builtins, retPack, 1);
    if (extracted.head.length === 0) return false;

    result.add(follow(extracted.head[0]!));
    return true;
  }

  // we have a table type to try indexing
  const tableTy = get(indexee, "TableType");
  if (tableTy) {
    return searchPropsAndIndexer(indexer, tableTy.props, tableTy.indexer, result, ctx);
  }

  // we have a metatable type to try indexing
  const metatableTy = get(indexee, "MetatableType");
  if (metatableTy) {
    const metatableTableTy = get(follow(metatableTy.table), "TableType");
    if (metatableTableTy) {
      // try finding all properties within the current scope of the table
      if (searchPropsAndIndexer(indexer, metatableTableTy.props, metatableTableTy.indexer, result, ctx)) return true;
    }

    // Some properties were not found, so the `__index` metamethod is next.
    if (!isRaw) {
      const dummy: LuauTypeError[] = [];
      const mmType = findMetatableEntry(ctx.builtins, dummy, indexee, "__index", new Location());
      if (mmType) return tblIndexIntoSeen(indexer, mmType, result, seenSet, ctx, isRaw);
    }
  }

  return false;
}

function tblIndexInto(indexer: TypeId, indexee: TypeId, result: Set<TypeId>, ctx: TypeFunctionContext, isRaw: boolean): boolean {
  const seenSet = new Set<TypeId>();
  return tblIndexIntoSeen(indexer, indexee, result, seenSet, ctx, isRaw);
}

/**
 * The indexee is the type that holds the properties, and the indexer the type
 * that accesses them: in `index<Person, "name">`, `Person` is the indexee and
 * `"name"` the indexer.
 */
function indexFunctionImpl(
  typeParams: TypeId[],
  _packParams: TypePackId[],
  ctx: TypeFunctionContext,
  isRaw: boolean,
): TypeFunctionReductionResult<TypeId> {
  const indexeeTy = follow(typeParams[0]!);

  if (isPending(indexeeTy, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [indexeeTy]);

  const indexeeNormTy = ctx.normalizer.normalize(indexeeTy);

  // if the indexee failed to normalize, we can't reduce, but know nothing about inhabitance.
  if (!indexeeNormTy) return reductionResult<TypeId>(undefined, Reduction.MaybeOk);

  // if the indexee is `any`, then indexing also gives us `any`.
  if (indexeeNormTy.shouldSuppressErrors()) return reductionResult(ctx.builtins.anyType, Reduction.MaybeOk);

  // Indexing needs just tables or just extern types.
  if (indexeeNormTy.hasTables() === indexeeNormTy.hasExternTypes()) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

  // Reject any type that has not normalized to a table or extern type, or a union of tables or extern types.
  if (
    indexeeNormTy.hasTops() ||
    indexeeNormTy.hasBooleans() ||
    indexeeNormTy.hasErrors() ||
    indexeeNormTy.hasNils() ||
    indexeeNormTy.hasNumbers() ||
    indexeeNormTy.hasStrings() ||
    indexeeNormTy.hasThreads() ||
    indexeeNormTy.hasBuffers() ||
    indexeeNormTy.hasFunctions() ||
    indexeeNormTy.hasTyvars()
  ) {
    return reductionResult<TypeId>(undefined, Reduction.Erroneous);
  }

  const indexerTy = follow(typeParams[1]!);

  if (isPending(indexerTy, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [indexerTy]);

  const indexerNormTy = ctx.normalizer.normalize(indexerTy);

  // if the indexer failed to normalize, we can't reduce, but know nothing about inhabitance.
  if (!indexerNormTy) return reductionResult<TypeId>(undefined, Reduction.MaybeOk);

  // Reject any type that is not a string singleton or a primitive (string,
  // number, boolean, thread, nil, function, table or buffer).
  if (indexerNormTy.hasTops() || indexerNormTy.hasErrors()) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

  // A union indexer is looked up member by member.
  let typesToFind: TypeId[];
  const singleType = [indexerTy];
  const unionTy = get(indexerTy, "UnionType");
  if (unionTy) typesToFind = unionTy.options;
  else typesToFind = singleType;

  // the types that the reduction results in
  const properties = new Set<TypeId>();

  if (indexeeNormTy.hasExternTypes()) {
    // `rawget` never reduces on extern types, as the `rawget` global function does not.
    if (isRaw) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

    // `hasExternTypes` guarantees at least one extern type here.
    for (const externTypeId of indexeeNormTy.externTypes.ordering) {
      const externTy = get(externTypeId, "ExternType");
      if (!externTy) {
        // Normalization leaves only extern types here.
        return reductionResult<TypeId>(undefined, Reduction.Erroneous);
      }

      for (const ty of typesToFind) {
        // Search for the indexer among the extern type's properties and indexer. Found
        // there, it needs no further search.
        if (searchPropsAndIndexer(ty, externTy.props, externTy.indexer, properties, ctx)) continue;

        let parent = externTy.parent;
        let foundInParent = false;
        while (parent && !foundInParent) {
          const parentExternType = get(follow(parent), "ExternType")!;
          foundInParent = searchPropsAndIndexer(ty, parentExternType.props, parentExternType.indexer, properties, ctx);
          parent = parentExternType.parent;
        }

        // we move on to the next type if any of the parents we went through had the property.
        if (foundInParent) continue;

        // Not found among the properties, the property is looked for in the metatable's `__index`.
        const dummy: LuauTypeError[] = [];
        const mmType = findMetatableEntry(ctx.builtins, dummy, externTypeId, "__index", new Location());
        // if a metatable does not exist, there is no where else to look
        if (!mmType) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

        // if indexer is not in the metatable, we fail to reduce
        if (!tblIndexInto(ty, mmType, properties, ctx, isRaw)) return reductionResult<TypeId>(undefined, Reduction.Erroneous);
      }
    }
  }

  if (indexeeNormTy.hasTables()) {
    // `hasTables` guarantees at least one table here.
    for (const table of indexeeNormTy.tables) {
      for (const ty of typesToFind) {
        if (!tblIndexInto(ty, table, properties, ctx, isRaw)) {
          if (isRaw) properties.add(ctx.builtins.nilType);
          else return reductionResult<TypeId>(undefined, Reduction.Erroneous);
        }
      }
    }
  }

  // If the type being reduced to is a single type, no need to union
  if (properties.size === 1) return reductionResult([...properties][0]!, Reduction.MaybeOk);

  return reductionResult(ctx.arena.addType(unionType([...properties])), Reduction.MaybeOk);
}

function indexTypeFunction(
  _instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("index type function: encountered a type function instance without the required argument structure");
  }

  return indexFunctionImpl(typeParams, packParams, ctx, /* isRaw */ false);
}

function rawgetTypeFunction(
  _instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("rawget type function: encountered a type function instance without the required argument structure");
  }

  return indexFunctionImpl(typeParams, packParams, ctx, /* isRaw */ true);
}

// ---------------------------------------------------------------------------
// Metatables
// ---------------------------------------------------------------------------

function setmetatableTypeFunction(
  _instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 2 || packParams.length !== 0) {
    throw new InternalCompilerError("setmetatable type function: encountered a type function instance without the required argument structure");
  }

  const location = ctx.constraint ? ctx.constraint.location : new Location();

  const targetTy = follow(typeParams[0]!);
  const metatableTy = follow(typeParams[1]!);

  // Having the target type be a pending table does not block dispatch.
  if (isPending(targetTy, ctx.solver) && !is(targetTy, "TableType")) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [targetTy]);

  const targetNorm = ctx.normalizer.normalize(targetTy);

  // if the operand failed to normalize, we can't reduce, but know nothing about inhabitance.
  if (!targetNorm) return reductionResult<TypeId>(undefined, Reduction.MaybeOk);

  // cannot setmetatable on something without table parts.
  if (!targetNorm.hasTables()) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

  // Reject any type that has not normalized to a table or a union or intersection of tables.
  if (
    targetNorm.hasTops() ||
    targetNorm.hasBooleans() ||
    targetNorm.hasErrors() ||
    targetNorm.hasNils() ||
    targetNorm.hasNumbers() ||
    targetNorm.hasStrings() ||
    targetNorm.hasThreads() ||
    targetNorm.hasBuffers() ||
    targetNorm.hasFunctions() ||
    targetNorm.hasTyvars() ||
    targetNorm.hasExternTypes()
  ) {
    return reductionResult<TypeId>(undefined, Reduction.Erroneous);
  }

  // Having the metatable type be a pending table does not block dispatch.
  if (isPending(metatableTy, ctx.solver) && !is(metatableTy, "TableType")) {
    return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [metatableTy]);
  }

  // if the supposed metatable is not a table, we will fail to reduce.
  if (!get(metatableTy, "TableType") && !get(metatableTy, "MetatableType")) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

  if (targetNorm.tables.size === 1) {
    let table = targetNorm.tables.front();

    const dummy: LuauTypeError[] = [];

    const metatableMetamethod = findMetatableEntry(ctx.builtins, dummy, table, "__metatable", location);

    // if the `__metatable` metamethod is present, then the table is locked and we cannot `setmetatable` on it.
    if (metatableMetamethod) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

    // A table that already has a metatable is replaced by its underlying table.
    const mt = get(table, "MetatableType");
    if (mt) table = mt.table;

    const withMetatable = ctx.arena.addType(metatableType(table, metatableTy));

    return reductionResult(withMetatable, Reduction.MaybeOk);
  }

  let result = ctx.builtins.neverType;

  for (let componentTy of targetNorm.tables) {
    const dummy: LuauTypeError[] = [];

    const metatableMetamethod = findMetatableEntry(ctx.builtins, dummy, componentTy, "__metatable", location);

    // if the `__metatable` metamethod is present, then the table is locked and we cannot `setmetatable` on it.
    if (metatableMetamethod) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

    // A table that already has a metatable is replaced by its underlying table.
    const mt = get(componentTy, "MetatableType");
    if (mt) componentTy = mt.table;

    const withMetatable = ctx.arena.addType(metatableType(componentTy, metatableTy));
    const simplified = simplifyUnion(ctx.builtins, ctx.arena, result, withMetatable);

    if (simplified.blockedTypes.size !== 0) {
      const blockedTypes: TypeId[] = [];
      for (const ty of simplified.blockedTypes) blockedTypes.push(ty);
      return reductionResult<TypeId>(undefined, Reduction.MaybeOk, blockedTypes);
    }

    result = simplified.result;
  }

  return reductionResult(result, Reduction.MaybeOk);
}

function getmetatableHelper(targetTy: TypeId, location: Location, ctx: TypeFunctionContext): TypeFunctionReductionResult<TypeId> {
  targetTy = follow(targetTy);

  let result: TypeId | undefined = undefined;
  let erroneous = true;

  if (get(targetTy, "TableType")) erroneous = false;

  const mt = get(targetTy, "MetatableType");
  if (mt) {
    result = mt.metatable;
    erroneous = false;
  }

  const clazz = get(targetTy, "ExternType");
  if (clazz) {
    result = clazz.metatable;
    erroneous = false;
  }

  const primitive = get(targetTy, "PrimitiveType");
  if (primitive) {
    if (primitive.type === PrimitiveKind.Table) {
      // `table` could have a metatable, so the result is `table?`.
      result = ctx.arena.addType(unionType([ctx.builtins.tableType, ctx.builtins.nilType]));
    } else {
      result = primitive.metatable;
    }
    erroneous = false;
  }

  const singleton = get(targetTy, "SingletonType");
  if (singleton) {
    if (singleton.variant.kind === "StringSingleton") {
      const primitiveString = get(ctx.builtins.stringType, "PrimitiveType")!;
      result = primitiveString.metatable;
    }
    erroneous = false;
  }

  if (get(targetTy, "AnyType")) {
    // getmetatable<any> ~ any
    result = targetTy;
    erroneous = false;
  }

  if (get(targetTy, "ErrorType")) {
    // getmetatable<error> ~ error
    result = targetTy;
    erroneous = false;
  }

  if (erroneous) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

  const dummy: LuauTypeError[] = [];

  const metatableMetamethod = findMetatableEntry(ctx.builtins, dummy, targetTy, "__metatable", location);

  if (metatableMetamethod) return reductionResult(metatableMetamethod, Reduction.MaybeOk);

  if (result) return reductionResult(result, Reduction.MaybeOk);

  return reductionResult(ctx.builtins.nilType, Reduction.MaybeOk);
}

function getmetatableTypeFunction(
  _instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 1 || packParams.length !== 0) {
    throw new InternalCompilerError("getmetatable type function: encountered a type function instance without the required argument structure");
  }

  const location = ctx.constraint ? ctx.constraint.location : new Location();

  const targetTy = follow(typeParams[0]!);

  if (isPending(targetTy, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [targetTy]);

  const ut = get(targetTy, "UnionType");
  if (ut) {
    const options: TypeId[] = [];

    for (const option of ut.options) {
      const result = getmetatableHelper(option, location, ctx);

      if (!result.result) return result;

      options.push(result.result);
    }

    return reductionResult(ctx.arena.addType(unionType(options)), Reduction.MaybeOk);
  }

  const it = get(targetTy, "IntersectionType");
  if (it) {
    const parts: TypeId[] = [];

    let erroredWithUnknown = false;

    for (const part of it.parts) {
      const result = getmetatableHelper(part, location, ctx);

      if (!result.result) {
        // An `unknown` part does not fail the reduction on its own.
        if (get(follow(part), "UnknownType")) {
          erroredWithUnknown = true;
          continue;
        } else return result;
      }

      parts.push(result.result);
    }

    // If all parts are unknown, return erroneous reduction
    if (erroredWithUnknown && parts.length === 0) return reductionResult<TypeId>(undefined, Reduction.Erroneous);

    if (parts.length === 1) return reductionResult(parts[0]!, Reduction.MaybeOk);

    return reductionResult(ctx.arena.addType(intersectionType(parts)), Reduction.MaybeOk);
  }

  return getmetatableHelper(targetTy, location, ctx);
}

// ---------------------------------------------------------------------------
// objectof, weakoptional and user
// ---------------------------------------------------------------------------

function objectofTypeFunction(
  _instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 1 || packParams.length !== 0) {
    throw new InternalCompilerError("objectof type function: encountered a type function instance without the required argument structure");
  }

  const targetTy = follow(typeParams[0]!);

  if (isPending(targetTy, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [targetTy]);

  // Only a user-defined class relates an extern type to its object type, and
  // user-defined classes are off (`DebugLuauUserDefinedClasses`).
  return reductionResult(ctx.builtins.errorType, Reduction.MaybeOk);
}

function weakoptionalTypeFunc(
  instance: TypeId,
  typeParams: TypeId[],
  packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  if (typeParams.length !== 1 || packParams.length !== 0) {
    throw new InternalCompilerError("weakoptional type function: encountered a type function instance without the required argument structure");
  }

  const targetTy = follow(typeParams[0]!);

  if (isPending(targetTy, ctx.solver)) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, [targetTy]);

  if (is(instance, "NeverType")) return reductionResult(ctx.builtins.nilType, Reduction.MaybeOk);

  const targetNorm = ctx.normalizer.normalize(targetTy);

  if (!targetNorm) return reductionResult<TypeId>(undefined, Reduction.MaybeOk);

  const result = ctx.normalizer.isInhabitedNormal(targetNorm);
  if (result === NormalizationResult.False) return reductionResult(ctx.builtins.nilType, Reduction.MaybeOk);

  return reductionResult(targetTy, Reduction.MaybeOk);
}

/**
 * The reducer of `user`, Luau's `userDefinedTypeFunction` from
 * `UserDefinedTypeFunction.cpp`, which reduces a use of a `type function`
 * declaration. Sparkdown has no VM to evaluate the declaration's body, so this
 * keeps the steps that come before evaluation: an instance reduces to the
 * error type when evaluation is not allowed or when the declaration, or a
 * type function it can call, has parse errors; waits on the pending types
 * under its arguments and under the type aliases its body names; and
 * otherwise fails with the error Luau reports when it has no VM to evaluate
 * with.
 */
function userDefinedTypeFunction(
  instance: TypeId,
  typeParams: TypeId[],
  _packParams: TypePackId[],
  ctx: TypeFunctionContext,
): TypeFunctionReductionResult<TypeId> {
  const typeFunction = get(instance, "TypeFunctionInstanceType")!;

  const userFuncData = typeFunction.userFuncData;
  if (typeFunction.userFuncName === undefined || userFuncData === undefined) {
    throw new InternalCompilerError("all user-defined type functions must have an associated function definition");
  }

  // If type functions cannot be evaluated because of errors in the code, we do not generate any additional ones
  if (!ctx.typeFunctionRuntime.allowEvaluation || userFuncData.definition.hasErrors) {
    return reductionResult(ctx.builtins.errorType, Reduction.MaybeOk);
  }

  const check = new FindUserTypeFunctionBlockers(ctx);

  for (const typeParam of typeParams) check.traverse(follow(typeParam));

  // The environment must not depend on any type alias that is blocked
  for (const alias of userFuncData.environmentAlias.values()) {
    if (alias.typeParams.length === 0 && alias.typePackParams.length === 0) check.traverse(follow(alias.type));
  }

  if (check.blockingTypes.length !== 0) return reductionResult<TypeId>(undefined, Reduction.MaybeOk, check.blockingTypes);

  // A type function the body can call that could not be parsed cannot be evaluated either
  for (const definition of userFuncData.environmentFunction.values()) {
    if (definition.hasErrors) return reductionResult(ctx.builtins.errorType, Reduction.MaybeOk);
  }

  const name = userFuncData.definition.name;

  return {
    ...reductionResult<TypeId>(undefined, Reduction.Erroneous),
    error: `'${name}' type function: cannot be evaluated in this context`,
  };
}

// ---------------------------------------------------------------------------
// BuiltinTypeFunctions
// ---------------------------------------------------------------------------

function builtinTypeFunction(name: string, reducer: ReducerFunction<TypeId>, canReduceGenerics = false): TypeFunction {
  return { name, reducer, canReduceGenerics };
}

/** One of each builtin type function, and the type aliases that name them. */
export class BuiltinTypeFunctions {
  readonly userFunc = builtinTypeFunction("user", userDefinedTypeFunction);

  readonly notFunc = builtinTypeFunction("not", notTypeFunction);
  readonly lenFunc = builtinTypeFunction("len", lenTypeFunction);
  readonly unmFunc = builtinTypeFunction("unm", unmTypeFunction);

  readonly addFunc = builtinTypeFunction("add", addTypeFunction);
  readonly subFunc = builtinTypeFunction("sub", subTypeFunction);
  readonly mulFunc = builtinTypeFunction("mul", mulTypeFunction);
  readonly divFunc = builtinTypeFunction("div", divTypeFunction);
  readonly idivFunc = builtinTypeFunction("idiv", idivTypeFunction);
  readonly powFunc = builtinTypeFunction("pow", powTypeFunction);
  readonly modFunc = builtinTypeFunction("mod", modTypeFunction);

  readonly concatFunc = builtinTypeFunction("concat", concatTypeFunction);

  readonly andFunc = builtinTypeFunction("and", andTypeFunction, /* canReduceGenerics */ true);
  readonly orFunc = builtinTypeFunction("or", orTypeFunction, /* canReduceGenerics */ true);

  readonly ltFunc = builtinTypeFunction("lt", ltTypeFunction);
  readonly leFunc = builtinTypeFunction("le", leTypeFunction);

  readonly refineFunc = builtinTypeFunction("refine", refineTypeFunction, /* canReduceGenerics */ true);
  readonly singletonFunc = builtinTypeFunction("singleton", singletonTypeFunction);
  readonly unionFunc = builtinTypeFunction("union", unionTypeFunction);
  readonly intersectFunc = builtinTypeFunction("intersect", intersectTypeFunction);

  readonly keyofFunc = builtinTypeFunction("keyof", keyofTypeFunction);
  readonly rawkeyofFunc = builtinTypeFunction("rawkeyof", rawkeyofTypeFunction);
  readonly indexFunc = builtinTypeFunction("index", indexTypeFunction);
  readonly rawgetFunc = builtinTypeFunction("rawget", rawgetTypeFunction);

  readonly setmetatableFunc = builtinTypeFunction("setmetatable", setmetatableTypeFunction);
  readonly getmetatableFunc = builtinTypeFunction("getmetatable", getmetatableTypeFunction);

  readonly objectofFunc = builtinTypeFunction("objectof", objectofTypeFunction);

  readonly weakoptionalFunc = builtinTypeFunction("weakoptional", weakoptionalTypeFunc, /* canReduceGenerics */ true);

  /** Binds the type functions that have a type alias, such as `add<T, U>`, in `scope`. */
  addToScope(arena: TypeArena, scope: Scope): void {
    // make a type function for a one-argument type function
    const mkUnaryTypeFunction = (tf: TypeFunction): TypeFun => {
      const t = arena.addType(genericType({ name: "T", polarity: Polarity.Negative }));
      const genericT: GenericTypeDefinition = { ty: t };

      return new TypeFun(arena.addType(typeFunctionInstanceType(tf, [t], [])), [genericT]);
    };

    // make a type function for a two-argument type function with a default argument for the second type being the first
    const mkBinaryTypeFunctionWithDefault = (tf: TypeFunction): TypeFun => {
      const t = arena.addType(genericType({ name: "T", polarity: Polarity.Negative }));
      const u = arena.addType(genericType({ name: "U", polarity: Polarity.Negative }));
      const genericT: GenericTypeDefinition = { ty: t };
      const genericU: GenericTypeDefinition = { ty: u, defaultValue: t };

      return new TypeFun(arena.addType(typeFunctionInstanceType(tf, [t, u], [])), [genericT, genericU]);
    };

    // make a two-argument type function without the default arguments
    const mkBinaryTypeFunction = (tf: TypeFunction): TypeFun => {
      const t = arena.addType(genericType({ name: "T", polarity: Polarity.Negative }));
      const u = arena.addType(genericType({ name: "U", polarity: Polarity.Negative }));
      const genericT: GenericTypeDefinition = { ty: t };
      const genericU: GenericTypeDefinition = { ty: u };

      return new TypeFun(arena.addType(typeFunctionInstanceType(tf, [t, u], [])), [genericT, genericU]);
    };

    scope.exportedTypeBindings.set(this.lenFunc.name, mkUnaryTypeFunction(this.lenFunc));
    scope.exportedTypeBindings.set(this.unmFunc.name, mkUnaryTypeFunction(this.unmFunc));

    scope.exportedTypeBindings.set(this.addFunc.name, mkBinaryTypeFunctionWithDefault(this.addFunc));
    scope.exportedTypeBindings.set(this.subFunc.name, mkBinaryTypeFunctionWithDefault(this.subFunc));
    scope.exportedTypeBindings.set(this.mulFunc.name, mkBinaryTypeFunctionWithDefault(this.mulFunc));
    scope.exportedTypeBindings.set(this.divFunc.name, mkBinaryTypeFunctionWithDefault(this.divFunc));
    scope.exportedTypeBindings.set(this.idivFunc.name, mkBinaryTypeFunctionWithDefault(this.idivFunc));
    scope.exportedTypeBindings.set(this.powFunc.name, mkBinaryTypeFunctionWithDefault(this.powFunc));
    scope.exportedTypeBindings.set(this.modFunc.name, mkBinaryTypeFunctionWithDefault(this.modFunc));
    scope.exportedTypeBindings.set(this.concatFunc.name, mkBinaryTypeFunctionWithDefault(this.concatFunc));

    scope.exportedTypeBindings.set(this.ltFunc.name, mkBinaryTypeFunctionWithDefault(this.ltFunc));
    scope.exportedTypeBindings.set(this.leFunc.name, mkBinaryTypeFunctionWithDefault(this.leFunc));
    scope.exportedTypeBindings.set(this.keyofFunc.name, mkUnaryTypeFunction(this.keyofFunc));
    scope.exportedTypeBindings.set(this.rawkeyofFunc.name, mkUnaryTypeFunction(this.rawkeyofFunc));

    scope.exportedTypeBindings.set(this.indexFunc.name, mkBinaryTypeFunction(this.indexFunc));
    scope.exportedTypeBindings.set(this.rawgetFunc.name, mkBinaryTypeFunction(this.rawgetFunc));

    scope.exportedTypeBindings.set(this.setmetatableFunc.name, mkBinaryTypeFunction(this.setmetatableFunc));
    scope.exportedTypeBindings.set(this.getmetatableFunc.name, mkUnaryTypeFunction(this.getmetatableFunc));
  }
}

registerBuiltinTypeFunctions(() => new BuiltinTypeFunctions());
