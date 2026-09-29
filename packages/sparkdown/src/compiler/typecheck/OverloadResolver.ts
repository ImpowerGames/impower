// Overload resolution, ported from Luau's `OverloadResolver.h`/
// `OverloadResolver.cpp`; Luau is MIT-licensed (see `LICENSE-luau.txt`).
//
// Given a possibly overloaded function type and the types of a call's
// arguments, the resolver tests each overload by subtyping, sorts the
// overloads into those that work, those that could work once other
// constraints hold, and those that cannot, and turns the reasons an overload
// fails into errors at the call's arguments.

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

/**
 * Why an overload is unsuitable. Either subtyping fails, which includes
 * finding no substitution of the generics that makes the function callable,
 * and the reasonings say where; or subtyping succeeds but leaves a type
 * function that cannot reduce (such as add<string, string>), and the errors
 * say which. `Array.isArray` tells the two apart.
 */
export type IncompatibilityReason = SubtypingReasonings | LuauTypeError[];

/** The overload selected from an `OverloadResolution`. */
export interface SelectedOverload {
  /**
   * An unambiguous overload, when one can be selected. It is not necessarily
   * valid for the arguments given: for
   *
   *  local f: ((string) -> "one") & ((string, string) -> "two")
   *  f(42)
   *
   * `(string) -> "one"` is selected by its arity, and type checking later
   * reports that `42` is not a string.
   */
  overload: TypeId | undefined;
  /**
   * The constraints selecting the overload assumes. In
   *
   *  local f: ((string, number) -> string) & ((number, boolean) -> number)
   *  local function g(x)
   *      f(x, 42)
   *  end
   *
   * the second overload is rejected, and the first is the only possible one,
   * with the constraint `x <: string`.
   */
  assumedConstraints: ConstraintV[];
  /**
   * Whether selecting an overload may be worth deferring, as in
   *
   *  local f: ((string) -> string) & ((number) -> number)
   *  local function g(x)
   *      f(x)
   *  end
   *
   * where a later constraint on `x` may select an overload unambiguously.
   */
  shouldRetry: boolean;
}

export class OverloadResolution {
  /** Overloads that work. */
  ok: TypeId[] = [];

  /** "Overloads" that are not callable. */
  nonFunctions: TypeId[] = [];

  /** Overloads that could match, but only if other constraints are satisfied too. */
  potentialOverloads: [TypeId, ConstraintV[]][] = [];

  /** Overloads that have the right arity but do not work. */
  incompatibleOverloads: [TypeId, IncompatibilityReason][] = [];

  /** Overloads that can never work, because of their arity. */
  arityMismatches: TypeId[] = [];

  /**
   * The overloads that are `__call` metamethods: type inference prepends the
   * self argument to the argument list when it infers them.
   */
  metamethods = new Set<TypeId>();

  /** Tries to determine an unambiguous overload; see `SelectedOverload`. */
  getUnambiguousOverload(): SelectedOverload {
    if (this.ok.length === 1 && this.potentialOverloads.length === 0) {
      // Exactly one overload matches without dispatching more constraints.
      return {
        overload: this.ok[0],
        assumedConstraints: [],
        shouldRetry: false,
      };
    }

    if (this.ok.length === 0 && this.potentialOverloads.length === 1) {
      // No overload matches without dispatching constraints, but exactly one
      // matches with them.
      const [overload, constraints] = this.potentialOverloads[0]!;
      return { overload, assumedConstraints: [...constraints], shouldRetry: false };
    }

    if (this.ok.length > 1) {
      // Luau's CLI-180645 would infer a union of the return types here, for
      // better autocomplete and inference in the rest of the function.
      return { overload: undefined, assumedConstraints: [], shouldRetry: false };
    }

    if (this.potentialOverloads.length + this.ok.length > 1) {
      // Ambiguous: several overloads match, at most one of them without
      // extra constraints. This is the one case that asks for a retry, which
      // callers use to decide between reporting an error and trying again
      // later.
      if (this.ok.length === 0) {
        const [overload, constraints] = this.potentialOverloads[0]!;
        return { overload, assumedConstraints: [...constraints], shouldRetry: true };
      } else {
        return { overload: this.ok[0], assumedConstraints: [], shouldRetry: true };
      }
    }

    // No overload is valid, so the one that makes the most legible errors is picked.
    if (this.incompatibleOverloads.length === 1) {
      // Exactly one overload has the right arity, if incompatible arguments:
      // it is used, and type checking fails.
      return { overload: this.incompatibleOverloads[0]![0], assumedConstraints: [], shouldRetry: false };
    }

    // No overload's parameters are supertypes of the arguments, with or
    // without dispatching constraints; none has the right arity with
    // incompatible arguments; and either none or several only mismatch in
    // arity. The best left is to unify against the error type and move on.
    return { overload: undefined, assumedConstraints: [], shouldRetry: false };
  }
}

