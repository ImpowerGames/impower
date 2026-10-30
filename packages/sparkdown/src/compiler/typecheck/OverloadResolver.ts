// Overload resolution, ported from Luau's `OverloadResolver.h`/
// `OverloadResolver.cpp`; Luau is MIT-licensed (see `LICENSE-luau.txt`).

import type { AstExpr } from "./Ast";
import type { ConstraintV } from "./Constraint";
import { countMismatch, CountMismatchContext, LuauTypeError, typeMismatch, TypeMismatchContext, type TypeErrorData } from "./Error";
import type { Location } from "./Location";
import type { Normalizer } from "./Normalize";
import type { Scope } from "./Scope";
import { Subtyping, SubtypingReasonings, SubtypingVariance, type SubtypingReasoning, type SubtypingResult } from "./Subtyping";
import {
  flatOptions,
  flatten,
  follow,
  functionType,
  get,
  getPack,
  is,
  isOptional,
  isVariadic,
  TypeFunctionInstanceState,
  type BuiltinTypes,
  type TypeArena,
  type TypeId,
  type TypePackId,
} from "./Type";
import { reduceTypeFunctions, TypeFunctionContext, type TypeCheckLimits, type TypeFunctionRuntime } from "./TypeFunction";
import {
  Components,
  IndexVariant,
  isTypeId,
  PackField,
  Path,
  traverse,
  traverseForFlattenedPack,
  traverseForPack,
  type Component,
  type TypeOrPack,
  type TypePathRenderMetadata,
} from "./TypePath";
import { ErrorSuppression, findMetatableEntry, getParameterExtents, isOptionalType, orElse, shouldSuppressErrors, shouldSuppressErrorsPack } from "./TypeUtils";

export type IncompatibilityReason = SubtypingReasonings | LuauTypeError[];

export interface SelectedOverload {
  overload: TypeId | undefined;
  assumedConstraints: ConstraintV[];
  shouldRetry: boolean;
}

export class OverloadResolution {
  ok: TypeId[] = [];

  nonFunctions: TypeId[] = [];

  potentialOverloads: [TypeId, ConstraintV[]][] = [];

  incompatibleOverloads: [TypeId, IncompatibilityReason][] = [];

  arityMismatches: TypeId[] = [];

  metamethods = new Set<TypeId>();

  getUnambiguousOverload(): SelectedOverload {
    if (this.ok.length === 1 && this.potentialOverloads.length === 0) {
      return {
        overload: this.ok[0],
        assumedConstraints: [],
        shouldRetry: false,
      };
    }

    if (this.ok.length === 0 && this.potentialOverloads.length === 1) {
      const [overload, constraints] = this.potentialOverloads[0]!;
      return { overload, assumedConstraints: [...constraints], shouldRetry: false };
    }

    if (this.ok.length > 1) {
      return { overload: undefined, assumedConstraints: [], shouldRetry: false };
    }

    if (this.potentialOverloads.length + this.ok.length > 1) {
      if (this.ok.length === 0) {
        const [overload, constraints] = this.potentialOverloads[0]!;
        return { overload, assumedConstraints: [...constraints], shouldRetry: true };
      } else {
        return { overload: this.ok[0], assumedConstraints: [], shouldRetry: true };
      }
    }

    if (this.incompatibleOverloads.length === 1) {
      return { overload: this.incompatibleOverloads[0]![0], assumedConstraints: [], shouldRetry: false };
    }

    return { overload: undefined, assumedConstraints: [], shouldRetry: false };
  }
}

function typePackMismatch(wantedTp: TypePackId, givenTp: TypePackId): TypeErrorData {
  return { kind: "TypePackMismatch", wantedTp, givenTp, reason: "" };
}

function reasoningIsReturnTypes(path: Path): boolean {
  if (path.empty()) return false;

  const firstComponent = path.components[0]!;

  return firstComponent.kind === "PackField" && firstComponent.field === PackField.Returns;
}

function ignoreReasoningForReturnType(sr: SubtypingResult): void {
  const result = new SubtypingReasonings();

  for (const reasoning of sr.reasoning) {
    if (reasoningIsReturnTypes(reasoning.subPath) && reasoningIsReturnTypes(reasoning.superPath)) continue;

    result.insert(reasoning);
  }

  sr.reasoning = result;

  if (sr.reasoning.empty() && sr.genericBoundsMismatches.length === 0 && sr.errors.length === 0) sr.isSubtype = true;
}

