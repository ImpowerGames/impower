// Subtyping, ported from Luau's `Subtyping.h`/`Subtyping.cpp`; Luau is
// MIT-licensed (see `LICENSE-luau.txt`).
//
// `isSubtype` answers whether one type is a subtype of another and, when it
// is not, records where inside the two types the test failed as a pair of
// type paths, which the checker turns into error messages.

import { type ConstraintV, type PackSubtypeConstraint, type SubtypeConstraint } from "./Constraint";
import { LuauTypeError } from "./Error";
import { Location } from "./Location";
import { NormalizationResult, isSubtypeOfStrings, type NormalizedExternType, type NormalizedFunctionType, type NormalizedStringType, type NormalizedType, type Normalizer } from "./Normalize";
import type { Scope } from "./Scope";
import { subsumes } from "./Scope";
import { areEqualPacks } from "./StructuralTypeEquality";
import { Substitution } from "./Substitution";
import {
  flatOptions,
  flatten,
  follow,
  followPack,
  get,
  getMetatable,
  getPack,
  isSubclass,
  lookupExternTypeProp,
  negationType,
  PrimitiveKind,
  Property,
  sliceTypePack,
  TableState,
  tableType,
  typePack,
  type BuiltinTypes,
  type ExternType,
  type FunctionType,
  type IntersectionType,
  type MetatableType,
  type NegationType,
  type PrimitiveType,
  type SingletonType,
  type TableIndexer,
  type TableType,
  type TypeArena,
  type TypeFunctionInstanceType,
  type TypeId,
  type TypePackId,
  type UnionType,
  type VariadicTypePack,
} from "./Type";
import { reduceTypeFunctions, TypeFunctionContext, type TypeFunctionRuntime } from "./TypeFunction";
import { TypeIds } from "./TypeIds";
import { Components, EMPTY_PATH, IndexVariant, PackField, Path, PathBuilder, TypeField, type Component } from "./TypePath";
import { ErrorSuppression, IntersectionBuilder, orElse, shouldSuppressErrors, UnionBuilder } from "./TypeUtils";

export const enum SubtypingVariance {
  Invalid,
  Covariant,
  Contravariant,
  Invariant,
}

export class SubtypingReasoning {
  constructor(
    public subPath: Path,
    public superPath: Path,
    public variance: SubtypingVariance = SubtypingVariance.Covariant,
    public isPropertyModifierViolation = false,
  ) {}

  key(): string {
    return `${this.subPath.key()}|${this.superPath.key()}|${this.variance}|${this.isPropertyModifierViolation ? 1 : 0}`;
  }
}

// Luau's `LuauSubtypingReasoningLimit`, `LuauSubtypingRecursionLimit` and
// `LuauSubtypingIterationLimit`.
const SUBTYPING_REASONING_LIMIT = 100;
const SUBTYPING_RECURSION_LIMIT = 100;
const SUBTYPING_ITERATION_LIMIT = 20000;

/** A set of reasonings, iterated in insertion order. */
export class SubtypingReasonings implements Iterable<SubtypingReasoning> {
  private items: SubtypingReasoning[] = [];

  get size(): number {
    return this.items.length;
  }

  empty(): boolean {
    return this.items.length === 0;
  }

  insert(r: SubtypingReasoning): void {
    const key = r.key();
    if (!this.items.some((x) => x.key() === key)) this.items.push(r);
  }

  contains(r: SubtypingReasoning): boolean {
    const key = r.key();
    return this.items.some((x) => x.key() === key);
  }

  clear(): void {
    this.items = [];
  }

  /** Rebuilds the set after its members were changed in place. */
  normalize(): void {
    const items = this.items;
    this.items = [];
    for (const r of items) this.insert(r);
  }

  [Symbol.iterator](): Iterator<SubtypingReasoning> {
    return this.items.slice()[Symbol.iterator]();
  }

  toArray(): SubtypingReasoning[] {
    return this.items.slice();
  }
}

function mergeReasonings(a: SubtypingReasonings, b: SubtypingReasonings): SubtypingReasonings {
  const result = new SubtypingReasonings();
  const add = (r: SubtypingReasoning, other: SubtypingReasonings) => {
    if (r.variance === SubtypingVariance.Invariant) result.insert(r);
    else if (r.variance === SubtypingVariance.Covariant || r.variance === SubtypingVariance.Contravariant) {
      const inverse = new SubtypingReasoning(
        r.subPath,
        r.superPath,
        r.variance === SubtypingVariance.Covariant ? SubtypingVariance.Contravariant : SubtypingVariance.Covariant,
      );
      if (other.contains(inverse)) result.insert(new SubtypingReasoning(r.subPath, r.superPath, SubtypingVariance.Invariant));
      else result.insert(r);
    }
  };
  for (const r of a) {
    add(r, b);
    if (result.size >= SUBTYPING_REASONING_LIMIT) return result;
  }
  for (const r of b) {
    add(r, a);
    if (result.size >= SUBTYPING_REASONING_LIMIT) return result;
  }
  return result;
}

export interface GenericBoundsMismatchRecord {
  genericName: string;
  lowerBounds: TypeId[];
  upperBounds: TypeId[];
}

export class SubtypingResult {
  isErrorSuppressing = false;
  errors: LuauTypeError[] = [];
  reasoning = new SubtypingReasonings();
  assumedConstraints: ConstraintV[] = [];
  genericBoundsMismatches: GenericBoundsMismatchRecord[] = [];

  constructor(
    public isSubtype = false,
    public normalizationTooComplex = false,
    public isCacheable = true,
  ) {}

  clone(): SubtypingResult {
    const r = new SubtypingResult(this.isSubtype, this.normalizationTooComplex, this.isCacheable);
    r.isErrorSuppressing = this.isErrorSuppressing;
    r.errors = [...this.errors];
    for (const reasoning of this.reasoning) {
      r.reasoning.insert(new SubtypingReasoning(reasoning.subPath, reasoning.superPath, reasoning.variance, reasoning.isPropertyModifierViolation));
    }
    r.assumedConstraints = [...this.assumedConstraints];
    r.genericBoundsMismatches = [...this.genericBoundsMismatches];
    return r;
  }

  andAlso(other: SubtypingResult): this {
    // A failure's reasonings join this result's; a first failure takes them over.
    if (!other.isSubtype) {
      if (this.isSubtype) this.reasoning = other.reasoning;
      else this.reasoning = mergeReasonings(this.reasoning, other.reasoning);
    }
    this.isSubtype = this.isSubtype && other.isSubtype;
    this.isErrorSuppressing = this.isErrorSuppressing || other.isErrorSuppressing;
    this.normalizationTooComplex = this.normalizationTooComplex || other.normalizationTooComplex;
    this.isCacheable = this.isCacheable && other.isCacheable;
    this.errors.push(...other.errors);
    this.genericBoundsMismatches.push(...other.genericBoundsMismatches);
    this.assumedConstraints.push(...other.assumedConstraints);
    return this;
  }

  orElse(other: SubtypingResult): this {
    // A success clears the reasonings; two failures join them.
    if (!this.isSubtype) {
      if (other.isSubtype) {
        this.reasoning.clear();
        this.assumedConstraints = other.assumedConstraints;
      } else {
        this.reasoning = mergeReasonings(this.reasoning, other.reasoning);
        this.isErrorSuppressing = this.isErrorSuppressing || other.isErrorSuppressing;
      }
    } else if (other.isSubtype) {
      this.assumedConstraints = other.assumedConstraints;
    }
    this.isSubtype = this.isSubtype || other.isSubtype;
    this.normalizationTooComplex = this.normalizationTooComplex || other.normalizationTooComplex;
    this.isCacheable = this.isCacheable && other.isCacheable;
    this.errors.push(...other.errors);
    this.genericBoundsMismatches.push(...other.genericBoundsMismatches);
    return this;
  }

  withBothComponent(component: Component): this {
    return this.withSubComponent(component).withSuperComponent(component);
  }

  withSubComponent(component: Component): this {
    if (this.reasoning.empty()) this.reasoning.insert(new SubtypingReasoning(new Path([component]), EMPTY_PATH));
    else {
      for (const r of this.reasoning) r.subPath = r.subPath.pushFront(component);
      this.reasoning.normalize();
    }
    return this;
  }

  withSuperComponent(component: Component): this {
    if (this.reasoning.empty()) this.reasoning.insert(new SubtypingReasoning(EMPTY_PATH, new Path([component])));
    else {
      for (const r of this.reasoning) r.superPath = r.superPath.pushFront(component);
      this.reasoning.normalize();
    }
    return this;
  }

  withBothPath(path: Path): this {
    return this.withSubPath(path).withSuperPath(path);
  }

  withSubPath(path: Path): this {
    if (this.reasoning.empty()) this.reasoning.insert(new SubtypingReasoning(path, EMPTY_PATH));
    else {
      for (const r of this.reasoning) r.subPath = path.append(r.subPath);
      this.reasoning.normalize();
    }
    return this;
  }

  withSuperPath(path: Path): this {
    if (this.reasoning.empty()) this.reasoning.insert(new SubtypingReasoning(EMPTY_PATH, path));
    else {
      for (const r of this.reasoning) r.superPath = path.append(r.superPath);
      this.reasoning.normalize();
    }
    return this;
  }

  withErrors(errs: LuauTypeError[]): this {
    this.errors.push(...errs);
    return this;
  }

  withError(err: LuauTypeError): this {
    this.errors.push(err);
    return this;
  }

  withPropertyModifierViolation(): this {
    for (const r of this.reasoning) r.isPropertyModifierViolation = true;
    this.reasoning.normalize();
    return this;
  }

  withAssumedConstraint(constraint: ConstraintV): this {
    this.assumedConstraints.push(constraint);
    return this;
  }

  static negate(result: SubtypingResult): SubtypingResult {
    return new SubtypingResult(!result.isSubtype, result.normalizationTooComplex);
  }
}

function subtypeConstraint(subType: TypeId, superType: TypeId): SubtypeConstraint {
  return { kind: "SubtypeConstraint", subType, superType };
}

function packSubtypeConstraint(subPack: TypePackId, superPack: TypePackId): PackSubtypeConstraint {
  return { kind: "PackSubtypeConstraint", subPack, superPack, returns: false };
}

// ---------------------------------------------------------------------------
// Generic packs
// ---------------------------------------------------------------------------

interface MappedGenericFrame {
  mappings: Map<TypePackId, TypePackId | undefined>;
  parentScopeIndex: number | undefined;
  children: Set<number>;
}

type LookupResult = { kind: "Mapped"; tp: TypePackId } | { kind: "Unmapped"; scopeIndex: number } | { kind: "NotBindable" };

/**
 * The generic packs bound while subtyping, as a tree of frames: generic packs
 * are not strictly lexical, and a nested pack can shadow an outer one.
 */