/** Luau's `TypePackMismatch` with its default, empty reason. */
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

  // When a mismatch of the return types was the only reason subtyping
  // failed, the match counts as a success.
  if (sr.reasoning.empty() && sr.genericBoundsMismatches.length === 0 && sr.errors.length === 0) sr.isSubtype = true;
}

function areUnsatisfiedArgumentsOptional(reasonings: SubtypingReasonings, argPack: TypePackId, funcArgPack: TypePackId): boolean {
  // When two argument lists are incompatible only in their counts, the
  // reasonings point at the argument lists themselves; a reasoning that
  // points into a pack means that argument's type is incompatible.
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

// Which argument a path points at, which generic pack substitutions make
// tricky to work out.
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
      // A component pointing at the tail of the pack advances the count by
      // the length of the current pack.
      if (isTypeId(ty)) return undefined;

      // Subtyping flattens chains of concrete packs when it makes these
      // paths, so the count does too.
      const { head, tail } = flatten(ty);
      result += head.length;

      if (!tail) return undefined;

      ty = tail;

      continue;
    } else return undefined;
  }

  return undefined;
}

// When subtyping fails against a union or intersection argument, it breaks
// that type down and makes a path into the member that failed (the `nil` of
// `number?`, say). An error about an argument names the type the caller
// actually passed, so the path is cut at its first union or intersection
// member.
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

  /** Tests each overload of a possibly overloaded function against a set of arguments. */
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

    // A variadic parameter has no index of its own, so the subPath stops at
    // the tail. The argument that failed against it is the one the
    // superPath names.
    if (argumentIndex === undefined) {
      const given = this.arena.addType(functionType(argPack, this.builtinTypes.anyTypePack));
      argumentIndex = getArgumentIndex(reason.superPath, given);
    }

    let argLocation: Location;
    // When the argument corresponds to an expression, its location is used.
    if (argumentIndex !== undefined && argumentIndex < argExprs.length) argLocation = argExprs[argumentIndex]!.location;
    // Else, when any arguments were passed, the last one's. (The location of
    // the call's closing parenthesis would be better.)
    else if (argExprs.length !== 0) argLocation = argExprs[argExprs.length - 1]!.location;
    // With no arguments at all, the location of the whole call.
    else argLocation = fnLocation;

    const prospectiveFunction = this.arena.addType(functionType(argPack, this.builtinTypes.anyTypePack));

    const failedSubPack = traverseForPack(prospectiveFunction, reason.superPath, this.builtinTypes, this.arena);
    const failedSuperPack = traverseForPack(fnTy, reason.subPath, this.builtinTypes, this.arena);

    if (failedSuperPack && getPack(failedSuperPack, "GenericTypePack")) {
      this.maybeEmplaceErrorPacks(errors, argLocation, moduleName, reason, failedSuperPack, failedSubPack ?? this.builtinTypes.emptyTypePack);
      return;
    }

    // A mismatch on the argument list itself means the wrong number of
    // arguments were passed.
    if (isPathOnArgumentList(reason.subPath)) {
      // Too few arguments give an empty subPath. Too many give a slice
      // subPath pointing at the first unsatisfied argument, and a superPath
      // pointing at the tail of the parameter list. The superPath sometimes
      // includes generic substitutions, which the expected parameter count
      // takes into account.

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
        // Not really a count mismatch: the required parameters can be a
        // generic pack that is not yet satisfied.

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
      // When the argument corresponds to an expression, its location is used.
      if (argumentIndex < argExprs.length) argLocation = argExprs[argumentIndex]!.location;
      // Else, when any arguments were passed, the last one's.
      else if (argExprs.length !== 0) argLocation = argExprs[argExprs.length - 1]!.location;
      // With no arguments at all, the location of the whole call.
      else argLocation = fnLocation;

      // The first path component is always the arguments pack field.
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
      // A bug in type inference can leave the result type of a function free,
      // making the return packs mismatch. That is reported rather than
      // failing outright, at the last argument, or at the function when there
      // are no arguments.
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

  // Tests a single function type against an argument list, reducing its type
  // functions and checking its arity properly.
  private testFunction(result: OverloadResolution, fnTy: TypeId, argsPack: TypePackId, fnLocation: Location, _uniqueTypes: Set<TypeId>): void {
    fnTy = follow(fnTy);

    if (is(fnTy, "FreeType", "BlockedType", "PendingExpansionType")) {
      // A potential overload without constraints: callers do not use these constraints yet.
      const constraints: ConstraintV[] = [];
      result.potentialOverloads.push([fnTy, constraints]);
      return;
    }

    const tfit = get(fnTy, "TypeFunctionInstanceType");
    if (tfit && tfit.state === TypeFunctionInstanceState.Unsolved) {
      // A potential overload without constraints: callers do not use these constraints yet.
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
    const reduceResult = reduceTypeFunctions(fnTy, this.callLoc, context, /* force */ true);
    // A user-defined type function in the signature always fails to evaluate,
    // since Sparkdown has no VM; that is reported where an annotation names
    // it, and does not make every call of the function a mismatch.
    const errors = reduceResult.errors.filter((e) => e.data.kind !== "UserDefinedTypeFunctionError");
    if (errors.length !== 0) {
      result.incompatibleOverloads.push([fnTy, errors]);
      return;
    }

    const prospectiveFunction = this.arena.addType(functionType(argsPack, this.builtinTypes.anyTypePack));

    const r = this.subtyping.isSubtype(fnTy, prospectiveFunction, this.scope);

    // Subtyping knows nothing of error suppression, so this test is likely to
    // fail on the mismatched return types: the reasonings about the return
    // type are pruned. Testing only the argument types would change the
    // paths the test makes.
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
        // Subtyping knows nothing of optional arguments: when the only reason
        // it failed is that optional arguments were not passed, the overload
        // works.
        if (r.assumedConstraints.length === 0) result.ok.push(fnTy);
        else result.potentialOverloads.push([fnTy, r.assumedConstraints]);
      } else result.incompatibleOverloads.push([fnTy, r.reasoning]);
    }
  }

  private testFunctionOrUnion(result: OverloadResolution, fnTy: TypeId, argsPack: TypePackId, fnLocation: Location, uniqueTypes: Set<TypeId>): void {
    const ut = get(fnTy, "UnionType");
    if (ut) {
      // A union of functions is a valid overload if and only if every type in it is one.

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
        // Type checking needs the union among the incompatible overloads,
        // even with this vague error.
        result.incompatibleOverloads.push([fnTy, [new LuauTypeError(fnLocation, { kind: "CannotCallNonFunction", ty: fnTy })]]);
      }
    } else this.testFunctionOrCallMetamethod(result, fnTy, argsPack, fnLocation, uniqueTypes);
  }

  // For `resolveOverload`: an overload that is a table with a `__call`
  // metamethod is unwrapped, and the metamethod tested. The metamethod may
  // itself be overloaded, but must be a function, not a table that
  // overloads `__call`.
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
      // Calling a metamethod forwards `fnTy` as self.
      argsPack = this.arena.addTypePack([fnTy], argsPack);
      fnTy = follow(callMetamethod);

      // An overloaded __call metamethod.
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

    // Functions, and metamethods that are not overloaded.
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

      // A failed normalization reports its own error and then the mismatch,
      // as it did not prove the mismatch suppressed.
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

  // Whether the arguments are arity-compatible with the parameters, for
  // filtering overloads by arity. Nil is not accepted in place of a generic
  // unless that generic is explicitly optional.
  private isArityCompatible(candidate: TypePackId, desired: TypePackId, builtinTypes: BuiltinTypes): boolean {
    const { head: candidateHead, tail: candidateTail } = flatten(candidate);
    const { head: desiredHead, tail: desiredTail } = flatten(desired);

    // Too few arguments were passed.
    if (candidateHead.length < desiredHead.length) {
      // A tail can fill in the remaining values.
      if (candidateTail) return true;

      // Without a tail, fewer arguments match only when the extra parameters are all optional.
      for (let i = candidateHead.length; i < desiredHead.length; ++i) {
        const ty = follow(desiredHead[i]!);
        if (!isOptionalType(ty, builtinTypes)) return false;
      }
    }

    // Too many arguments were passed.
    if (candidateHead.length > desiredHead.length) {
      // A function that takes a variadic or generic tail matches the arity.
      return desiredTail !== undefined;
    }

    // Nothing else makes the arities incompatible.
    return true;
  }
}