function areUnsatisfiedArgumentsOptional(reasonings: SubtypingReasonings, argPack: TypePackId, funcArgPack: TypePackId): boolean {
  if (1 !== reasonings.size) return false;

  const justArguments = new Path([Components.pack(PackField.Arguments)]);
  const reason = reasonings.toArray()[0]!;
  if (!reason.subPath.equals(justArguments) || !reason.superPath.equals(justArguments)) return false;

  const { head: argHead } = flatten(argPack);
  const { head: funArgHead } = flatten(funcArgPack);

  if (argHead.length >= funArgHead.length) return false;

  for (let i = argHead.length; i < funArgHead.length; ++i) {
    if (!isOptional(funArgHead[i]!)) return false;
  }
  return true;
}

function isPathOnArgumentList(path: Path): boolean {
  const components = path.components;
  let iter = 0;
  const endIter = components.length;

  if (iter === endIter) return false;

  const args = components[iter]!;
  if (args.kind === "PackField" && args.field !== PackField.Arguments) return false;

  ++iter;

  while (iter !== endIter) {
    const component = components[iter]!;
    if (component.kind === "PackSlice" || component.kind === "GenericPackMapping") ++iter;
    else if (component.kind === "PackField" && component.field === PackField.Tail) ++iter;
    else return false;
  }

  return true;
}

function getArgumentIndex(path: Path, fnTy: TypeId): number | undefined {
  const components = path.components;
  let iter = 0;
  const endIter = components.length;

  if (iter === endIter) return undefined;

  const args = components[iter]!;
  if (args.kind === "PackField" && args.field !== PackField.Arguments) return undefined;

  ++iter;

  const ft = get(fnTy, "FunctionType")!;

  let result = 0;
  let ty: TypeOrPack = ft.argTypes;

  while (iter !== endIter) {
    const component = components[iter]!;
    ++iter;

    if (component.kind === "Index") return result + component.index;
    else if (component.kind === "GenericPackMapping") ty = component.mappedType;
    else if (component.kind === "PackSlice") result += component.startIndex;
    else if (component.kind === "PackField" && component.field === PackField.Tail) {
      if (isTypeId(ty)) return undefined;

      const { head, tail } = flatten(ty);
      result += head.length;

      if (!tail) return undefined;

      ty = tail;

      continue;
    } else return undefined;
  }

  return undefined;
}

function truncatePathAtUnionOrIntersection(path: Path): Path {
  const components: Component[] = [];
  for (const component of path.components) {
    if (component.kind === "Index" && (component.variant === IndexVariant.Union || component.variant === IndexVariant.Intersection)) break;

    components.push(component);
  }
  return new Path(components);
}

export class OverloadResolver {
  readonly subtyping: Subtyping;
  readonly callLoc: Location;

  constructor(
    readonly builtinTypes: BuiltinTypes,
    readonly arena: TypeArena,
    readonly normalizer: Normalizer,
    readonly typeFunctionRuntime: TypeFunctionRuntime,
    readonly scope: Scope,
    readonly limits: TypeCheckLimits,
    callLocation: Location,
  ) {
    this.subtyping = new Subtyping(builtinTypes, arena, normalizer, typeFunctionRuntime);
    this.callLoc = callLocation;
  }

  resolveOverload(ty: TypeId, argsPack: TypePackId, fnLocation: Location, uniqueTypes: Set<TypeId>, _useFreeTypeBounds: boolean): OverloadResolution {
    const result = new OverloadResolution();

    ty = follow(ty);

    const it = get(ty, "IntersectionType");
    if (it) {
      for (const component of flatOptions(it)) this.testFunctionOrUnion(result, component, argsPack, fnLocation, uniqueTypes);
    } else this.testFunctionOrUnion(result, ty, argsPack, fnLocation, uniqueTypes);

    return result;
  }