class MappedGenericEnvironment {
  frames: MappedGenericFrame[] = [];
  currentScopeIndex: number | undefined;

  lookupGenericPack(genericTp: TypePackId): LookupResult {
    genericTp = followPack(genericTp);
    let currentFrameIndex = this.currentScopeIndex;
    while (currentFrameIndex !== undefined) {
      const frame = this.frames[currentFrameIndex]!;
      if (frame.mappings.has(genericTp)) {
        const mapped = frame.mappings.get(genericTp);
        return mapped ? { kind: "Mapped", tp: mapped } : { kind: "Unmapped", scopeIndex: currentFrameIndex };
      }
      currentFrameIndex = frame.parentScopeIndex;
    }
    // A scope nested in this one may mention the pack.
    if (this.currentScopeIndex !== undefined) {
      const toCheck = [...this.frames[this.currentScopeIndex]!.children];
      while (toCheck.length) {
        const currIndex = toCheck.pop()!;
        const frame = this.frames[currIndex]!;
        if (frame.mappings.has(genericTp)) {
          const mapped = frame.mappings.get(genericTp);
          return mapped ? { kind: "Mapped", tp: mapped } : { kind: "Unmapped", scopeIndex: currIndex };
        }
        toCheck.push(...frame.children);
      }
    }
    return { kind: "NotBindable" };
  }

  pushFrame(genericTps: TypePackId[]): void {
    const mappings = new Map<TypePackId, TypePackId | undefined>();
    for (const tp of genericTps) mappings.set(tp, undefined);
    this.frames.push({ mappings, parentScopeIndex: this.currentScopeIndex, children: new Set() });
    const newFrameIndex = this.frames.length - 1;
    if (this.currentScopeIndex !== undefined) this.frames[this.currentScopeIndex]!.children.add(newFrameIndex);
    this.currentScopeIndex = newFrameIndex;
  }

  popFrame(): void {
    if (this.currentScopeIndex !== undefined) {
      this.currentScopeIndex = this.frames[this.currentScopeIndex]!.parentScopeIndex ?? 0;
    }
  }

  bindGeneric(genericTp: TypePackId, bindeeTp: TypePackId): boolean {
    if (genericTp === bindeeTp) return true;
    if (!getPack(genericTp, "GenericTypePack")) return false;
    const lookupResult = this.lookupGenericPack(genericTp);
    if (lookupResult.kind === "Unmapped") {
      this.frames[lookupResult.scopeIndex]!.mappings.set(genericTp, bindeeTp);
      return true;
    }
    return false;
  }
}

interface GenericBounds {
  lowerBound: TypeIds;
  upperBound: TypeIds;
}

function freshBounds(): GenericBounds {
  return { lowerBound: new TypeIds(), upperBound: new TypeIds() };
}

export class SubtypingEnvironment {
  parent: SubtypingEnvironment | undefined;
  /** For each generic, a stack of bounds: a generic may be shadowed by a nested function type. */
  readonly mappedGenerics = new Map<TypeId, GenericBounds[]>();
  readonly mappedGenericPacks = new MappedGenericEnvironment();
  /** An entry mapped to undefined counts as absent. */
  readonly substitutions = new Map<TypeId, TypeId | undefined>();
  readonly seenSetCache = new Map<string, SubtypingResult>();
  iterationCount = 0;

  applyMappedGenerics(builtinTypes: BuiltinTypes, arena: TypeArena, ty: TypeId): TypeId | undefined {
    return new ApplyMappedGenerics(builtinTypes, arena, this).substitute(ty);
  }

  tryFindSubstitution(ty: TypeId): TypeId | undefined {
    if (this.substitutions.has(ty)) return this.substitutions.get(ty);
    return this.parent?.tryFindSubstitution(ty);
  }

  tryFindSubtypingResult(key: string): SubtypingResult | undefined {
    return this.seenSetCache.get(key) ?? this.parent?.tryFindSubtypingResult(key);
  }

  containsMappedType(ty: TypeId): boolean {
    ty = follow(ty);
    const bounds = this.mappedGenerics.get(ty);
    if (bounds && bounds.length) return true;
    return this.parent?.containsMappedType(ty) ?? false;
  }

  containsMappedPack(tp: TypePackId): boolean {
    if (this.mappedGenericPacks.lookupGenericPack(tp).kind === "Mapped") return true;
    return this.parent?.containsMappedPack(tp) ?? false;
  }

  getMappedTypeBounds(ty: TypeId): GenericBounds {
    ty = follow(ty);
    const bounds = this.mappedGenerics.get(ty);
    if (bounds && bounds.length) return bounds[bounds.length - 1]!;
    if (this.parent) return this.parent.getMappedTypeBounds(ty);
    throw new Error("Trying to access bounds for a type with no in-scope bounds");
  }

  lookupGenericPack(tp: TypePackId): LookupResult {
    const result = this.mappedGenericPacks.lookupGenericPack(tp);
    if (result.kind === "Mapped") return result;
    if (this.parent) return this.parent.lookupGenericPack(tp);
    return result;
  }
}

class ApplyMappedGenerics extends Substitution {
  constructor(
    readonly builtinTypes: BuiltinTypes,
    arena: TypeArena,
    readonly env: SubtypingEnvironment,
  ) {
    super(arena);
  }

  isDirty(ty: TypeId): boolean {
    return this.env.containsMappedType(ty);
  }

  isDirtyPack(tp: TypePackId): boolean {
    return this.env.containsMappedPack(tp);
  }

  clean(ty: TypeId): TypeId {
    const { lowerBound, upperBound } = this.env.getMappedTypeBounds(ty);
    if (upperBound.empty() && lowerBound.empty()) {
      // With no bounds, unknown is as good as never, and closest to the original behavior.
      return this.builtinTypes.unknownType;
    } else if (!upperBound.empty()) {
      const ib = new IntersectionBuilder(this.arena, this.builtinTypes);
      for (const ub of upperBound) if (!get(ub, "GenericType")) ib.add(ub);
      return ib.build();
    }
    const ub = new UnionBuilder(this.arena, this.builtinTypes);
    for (const lb of lowerBound) if (!get(lb, "GenericType")) ub.add(lb);
    return ub.build();
  }

  cleanPack(tp: TypePackId): TypePackId {
    const result = this.env.lookupGenericPack(tp);
    if (result.kind === "Mapped") return result.tp;
    return this.builtinTypes.anyTypePack;
  }

  override ignoreChildren(ty: TypeId): boolean {
    if (get(ty, "ExternType")) return true;
    const f = get(ty, "FunctionType");
    if (f) {
      for (let g of f.generics) {
        g = follow(g);
        const bounds = this.env.mappedGenerics.get(g);
        // The generics of a function being subtyped are not substituted.
        if (bounds && bounds.length) return true;
      }
    }
    return ty.persistent;
  }

  override ignoreChildrenPack(tp: TypePackId): boolean {
    return tp.persistent;
  }
}

// ---------------------------------------------------------------------------
// Subtyping
// ---------------------------------------------------------------------------

function pairKey(a: { serial: number }, b: { serial: number }): string {
  return `${a.serial}:${b.serial}`;
}

/** A result returned without entering the result cache, as Luau's early returns are. */
class Uncached {
  constructor(readonly result: SubtypingResult) {}
}

export class Subtyping {
  private readonly resultCache = new Map<string, SubtypingResult>();
  private readonly seenTypes = new Set<string>();
  private readonly seenPacks = new Set<string>();
  /** Types known to be unique, whose tables may be tested covariantly. */
  uniqueTypes: Set<TypeId> | undefined;

  constructor(
    readonly builtinTypes: BuiltinTypes,
    readonly arena: TypeArena,
    readonly normalizer: Normalizer,
    readonly typeFunctionRuntime: TypeFunctionRuntime,
    readonly recursionLimit = SUBTYPING_RECURSION_LIMIT,
  ) {}

  private recurse(f: () => SubtypingResult): SubtypingResult {
    const counters = this.normalizer.sharedState.counters;
    if (this.recursionLimit > 0 && counters.recursionCount >= this.recursionLimit) return new SubtypingResult(false, true);
    counters.recursionCount++;
    try {
      return f();
    } finally {
      counters.recursionCount--;
    }
  }

  isSubtype(subTy: TypeId, superTy: TypeId, scope: Scope): SubtypingResult {
    const env = new SubtypingEnvironment();
    const result = this.isCovariantWith(env, subTy, superTy, scope);
    if (result.isCacheable) this.resultCache.set(pairKey(subTy, superTy), result.clone());
    return result;
  }

  isSubtypePack(
    subTp: TypePackId,
    superTp: TypePackId,
    scope: Scope,
    bindableGenerics: TypeId[] = [],
    bindableGenericPacks: TypePackId[] = [],
  ): SubtypingResult {
    const env = new SubtypingEnvironment();
    for (const g of bindableGenerics) env.mappedGenerics.set(follow(g), [freshBounds()]);
    env.mappedGenericPacks.pushFrame(bindableGenericPacks);
    const result = this.isCovariantWithPacks(env, subTp, superTp, scope);
    for (let bg of bindableGenerics) {
      bg = follow(bg);
      const bounds = env.mappedGenerics.get(bg);
      if (!bounds || !bounds.length) continue;
      const gen = get(bg, "GenericType");
      if (gen) result.andAlso(this.checkGenericBounds(bounds[bounds.length - 1]!, env, scope, gen.name));
    }
    return result;
  }

  private cache(result: SubtypingResult, subTy: TypeId, superTy: TypeId): SubtypingResult {
    if (result.isCacheable) this.resultCache.set(pairKey(subTy, superTy), result.clone());
    return result;
  }

  isCovariantWith(env: SubtypingEnvironment, subTy: TypeId, superTy: TypeId, scope: Scope): SubtypingResult {
    return this.recurse(() => {
      env.iterationCount++;
      if (env.iterationCount >= SUBTYPING_ITERATION_LIMIT) return new SubtypingResult(false, true);
      subTy = follow(subTy);
      superTy = follow(superTy);
      const subIt = env.tryFindSubstitution(subTy);
      if (subIt) subTy = subIt;
      // As in Luau, a substitution for the supertype replaces the subtype.
      const superIt = env.tryFindSubstitution(superTy);
      if (superIt) subTy = superIt;

      const key = pairKey(subTy, superTy);
      const cachedResult = this.resultCache.get(key) ?? env.tryFindSubtypingResult(key);
      if (cachedResult) return cachedResult.clone();
      if (subTy === superTy) return new SubtypingResult(true);

      if (this.seenTypes.has(key)) {
        // A cycle is assumed to succeed, and nothing touching it is cached.
        const res = new SubtypingResult(true, false, false);
        env.seenSetCache.set(key, res.clone());
        return res;
      }
      this.seenTypes.add(key);
      try {
        const result = this.isCovariantWithTypes(env, subTy, superTy, scope);
        if (result instanceof Uncached) return result.result;
        return this.cache(result, subTy, superTy);
      } finally {
        this.seenTypes.delete(key);
      }
    });
  }

  private isCovariantWithTypes(env: SubtypingEnvironment, subTy: TypeId, superTy: TypeId, scope: Scope): SubtypingResult | Uncached {
    const b = this.builtinTypes;
    let result = new SubtypingResult();
    const subFree = get(subTy, "FreeType");
    const superFree = get(superTy, "FreeType");
    if (subFree && superFree) {
      // Two free types may both narrow to never.
      result = new SubtypingResult(true);
      result.assumedConstraints.push(subtypeConstraint(subTy, superTy));
    } else if (superFree) {
      // SubTy <: (LB <: SuperTy <: UB) is possible when SubTy <: UB.
      result = this.isCovariantWith(env, subTy, superFree.upperBound, scope);
      if (result.isSubtype) result.assumedConstraints.push(subtypeConstraint(subTy, superTy));
    } else if (subFree) {
      // (LB <: SubTy <: UB) <: SuperTy is impossible when LB </: SuperTy.
      if (this.isCovariantWith(env, subFree.lowerBound, superTy, scope).isSubtype) {
        result = new SubtypingResult(true);
        result.assumedConstraints.push(subtypeConstraint(subTy, superTy));
      } else result = new SubtypingResult(false);
    } else if (get(subTy, "BlockedType") || get(superTy, "BlockedType")) {
      result = new SubtypingResult(true);
      result.assumedConstraints.push(subtypeConstraint(subTy, superTy));
    } else if (get(subTy, "GenericType") && subsumes(get(subTy, "GenericType")!.scope, scope)) {
      return new Uncached(this.isCovariantWith(env, b.neverType, superTy, scope));
    } else if (get(superTy, "GenericType") && subsumes(get(superTy, "GenericType")!.scope, scope)) {
      return new Uncached(this.isCovariantWith(env, subTy, b.unknownType, scope));
    } else if (get(superTy, "AnyType")) {
      result = new SubtypingResult(true);
    } else if (get(subTy, "AnyType") && get(superTy, "UnknownType")) {
      // any is unknown | *error-type*, and the error type has no inhabitants.
      result = new SubtypingResult(true);
    } else if (get(subTy, "AnyType")) {
      result = this.isCovariantWith(env, b.unknownType, superTy, scope).andAlso(this.isCovariantWith(env, b.errorType, superTy, scope));
      result.isErrorSuppressing = true;
    } else if (get(superTy, "UnknownType") && !get(subTy, "UnionType") && !get(subTy, "IntersectionType")) {
      const errorSuppressing = get(subTy, "ErrorType") !== undefined;
      result.isSubtype = !errorSuppressing;
      result.isErrorSuppressing = errorSuppressing;
    } else if (get(subTy, "NeverType")) {
      result = new SubtypingResult(true);
    } else if (get(superTy, "ErrorType")) {
      result = new SubtypingResult(false);
    } else if (get(subTy, "ErrorType")) {
      result = new SubtypingResult(true);
      result.isErrorSuppressing = true;
    } else if (get(subTy, "TypeFunctionInstanceType")) {
      let subInstance = get(subTy, "TypeFunctionInstanceType")!;
      let applied = false;
      const substSubTy = env.applyMappedGenerics(b, this.arena, subTy);
      if (substSubTy) {
        applied = substSubTy !== subTy;
        subInstance = get(substSubTy, "TypeFunctionInstanceType") ?? subInstance;
      }
      result = this.isCovariantWithReducedSub(env, subInstance, superTy, scope);
      result.isCacheable = !applied;
    } else if (get(superTy, "TypeFunctionInstanceType")) {
      let superInstance = get(superTy, "TypeFunctionInstanceType")!;
      let applied = false;
      const substSuperTy = env.applyMappedGenerics(b, this.arena, superTy);
      if (substSuperTy) {
        applied = substSuperTy !== superTy;
        superInstance = get(substSuperTy, "TypeFunctionInstanceType") ?? superInstance;
      }
      result = this.isCovariantWithReducedSuper(env, subTy, superInstance, scope);
      result.isCacheable = !applied;
    } else if (get(subTy, "GenericType") || get(superTy, "GenericType")) {
      const subBounds = env.mappedGenerics.get(subTy);
      const superBounds = env.mappedGenerics.get(superTy);
      if ((subBounds && subBounds.length) || (superBounds && superBounds.length)) {
        result.isSubtype = this.bindGeneric(env, subTy, superTy);
        result.isCacheable = false;
      }
    } else if (get(subTy, "UnionType") && get(superTy, "UnionType")) {
      result = this.isCovariantWithUnions(env, get(subTy, "UnionType")!, get(superTy, "UnionType")!, scope);
      if (!result.isSubtype && !result.normalizationTooComplex) result = this.trySemanticSubtyping(env, subTy, superTy, scope, result);
    } else if (get(subTy, "UnionType")) {
      result = this.isCovariantWithSubUnion(env, get(subTy, "UnionType")!, superTy, scope);
    } else if (get(superTy, "UnionType")) {
      result = this.isCovariantWithSuperUnion(env, subTy, get(superTy, "UnionType")!, scope);
      if (!result.isSubtype && !result.normalizationTooComplex) result = this.trySemanticSubtyping(env, subTy, superTy, scope, result);
    } else if (get(superTy, "IntersectionType")) {
      result = this.isCovariantWithSuperIntersection(env, subTy, get(superTy, "IntersectionType")!, scope);
    } else if (get(subTy, "IntersectionType")) {
      result = this.isCovariantWithSubIntersection(env, get(subTy, "IntersectionType")!, superTy, scope);
      if (!result.isSubtype && !result.normalizationTooComplex) result = this.trySemanticSubtyping(env, subTy, superTy, scope, result);
    } else if (get(subTy, "NegationType") && get(superTy, "NegationType")) {
      // Contravariance keeps the type paths coherent.
      result = this.isContravariantWith(env, get(subTy, "NegationType")!.ty, get(superTy, "NegationType")!.ty, scope).withBothComponent(
        Components.field(TypeField.Negated),
      );
    } else if (get(subTy, "NegationType")) {
      result = this.isCovariantWithSubNegation(env, get(subTy, "NegationType")!, superTy, scope);
      if (!result.isSubtype && !result.normalizationTooComplex) result = this.trySemanticSubtyping(env, subTy, superTy, scope, result);
    } else if (get(superTy, "NegationType")) {
      result = this.isCovariantWithSuperNegation(env, subTy, get(superTy, "NegationType")!, scope);
      if (!result.isSubtype && !result.normalizationTooComplex) result = this.trySemanticSubtyping(env, subTy, superTy, scope, result);
    } else if (get(subTy, "PrimitiveType") && get(superTy, "PrimitiveType")) {
      result = new SubtypingResult(get(subTy, "PrimitiveType")!.type === get(superTy, "PrimitiveType")!.type);
    } else if (get(subTy, "SingletonType") && get(superTy, "PrimitiveType")) {
      result = this.isCovariantWithSingletonPrim(get(subTy, "SingletonType")!, get(superTy, "PrimitiveType")!);
    } else if (get(subTy, "SingletonType") && get(superTy, "SingletonType")) {
      result = new SubtypingResult(singletonsEqual(get(subTy, "SingletonType")!, get(superTy, "SingletonType")!));
    } else if (get(subTy, "FunctionType") && get(superTy, "PrimitiveType")) {
      result.isSubtype = get(superTy, "PrimitiveType")!.type === PrimitiveKind.Function;
    } else if (get(subTy, "FunctionType") && get(superTy, "FunctionType")) {
      result = this.isCovariantWithFunctions(env, get(subTy, "FunctionType")!, get(superTy, "FunctionType")!, scope);
    } else if (get(subTy, "TableType") && get(superTy, "TableType")) {
      const subTable = get(subTy, "TableType")!;
      const superTable = get(superTy, "TableType")!;
      result = this.isCovariantWithTables(env, subTable, superTable, false, scope);
      if (result.isSubtype && !subTable.indexer && superTable.indexer && subTable.state !== TableState.Sealed) {
        // An unsealed table receives an indexer by unification.
        result.assumedConstraints.push(subtypeConstraint(subTy, superTy));
      }
    } else if (get(subTy, "MetatableType") && get(superTy, "MetatableType")) {
      const subMt = get(subTy, "MetatableType")!;
      const superMt = get(superTy, "MetatableType")!;
      result = this.isCovariantWith(env, subMt.table, superMt.table, scope)
        .withBothComponent(Components.field(TypeField.Table))
        .andAlso(this.isCovariantWith(env, subMt.metatable, superMt.metatable, scope).withBothComponent(Components.field(TypeField.Metatable)));
    } else if (get(subTy, "MetatableType") && get(superTy, "TableType")) {
      result = this.isCovariantWithMetatableTable(env, get(subTy, "MetatableType")!, get(superTy, "TableType")!, scope);
    } else if (get(subTy, "MetatableType") && get(superTy, "PrimitiveType")) {
      result = this.isCovariantWithMetatablePrim(env, get(subTy, "MetatableType")!, get(superTy, "PrimitiveType")!, scope);
    } else if (get(subTy, "ExternType") && get(superTy, "ExternType")) {
      result = new SubtypingResult(isSubclass(get(subTy, "ExternType")!, get(superTy, "ExternType")!));
    } else if (get(subTy, "ExternType") && get(superTy, "TableType")) {
      result = this.isCovariantWithExternTable(env, subTy, get(subTy, "ExternType")!, superTy, get(superTy, "TableType")!, scope);
    } else if (get(subTy, "TableType") && get(superTy, "PrimitiveType")) {
      result = new SubtypingResult(get(superTy, "PrimitiveType")!.type === PrimitiveKind.Table);
    } else if (get(subTy, "PrimitiveType") && get(superTy, "TableType")) {
      result = this.isCovariantWithPrimTable(env, get(subTy, "PrimitiveType")!, get(superTy, "TableType")!, scope);
    } else if (get(subTy, "SingletonType") && get(superTy, "TableType")) {
      result = this.isCovariantWithSingletonTable(env, get(subTy, "SingletonType")!, get(superTy, "TableType")!, scope);
    }
    return result;
  }

  /**
   * Subtyping of packs: the heads pairwise, then the longer head against the
   * other side's tail, then the tails.
   */
  isCovariantWithPacks(env: SubtypingEnvironment, subTp: TypePackId, superTp: TypePackId, scope: Scope): SubtypingResult {
    return this.recurse(() => {
      subTp = followPack(subTp);
      superTp = followPack(superTp);
      const key = pairKey(subTp, superTp);
      if (this.seenPacks.has(key)) return new SubtypingResult(true, false, false);
      this.seenPacks.add(key);
      try {
        return this.isCovariantWithPacksInner(env, subTp, superTp, scope);
      } finally {
        this.seenPacks.delete(key);
      }
    });
  }