  reportErrors(
    errors: LuauTypeError[],
    fnTy: TypeId,
    fnLocation: Location,
    moduleName: string,
    argPack: TypePackId,
    argExprs: AstExpr[],
    reason: SubtypingReasoning,
  ): void {
    let argumentIndex = getArgumentIndex(reason.subPath, fnTy);

    if (argumentIndex === undefined) {
      const given = this.arena.addType(functionType(argPack, this.builtinTypes.anyTypePack));
      argumentIndex = getArgumentIndex(reason.superPath, given);
    }

    let argLocation: Location;
    if (argumentIndex !== undefined && argumentIndex < argExprs.length) argLocation = argExprs[argumentIndex]!.location;
    else if (argExprs.length !== 0) argLocation = argExprs[argExprs.length - 1]!.location;
    else argLocation = fnLocation;

    const prospectiveFunction = this.arena.addType(functionType(argPack, this.builtinTypes.anyTypePack));

    const failedSubPack = traverseForPack(prospectiveFunction, reason.superPath, this.builtinTypes, this.arena);
    const failedSuperPack = traverseForPack(fnTy, reason.subPath, this.builtinTypes, this.arena);

    if (failedSuperPack && getPack(failedSuperPack, "GenericTypePack")) {
      this.maybeEmplaceErrorPacks(errors, argLocation, moduleName, reason, failedSuperPack, failedSubPack ?? this.builtinTypes.emptyTypePack);
      return;
    }

    if (isPathOnArgumentList(reason.subPath)) {
      if (!failedSuperPack) {
        errors.push(new LuauTypeError(fnLocation, { kind: "InternalError", message: "Malformed SubtypingReasoning" }, moduleName));
        return;
      }

      const requiredMappedArgs = this.arena.addTypePack(traverseForFlattenedPack(fnTy, reason.subPath, this.builtinTypes, this.arena));
      const { head: paramsHead } = flatten(requiredMappedArgs);
      const { head: argHead, tail: argTail } = flatten(argPack);

      const argCount = argHead.length;
      const { max: optMaxParams } = getParameterExtents(requiredMappedArgs);

      switch (shouldSuppressErrorsPack(this.normalizer, argPack)) {
        case ErrorSuppression.Suppress:
          return;
        case ErrorSuppression.DoNotSuppress:
          break;
        case ErrorSuppression.NormalizationFailed:
          errors.push(new LuauTypeError(fnLocation, { kind: "NormalizationTooComplex" }, moduleName));
          return;
      }

      if (failedSuperPack) {
        switch (shouldSuppressErrorsPack(this.normalizer, requiredMappedArgs)) {
          case ErrorSuppression.Suppress:
            return;
          case ErrorSuppression.DoNotSuppress:
            break;
          case ErrorSuppression.NormalizationFailed:
            errors.push(new LuauTypeError(fnLocation, { kind: "NormalizationTooComplex" }, moduleName));
            return;
        }
      }

      const isVariadicArgs = argTail !== undefined && isVariadic(argTail);

      if (isVariadicArgs) {
        this.maybeEmplaceErrorPacks(errors, argLocation, moduleName, reason, failedSuperPack, failedSubPack ?? this.builtinTypes.emptyTypePack);
      } else {
        errors.push(
          new LuauTypeError(
            fnLocation,
            countMismatch(paramsHead.length, argCount, CountMismatchContext.Arg, { maximum: optMaxParams, isVariadic: isVariadicArgs }),
            moduleName,
          ),
        );
      }

      return;
    }

    if (argumentIndex !== undefined) {
      if (argumentIndex < argExprs.length) argLocation = argExprs[argumentIndex]!.location;
      else if (argExprs.length !== 0) argLocation = argExprs[argExprs.length - 1]!.location;
      else argLocation = fnLocation;

      const superPathTail = new Path(reason.superPath.components.slice(1));

      const subMetadata: TypePathRenderMetadata = { returnTypePacks: new Map() };
      const superMetadata: TypePathRenderMetadata = { returnTypePacks: new Map() };

      const truncatedSuperPathTail = truncatePathAtUnionOrIntersection(superPathTail);
      const truncatedSubPathTail = truncatePathAtUnionOrIntersection(reason.subPath);
      const failedSub = traverse(argPack, truncatedSuperPathTail, this.builtinTypes, this.arena, subMetadata);
      const failedSuper = traverse(fnTy, truncatedSubPathTail, this.builtinTypes, this.arena, superMetadata);

      this.maybeEmplaceErrorTypeOrPack(errors, argLocation, moduleName, reason, failedSuper, failedSub);
      return;
    }

    if (failedSubPack && !failedSuperPack && getPack(failedSubPack, "GenericTypePack")) {
      errors.push(new LuauTypeError(argLocation, typePackMismatch(failedSubPack, this.builtinTypes.emptyTypePack), moduleName));
    }

    if (failedSubPack && failedSuperPack) {
      if (argExprs.length === 0) argLocation = fnLocation;
      else argLocation = argExprs[argExprs.length - 1]!.location;

      const errorSuppression = orElse(shouldSuppressErrorsPack(this.normalizer, failedSubPack), shouldSuppressErrorsPack(this.normalizer, failedSuperPack));
      if (errorSuppression === ErrorSuppression.Suppress) return;

      switch (reason.variance) {
        case SubtypingVariance.Covariant:
          errors.push(new LuauTypeError(argLocation, typePackMismatch(failedSubPack, failedSuperPack), moduleName));
          break;
        case SubtypingVariance.Contravariant:
          errors.push(new LuauTypeError(argLocation, typePackMismatch(failedSuperPack, failedSubPack), moduleName));
          break;
        case SubtypingVariance.Invariant:
          errors.push(new LuauTypeError(argLocation, typePackMismatch(failedSubPack, failedSuperPack), moduleName));
          break;
        default:
          break;
      }
    }
  }