  private isCovariantWithPacksInner(env: SubtypingEnvironment, subTp: TypePackId, superTp: TypePackId, scope: Scope): SubtypingResult {
    const { head: subHead, tail: subTail } = flatten(subTp);
    const { head: superHead, tail: superTail } = flatten(superTp);
    const headSize = Math.min(subHead.length, superHead.length);
    const result = new SubtypingResult(true);
    if (subTp === superTp) return new SubtypingResult(true);

    for (let i = 0; i < headSize; ++i) {
      result.andAlso(this.isCovariantWith(env, subHead[i]!, superHead[i]!, scope).withBothComponent(Components.index(i, IndexVariant.Pack)));
    }

    if (subHead.length < superHead.length) {
      if (subTail) {
        const out = this.isSubTailCovariantWith(env, result, subTp, subTail, superTp, headSize, superHead, superTail, scope);
        if (out.earlyExit) return out.result;
      } else {
        result.andAlso(new SubtypingResult(false));
        return result;
      }
    } else if (subHead.length > superHead.length) {
      if (superTail) {
        const out = this.isCovariantWithSuperTail(env, result, subTp, headSize, subHead, subTail, superTp, superTail, scope);
        if (out.earlyExit) return out.result;
      } else {
        return new SubtypingResult(false);
      }
    }

    const tailComponent = Components.pack(PackField.Tail);
    if (subTail && superTail) {
      const sv = getPack(subTail, "VariadicTypePack");
      const pv = getPack(superTail, "VariadicTypePack");
      const sg = getPack(subTail, "GenericTypePack");
      const pg = getPack(superTail, "GenericTypePack");
      if (sv && pv) result.andAlso(this.isTailVariadicVariadic(env, scope, sv, pv));
      else if (sg && pg) result.andAlso(this.isTailGenericGeneric(env, scope, subTail, superTail));
      else if (sv && pg) result.andAlso(this.isTailVariadicGeneric(env, scope, subTail, superTail));
      else if (sg && pv) result.andAlso(this.isTailGenericVariadic(env, scope, subTail, superTail, pv));
      else if (getPack(subTail, "FreeTypePack") || getPack(superTail, "FreeTypePack")) {
        result.andAlso(new SubtypingResult(true).withBothComponent(tailComponent).withAssumedConstraint(packSubtypeConstraint(subTail, superTail)));
      } else if (getPack(subTail, "ErrorTypePack") || getPack(superTail, "ErrorTypePack")) {
        // An error type pack is fine on either side.
        result.andAlso(new SubtypingResult(true).withBothComponent(tailComponent));
      } else {
        return new SubtypingResult(false)
          .withBothComponent(tailComponent)
          .withError(new LuauTypeError(scope.location, { kind: "UnexpectedTypePackInSubtyping", tp: subTail }))
          .withError(new LuauTypeError(scope.location, { kind: "UnexpectedTypePackInSubtyping", tp: superTail }));
      }
    } else if (subTail) {
      if (getPack(subTail, "VariadicTypePack")) return new SubtypingResult(false).withSubComponent(tailComponent);
      if (getPack(subTail, "GenericTypePack")) return this.isTailGenericNothing(env, scope, subTail);
      if (getPack(subTail, "FreeTypePack")) {
        // With equal heads and no super tail, the missing tail is the empty pack.
        return new SubtypingResult(true)
          .withBothComponent(tailComponent)
          .withAssumedConstraint(packSubtypeConstraint(subTail, this.builtinTypes.emptyTypePack));
      }
      return new SubtypingResult(false)
        .withSubComponent(tailComponent)
        .withError(new LuauTypeError(scope.location, { kind: "UnexpectedTypePackInSubtyping", tp: subTail }));
    } else if (superTail) {
      if (getPack(superTail, "VariadicTypePack")) {
        // Every variadic pack is a supertype of the empty pack.
      } else if (getPack(superTail, "GenericTypePack")) {
        result.andAlso(this.isTailNothingGeneric(env, scope, superTail));
      } else if (getPack(superTail, "FreeTypePack")) {
        result.andAlso(
          new SubtypingResult(true)
            .withBothComponent(tailComponent)
            .withAssumedConstraint(packSubtypeConstraint(this.builtinTypes.emptyTypePack, superTail)),
        );
      } else {
        return new SubtypingResult(false)
          .withSuperComponent(tailComponent)
          .withError(new LuauTypeError(scope.location, { kind: "UnexpectedTypePackInSubtyping", tp: superTail }));
      }
    }
    return result;
  }

  /** The sub tail against the rest of a longer super head; `earlyExit` means the result is the whole answer. */
  private isSubTailCovariantWith(
    env: SubtypingEnvironment,
    outputResult: SubtypingResult,
    _subTp: TypePackId,
    subTail: TypePackId,
    superTp: TypePackId,
    superHeadStartIndex: number,
    superHead: TypeId[],
    superTail: TypePackId | undefined,
    scope: Scope,
  ): { earlyExit: boolean; result: SubtypingResult } {
    const vt = getPack(subTail, "VariadicTypePack");
    if (vt) {
      for (let i = superHeadStartIndex; i < superHead.length; ++i) {
        outputResult.andAlso(
          this.isCovariantWith(env, vt.ty, superHead[i]!, scope)
            .withSubPath(new PathBuilder().tail().variadic().build())
            .withSuperComponent(Components.index(i, IndexVariant.Pack)),
        );
      }
      return { earlyExit: false, result: outputResult };
    }
    if (getPack(subTail, "GenericTypePack")) {
      const lookupResult = env.lookupGenericPack(subTail);
      let result: SubtypingResult;
      if (lookupResult.kind === "NotBindable") {
        result = new SubtypingResult(false, false, false)
          .withSubComponent(Components.pack(PackField.Tail))
          .withSuperComponent(Components.slice(superHeadStartIndex));
      } else {
        const superTailPack = sliceTypePack(superHeadStartIndex, superTp, superHead, superTail, this.builtinTypes, this.arena);
        if (lookupResult.kind === "Mapped") {
          let subTpToCompare = lookupResult.tp;
          // A hidden variadic tail is clipped, for better arity mismatch reporting.
          const tp = getPack(lookupResult.tp, "TypePack");
          const vtp = tp && tp.tail ? getPack(followPack(tp.tail), "VariadicTypePack") : undefined;
          if (tp && vtp && vtp.hidden) subTpToCompare = this.arena.addTypePack(tp.head);
          result = this.isCovariantWithPacks(env, subTpToCompare, superTailPack, scope)
            .withSubPath(new Path([Components.pack(PackField.Tail), Components.mapping(lookupResult.tp)]))
            .withSuperComponent(Components.slice(superHeadStartIndex));
        } else {
          const ok = env.mappedGenericPacks.bindGeneric(subTail, superTailPack);
          result = new SubtypingResult(ok, false, false)
            .withSubComponent(Components.pack(PackField.Tail))
            .withSuperComponent(Components.slice(superHeadStartIndex));
        }
      }
      outputResult.andAlso(result);
      return { earlyExit: true, result: outputResult };
    }
    if (getPack(subTail, "ErrorTypePack")) {
      return { earlyExit: true, result: new SubtypingResult(true).withSubComponent(Components.pack(PackField.Tail)) };
    }
    if (getPack(subTail, "FreeTypePack")) {
      const superTailPack = sliceTypePack(superHeadStartIndex, superTp, superHead, superTail, this.builtinTypes, this.arena);
      outputResult.andAlso(
        new SubtypingResult(true)
          .withSubComponent(Components.pack(PackField.Tail))
          .withAssumedConstraint(packSubtypeConstraint(subTail, superTailPack)),
      );
      return { earlyExit: true, result: outputResult };
    }
    return {
      earlyExit: true,
      result: new SubtypingResult(false)
        .withSubComponent(Components.pack(PackField.Tail))
        .withError(new LuauTypeError(scope.location, { kind: "UnexpectedTypePackInSubtyping", tp: subTail })),
    };
  }

  private isCovariantWithSuperTail(
    env: SubtypingEnvironment,
    outputResult: SubtypingResult,
    subTp: TypePackId,
    subHeadStartIndex: number,
    subHead: TypeId[],
    subTail: TypePackId | undefined,
    _superTp: TypePackId,
    superTail: TypePackId,
    scope: Scope,
  ): { earlyExit: boolean; result: SubtypingResult } {
    const vt = getPack(superTail, "VariadicTypePack");
    if (vt) {
      for (let i = subHeadStartIndex; i < subHead.length; ++i) {
        outputResult.andAlso(
          this.isCovariantWith(env, subHead[i]!, vt.ty, scope)
            .withSubComponent(Components.index(i, IndexVariant.Pack))
            .withSuperPath(new PathBuilder().tail().variadic().build()),
        );
      }
      return { earlyExit: false, result: outputResult };
    }
    if (getPack(superTail, "GenericTypePack")) {
      const lookupResult = env.lookupGenericPack(superTail);
      let result: SubtypingResult;
      if (lookupResult.kind === "NotBindable") {
        result = new SubtypingResult(false, false, false)
          .withSubComponent(Components.slice(subHeadStartIndex))
          .withSuperComponent(Components.pack(PackField.Tail));
      } else {
        const subTailPack = sliceTypePack(subHeadStartIndex, subTp, subHead, subTail, this.builtinTypes, this.arena);
        if (lookupResult.kind === "Mapped") {
          let superTpToCompare = lookupResult.tp;
          const tp = getPack(lookupResult.tp, "TypePack");
          const vtp = tp && tp.tail ? getPack(followPack(tp.tail), "VariadicTypePack") : undefined;
          if (tp && vtp && vtp.hidden) superTpToCompare = this.arena.addTypePack(tp.head);
          result = this.isCovariantWithPacks(env, subTailPack, superTpToCompare, scope)
            .withSubComponent(Components.slice(subHeadStartIndex))
            .withSuperPath(new Path([Components.pack(PackField.Tail), Components.mapping(lookupResult.tp)]));
        } else {
          const ok = env.mappedGenericPacks.bindGeneric(superTail, subTailPack);
          result = new SubtypingResult(ok, false, false)
            .withSubComponent(Components.slice(subHeadStartIndex))
            .withSuperComponent(Components.pack(PackField.Tail));
        }
      }
      outputResult.andAlso(result);
      return { earlyExit: true, result: outputResult };
    }
    if (getPack(superTail, "ErrorTypePack")) {
      return { earlyExit: true, result: new SubtypingResult(true).withSuperComponent(Components.pack(PackField.Tail)) };
    }
    if (getPack(superTail, "FreeTypePack")) {
      const subTailPack = sliceTypePack(subHeadStartIndex, subTp, subHead, subTail, this.builtinTypes, this.arena);
      outputResult.andAlso(
        new SubtypingResult(true)
          .withSuperComponent(Components.pack(PackField.Tail))
          .withAssumedConstraint(packSubtypeConstraint(subTailPack, superTail)),
      );
      return { earlyExit: true, result: outputResult };
    }
    return {
      earlyExit: true,
      result: new SubtypingResult(false)
        .withSuperComponent(Components.pack(PackField.Tail))
        .withError(new LuauTypeError(scope.location, { kind: "UnexpectedTypePackInSubtyping", tp: superTail })),
    };
  }

  private isTailVariadicVariadic(env: SubtypingEnvironment, scope: Scope, sub: VariadicTypePack, sup: VariadicTypePack): SubtypingResult {
    return this.isCovariantWith(env, sub.ty, sup.ty, scope)
      .withBothComponent(Components.field(TypeField.Variadic))
      .withBothComponent(Components.pack(PackField.Tail));
  }

  private isTailGenericGeneric(env: SubtypingEnvironment, scope: Scope, subTp: TypePackId, superTp: TypePackId): SubtypingResult {
    const subLookup = env.lookupGenericPack(subTp);
    const superLookup = env.lookupGenericPack(superTp);
    const tail = Components.pack(PackField.Tail);
    if (subLookup.kind === "Mapped") {
      return this.isCovariantWithPacks(env, subLookup.tp, superTp, scope)
        .withSubPath(new Path([tail, Components.mapping(subLookup.tp)]))
        .withSuperComponent(tail);
    } else if (subLookup.kind === "Unmapped") {
      const ok = env.mappedGenericPacks.bindGeneric(subTp, superTp);
      return new SubtypingResult(ok, false, false).withBothComponent(tail);
    } else if (superLookup.kind === "Mapped") {
      return this.isCovariantWithPacks(env, subTp, superLookup.tp, scope)
        .withSubComponent(tail)
        .withSuperPath(new Path([tail, Components.mapping(superLookup.tp)]));
    } else if (superLookup.kind === "Unmapped") {
      const ok = env.mappedGenericPacks.bindGeneric(superTp, subTp);
      return new SubtypingResult(ok, false, false).withBothComponent(tail);
    }
    // Generic packs of the function being checked are not bindable, but subtype themselves.
    return new SubtypingResult(subTp === superTp, false, false).withBothComponent(tail);
  }

  private isTailVariadicGeneric(env: SubtypingEnvironment, scope: Scope, subTp: TypePackId, superTp: TypePackId): SubtypingResult {
    const lookup = env.lookupGenericPack(superTp);
    const tail = Components.pack(PackField.Tail);
    if (lookup.kind === "Mapped") {
      return this.isCovariantWithPacks(env, subTp, lookup.tp, scope)
        .withSubComponent(tail)
        .withSuperPath(new Path([tail, Components.mapping(lookup.tp)]));
    } else if (lookup.kind === "Unmapped") {
      const ok = env.mappedGenericPacks.bindGeneric(superTp, subTp);
      return new SubtypingResult(ok, false, false).withBothComponent(tail);
    }
    return new SubtypingResult(false, false, false).withBothComponent(tail);
  }

  private isTailGenericVariadic(
    env: SubtypingEnvironment,
    scope: Scope,
    subTp: TypePackId,
    superTp: TypePackId,
    sup: VariadicTypePack,
  ): SubtypingResult {
    const t = follow(sup.ty);
    // T... <: ...any and T... <: ...unknown.
    if (get(t, "AnyType") || get(t, "UnknownType")) return new SubtypingResult(true);
    const lookup = env.lookupGenericPack(subTp);
    const tail = Components.pack(PackField.Tail);
    if (lookup.kind === "Mapped") {
      return this.isCovariantWithPacks(env, lookup.tp, superTp, scope)
        .withSubPath(new Path([tail, Components.mapping(lookup.tp)]))
        .withSuperComponent(tail);
    } else if (lookup.kind === "Unmapped") {
      const ok = env.mappedGenericPacks.bindGeneric(subTp, superTp);
      return new SubtypingResult(ok, false, false).withBothComponent(tail);
    }
    return new SubtypingResult(false, false, false).withBothComponent(tail);
  }

  private isTailGenericNothing(env: SubtypingEnvironment, scope: Scope, subTp: TypePackId): SubtypingResult {
    const lookup = env.lookupGenericPack(subTp);
    const tail = Components.pack(PackField.Tail);
    if (lookup.kind === "Mapped") {
      return this.isCovariantWithPacks(env, lookup.tp, this.builtinTypes.emptyTypePack, scope).withSubPath(
        new Path([tail, Components.mapping(lookup.tp)]),
      );
    } else if (lookup.kind === "Unmapped") {
      const ok = env.mappedGenericPacks.bindGeneric(subTp, this.builtinTypes.emptyTypePack);
      return new SubtypingResult(ok, false, false).withSubComponent(tail);
    }
    return new SubtypingResult(false, false, false).withSubComponent(tail);
  }

  private isTailNothingGeneric(env: SubtypingEnvironment, scope: Scope, superTp: TypePackId): SubtypingResult {
    const lookup = env.lookupGenericPack(superTp);
    const tail = Components.pack(PackField.Tail);
    if (lookup.kind === "Mapped") {
      return this.isCovariantWithPacks(env, this.builtinTypes.emptyTypePack, lookup.tp, scope).withSuperPath(
        new Path([tail, Components.mapping(lookup.tp)]),
      );
    } else if (lookup.kind === "Unmapped") {
      const ok = env.mappedGenericPacks.bindGeneric(superTp, this.builtinTypes.emptyTypePack);
      return new SubtypingResult(ok, false, false).withSuperComponent(tail);
    }
    return new SubtypingResult(false, false, false).withSuperComponent(tail);
  }

  private swapReasonings(result: SubtypingResult): SubtypingResult {
    if (result.reasoning.empty()) {
      result.reasoning.insert(new SubtypingReasoning(EMPTY_PATH, EMPTY_PATH, SubtypingVariance.Contravariant));
    } else {
      // Swap the paths, or components of the supertype end up on the subtype,
      // and swap covariance with contravariance.
      for (const r of result.reasoning) {
        const sub = r.subPath;
        r.subPath = r.superPath;
        r.superPath = sub;
        if (r.variance === SubtypingVariance.Covariant) r.variance = SubtypingVariance.Contravariant;
        else if (r.variance === SubtypingVariance.Contravariant) r.variance = SubtypingVariance.Covariant;
      }
      result.reasoning.normalize();
    }
    return result;
  }

  isContravariantWith(env: SubtypingEnvironment, subTy: TypeId, superTy: TypeId, scope: Scope): SubtypingResult {
    return this.swapReasonings(this.isCovariantWith(env, superTy, subTy, scope));
  }

  isContravariantWithPacks(env: SubtypingEnvironment, subTp: TypePackId, superTp: TypePackId, scope: Scope): SubtypingResult {
    return this.swapReasonings(this.isCovariantWithPacks(env, superTp, subTp, scope));
  }

  isInvariantWith(env: SubtypingEnvironment, subTy: TypeId, superTy: TypeId, scope: Scope): SubtypingResult {
    const result = this.isCovariantWith(env, subTy, superTy, scope);
    result.andAlso(this.isContravariantWith(env, subTy, superTy, scope));
    if (result.reasoning.empty()) {
      result.reasoning.insert(new SubtypingReasoning(EMPTY_PATH, EMPTY_PATH, SubtypingVariance.Invariant));
    } else {
      for (const r of result.reasoning) r.variance = SubtypingVariance.Invariant;
      result.reasoning.normalize();
    }
    return result;
  }

  /** T <: A | B when T <: A or T <: B. */
  private isCovariantWithSuperUnion(env: SubtypingEnvironment, subTy: TypeId, superUnion: UnionType, scope: Scope): SubtypingResult {
    const result = new SubtypingResult(false);
    const options = flatOptions(superUnion);
    // A union that already includes the subtype binds no generics.
    for (const ty of options) if (follow(ty) === subTy) return new SubtypingResult(true);
    let index = 0;
    for (const ty of options) {
      const next = this.isCovariantWith(env, subTy, ty, scope);
      if (next.normalizationTooComplex) return new SubtypingResult(false, true);
      if (next.isSubtype) return next;
      result.andAlso(next.withSuperComponent(Components.index(index, IndexVariant.Union)));
      ++index;
    }
    result.reasoning.clear();
    return result;
  }

  /** A | B | C <: D | E | F, skipping the options on the left that the right has. */
  private isCovariantWithUnions(env: SubtypingEnvironment, subUnion: UnionType, superUnion: UnionType, scope: Scope): SubtypingResult {
    const result = new SubtypingResult(true);
    const superOptions = new TypeIds(flatOptions(superUnion));
    let subIndex = 0;
    for (const ty of flatOptions(subUnion)) {
      if (!superOptions.contains(ty)) {
        result.andAlso(this.isCovariantWithSuperUnion(env, ty, superUnion, scope).withSubComponent(Components.index(subIndex, IndexVariant.Union)));
        if (result.normalizationTooComplex) return new SubtypingResult(false, true);
      }
      subIndex++;
    }
    return result;
  }

  /** A | B <: T when A <: T and B <: T. */
  private isCovariantWithSubUnion(env: SubtypingEnvironment, subUnion: UnionType, superTy: TypeId, scope: Scope): SubtypingResult {
    const result = new SubtypingResult(true);
    let i = 0;
    for (const ty of flatOptions(subUnion)) {
      result.andAlso(this.isCovariantWith(env, ty, superTy, scope).withSubComponent(Components.index(i++, IndexVariant.Union)));
      if (result.normalizationTooComplex) return new SubtypingResult(false, true);
    }
    return result;
  }

  /** T <: A & B when T <: A and T <: B. */
  private isCovariantWithSuperIntersection(
    env: SubtypingEnvironment,
    subTy: TypeId,
    superIntersection: IntersectionType,
    scope: Scope,
  ): SubtypingResult {
    const result = new SubtypingResult(true);
    let i = 0;
    for (const ty of flatOptions(superIntersection)) {
      result.andAlso(this.isCovariantWith(env, subTy, ty, scope).withSuperComponent(Components.index(i++, IndexVariant.Intersection)));
      if (result.normalizationTooComplex) return new SubtypingResult(false, true);
    }
    return result;
  }