  private testFunction(result: OverloadResolution, fnTy: TypeId, argsPack: TypePackId, fnLocation: Location, _uniqueTypes: Set<TypeId>): void {
    fnTy = follow(fnTy);

    if (is(fnTy, "FreeType", "BlockedType", "PendingExpansionType")) {
      const constraints: ConstraintV[] = [];
      result.potentialOverloads.push([fnTy, constraints]);
      return;
    }

    const tfit = get(fnTy, "TypeFunctionInstanceType");
    if (tfit && tfit.state === TypeFunctionInstanceState.Unsolved) {
      const constraints: ConstraintV[] = [];
      result.potentialOverloads.push([fnTy, constraints]);
      return;
    }

    const ftv = get(fnTy, "FunctionType");
    if (!ftv) {
      result.nonFunctions.push(fnTy);
      return;
    }

    if (!this.isArityCompatible(argsPack, ftv.argTypes, this.builtinTypes)) {
      result.arityMismatches.push(fnTy);
      return;
    }

    const context = new TypeFunctionContext({
      arena: this.arena,
      builtins: this.builtinTypes,
      scope: this.scope,
      normalizer: this.normalizer,
      typeFunctionRuntime: this.typeFunctionRuntime,
      limits: this.limits,
      subtyping: this.subtyping,
    });
    const reduceResult = reduceTypeFunctions(fnTy, this.callLoc, context, true);
    const errors = reduceResult.errors.filter((e) => e.data.kind !== "UserDefinedTypeFunctionError");
    if (errors.length !== 0) {
      result.incompatibleOverloads.push([fnTy, errors]);
      return;
    }

    const prospectiveFunction = this.arena.addType(functionType(argsPack, this.builtinTypes.anyTypePack));

    const r = this.subtyping.isSubtype(fnTy, prospectiveFunction, this.scope);

    ignoreReasoningForReturnType(r);

    if (r.isSubtype) {
      if (r.assumedConstraints.length === 0) result.ok.push(fnTy);
      else result.potentialOverloads.push([fnTy, r.assumedConstraints]);
    } else {
      if (r.genericBoundsMismatches.length !== 0) {
        const errors: LuauTypeError[] = [];
        for (const gbm of r.genericBoundsMismatches) {
          errors.push(
            new LuauTypeError(fnLocation, {
              kind: "GenericBoundsMismatch",
              genericName: gbm.genericName,
              lowerBounds: [...gbm.lowerBounds],
              upperBounds: [...gbm.upperBounds],
            }),
          );
        }
        result.incompatibleOverloads.push([fnTy, errors]);
      } else if (areUnsatisfiedArgumentsOptional(r.reasoning, argsPack, ftv.argTypes)) {
        if (r.assumedConstraints.length === 0) result.ok.push(fnTy);
        else result.potentialOverloads.push([fnTy, r.assumedConstraints]);
      } else result.incompatibleOverloads.push([fnTy, r.reasoning]);
    }
  }

  private testFunctionOrUnion(result: OverloadResolution, fnTy: TypeId, argsPack: TypePackId, fnLocation: Location, uniqueTypes: Set<TypeId>): void {
    const ut = get(fnTy, "UnionType");
    if (ut) {
      const innerResult = new OverloadResolution();
      let count = 0;
      for (const t of flatOptions(ut)) {
        ++count;
        this.testFunctionOrCallMetamethod(innerResult, t, argsPack, fnLocation, uniqueTypes);
      }

      if (count === innerResult.ok.length) {
        result.ok.push(fnTy);
      } else if (count === innerResult.ok.length + innerResult.potentialOverloads.length) {
        const allConstraints: ConstraintV[] = [];
        for (const [, constraints] of innerResult.potentialOverloads) for (const c of constraints) allConstraints.push(c);

        result.potentialOverloads.push([fnTy, allConstraints]);
      } else {
        result.incompatibleOverloads.push([fnTy, [new LuauTypeError(fnLocation, { kind: "CannotCallNonFunction", ty: fnTy })]]);
      }
    } else this.testFunctionOrCallMetamethod(result, fnTy, argsPack, fnLocation, uniqueTypes);
  }