  /** A & B <: T when A <: T or B <: T. */
  private isCovariantWithSubIntersection(
    env: SubtypingEnvironment,
    subIntersection: IntersectionType,
    superTy: TypeId,
    scope: Scope,
  ): SubtypingResult {
    const result = new SubtypingResult(false);
    let i = 0;
    for (const ty of flatOptions(subIntersection)) {
      result.orElse(this.isCovariantWith(env, ty, superTy, scope).withSubComponent(Components.index(i++, IndexVariant.Intersection)));
      if (result.normalizationTooComplex) return new SubtypingResult(false, true);
    }
    return result;
  }

  private isCovariantWithSubNegation(env: SubtypingEnvironment, subNegation: NegationType, superTy: TypeId, scope: Scope): SubtypingResult {
    const negatedTy = follow(subNegation.ty);
    const b = this.builtinTypes;
    const negated = Components.field(TypeField.Negated);
    if (get(negatedTy, "NeverType")) return this.isCovariantWith(env, b.unknownType, superTy, scope).withSubComponent(negated);
    if (get(negatedTy, "UnknownType")) return this.isCovariantWith(env, b.neverType, superTy, scope).withSubComponent(negated);
    if (get(negatedTy, "AnyType")) return this.isCovariantWith(env, negatedTy, superTy, scope).withSubComponent(negated);
    const u = get(negatedTy, "UnionType");
    if (u) {
      // ~(A | B) is ~A & ~B.
      const result = new SubtypingResult(true);
      for (const ty of flatOptions(u)) {
        const negatedPart = get(follow(ty), "NegationType");
        if (negatedPart) result.andAlso(this.isCovariantWith(env, negatedPart.ty, superTy, scope).withSubComponent(negated));
        else result.andAlso(this.isCovariantWithSubNegation(env, negationType(ty), superTy, scope));
      }
      return result;
    }
    const i = get(negatedTy, "IntersectionType");
    if (i) {
      // ~(A & B) is ~A | ~B.
      const result = new SubtypingResult(false);
      for (const ty of flatOptions(i)) {
        const negatedPart = get(follow(ty), "NegationType");
        if (negatedPart) result.orElse(this.isCovariantWith(env, negatedPart.ty, superTy, scope).withSubComponent(negated));
        else result.orElse(this.isCovariantWithSubNegation(env, negationType(ty), superTy, scope));
      }
      return result;
    }
    if (get(negatedTy, "ErrorType") || get(negatedTy, "FunctionType") || get(negatedTy, "TableType") || get(negatedTy, "MetatableType")) {
      throw new Error("attempting to negate a non-testable type");
    }
    // The negation of anything else is too wide to be a subtype of other things.
    return new SubtypingResult(false).withSubComponent(negated);
  }

  private isCovariantWithSuperNegation(env: SubtypingEnvironment, subTy: TypeId, superNegation: NegationType, scope: Scope): SubtypingResult {
    const negatedTy = follow(superNegation.ty);
    const b = this.builtinTypes;
    const negated = Components.field(TypeField.Negated);
    if (get(negatedTy, "NeverType")) return this.isCovariantWith(env, subTy, b.unknownType, scope).withSuperComponent(negated);
    if (get(negatedTy, "UnknownType")) return this.isCovariantWith(env, subTy, b.neverType, scope).withSuperComponent(negated);
    if (get(negatedTy, "AnyType")) return this.isCovariantWith(env, subTy, negatedTy, scope).withSuperComponent(negated);
    const u = get(negatedTy, "UnionType");
    if (u) {
      const result = new SubtypingResult(true);
      for (const ty of flatOptions(u)) {
        const negatedPart = get(follow(ty), "NegationType");
        if (negatedPart) result.andAlso(this.isCovariantWith(env, subTy, negatedPart.ty, scope).withSuperComponent(negated));
        else result.andAlso(this.isCovariantWithSuperNegation(env, subTy, negationType(ty), scope));
      }
      return result;
    }
    const i = get(negatedTy, "IntersectionType");
    if (i) {
      const result = new SubtypingResult(false);
      for (const ty of flatOptions(i)) {
        const negatedPart = get(follow(ty), "NegationType");
        if (negatedPart) result.orElse(this.isCovariantWith(env, subTy, negatedPart.ty, scope).withSuperComponent(negated));
        else result.orElse(this.isCovariantWithSuperNegation(env, subTy, negationType(ty), scope));
      }
      return result;
    }
    let isSubtype: boolean;
    const subPrim = get(subTy, "PrimitiveType");
    const subSingleton = get(subTy, "SingletonType");
    const negPrim = get(negatedTy, "PrimitiveType");
    const negSingleton = get(negatedTy, "SingletonType");
    if (subPrim && negPrim) {
      // number <: ~boolean, number </: ~number
      isSubtype = subPrim.type !== negPrim.type;
    } else if (subSingleton && negPrim) {
      if (subSingleton.variant.kind === "StringSingleton" && negPrim.type === PrimitiveKind.String) isSubtype = false;
      else if (subSingleton.variant.kind === "BooleanSingleton" && negPrim.type === PrimitiveKind.Boolean) isSubtype = false;
      else isSubtype = true;
    } else if (subPrim && negSingleton) {
      if (subPrim.type === PrimitiveKind.String && negSingleton.variant.kind === "StringSingleton") isSubtype = false;
      else if (subPrim.type === PrimitiveKind.Boolean && negSingleton.variant.kind === "BooleanSingleton") isSubtype = false;
      else isSubtype = true;
    } else if (get(subTy, "ExternType") && negPrim) {
      // The top extern type is not a primitive, so negating a primitive includes it.
      isSubtype = true;
    } else if (negPrim && (get(subTy, "TableType") || get(subTy, "MetatableType"))) {
      isSubtype = negPrim.type !== PrimitiveKind.Table;
    } else if (get(subTy, "FunctionType") && negPrim) {
      isSubtype = negPrim.type !== PrimitiveKind.Function;
    } else if (subSingleton && negSingleton) {
      isSubtype = !singletonsEqual(subSingleton, negSingleton);
    } else if (get(subTy, "ExternType") && get(negatedTy, "ExternType")) {
      const r = SubtypingResult.negate(new SubtypingResult(isSubclass(get(subTy, "ExternType")!, get(negatedTy, "ExternType")!)));
      return r.withSuperComponent(negated);
    } else if (get(subTy, "FunctionType") && get(negatedTy, "ExternType")) {
      isSubtype = true;
    } else if (get(negatedTy, "ErrorType") || get(negatedTy, "FunctionType") || get(negatedTy, "TableType") || get(negatedTy, "MetatableType")) {
      throw new Error("attempting to negate a non-testable type");
    } else {
      isSubtype = false;
    }
    return new SubtypingResult(isSubtype).withSuperComponent(negated);
  }

  private isCovariantWithSingletonPrim(subSingleton: SingletonType, superPrim: PrimitiveType): SubtypingResult {
    if (subSingleton.variant.kind === "StringSingleton" && superPrim.type === PrimitiveKind.String) return new SubtypingResult(true);
    if (subSingleton.variant.kind === "BooleanSingleton" && superPrim.type === PrimitiveKind.Boolean) return new SubtypingResult(true);
    return new SubtypingResult(false);
  }

  isCovariantWithTables(
    env: SubtypingEnvironment,
    subTable: TableType,
    superTable: TableType,
    forceCovariantTest: boolean,
    scope: Scope,
  ): SubtypingResult {
    const result = new SubtypingResult(true);
    if (subTable.props.size === 0 && !subTable.indexer && subTable.state === TableState.Sealed && superTable.indexer) {
      // {} </: {T}, though an unsealed {| |} may yet gain the indexer.
      return new SubtypingResult(false);
    }
    // An `any` suppresses errors only when every failure is one it suppresses.
    let hasErrorSuppression = false;
    let shouldSuppress = true;
    const record = (subResult: SubtypingResult) => {
      hasErrorSuppression = hasErrorSuppression || subResult.isErrorSuppressing;
      shouldSuppress = shouldSuppress && (subResult.isSubtype || subResult.isErrorSuppressing);
      result.andAlso(subResult);
    };
    for (const [name, superProp] of superTable.props) {
      const subProp = subTable.props.get(name);
      if (subProp) {
        record(this.isCovariantWithProperties(env, subProp, superProp, name, forceCovariantTest, scope));
      } else if (subTable.indexer && this.isCovariantWith(env, this.builtinTypes.stringType, subTable.indexer.indexType, scope).isSubtype) {
        // A string indexer stands in for the property.
        const indexResult = Components.field(TypeField.IndexResult);
        if (superProp.isShared()) {
          if (subTable.indexer.isReadOnly) {
            record(new SubtypingResult(false).withSubComponent(indexResult).withSuperComponent(Components.prop(name, true)));
          } else {
            record(
              this.isInvariantWith(env, subTable.indexer.indexResultType, superProp.readTy!, scope)
                .withSubComponent(indexResult)
                .withSuperComponent(Components.prop(name, true)),
            );
          }
        } else {
          if (superProp.readTy) {
            record(
              this.isCovariantWith(env, subTable.indexer.indexResultType, superProp.readTy, scope)
                .withSubComponent(indexResult)
                .withSuperComponent(Components.prop(name, true)),
            );
          }
          if (superProp.writeTy) {
            if (subTable.indexer.isReadOnly) {
              record(new SubtypingResult(false).withSubComponent(indexResult).withSuperComponent(Components.prop(name, false)));
            } else {
              record(
                this.isContravariantWith(env, subTable.indexer.indexResultType, superProp.writeTy, scope)
                  .withSubComponent(indexResult)
                  .withSuperComponent(Components.prop(name, false)),
              );
            }
          }
        }
      } else {
        // A missing property reads as nil; the failure points here rather
        // than into a property the subtype does not have.
        const nilProp = forceCovariantTest ? Property.rw(this.builtinTypes.nilType) : Property.readonly(this.builtinTypes.nilType);
        const missing = this.isCovariantWithProperties(env, nilProp, superProp, name, forceCovariantTest, scope);
        missing.reasoning.clear();
        record(missing);
      }
    }
    if (superTable.indexer) {
      if (subTable.indexer) record(this.isCovariantWithIndexers(env, subTable.indexer, superTable.indexer, scope));
      else if (subTable.state !== TableState.Sealed) return new SubtypingResult(true);
      else return new SubtypingResult(false);
    }
    result.isErrorSuppressing = hasErrorSuppression && shouldSuppress;
    return result;
  }

  private isCovariantWithMetatableTable(env: SubtypingEnvironment, subMt: MetatableType, superTable: TableType, scope: Scope): SubtypingResult {
    const subTable = get(follow(subMt.table), "TableType");
    if (!subTable) return new SubtypingResult(false);
    const doDefault = () => this.isCovariantWithTables(env, subTable, superTable, false, scope);
    const subMTTable = get(follow(subMt.metatable), "TableType");
    if (!subMTTable) return doDefault();
    const indexProp = subMTTable.props.get("__index");
    if (!indexProp || !indexProp.readTy) return doDefault();
    const indexTableProp = get(follow(indexProp.readTy), "TableType");
    if (!indexTableProp) return doDefault();
    // The `__index` table's fields count, read-only.
    const faux = tableType({ props: subTable.props.clone(), indexer: subTable.indexer, state: subTable.state, level: subTable.level, scope: subTable.scope });
    for (const [name, prop] of indexTableProp.props) {
      if (prop.readTy && !faux.props.has(name)) faux.props.set(name, Property.readonly(prop.readTy));
    }
    return this.isCovariantWithTables(env, faux, superTable, false, scope);
  }

  private isCovariantWithMetatablePrim(env: SubtypingEnvironment, subMt: MetatableType, superPrim: PrimitiveType, scope: Scope): SubtypingResult {
    if (superPrim.type === PrimitiveKind.Table) {
      const subTable = get(follow(subMt.table), "TableType");
      if (subTable) return new SubtypingResult(true);
      const nested = get(follow(subMt.table), "MetatableType");
      if (nested) return this.isCovariantWithMetatablePrim(env, nested, superPrim, scope);
    }
    return new SubtypingResult(false);
  }

  private isCovariantWithExternTable(
    env: SubtypingEnvironment,
    subTy: TypeId,
    subExternType: ExternType,
    superTy: TypeId,
    superTable: TableType,
    scope: Scope,
  ): SubtypingResult {
    let result = new SubtypingResult(true);
    env.substitutions.set(superTy, subTy);
    for (const [name, prop] of superTable.props) {
      const classProp = lookupExternTypeProp(subExternType, name);
      if (classProp) {
        result.andAlso(this.isCovariantWithProperties(env, classProp, prop, name, false, scope));
      } else {
        result = new SubtypingResult(false);
        break;
      }
    }
    if (superTable.indexer && subExternType.indexer) {
      result.andAlso(this.isCovariantWithIndexers(env, subExternType.indexer, superTable.indexer, scope));
    } else if (superTable.indexer && !subExternType.indexer) {
      result = new SubtypingResult(false);
    }
    env.substitutions.set(superTy, undefined);
    return result;
  }

  private isCovariantWithFunctions(
    env: SubtypingEnvironment,
    subFunction: FunctionType,
    superFunction: FunctionType,
    scope: Scope,
  ): SubtypingResult {
    const result = new SubtypingResult();
    for (let g of subFunction.generics) {
      g = follow(g);
      if (get(g, "GenericType")) {
        const bounds = env.mappedGenerics.get(g);
        // A generic may shadow an outer one, so it gets fresh bounds.
        if (bounds) bounds.push(freshBounds());
        else env.mappedGenerics.set(g, [freshBounds()]);
      }
    }
    if (subFunction.genericPacks.length) {
      const packs = subFunction.genericPacks.map((g) => followPack(g)).filter((g) => getPack(g, "GenericTypePack"));
      env.mappedGenericPacks.pushFrame(packs);
    }

    result.orElse(this.isContravariantWithPacks(env, subFunction.argTypes, superFunction.argTypes, scope).withBothComponent(Components.pack(PackField.Arguments)));
    // A hidden variadic tail on the supertype's arguments may be what failed.
    if (!result.isSubtype) {
      const { head: args, tail } = flatten(superFunction.argTypes);
      const variadic = tail ? getPack(tail, "VariadicTypePack") : undefined;
      if (variadic && variadic.hidden) {
        result.orElse(
          this.isContravariantWithPacks(env, subFunction.argTypes, this.arena.addTypePack(typePack(args)), scope).withBothComponent(
            Components.pack(PackField.Arguments),
          ),
        );
      }
    }
    result.andAlso(this.isCovariantWithPacks(env, subFunction.retTypes, superFunction.retTypes, scope).withBothComponent(Components.pack(PackField.Returns)));

    if (areEqualPacks(subFunction.argTypes, superFunction.argTypes) && areEqualPacks(subFunction.retTypes, superFunction.retTypes)) {
      // A generic function is a subtype of its instantiations.
      if (superFunction.generics.length !== subFunction.generics.length && superFunction.generics.length) {
        result.andAlso(new SubtypingResult(false));
        result.withError(
          new LuauTypeError(scope.location, {
            kind: "GenericTypeCountMismatch",
            subTyGenericCount: superFunction.generics.length,
            superTyGenericCount: subFunction.generics.length,
          }),
        );
      }
      if (superFunction.genericPacks.length !== subFunction.genericPacks.length && superFunction.genericPacks.length) {
        result.andAlso(new SubtypingResult(false));
        result.withError(
          new LuauTypeError(scope.location, {
            kind: "GenericTypePackCountMismatch",
            subTyGenericPackCount: superFunction.genericPacks.length,
            superTyGenericPackCount: subFunction.genericPacks.length,
          }),
        );
      }
    }

    for (let g of subFunction.generics) {
      g = follow(g);
      const gen = get(g, "GenericType");
      if (gen) {
        const bounds = env.mappedGenerics.get(g)!;
        result.andAlso(this.checkGenericBounds(bounds[bounds.length - 1]!, env, scope, gen.name));
        bounds.pop();
      }
    }
    if (subFunction.genericPacks.length) {
      env.mappedGenericPacks.popFrame();
      // The generic pack mapping may need repopulating later.
      result.isCacheable = false;
    }
    return result;
  }

  private stringTableOf(): TableType | undefined {
    const metatable = getMetatable(this.builtinTypes.stringType, this.builtinTypes);
    if (!metatable) return undefined;
    const mttv = get(follow(metatable), "TableType");
    const index = mttv?.props.get("__index");
    return index?.readTy ? get(index.readTy, "TableType") : undefined;
  }

  private isCovariantWithPrimTable(env: SubtypingEnvironment, subPrim: PrimitiveType, superTable: TableType, scope: Scope): SubtypingResult {
    const result = new SubtypingResult(false);
    if (subPrim.type === PrimitiveKind.String) {
      const stringTable = this.stringTableOf();
      if (stringTable) {
        result.orElse(
          this.isCovariantWithTables(env, stringTable, superTable, false, scope).withSubPath(new PathBuilder().mt().readProp("__index").build()),
        );
      }
    } else if (subPrim.type === PrimitiveKind.Table) {
      return new SubtypingResult(superTable.props.size === 0 && (!superTable.indexer || superTable.state === TableState.Generic));
    }
    return result;
  }

  private isCovariantWithSingletonTable(env: SubtypingEnvironment, subSingleton: SingletonType, superTable: TableType, scope: Scope): SubtypingResult {
    const result = new SubtypingResult(false);
    if (subSingleton.variant.kind === "StringSingleton") {
      const stringTable = this.stringTableOf();
      if (stringTable) {
        result.orElse(
          this.isCovariantWithTables(env, stringTable, superTable, false, scope).withSubPath(new PathBuilder().mt().readProp("__index").build()),
        );
      }
    }
    return result;
  }

  private isCovariantWithIndexers(env: SubtypingEnvironment, subIndexer: TableIndexer, superIndexer: TableIndexer, scope: Scope): SubtypingResult {
    let result = new SubtypingResult(false);
    if (subIndexer.isReadOnly && !superIndexer.isReadOnly) {
      result.withBothComponent(Components.field(TypeField.IndexResult));
      result.withPropertyModifierViolation();
      return result;
    }
    result = this.isInvariantWith(env, subIndexer.indexType, superIndexer.indexType, scope).withBothComponent(Components.field(TypeField.IndexLookup));
    // A read-only super indexer is covariant in its values; a read-write one is invariant.
    if (superIndexer.isReadOnly) {
      result.andAlso(
        this.isCovariantWith(env, subIndexer.indexResultType, superIndexer.indexResultType, scope).withBothComponent(
          Components.field(TypeField.IndexResult),
        ),
      );
    } else {
      result.andAlso(
        this.isInvariantWith(env, subIndexer.indexResultType, superIndexer.indexResultType, scope).withBothComponent(
          Components.field(TypeField.IndexResult),
        ),
      );
    }
    return result;
  }

  private isCovariantWithProperties(
    env: SubtypingEnvironment,
    subProp: Property,
    superProp: Property,
    name: string,
    forceCovariantTest: boolean,
    scope: Scope,
  ): SubtypingResult {
    const res = new SubtypingResult(true);
    if (superProp.isShared() && subProp.isShared()) {
      if (forceCovariantTest) {
        res.andAlso(this.isCovariantWith(env, subProp.readTy!, superProp.readTy!, scope).withBothComponent(Components.prop(name, true)));
      } else {
        res.andAlso(this.isInvariantWith(env, subProp.readTy!, superProp.readTy!, scope).withBothComponent(Components.prop(name, true)));
      }
    } else {
      if (superProp.readTy && subProp.readTy) {
        res.andAlso(this.isCovariantWith(env, subProp.readTy, superProp.readTy, scope).withBothComponent(Components.prop(name, true)));
      }
      if (superProp.writeTy && subProp.writeTy && !forceCovariantTest) {
        res.andAlso(this.isContravariantWith(env, subProp.writeTy, superProp.writeTy, scope).withBothComponent(Components.prop(name, false)));
      }
      if (superProp.isReadWrite()) {
        if (subProp.isReadOnly()) {
          res.andAlso(new SubtypingResult(false).withBothComponent(Components.prop(name, true)).withPropertyModifierViolation());
        } else if (subProp.isWriteOnly()) {
          res.andAlso(new SubtypingResult(false).withBothComponent(Components.prop(name, false)).withPropertyModifierViolation());
        }
      }
    }
    return res;
  }

  private isCovariantWithNormals(
    env: SubtypingEnvironment,
    subNorm: NormalizedType | undefined,
    superNorm: NormalizedType | undefined,
    scope: Scope,
  ): SubtypingResult {
    if (!subNorm || !superNorm) return new SubtypingResult(false, true);
    const result = this.isCovariantWith(env, subNorm.tops, superNorm.tops, scope);
    result.andAlso(this.isCovariantWith(env, subNorm.booleans, superNorm.booleans, scope));
    result.andAlso(
      this.isCovariantWithNormalizedExterns(env, subNorm.externTypes, superNorm.externTypes, scope).orElse(
        this.isCovariantWithExternsAndTables(env, subNorm.externTypes, superNorm.tables, scope),
      ),
    );
    result.andAlso(this.isCovariantWith(env, subNorm.errors, superNorm.errors, scope));
    result.andAlso(this.isCovariantWith(env, subNorm.nils, superNorm.nils, scope));
    result.andAlso(this.isCovariantWith(env, subNorm.numbers, superNorm.numbers, scope));
    const strings = new SubtypingResult(false);
    strings.orElse(new SubtypingResult(isSubtypeOfStrings(subNorm.strings, superNorm.strings)));
    strings.orElse(this.isCovariantWithStringsAndTables(env, subNorm.strings, superNorm.tables, scope));
    result.andAlso(strings);
    result.andAlso(this.isCovariantWith(env, subNorm.threads, superNorm.threads, scope));
    result.andAlso(this.isCovariantWith(env, subNorm.buffers, superNorm.buffers, scope));
    result.andAlso(this.isCovariantWithTypeIds(env, subNorm.tables, superNorm.tables, scope));
    result.andAlso(this.isCovariantWithNormalizedFunctions(env, subNorm.functions, superNorm.functions, scope));
    return result;
  }