  private testFunctionOrCallMetamethod(
    result: OverloadResolution,
    fnTy: TypeId,
    argsPack: TypePackId,
    fnLocation: Location,
    uniqueTypes: Set<TypeId>,
  ): void {
    fnTy = follow(fnTy);

    const dummyErrors: LuauTypeError[] = [];
    const callMetamethod = findMetatableEntry(this.builtinTypes, dummyErrors, fnTy, "__call", this.callLoc);
    if (callMetamethod) {
      argsPack = this.arena.addTypePack([fnTy], argsPack);
      fnTy = follow(callMetamethod);

      const it = get(fnTy, "IntersectionType");
      if (it) {
        for (let component of flatOptions(it)) {
          component = follow(component);
          result.metamethods.add(component);
          const fn = get(component, "FunctionType");

          if (fn && !this.isArityCompatible(argsPack, fn.argTypes, this.builtinTypes)) result.arityMismatches.push(component);
          else this.testFunction(result, component, argsPack, fnLocation, uniqueTypes);
        }
        return;
      }

      result.metamethods.add(fnTy);
    }

    this.testFunction(result, fnTy, argsPack, fnLocation, uniqueTypes);
  }

  private maybeEmplaceErrorTypes(
    errors: LuauTypeError[],
    argLocation: Location,
    moduleName: string,
    reason: SubtypingReasoning,
    wantedType: TypeId | undefined,
    givenType: TypeId | undefined,
  ): void {
    if (wantedType && givenType) {
      const errorSuppression = orElse(shouldSuppressErrors(this.normalizer, wantedType), shouldSuppressErrors(this.normalizer, givenType));
      if (errorSuppression === ErrorSuppression.Suppress) return;

      if (errorSuppression === ErrorSuppression.NormalizationFailed) {
        errors.push(new LuauTypeError(argLocation, { kind: "NormalizationTooComplex" }, moduleName));
      }

      switch (reason.variance) {
        case SubtypingVariance.Covariant:
        case SubtypingVariance.Contravariant:
          errors.push(new LuauTypeError(argLocation, typeMismatch(wantedType, givenType, { context: TypeMismatchContext.CovariantContext }), moduleName));
          break;
        case SubtypingVariance.Invariant:
          errors.push(new LuauTypeError(argLocation, typeMismatch(wantedType, givenType, { context: TypeMismatchContext.InvariantContext }), moduleName));
          break;
        default:
          break;
      }
    }
  }

  private maybeEmplaceErrorPacks(
    errors: LuauTypeError[],
    argLocation: Location,
    moduleName: string,
    _reason: SubtypingReasoning,
    wantedTp: TypePackId | undefined,
    givenTp: TypePackId | undefined,
  ): void {
    if (!wantedTp || !givenTp) return;
    switch (orElse(shouldSuppressErrorsPack(this.normalizer, wantedTp), shouldSuppressErrorsPack(this.normalizer, givenTp))) {
      case ErrorSuppression.Suppress:
        break;
      case ErrorSuppression.NormalizationFailed:
        errors.push(new LuauTypeError(argLocation, { kind: "NormalizationTooComplex" }, moduleName));
        break;
      case ErrorSuppression.DoNotSuppress:
        errors.push(new LuauTypeError(argLocation, typePackMismatch(wantedTp, givenTp), moduleName));
        break;
    }
  }

  private maybeEmplaceErrorTypeOrPack(
    errors: LuauTypeError[],
    argLocation: Location,
    moduleName: string,
    reason: SubtypingReasoning,
    wantedType: TypeOrPack | undefined,
    givenType: TypeOrPack | undefined,
  ): void {
    if (!wantedType || !givenType) return;

    if (isTypeId(wantedType) && isTypeId(givenType)) {
      this.maybeEmplaceErrorTypes(errors, argLocation, moduleName, reason, wantedType, givenType);
      return;
    }

    if (!isTypeId(wantedType) && !isTypeId(givenType)) {
      this.maybeEmplaceErrorPacks(errors, argLocation, moduleName, reason, wantedType, givenType);
      return;
    }
  }

  private isArityCompatible(candidate: TypePackId, desired: TypePackId, builtinTypes: BuiltinTypes): boolean {
    const { head: candidateHead, tail: candidateTail } = flatten(candidate);
    const { head: desiredHead, tail: desiredTail } = flatten(desired);

    if (candidateHead.length < desiredHead.length) {
      if (candidateTail) return true;

      for (let i = candidateHead.length; i < desiredHead.length; ++i) {
        const ty = follow(desiredHead[i]!);
        if (!isOptionalType(ty, builtinTypes)) return false;
      }
    }

    if (candidateHead.length > desiredHead.length) {
      return desiredTail !== undefined;
    }

    return true;
  }
}