  private isCovariantWithNormalizedExterns(
    env: SubtypingEnvironment,
    subExternType: NormalizedExternType,
    superExternType: NormalizedExternType,
    scope: Scope,
  ): SubtypingResult {
    for (const subTy of subExternType.externTypes.keys()) {
      const result = new SubtypingResult();
      for (const [superTy, superNegations] of superExternType.externTypes) {
        result.orElse(this.isCovariantWith(env, subTy, superTy, scope));
        if (!result.isSubtype) continue;
        for (const negation of superNegations) {
          result.andAlso(SubtypingResult.negate(this.isCovariantWith(env, subTy, negation, scope)));
          if (result.isSubtype) break;
        }
      }
      if (!result.isSubtype) return result;
    }
    return new SubtypingResult(true);
  }

  private isCovariantWithExternsAndTables(
    env: SubtypingEnvironment,
    subExternType: NormalizedExternType,
    superTables: TypeIds,
    scope: Scope,
  ): SubtypingResult {
    for (const subTy of subExternType.externTypes.keys()) {
      const result = new SubtypingResult();
      for (const superTableTy of superTables) result.orElse(this.isCovariantWith(env, subTy, superTableTy, scope));
      if (!result.isSubtype) return result;
    }
    return new SubtypingResult(true);
  }

  private isCovariantWithStringsAndTables(
    env: SubtypingEnvironment,
    subString: NormalizedStringType,
    superTables: TypeIds,
    scope: Scope,
  ): SubtypingResult {
    if (subString.isNever()) return new SubtypingResult(true);
    if (subString.isCofinite) {
      const result = new SubtypingResult();
      for (const superTable of superTables) {
        result.orElse(this.isCovariantWith(env, this.builtinTypes.stringType, superTable, scope));
        if (result.isSubtype) return result;
      }
      return result;
    }
    // A finite set of strings is a subtype of some table when every one of them is.
    for (const superTable of superTables) {
      const result = new SubtypingResult(true);
      for (const [, s] of subString.sortedSingletons()) {
        result.andAlso(this.isCovariantWith(env, s, superTable, scope));
        if (!result.isSubtype) break;
      }
      if (result.isSubtype) return result;
    }
    return new SubtypingResult(false);
  }

  private isCovariantWithNormalizedFunctions(
    env: SubtypingEnvironment,
    subFunction: NormalizedFunctionType,
    superFunction: NormalizedFunctionType,
    scope: Scope,
  ): SubtypingResult {
    if (subFunction.isNever()) return new SubtypingResult(true);
    if (superFunction.isTop) return new SubtypingResult(true);
    return this.isCovariantWithTypeIds(env, subFunction.parts, superFunction.parts, scope);
  }

  private isCovariantWithTypeIds(env: SubtypingEnvironment, subTypes: TypeIds, superTypes: TypeIds, scope: Scope): SubtypingResult {
    const result = new SubtypingResult(true);
    for (const subTy of subTypes) {
      const inner = new SubtypingResult();
      for (const superTy of superTypes) {
        inner.orElse(this.isCovariantWith(env, subTy, superTy, scope));
        if (inner.normalizationTooComplex) return new SubtypingResult(false, true);
      }
      result.andAlso(inner);
    }
    return result;
  }

  private bindGeneric(env: SubtypingEnvironment, subTy: TypeId, superTy: TypeId): boolean {
    subTy = follow(subTy);
    superTy = follow(superTy);
    let originalSubTyBounds: GenericBounds | undefined;
    const subBounds = env.mappedGenerics.get(subTy);
    if (subBounds && subBounds.length) {
      const current = subBounds[subBounds.length - 1]!;
      originalSubTyBounds = { lowerBound: current.lowerBound.clone(), upperBound: current.upperBound.clone() };
      const superBounds = env.mappedGenerics.get(superTy);
      if (superBounds && superBounds.length) {
        const superCurrent = superBounds[superBounds.length - 1]!;
        Subtyping.maybeUpdateBounds(subTy, superTy, current.upperBound, superCurrent.lowerBound, superCurrent.upperBound);
      } else {
        current.upperBound.insert(superTy);
      }
    }
    const superBounds = env.mappedGenerics.get(superTy);
    if (superBounds && superBounds.length) {
      const superCurrent = superBounds[superBounds.length - 1]!;
      if (originalSubTyBounds) {
        Subtyping.maybeUpdateBounds(superTy, subTy, superCurrent.lowerBound, originalSubTyBounds.upperBound, originalSubTyBounds.lowerBound);
      } else {
        superCurrent.lowerBound.insert(subTy);
      }
    }
    return true;
  }

  private isCovariantWithReducedSub(env: SubtypingEnvironment, instance: TypeFunctionInstanceType, superTy: TypeId, scope: Scope): SubtypingResult {
    const { ty, errors } = this.handleTypeFunctionReductionResult(instance, scope);
    // An irreducible instance reduces to never.
    return this.isCovariantWith(env, ty, superTy, scope).withErrors(errors).withSubComponent(Components.reduction(ty));
  }

  private isCovariantWithReducedSuper(env: SubtypingEnvironment, subTy: TypeId, instance: TypeFunctionInstanceType, scope: Scope): SubtypingResult {
    const { ty, errors } = this.handleTypeFunctionReductionResult(instance, scope);
    return this.isCovariantWith(env, subTy, ty, scope).withErrors(errors).withSuperComponent(Components.reduction(ty));
  }

  private handleTypeFunctionReductionResult(instance: TypeFunctionInstanceType, scope: Scope): { ty: TypeId; errors: LuauTypeError[] } {
    const context = new TypeFunctionContext({
      arena: this.arena,
      builtins: this.builtinTypes,
      scope,
      normalizer: this.normalizer,
      typeFunctionRuntime: this.typeFunctionRuntime,
      subtyping: this,
    });
    const fn = this.arena.addType({ ...instance, typeArguments: [...instance.typeArguments], packArguments: [...instance.packArguments] });
    const result = reduceTypeFunctions(fn, new Location(), context, true);
    const errors: LuauTypeError[] = [];
    if (result.blockedTypes.size || result.blockedPacks.size) {
      errors.push(new LuauTypeError(new Location(), { kind: "UninhabitedTypeFunction", ty: fn }));
      return { ty: this.builtinTypes.neverType, errors };
    }
    if (result.reducedTypes.has(fn)) return { ty: fn, errors };
    return { ty: this.builtinTypes.neverType, errors };
  }

  private trySemanticSubtyping(
    env: SubtypingEnvironment,
    subTy: TypeId,
    superTy: TypeId,
    scope: Scope,
    original: SubtypingResult,
  ): SubtypingResult {
    const semantic = this.isCovariantWithNormals(env, this.normalizer.normalize(subTy), this.normalizer.normalize(superTy), scope);
    if (semantic.normalizationTooComplex) return semantic;
    if (semantic.isSubtype) {
      semantic.reasoning.clear();
      return semantic;
    }
    return original;
  }

  private checkGenericBounds(bounds: GenericBounds, env: SubtypingEnvironment, scope: Scope, genericName: string): SubtypingResult {
    const result = new SubtypingResult(true);
    const aggregateLowerBound = new UnionBuilder(this.arena, this.builtinTypes);
    for (const t of bounds.lowerBound) {
      const mapped = env.mappedGenerics.get(t);
      if (mapped && mapped.length === 0) continue;
      aggregateLowerBound.add(t);
    }
    let lowerBound = aggregateLowerBound.build();
    const aggregateUpperBound = new IntersectionBuilder(this.arena, this.builtinTypes);
    for (const t of bounds.upperBound) {
      const mapped = env.mappedGenerics.get(t);
      if (mapped && mapped.length === 0) continue;
      aggregateUpperBound.add(t);
    }
    let upperBound = aggregateUpperBound.build();
    lowerBound = env.applyMappedGenerics(this.builtinTypes, this.arena, lowerBound) ?? lowerBound;
    upperBound = env.applyMappedGenerics(this.builtinTypes, this.arena, upperBound) ?? upperBound;

    const nt = this.normalizer.normalize(upperBound);
    // A type too complex to normalize is likely inhabited.
    const res = nt ? this.normalizer.isInhabitedNormal(nt) : NormalizationResult.True;
    if (!nt || res === NormalizationResult.HitLimits) result.normalizationTooComplex = true;
    else if (res === NormalizationResult.False) {
      // An uninhabited upper bound, as for T in <T>() -> (T, T) <: () -> (string, number), fails.
      result.isSubtype = false;
    }
    const boundsEnv = new SubtypingEnvironment();
    boundsEnv.parent = env;
    const boundsResult = this.isCovariantWith(boundsEnv, lowerBound, upperBound, scope);
    boundsResult.reasoning.clear();
    if (res === NormalizationResult.False) {
      result.genericBoundsMismatches.push({ genericName, lowerBounds: bounds.lowerBound.toArray(), upperBounds: bounds.upperBound.toArray() });
    } else if (!boundsResult.isSubtype) {
      const suppression = orElse(shouldSuppressErrors(this.normalizer, lowerBound), shouldSuppressErrors(this.normalizer, upperBound));
      if (suppression !== ErrorSuppression.Suppress) {
        result.genericBoundsMismatches.push({ genericName, lowerBounds: bounds.lowerBound.toArray(), upperBounds: bounds.upperBound.toArray() });
      }
    }
    result.andAlso(boundsResult);
    return result;
  }

  private static maybeUpdateBounds(
    here: TypeId,
    there: TypeId,
    boundsToUpdate: TypeIds,
    firstBoundsToCheck: TypeIds,
    secondBoundsToCheck: TypeIds,
  ): void {
    let boundsChanged = false;
    for (const t of firstBoundsToCheck) {
      if (t !== here) {
        boundsToUpdate.insert(t);
        boundsChanged = true;
      }
    }
    if (!boundsChanged) {
      for (const t of secondBoundsToCheck) {
        if (t !== here) {
          boundsToUpdate.insert(t);
          boundsChanged = true;
        }
      }
    }
    if (!boundsChanged && here !== there) boundsToUpdate.insert(there);
  }
}

function singletonsEqual(a: SingletonType, b: SingletonType): boolean {
  return a.variant.kind === b.variant.kind && a.variant.value === b.variant.value;
}

