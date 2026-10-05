// Normalized types, ported from Luau's `Normalize.h`/`Normalize.cpp`; Luau
// is MIT-licensed (see `LICENSE-luau.txt`).
//
// A normalized type splits a type into disjoint parts by kind (tops,
// booleans, extern types, errors, nil, numbers, strings, threads, buffers,
// tables, functions and type variables), which makes semantic subtyping,
// inhabitation and refinement decidable in the common cases.

import { addIntersection } from "./TypeUtils";
import { relate, Relation, simplifyIntersection } from "./Simplify";
import {
  flatOptions,
  flatten,
  follow,
  functionType,
  get,
  getPack,
  getSingleton,
  isNumber,
  isPrim,
  isSubclass as isSubclassExtern,
  metatableType,
  negationType,
  PrimitiveKind,
  TableIndexer,
  TableState,
  tableType,
  typePack,
  unionType as makeUnionType,
  intersectionType as makeIntersectionType,
  variadicTypePack,
  type BuiltinTypes,
  type TypeArena,
  type TypeId,
  type TypePackId,
} from "./Type";
import { TypeIds } from "./TypeIds";
import { maxScope } from "./Scope";

export class UnifierSharedState {
  counters = { recursionCount: 0, recursionLimit: 165, iterationCount: 0, iterationLimit: 20000 };
  reentrantTypeReduction = false;
}

export class NormalizedStringType {
  constructor(
    public isCofinite = false,
    public singletons = new Map<string, TypeId>(),
  ) {}

  clone(): NormalizedStringType {
    return new NormalizedStringType(this.isCofinite, new Map(this.singletons));
  }

  resetToString(): void {
    this.isCofinite = true;
    this.singletons.clear();
  }

  resetToNever(): void {
    this.isCofinite = false;
    this.singletons.clear();
  }

  isNever(): boolean {
    return !this.isCofinite && this.singletons.size === 0;
  }

  isString(): boolean {
    return this.isCofinite && this.singletons.size === 0;
  }

  isUnion(): boolean {
    return !this.isCofinite;
  }

  isIntersection(): boolean {
    return this.isCofinite;
  }

  includes(str: string): boolean {
    if (this.isString()) return true;
    if (this.isUnion() && this.singletons.has(str)) return true;
    if (this.isIntersection() && !this.singletons.has(str)) return true;
    return false;
  }

  /** The singletons in name order, as Luau's `std::map` holds them. */
  sortedSingletons(): [string, TypeId][] {
    return [...this.singletons.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
}

export function isSubtypeOfStrings(subStr: NormalizedStringType, superStr: NormalizedStringType): boolean {
  if (subStr.isIntersection() && superStr.isIntersection()) {
    // Every exclusion of the superset must also be excluded in the subset.
    for (const name of superStr.singletons.keys()) if (!subStr.singletons.has(name)) return false;
    return true;
  }
  if (subStr.isUnion() && superStr.isUnion()) {
    for (const name of subStr.singletons.keys()) if (!superStr.singletons.has(name)) return false;
    return true;
  }
  if (subStr.isUnion() && superStr.isIntersection()) {
    for (const name of subStr.singletons.keys()) if (superStr.singletons.has(name)) return false;
    return true;
  }
  // A cofinite set is never a subset of a finite one.
  return false;
}

export class NormalizedExternType {
  /** `(C1 & ~N11 & ...) | (C2 & ~N21 & ...) | ...`, in `ordering`. */
  externTypes = new Map<TypeId, TypeIds>();
  /** Table shapes that extend the extern types, as one big intersection. */
  shapeExtensions = new TypeIds();
  ordering: TypeId[] = [];

  pushPair(ty: TypeId, negations: TypeIds): void {
    if (!this.externTypes.has(ty)) {
      this.externTypes.set(ty, negations);
      this.ordering.push(ty);
    }
  }

  erase(ty: TypeId): void {
    this.externTypes.delete(ty);
    this.ordering = this.ordering.filter((t) => t !== ty);
  }

  resetToNever(): void {
    this.ordering = [];
    this.externTypes.clear();
    this.shapeExtensions.clear();
  }

  isNever(): boolean {
    return this.externTypes.size === 0;
  }

  clone(): NormalizedExternType {
    const r = new NormalizedExternType();
    for (const t of this.ordering) r.pushPair(t, this.externTypes.get(t)!.clone());
    r.shapeExtensions = this.shapeExtensions.clone();
    return r;
  }
}

export class NormalizedFunctionType {
  isTop = false;
  parts = new TypeIds();

  resetToNever(): void {
    this.isTop = false;
    this.parts.clear();
  }

  resetToTop(): void {
    this.isTop = true;
    this.parts.clear();
  }

  isNever(): boolean {
    return !this.isTop && this.parts.empty();
  }

  clone(): NormalizedFunctionType {
    const r = new NormalizedFunctionType();
    r.isTop = this.isTop;
    r.parts = this.parts.clone();
    return r;
  }
}

export const enum NormalizationResult {
  True,
  False,
  HitLimits,
}

export class NormalizedType {
  tops: TypeId;
  booleans: TypeId;
  externTypes = new NormalizedExternType();
  errors: TypeId;
  nils: TypeId;
  numbers: TypeId;
  integers: TypeId;
  strings = new NormalizedStringType();
  threads: TypeId;
  buffers: TypeId;
  tables = new TypeIds();
  functions = new NormalizedFunctionType();
  tyvars = new Map<TypeId, NormalizedType>();
  isCacheable = true;

  constructor(readonly builtinTypes: BuiltinTypes) {
    this.tops = builtinTypes.neverType;
    this.booleans = builtinTypes.neverType;
    this.errors = builtinTypes.neverType;
    this.nils = builtinTypes.neverType;
    this.numbers = builtinTypes.neverType;
    this.integers = builtinTypes.neverType;
    this.threads = builtinTypes.neverType;
    this.buffers = builtinTypes.neverType;
  }

  isUnknown(): boolean {
    if (get(this.tops, "UnknownType")) return true;
    const hasAllPrimitives =
      isPrim(this.booleans, PrimitiveKind.Boolean) &&
      isPrim(this.nils, PrimitiveKind.NilType) &&
      isNumber(this.numbers) &&
      this.strings.isString() &&
      isPrim(this.threads, PrimitiveKind.Thread) &&
      isPrim(this.buffers, PrimitiveKind.Buffer) &&
      isPrim(this.integers, PrimitiveKind.Integer);
    let isTopExternType = false;
    for (const [t, disj] of this.externTypes.externTypes) {
      if (get(t, "ExternType") && t === this.builtinTypes.externType && disj.empty()) {
        isTopExternType = true;
        break;
      }
    }
    let isTopTable = false;
    for (const t of this.tables) {
      if (isPrim(t, PrimitiveKind.Table)) {
        isTopTable = true;
        break;
      }
    }
    return get(this.errors, "NeverType") !== undefined && hasAllPrimitives && isTopExternType && isTopTable && this.functions.isTop;
  }

  private onlyHas(...which: string[]): boolean {
    const has: Record<string, boolean> = {
      tops: this.hasTops(),
      booleans: this.hasBooleans(),
      externTypes: this.hasExternTypes(),
      errors: this.hasErrors(),
      nils: this.hasNils(),
      numbers: this.hasNumbers(),
      integers: this.hasIntegers(),
      strings: this.hasStrings(),
      threads: this.hasThreads(),
      buffers: this.hasBuffers(),
      tables: this.hasTables(),
      functions: this.hasFunctions(),
      tyvars: this.hasTyvars(),
    };
    for (const [k, v] of Object.entries(has)) {
      if (!which.includes(k) && v) return false;
    }
    return true;
  }

  isExactlyNumber(): boolean {
    return this.hasNumbers() && this.onlyHas("numbers");
  }

  isSubtypeOfString(): boolean {
    return this.hasStrings() && this.onlyHas("strings");
  }

  isSubtypeOfBooleans(): boolean {
    return this.hasBooleans() && this.onlyHas("booleans");
  }

  shouldSuppressErrors(): boolean {
    return this.hasErrors() || get(this.tops, "AnyType") !== undefined;
  }

  hasTopTable(): boolean {
    return this.hasTables() && [...this.tables].some((ty) => get(ty, "PrimitiveType")?.type === PrimitiveKind.Table);
  }

  hasTops(): boolean {
    return !get(this.tops, "NeverType");
  }

  hasBooleans(): boolean {
    return !get(this.booleans, "NeverType");
  }

  hasExternTypes(): boolean {
    return !this.externTypes.isNever();
  }

  hasErrors(): boolean {
    return !get(this.errors, "NeverType");
  }

  hasNils(): boolean {
    return !get(this.nils, "NeverType");
  }

  hasNumbers(): boolean {
    return !get(this.numbers, "NeverType");
  }

  hasIntegers(): boolean {
    return !get(this.integers, "NeverType");
  }

  hasStrings(): boolean {
    return !this.strings.isNever();
  }

  hasThreads(): boolean {
    return !get(this.threads, "NeverType");
  }

  hasBuffers(): boolean {
    return !get(this.buffers, "NeverType");
  }

  hasTables(): boolean {
    return !this.tables.isNever();
  }

  hasFunctions(): boolean {
    return !this.functions.isNever();
  }

  hasTyvars(): boolean {
    return this.tyvars.size > 0;
  }

  isFalsy(): boolean {
    const bs = getSingleton(this.booleans, "BooleanSingleton");
    const hasAFalse = bs !== undefined && !bs.value;
    return (hasAFalse || this.hasNils()) && this.onlyHas("booleans", "nils");
  }

  isTruthy(): boolean {
    return !this.isFalsy();
  }

  isNil(): boolean {
    if (!this.hasNils()) return false;
    return this.onlyHas("nils", "errors");
  }
}

function isShallowInhabited(norm: NormalizedType): boolean {
  // A shallow check: `{ p: never }` counts as inhabited.
  return (
    !get(norm.tops, "NeverType") ||
    !get(norm.booleans, "NeverType") ||
    !norm.externTypes.isNever() ||
    !get(norm.errors, "NeverType") ||
    !get(norm.nils, "NeverType") ||
    !get(norm.numbers, "NeverType") ||
    !norm.strings.isNever() ||
    !get(norm.threads, "NeverType") ||
    !get(norm.buffers, "NeverType") ||
    !norm.functions.isNever() ||
    !norm.tables.empty() ||
    norm.tyvars.size > 0 ||
    !get(norm.integers, "NeverType")
  );
}

function tyvarIndex(ty: TypeId): number {
  return get(ty, "GenericType")?.index ?? get(ty, "FreeType")?.index ?? get(ty, "BlockedType")?.index ?? 0;
}

function isTopExterns(builtinTypes: BuiltinTypes, externTypes: NormalizedExternType): boolean {
  if (externTypes.externTypes.size !== 1) return false;
  const [firstTy, negations] = [...externTypes.externTypes.entries()][0]!;
  return firstTy === builtinTypes.externType && negations.empty();
}

function resetToTopExterns(builtinTypes: BuiltinTypes, externTypes: NormalizedExternType): void {
  externTypes.ordering = [];
  externTypes.externTypes.clear();
  externTypes.pushPair(builtinTypes.externType, new TypeIds());
}

function isSubclass(test: TypeId, parent: TypeId): boolean {
  const testCtv = get(test, "ExternType");
  const parentCtv = get(parent, "ExternType");
  if (!testCtv || !parentCtv) return false;
  return isSubclassExtern(testCtv, parentCtv);
}

class NormalizerHitLimits extends Error {}

function isCacheableType(ty: TypeId, seen = new Set<TypeId>()): boolean {
  if (seen.has(ty)) return true;
  seen.add(ty);
  ty = follow(ty);
  if (get(ty, "FreeType") || get(ty, "BlockedType") || get(ty, "PendingExpansionType")) return false;
  const tfi = get(ty, "TypeFunctionInstanceType");
  if (tfi) {
    for (const t of tfi.typeArguments) if (!isCacheableType(t, seen)) return false;
    for (const tp of tfi.packArguments) if (!isCacheablePack(tp, seen)) return false;
  }
  return true;
}

function isCacheablePack(tp: TypePackId, seen: Set<TypeId>): boolean {
  const { head, tail } = flatten(tp);
  for (const t of head) if (!isCacheableType(t, seen)) return false;
  if (tail && (getPack(tail, "FreeTypePack") || getPack(tail, "BlockedTypePack") || getPack(tail, "TypeFunctionInstanceTypePack"))) {
    return false;
  }
  return true;
}

// Luau's `LuauNormalizeCacheLimit` and `LuauNormalizerInitialFuel`.
const NORMALIZE_CACHE_LIMIT = 100000;
const NORMALIZER_INITIAL_FUEL = 3000;

type SeenSet = Set<TypeId>;

export class Normalizer {
  private readonly cachedNormals = new Map<TypeId, NormalizedType>();
  private readonly cachedIntersections = new Map<string, TypeId>();
  private readonly cachedUnions = new Map<string, TypeId>();
  private readonly cachedIsInhabited = new Map<TypeId, boolean>();
  private readonly cachedIsInhabitedIntersection = new Map<string, boolean>();
  private fuel: number | undefined;

  constructor(
    readonly arena: TypeArena,
    readonly builtinTypes: BuiltinTypes,
    readonly sharedState: UnifierSharedState,
    readonly cacheInhabitance = false,
    readonly cacheLimit = NORMALIZE_CACHE_LIMIT,
  ) {}

  private withFuel<T>(f: () => T): T {
    const initialized = this.fuel === undefined;
    if (initialized) this.fuel = NORMALIZER_INITIAL_FUEL;
    try {
      return f();
    } finally {
      if (initialized) this.fuel = undefined;
    }
  }

  private consumeFuel(): void {
    if (this.fuel !== undefined) {
      this.fuel--;
      if (this.fuel <= 0) throw new NormalizerHitLimits();
    }
  }

  private withinResourceLimits(): boolean {
    const cacheUsage =
      this.cachedNormals.size +
      this.cachedIntersections.size +
      this.cachedUnions.size +
      this.cachedIsInhabited.size +
      this.cachedIsInhabitedIntersection.size;
    if (this.cacheLimit > 0 && cacheUsage > this.cacheLimit) {
      this.clearCaches();
      return false;
    }
    const counters = this.sharedState.counters;
    if (counters.recursionLimit > 0 && counters.recursionLimit < counters.recursionCount) return false;
    return true;
  }

  private recurse<T>(f: () => T): T {
    this.sharedState.counters.recursionCount++;
    try {
      return f();
    } finally {
      this.sharedState.counters.recursionCount--;
    }
  }

  clearCaches(): void {
    this.cachedNormals.clear();
    this.cachedIntersections.clear();
    this.cachedUnions.clear();
  }

  // ------- Inhabitation

  isInhabitedNormal(norm: NormalizedType | undefined): NormalizationResult {
    try {
      return this.withFuel(() => this.isInhabitedNormalSeen(norm, new Set()));
    } catch (e) {
      if (e instanceof NormalizerHitLimits) return NormalizationResult.HitLimits;
      throw e;
    }
  }

  private isInhabitedNormalSeen(norm: NormalizedType | undefined, seen: SeenSet): NormalizationResult {
    return this.recurse(() => {
      if (!this.withinResourceLimits() || !norm) return NormalizationResult.HitLimits;
      this.consumeFuel();
      if (
        !get(norm.tops, "NeverType") ||
        !get(norm.booleans, "NeverType") ||
        !get(norm.errors, "NeverType") ||
        !get(norm.nils, "NeverType") ||
        !get(norm.numbers, "NeverType") ||
        !get(norm.threads, "NeverType") ||
        !get(norm.buffers, "NeverType") ||
        !norm.externTypes.isNever() ||
        !get(norm.integers, "NeverType") ||
        !norm.strings.isNever() ||
        !norm.functions.isNever()
      ) {
        return NormalizationResult.True;
      }
      for (const intersect of norm.tyvars.values()) {
        const res = this.isInhabitedNormalSeen(intersect, seen);
        if (res !== NormalizationResult.False) return res;
      }
      for (const table of norm.tables) {
        const res = this.isInhabitedSeen(table, seen);
        if (res !== NormalizationResult.False) return res;
      }
      return NormalizationResult.False;
    });
  }

  isInhabited(ty: TypeId): NormalizationResult {
    if (this.cacheInhabitance) {
      const cached = this.cachedIsInhabited.get(ty);
      if (cached !== undefined) return cached ? NormalizationResult.True : NormalizationResult.False;
    }
    try {
      const result = this.withFuel(() => this.isInhabitedSeen(ty, new Set()));
      if (this.cacheInhabitance && result === NormalizationResult.True) this.cachedIsInhabited.set(ty, true);
      else if (this.cacheInhabitance && result === NormalizationResult.False) this.cachedIsInhabited.set(ty, false);
      return result;
    } catch (e) {
      if (e instanceof NormalizerHitLimits) return NormalizationResult.HitLimits;
      throw e;
    }
  }

  private isInhabitedSeen(ty: TypeId, seen: SeenSet): NormalizationResult {
    return this.recurse(() => {
      if (!this.withinResourceLimits()) return NormalizationResult.HitLimits;
      this.consumeFuel();
      ty = follow(ty);
      if (get(ty, "NeverType")) return NormalizationResult.False;
      if (!get(ty, "IntersectionType") && !get(ty, "UnionType") && !get(ty, "TableType") && !get(ty, "MetatableType")) {
        return NormalizationResult.True;
      }
      if (seen.has(ty)) return NormalizationResult.True;
      seen.add(ty);
      const ttv = get(ty, "TableType");
      if (ttv) {
        for (const [, prop] of ttv.props) {
          // A table with an uninhabited read property is uninhabited; a
          // write property of an uninhabited type merely makes it read-only.
          if (prop.readTy) {
            const res = this.isInhabitedSeen(prop.readTy, seen);
            if (res !== NormalizationResult.True) return res;
          }
        }
        return NormalizationResult.True;
      }
      const mtv = get(ty, "MetatableType");
      if (mtv) {
        const res = this.isInhabitedSeen(mtv.table, seen);
        if (res !== NormalizationResult.True) return res;
        return this.isInhabitedSeen(mtv.metatable, seen);
      }
      return this.isInhabitedNormalSeen(this.normalize(ty), seen);
    });
  }

  isIntersectionInhabited(left: TypeId, right: TypeId): NormalizationResult {
    try {
      return this.withFuel(() => this.isIntersectionInhabitedSeen(left, right, new Set()));
    } catch (e) {
      if (e instanceof NormalizerHitLimits) return NormalizationResult.HitLimits;
      throw e;
    }
  }

  private isIntersectionInhabitedSeen(left: TypeId, right: TypeId, seenSet: SeenSet): NormalizationResult {
    this.consumeFuel();
    left = follow(left);
    right = follow(right);
    const key = `${left.serial},${right.serial}`;
    if (this.cacheInhabitance) {
      const cached = this.cachedIsInhabitedIntersection.get(key);
      if (cached !== undefined) return cached ? NormalizationResult.True : NormalizationResult.False;
    }
    const norm = new NormalizedType(this.builtinTypes);
    const res = this.normalizeIntersections([left, right], norm, seenSet);
    if (res !== NormalizationResult.True) {
      if (this.cacheInhabitance && res === NormalizationResult.False) this.cachedIsInhabitedIntersection.set(key, false);
      return res;
    }
    const result = this.isInhabitedNormalSeen(norm, seenSet);
    if (this.cacheInhabitance && result === NormalizationResult.True) this.cachedIsInhabitedIntersection.set(key, true);
    else if (this.cacheInhabitance && result === NormalizationResult.False) this.cachedIsInhabitedIntersection.set(key, false);
    return result;
  }

  // ------- Normalizing

  /** The normal form of a type, or undefined when normalization hit its limits. Never mutate the result. */
  normalize(ty: TypeId): NormalizedType | undefined {
    const found = this.cachedNormals.get(ty);
    if (found) return found;
    const norm = new NormalizedType(this.builtinTypes);
    try {
      const res = this.withFuel(() => this.unionNormalWithTy(norm, ty, new Set()));
      if (res !== NormalizationResult.True) return undefined;
    } catch (e) {
      if (e instanceof NormalizerHitLimits) return undefined;
      throw e;
    }
    if (norm.isUnknown()) {
      this.clearNormal(norm);
      norm.tops = this.builtinTypes.unknownType;
    }
    if (norm.isCacheable) this.cachedNormals.set(ty, norm);
    return norm;
  }

  private normalizeIntersections(intersections: TypeId[], outType: NormalizedType, seenSet: SeenSet): NormalizationResult {
    this.consumeFuel();
    const norm = new NormalizedType(this.builtinTypes);
    norm.tops = this.builtinTypes.unknownType;
    for (const ty of intersections) {
      const res = this.intersectNormalWithTy(norm, ty, seenSet);
      if (res !== NormalizationResult.True) return res;
    }
    return this.unionNormals(outType, norm);
  }

  private clearNormal(norm: NormalizedType): void {
    const b = this.builtinTypes;
    norm.tops = b.neverType;
    norm.booleans = b.neverType;
    norm.externTypes = new NormalizedExternType();
    norm.errors = b.neverType;
    norm.nils = b.neverType;
    norm.numbers = b.neverType;
    norm.integers = b.neverType;
    norm.strings = new NormalizedStringType();
    norm.threads = b.neverType;
    norm.buffers = b.neverType;
    norm.tables = new TypeIds();
    norm.functions = new NormalizedFunctionType();
    norm.tyvars = new Map();
  }

  private unionType(here: TypeId, there: TypeId): TypeId {
    this.consumeFuel();
    here = follow(here);
    there = follow(there);
    if (here === there) return here;
    if (get(here, "NeverType") || get(there, "AnyType")) return there;
    if (get(there, "NeverType") || get(here, "AnyType")) return here;
    const tmps = new TypeIds();
    const hu = get(here, "UnionType");
    if (hu) {
      const heres = new TypeIds(flatOptions(hu));
      tmps.insertAll(heres);
      this.cachedUnions.set(heres.key(), here);
    } else tmps.insert(here);
    const tu = get(there, "UnionType");
    if (tu) {
      const theres = new TypeIds(flatOptions(tu));
      tmps.insertAll(theres);
      this.cachedUnions.set(theres.key(), there);
    } else tmps.insert(there);
    const hit = this.cachedUnions.get(tmps.key());
    if (hit) return hit;
    const result = this.arena.addType(makeUnionType(tmps.toArray()));
    this.cachedUnions.set(tmps.key(), result);
    return result;
  }

  private intersectionType(here: TypeId, there: TypeId): TypeId {
    this.consumeFuel();
    here = follow(here);
    there = follow(there);
    if (here === there) return here;
    if (get(here, "NeverType") || get(there, "AnyType")) return here;
    if (get(there, "NeverType") || get(here, "AnyType")) return there;
    const tmps = new TypeIds();
    const hi = get(here, "IntersectionType");
    if (hi) {
      const heres = new TypeIds(flatOptions(hi));
      tmps.insertAll(heres);
      this.cachedIntersections.set(heres.key(), here);
    } else tmps.insert(here);
    const ti = get(there, "IntersectionType");
    if (ti) {
      const theres = new TypeIds(flatOptions(ti));
      tmps.insertAll(theres);
      this.cachedIntersections.set(theres.key(), there);
    } else tmps.insert(there);
    if (tmps.size === 1) return tmps.front();
    const hit = this.cachedIntersections.get(tmps.key());
    if (hit) return hit;
    const result = this.arena.addType(makeIntersectionType(tmps.toArray()));
    this.cachedIntersections.set(tmps.key(), result);
    return result;
  }

  // ------- Unions

  private unionOfTops(here: TypeId, there: TypeId): TypeId {
    this.consumeFuel();
    return get(here, "NeverType") || get(there, "AnyType") ? there : here;
  }

  private unionOfBools(here: TypeId, there: TypeId): TypeId {
    this.consumeFuel();
    if (get(here, "NeverType")) return there;
    if (get(there, "NeverType")) return here;
    const hbool = getSingleton(here, "BooleanSingleton");
    const tbool = getSingleton(there, "BooleanSingleton");
    if (hbool && tbool && hbool.value === tbool.value) return here;
    return this.builtinTypes.booleanType;
  }

  private unionExternTypeIdsWithExternType(heres: TypeIds, there: TypeId): void {
    this.consumeFuel();
    if (heres.contains(there)) return;
    for (const here of heres) {
      if (isSubclass(there, here)) return;
      if (isSubclass(here, there)) heres.erase(here);
    }
    heres.insert(there);
  }

  private unionExternTypeIds(heres: TypeIds, theres: TypeIds): void {
    this.consumeFuel();
    for (const there of theres) this.unionExternTypeIdsWithExternType(heres, there);
  }

  private unionExternTypesWithExternType(heres: NormalizedExternType, there: TypeId): void {
    this.consumeFuel();
    for (const hereTy of [...heres.ordering]) {
      const hereNegations = heres.externTypes.get(hereTy)!;
      if (isSubclass(there, hereTy)) {
        for (const hereNegation of hereNegations) {
          if (isSubclass(there, hereNegation)) {
            heres.pushPair(there, new TypeIds());
            return;
          } else if (isSubclass(hereNegation, there)) {
            hereNegations.erase(hereNegation);
          }
        }
        return;
      } else if (isSubclass(hereTy, there)) {
        heres.erase(hereTy);
        heres.pushPair(there, hereNegations);
        return;
      }
    }
    heres.pushPair(there, new TypeIds());
  }

  private unionExternTypes(heres: NormalizedExternType, theres: NormalizedExternType): void {
    this.consumeFuel();
    for (const thereTy of theres.ordering) {
      const thereNegations = theres.externTypes.get(thereTy)!;
      let insert = true;
      for (const hereTy of [...heres.ordering]) {
        const hereNegations = heres.externTypes.get(hereTy)!;
        if (isSubclass(thereTy, hereTy)) {
          let inserted = false;
          for (const hereNegateTy of hereNegations) {
            if (isSubclass(thereTy, hereNegateTy)) {
              inserted = true;
              heres.pushPair(thereTy, thereNegations.clone());
              break;
            } else if (isSubclass(hereNegateTy, thereTy)) {
              inserted = true;
              hereNegations.erase(hereNegateTy);
              break;
            }
          }
          if (inserted) {
            insert = false;
            break;
          }
        } else if (isSubclass(hereTy, thereTy)) {
          const negations = hereNegations;
          this.unionExternTypeIds(negations, thereNegations);
          heres.erase(hereTy);
          heres.pushPair(thereTy, negations);
          insert = false;
          break;
        } else if (hereTy === thereTy) {
          this.unionExternTypeIds(hereNegations, thereNegations);
          insert = false;
          break;
        }
      }
      if (insert) {
        heres.pushPair(thereTy, thereNegations.clone());
        for (const shape of theres.shapeExtensions) heres.shapeExtensions.insert(shape);
      }
    }
  }

  private unionStrings(here: NormalizedStringType, there: NormalizedStringType): void {
    this.consumeFuel();
    if (there.isString()) here.resetToString();
    else if (here.isUnion() && there.isUnion()) {
      for (const [k, v] of there.singletons) if (!here.singletons.has(k)) here.singletons.set(k, v);
    } else if (here.isUnion() && there.isIntersection()) {
      here.isCofinite = true;
      for (const [k, v] of there.singletons) {
        if (here.singletons.has(k)) here.singletons.delete(k);
        else here.singletons.set(k, v);
      }
    } else if (here.isIntersection() && there.isUnion()) {
      for (const k of there.singletons.keys()) here.singletons.delete(k);
    } else if (here.isIntersection() && there.isIntersection()) {
      for (const k of [...here.singletons.keys()]) if (!there.singletons.has(k)) here.singletons.delete(k);
    }
  }

  private combinePacks(
    here: TypePackId,
    there: TypePackId,
    combine: (h: TypeId, t: TypeId) => TypeId,
    union: boolean,
  ): TypePackId | undefined {
    this.consumeFuel();
    if (here === there) return here;
    const head: TypeId[] = [];
    let tail: TypePackId | undefined;
    let hereSubThere = true;
    let thereSubHere = true;
    const h = flatten(here);
    const t = flatten(there);
    const common = Math.min(h.head.length, t.head.length);
    const note = (ty: TypeId, hty: TypeId, tty: TypeId) => {
      if (union) {
        if (ty !== hty) thereSubHere = false;
        if (ty !== tty) hereSubThere = false;
      } else {
        if (ty !== hty) hereSubThere = false;
        if (ty !== tty) thereSubHere = false;
      }
    };
    for (let i = 0; i < common; i++) {
      const hty = h.head[i]!;
      const tty = t.head[i]!;
      const ty = combine(hty, tty);
      note(ty, hty, tty);
      head.push(ty);
    }
    // One side is longer: its extra elements combine with the other side's variadic tail.
    const extend = (longer: TypeId[], otherTail: TypePackId | undefined, longerIsHere: boolean): boolean => {
      if (longer.length <= common) return true;
      let tty = this.builtinTypes.nilType;
      if (otherTail) {
        const tvtp = getPack(otherTail, "VariadicTypePack");
        if (!tvtp) return false;
        tty = tvtp.ty;
      } else {
        return false;
      }
      for (let i = common; i < longer.length; i++) {
        const hty = longer[i]!;
        const ty = combine(hty, tty);
        if (longerIsHere) note(ty, hty, tty);
        else note(ty, tty, hty);
        head.push(ty);
      }
      return true;
    };
    if (!extend(h.head, t.tail, true)) return undefined;
    if (!extend(t.head, h.tail, false)) return undefined;

    const htail = h.tail;
    const ttail = t.tail;
    if (htail) {
      if (ttail) {
        if (htail === ttail) tail = htail;
        else {
          const hvtp = getPack(htail, "VariadicTypePack");
          const tvtp = getPack(ttail, "VariadicTypePack");
          if (!hvtp || !tvtp) return undefined;
          const ty = combine(hvtp.ty, tvtp.ty);
          if (union) {
            if (ty !== hvtp.ty) thereSubHere = false;
            if (ty !== tvtp.ty) hereSubThere = false;
          } else {
            if (ty !== hvtp.ty) thereSubHere = false;
            if (ty !== tvtp.ty) hereSubThere = false;
          }
          tail = this.arena.addTypePack(variadicTypePack(ty, hvtp.hidden && tvtp.hidden));
        }
      } else if (getPack(htail, "VariadicTypePack")) {
        hereSubThere = false;
        if (union) tail = htail;
      } else return undefined;
    } else if (ttail) {
      if (getPack(ttail, "VariadicTypePack")) {
        thereSubHere = false;
        if (union) tail = htail;
      } else return undefined;
    }

    if (hereSubThere) return union ? there : here;
    if (thereSubHere) return union ? here : there;
    if (head.length) return this.arena.addTypePack(typePack(head, tail));
    if (tail) return tail;
    return this.arena.addTypePack(typePack([]));
  }

  private unionOfTypePacks(here: TypePackId, there: TypePackId): TypePackId | undefined {
    return this.combinePacks(here, there, (h, t) => this.unionType(h, t), true);
  }

  intersectionOfTypePacks(here: TypePackId, there: TypePackId): TypePackId | undefined {
    try {
      return this.withFuel(() => this.intersectionOfTypePacksInternal(here, there));
    } catch (e) {
      if (e instanceof NormalizerHitLimits) return undefined;
      throw e;
    }
  }

  private intersectionOfTypePacksInternal(here: TypePackId, there: TypePackId): TypePackId | undefined {
    return this.combinePacks(here, there, (h, t) => this.intersectionType(h, t), false);
  }

  private sameGenerics(a: TypeId[], b: TypeId[]): boolean {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }

  private sameGenericPacks(a: TypePackId[], b: TypePackId[]): boolean {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }

  private unionOfFunctions(here: TypeId, there: TypeId): TypeId | undefined {
    this.consumeFuel();
    if (get(here, "ErrorType")) return here;
    if (get(there, "ErrorType")) return there;
    const hftv = get(here, "FunctionType")!;
    const tftv = get(there, "FunctionType")!;
    if (!this.sameGenerics(hftv.generics, tftv.generics)) return undefined;
    if (!this.sameGenericPacks(hftv.genericPacks, tftv.genericPacks)) return undefined;
    const argTypes = this.intersectionOfTypePacksInternal(hftv.argTypes, tftv.argTypes);
    if (!argTypes) return undefined;
    const retTypes = this.unionOfTypePacks(hftv.retTypes, tftv.retTypes);
    if (!retTypes) return undefined;
    if (argTypes === hftv.argTypes && retTypes === hftv.retTypes) return here;
    if (argTypes === tftv.argTypes && retTypes === tftv.retTypes) return there;
    return this.arena.addType(functionType(argTypes, retTypes, { generics: hftv.generics, genericPacks: hftv.genericPacks }));
  }

  private unionFunctions(heres: NormalizedFunctionType, theres: NormalizedFunctionType): void {
    this.consumeFuel();
    if (heres.isTop) return;
    if (theres.isTop) heres.resetToTop();
    if (theres.isNever()) return;
    const tmps = new TypeIds();
    if (heres.isNever()) {
      tmps.insertAll(theres.parts);
      heres.parts = tmps;
      return;
    }
    for (const here of heres.parts) {
      for (const there of theres.parts) {
        const fun = this.unionOfFunctions(here, there);
        tmps.insert(fun ?? this.builtinTypes.errorRecoveryType(there));
      }
    }
    heres.parts = tmps;
  }

  private unionFunctionsWithFunction(heres: NormalizedFunctionType, there: TypeId): void {
    this.consumeFuel();
    if (heres.isNever()) {
      heres.parts = new TypeIds([there]);
      return;
    }
    const tmps = new TypeIds();
    for (const here of heres.parts) {
      const fun = this.unionOfFunctions(here, there);
      tmps.insert(fun ?? this.builtinTypes.errorRecoveryType(there));
    }
    heres.parts = tmps;
  }

  private unionTablesWithTable(heres: TypeIds, there: TypeId): void {
    if (get(there, "NeverType")) return;
    heres.insert(there);
  }

  private unionTables(heres: TypeIds, theres: TypeIds): void {
    this.consumeFuel();
    for (const there of theres) {
      if (there === this.builtinTypes.tableType) {
        heres.clear();
        heres.insert(there);
        return;
      }
      this.unionTablesWithTable(heres, there);
    }
  }

  /**
   * Unions `there` into `here`, ignoring type variables of `there` whose
   * index is at most `ignoreSmallerTyvars`, which keeps the type variables
   * ordered as in an ordered decision diagram.
   */
  unionNormals(here: NormalizedType, there: NormalizedType, ignoreSmallerTyvars = -1): NormalizationResult {
    this.consumeFuel();
    here.isCacheable = here.isCacheable && there.isCacheable;
    let tops = this.unionOfTops(here.tops, there.tops);
    if (get(tops, "UnknownType") && (get(here.errors, "ErrorType") || get(there.errors, "ErrorType"))) {
      tops = this.builtinTypes.anyType;
    }
    if (!get(tops, "NeverType")) {
      this.clearNormal(here);
      here.tops = tops;
      return NormalizationResult.True;
    }
    for (const [tyvar, inter] of there.tyvars) {
      const index = tyvarIndex(tyvar);
      if (index <= ignoreSmallerTyvars) continue;
      let emplaced = here.tyvars.get(tyvar);
      if (!emplaced) {
        emplaced = new NormalizedType(this.builtinTypes);
        here.tyvars.set(tyvar, emplaced);
        const res = this.unionNormals(emplaced, here, index);
        if (res !== NormalizationResult.True) return res;
      }
      const res = this.unionNormals(emplaced, inter, index);
      if (res !== NormalizationResult.True) return res;
    }
    here.booleans = this.unionOfBools(here.booleans, there.booleans);
    this.unionExternTypes(here.externTypes, there.externTypes);
    here.errors = get(there.errors, "NeverType") ? here.errors : there.errors;
    here.nils = get(there.nils, "NeverType") ? here.nils : there.nils;
    here.numbers = get(there.numbers, "NeverType") ? here.numbers : there.numbers;
    here.integers = get(there.integers, "NeverType") ? here.integers : there.integers;
    this.unionStrings(here.strings, there.strings);
    here.threads = get(there.threads, "NeverType") ? here.threads : there.threads;
    here.buffers = get(there.buffers, "NeverType") ? here.buffers : there.buffers;
    this.unionFunctions(here.functions, there.functions);
    this.unionTables(here.tables, there.tables);
    return NormalizationResult.True;
  }

  private intersectNormalWithNegationTy(toNegate: TypeId, intersect: NormalizedType): NormalizationResult {
    this.consumeFuel();
    const normal = this.normalize(toNegate);
    if (!normal) return NormalizationResult.False;
    const negated = this.negateNormal(normal);
    if (!negated) return NormalizationResult.False;
    this.intersectNormals(intersect, negated);
    return NormalizationResult.True;
  }

  unionNormalWithTy(here: NormalizedType, there: TypeId, seenSetTypes: SeenSet, ignoreSmallerTyvars = -1): NormalizationResult {
    return this.recurse(() => {
      if (!this.withinResourceLimits()) return NormalizationResult.HitLimits;
      this.consumeFuel();
      there = follow(there);
      if (get(there, "AnyType") || get(there, "UnknownType")) {
        let tops = this.unionOfTops(here.tops, there);
        if (get(tops, "UnknownType") && get(here.errors, "ErrorType")) tops = this.builtinTypes.anyType;
        this.clearNormal(here);
        here.tops = tops;
        return NormalizationResult.True;
      } else if (get(there, "NeverType") || get(here.tops, "AnyType")) {
        return NormalizationResult.True;
      } else if (get(there, "ErrorType") && get(here.tops, "UnknownType")) {
        here.tops = this.builtinTypes.anyType;
        return NormalizationResult.True;
      }
      const utv = get(there, "UnionType");
      if (utv) {
        if (seenSetTypes.has(there)) return NormalizationResult.True;
        seenSetTypes.add(there);
        for (const option of flatOptions(utv)) {
          const res = this.unionNormalWithTy(here, option, seenSetTypes);
          if (res !== NormalizationResult.True) {
            seenSetTypes.delete(there);
            return res;
          }
        }
        seenSetTypes.delete(there);
        return NormalizationResult.True;
      }
      const itv = get(there, "IntersectionType");
      if (itv) {
        if (seenSetTypes.has(there)) return NormalizationResult.True;
        seenSetTypes.add(there);
        const norm = new NormalizedType(this.builtinTypes);
        norm.tops = this.builtinTypes.unknownType;
        for (const part of flatOptions(itv)) {
          const res = this.intersectNormalWithTy(norm, part, seenSetTypes);
          if (res !== NormalizationResult.True) {
            seenSetTypes.delete(there);
            return res;
          }
        }
        seenSetTypes.delete(there);
        return this.unionNormals(here, norm);
      }
      if (get(here.tops, "UnknownType")) return NormalizationResult.True;

      if (
        get(there, "GenericType") ||
        get(there, "FreeType") ||
        get(there, "BlockedType") ||
        get(there, "PendingExpansionType") ||
        get(there, "TypeFunctionInstanceType")
      ) {
        if (tyvarIndex(there) <= ignoreSmallerTyvars) return NormalizationResult.True;
        const inter = new NormalizedType(this.builtinTypes);
        inter.tops = this.builtinTypes.unknownType;
        here.tyvars.set(there, inter);
        if (!isCacheableType(there)) here.isCacheable = false;
      } else if (get(there, "FunctionType")) {
        this.unionFunctionsWithFunction(here.functions, there);
      } else if (get(there, "TableType") || get(there, "MetatableType")) {
        this.unionTablesWithTable(here.tables, there);
      } else if (get(there, "ExternType")) {
        this.unionExternTypesWithExternType(here.externTypes, there);
      } else if (get(there, "ErrorType")) {
        here.errors = there;
      } else if (get(there, "PrimitiveType")) {
        const ptv = get(there, "PrimitiveType")!;
        switch (ptv.type) {
          case PrimitiveKind.Boolean:
            here.booleans = there;
            break;
          case PrimitiveKind.NilType:
            here.nils = there;
            break;
          case PrimitiveKind.Number:
            here.numbers = there;
            break;
          case PrimitiveKind.Integer:
            here.integers = there;
            break;
          case PrimitiveKind.String:
            here.strings.resetToString();
            break;
          case PrimitiveKind.Thread:
            here.threads = there;
            break;
          case PrimitiveKind.Buffer:
            here.buffers = there;
            break;
          case PrimitiveKind.Function:
            here.functions.resetToTop();
            break;
          case PrimitiveKind.Table:
            here.tables.clear();
            here.tables.insert(there);
            break;
        }
      } else if (get(there, "SingletonType")) {
        const bs = getSingleton(there, "BooleanSingleton");
        const ss = getSingleton(there, "StringSingleton");
        if (bs) here.booleans = this.unionOfBools(here.booleans, there);
        else if (ss) {
          if (here.strings.isCofinite) here.strings.singletons.delete(ss.value);
          else if (!here.strings.singletons.has(ss.value)) here.strings.singletons.set(ss.value, there);
        }
      } else if (get(there, "NegationType")) {
        const ntv = get(there, "NegationType")!;
        const thereNormal = this.normalize(ntv.ty);
        if (!thereNormal) return NormalizationResult.False;
        const tn = this.negateNormal(thereNormal);
        if (!tn) return NormalizationResult.False;
        const res = this.unionNormals(here, tn);
        if (res !== NormalizationResult.True) return res;
      }
      // Pending expansions, type functions and *no-refine* add nothing.

      for (const [tyvar, intersect] of [...here.tyvars]) {
        const res = this.unionNormalWithTy(intersect, there, seenSetTypes, tyvarIndex(tyvar));
        if (res !== NormalizationResult.True) return res;
      }
      return NormalizationResult.True;
    });
  }

  // ------- Negations

  negateNormal(here: NormalizedType): NormalizedType | undefined {
    this.consumeFuel();
    const b = this.builtinTypes;
    const result = new NormalizedType(b);
    result.isCacheable = here.isCacheable;
    // The negation of unknown or any is never.
    if (!get(here.tops, "NeverType")) return result;
    // Negating an error yields the same error.
    if (!get(here.errors, "NeverType")) {
      result.errors = here.errors;
      return result;
    }
    if (get(here.booleans, "NeverType")) result.booleans = b.booleanType;
    else if (get(here.booleans, "PrimitiveType")) result.booleans = b.neverType;
    else {
      const bs = getSingleton(here.booleans, "BooleanSingleton");
      if (bs) result.booleans = bs.value ? b.falseType : b.trueType;
    }
    if (here.externTypes.isNever()) {
      resetToTopExterns(b, result.externTypes);
    } else if (isTopExterns(b, result.externTypes)) {
      result.externTypes.resetToNever();
    } else {
      const rootNegations = new TypeIds();
      for (const [hereParent, hereNegations] of here.externTypes.externTypes) {
        if (hereParent !== b.externType) rootNegations.insert(hereParent);
        for (const hereNegation of hereNegations) this.unionExternTypesWithExternType(result.externTypes, hereNegation);
      }
      if (!rootNegations.empty()) result.externTypes.pushPair(b.externType, rootNegations);
    }
    result.nils = get(here.nils, "NeverType") ? b.nilType : b.neverType;
    result.numbers = get(here.numbers, "NeverType") ? b.numberType : b.neverType;
    result.integers = get(here.integers, "NeverType") ? b.integerType : b.neverType;
    result.strings = here.strings.clone();
    result.strings.isCofinite = !result.strings.isCofinite;
    result.threads = get(here.threads, "NeverType") ? b.threadType : b.neverType;
    result.buffers = get(here.buffers, "NeverType") ? b.bufferType : b.neverType;
    // Arbitrary function types are not runtime-testable, so only top and never negate.
    if (here.functions.isNever()) result.functions.resetToTop();
    else if (here.functions.isTop) result.functions.resetToNever();
    else return undefined;
    // Likewise only `table` and never negate among tables.
    if (here.tables.empty()) result.tables.insert(b.tableType);
    else if (here.tables.size === 1 && here.tables.front() === b.tableType) result.tables.clear();
    else return undefined;
    return result;
  }

  negate(there: TypeId): TypeId {
    this.consumeFuel();
    there = follow(there);
    if (get(there, "AnyType")) return there;
    if (get(there, "UnknownType")) return this.builtinTypes.neverType;
    if (get(there, "NeverType")) return this.builtinTypes.unknownType;
    const ntv = get(there, "NegationType");
    if (ntv) return ntv.ty;
    const utv = get(there, "UnionType");
    if (utv) return this.arena.addType(makeIntersectionType(flatOptions(utv).map((o) => this.negate(o))));
    const itv = get(there, "IntersectionType");
    if (itv) return this.arena.addType(makeUnionType(flatOptions(itv).map((p) => this.negate(p))));
    return there;
  }

  private subtractPrimitive(here: NormalizedType, ty: TypeId): void {
    this.consumeFuel();
    const ptv = get(follow(ty), "PrimitiveType")!;
    const b = this.builtinTypes;
    switch (ptv.type) {
      case PrimitiveKind.NilType:
        here.nils = b.neverType;
        break;
      case PrimitiveKind.Boolean:
        here.booleans = b.neverType;
        break;
      case PrimitiveKind.Number:
        here.numbers = b.neverType;
        break;
      case PrimitiveKind.Integer:
        here.integers = b.neverType;
        break;
      case PrimitiveKind.String:
        here.strings.resetToNever();
        break;
      case PrimitiveKind.Thread:
        here.threads = b.neverType;
        break;
      case PrimitiveKind.Buffer:
        here.buffers = b.neverType;
        break;
      case PrimitiveKind.Function:
        here.functions.resetToNever();
        break;
      case PrimitiveKind.Table:
        here.tables.clear();
        break;
    }
  }

  private subtractSingleton(here: NormalizedType, ty: TypeId): void {
    this.consumeFuel();
    const ss = getSingleton(ty, "StringSingleton");
    const bs = getSingleton(ty, "BooleanSingleton");
    if (ss) {
      if (here.strings.isCofinite) {
        if (!here.strings.singletons.has(ss.value)) here.strings.singletons.set(ss.value, ty);
      } else here.strings.singletons.delete(ss.value);
    } else if (bs) {
      if (get(here.booleans, "NeverType")) {
        // Nothing to subtract from.
      } else if (get(here.booleans, "PrimitiveType")) {
        here.booleans = bs.value ? this.builtinTypes.falseType : this.builtinTypes.trueType;
      } else {
        const hereBool = getSingleton(here.booleans, "BooleanSingleton");
        // `bs` is the value negated out, so equal values reduce to never.
        if (hereBool && bs.value === hereBool.value) here.booleans = this.builtinTypes.neverType;
      }
    }
  }

  // ------- Intersections

  private intersectionOfTops(here: TypeId, there: TypeId): TypeId {
    this.consumeFuel();
    if (get(here, "NeverType") || get(there, "NeverType")) return this.builtinTypes.neverType;
    if (get(here, "AnyType") || get(there, "AnyType")) return this.builtinTypes.anyType;
    return this.builtinTypes.unknownType;
  }

  private intersectionOfBools(here: TypeId, there: TypeId): TypeId {
    this.consumeFuel();
    if (get(here, "NeverType")) return here;
    if (get(there, "NeverType")) return there;
    const hbool = getSingleton(here, "BooleanSingleton");
    if (hbool) {
      const tbool = getSingleton(there, "BooleanSingleton");
      if (tbool) return hbool.value === tbool.value ? here : this.builtinTypes.neverType;
      return here;
    }
    return there;
  }

  private intersectExternTypes(heres: NormalizedExternType, theres: NormalizedExternType): void {
    this.consumeFuel();
    if (theres.isNever()) {
      heres.resetToNever();
      return;
    }
    if (isTopExterns(this.builtinTypes, theres)) return;
    for (const thereTy of theres.ordering) {
      const thereNegations = theres.externTypes.get(thereTy)!;
      for (let i = 0; i < heres.ordering.length; ) {
        const hereTy = heres.ordering[i]!;
        const hereNegations = heres.externTypes.get(hereTy)!;
        if (isSubclass(thereTy, hereTy)) {
          const negations = hereNegations;
          for (const n of negations) if (!isSubclass(n, thereTy)) negations.erase(n);
          this.unionExternTypeIds(negations, thereNegations);
          heres.erase(hereTy);
          heres.pushPair(thereTy, negations);
          break;
        } else if (isSubclass(hereTy, thereTy)) {
          const negations = thereNegations.clone();
          let erasedHere = false;
          for (const n of negations) {
            if (isSubclass(hereTy, n)) {
              heres.erase(hereTy);
              erasedHere = true;
              break;
            }
            if (!isSubclass(n, hereTy)) negations.erase(n);
          }
          if (!erasedHere) {
            this.unionExternTypeIds(hereNegations, negations);
            i++;
          }
        } else if (hereTy === thereTy) {
          this.unionExternTypeIds(hereNegations, thereNegations);
          break;
        } else {
          heres.erase(hereTy);
        }
      }
    }
  }

  private intersectExternTypesWithExternType(heres: NormalizedExternType, there: TypeId): void {
    this.consumeFuel();
    for (let i = 0; i < heres.ordering.length; ) {
      const hereTy = heres.ordering[i]!;
      const hereNegations = heres.externTypes.get(hereTy)!;
      if (hereTy === there) {
        i++;
      } else if (isSubclass(there, hereTy)) {
        const negations = hereNegations;
        let emptyIntersectWithNegation = false;
        for (const n of negations) {
          if (isSubclass(there, n)) {
            // `Dog & ~Animal` is never.
            emptyIntersectWithNegation = true;
            break;
          }
          if (!isSubclass(n, there)) negations.erase(n);
        }
        heres.erase(hereTy);
        if (!emptyIntersectWithNegation) heres.pushPair(there, negations);
        break;
      } else if (isSubclass(hereTy, there)) {
        return;
      } else {
        heres.erase(hereTy);
      }
    }
  }

  private intersectExternTypesWithShape(heres: NormalizedExternType, there: TypeId): void {
    this.consumeFuel();
    const shape = get(there, "TableType");
    if (!shape) return;
    let isCoincident = true;
    for (const [name, shapeProp] of shape.props) {
      for (const hereTy of heres.ordering) {
        const externTy = get(hereTy, "ExternType")!;
        const prop = externTy.props.get(name);
        if (!prop) {
          isCoincident = false;
          continue;
        }
        if (prop.readTy && shapeProp.readTy) {
          if (this.isIntersectionInhabited(prop.readTy, shapeProp.readTy) !== NormalizationResult.True) {
            heres.resetToNever();
            return;
          }
          if (relate(prop.readTy, shapeProp.readTy) !== Relation.Coincident) isCoincident = false;
        }
        if (prop.writeTy && shapeProp.writeTy) {
          if (relate(prop.writeTy, shapeProp.writeTy) !== Relation.Coincident) isCoincident = false;
        }
      }
    }
    if (!isCoincident) heres.shapeExtensions.insert(there);
  }

  private intersectStrings(here: NormalizedStringType, there: NormalizedStringType): void {
    this.consumeFuel();
    if (there.isString()) return;
    if (here.isString()) {
      here.singletons.clear();
      for (const [k, v] of there.singletons) here.singletons.set(k, v);
      here.isCofinite = here.isCofinite && there.isCofinite;
    } else if (here.isIntersection() && there.isIntersection()) {
      here.isCofinite = true;
      for (const [k, v] of there.singletons) here.singletons.set(k, v);
    } else if (here.isUnion() && there.isIntersection()) {
      here.isCofinite = false;
      for (const k of there.singletons.keys()) here.singletons.delete(k);
    } else if (here.isIntersection() && there.isUnion()) {
      here.isCofinite = false;
      const result = new Map(there.singletons);
      for (const k of here.singletons.keys()) result.delete(k);
      here.singletons = result;
    } else if (here.isUnion() && there.isUnion()) {
      here.isCofinite = false;
      const result = new Map<string, TypeId>();
      for (const [k, v] of here.singletons) if (there.singletons.has(k)) result.set(k, v);
      here.singletons = result;
    }
  }

  private intersectionOfTables(here: TypeId, there: TypeId, seenSet: SeenSet): TypeId | undefined {
    this.consumeFuel();
    if (here === there) return here;
    return this.recurse(() => {
      const counters = this.sharedState.counters;
      if (counters.recursionLimit > 0 && counters.recursionLimit < counters.recursionCount) return undefined;
      if (isPrim(here, PrimitiveKind.Table)) return there;
      if (isPrim(there, PrimitiveKind.Table)) return here;
      if (get(here, "NeverType")) return there;
      if (get(there, "NeverType")) return here;
      if (get(here, "AnyType")) return there;
      if (get(there, "AnyType")) return here;

      let htable = here;
      let hmtable: TypeId | undefined;
      const hmtv = get(here, "MetatableType");
      if (hmtv) {
        htable = follow(hmtv.table);
        hmtable = follow(hmtv.metatable);
      }
      let ttable = there;
      let tmtable: TypeId | undefined;
      const tmtv = get(there, "MetatableType");
      if (tmtv) {
        ttable = follow(tmtv.table);
        tmtable = follow(tmtv.metatable);
      }
      const httv = get(htable, "TableType");
      if (!httv) return undefined;
      const tttv = get(ttable, "TableType");
      if (!tttv) return undefined;
      if (httv.state === TableState.Free || tttv.state === TableState.Free) return undefined;
      if (httv.state === TableState.Generic || tttv.state === TableState.Generic) return undefined;

      let state = httv.state;
      if (tttv.state === TableState.Unsealed) state = tttv.state;
      const level = httv.level.subsumes(tttv.level) ? tttv.level : httv.level;
      const scope = maxScope(httv.scope, tttv.scope);

      let result: ReturnType<typeof tableType> | undefined;
      let hereSubThere = true;
      let thereSubHere = true;
      const makeResult = () => (result ??= tableType({ state, level, scope }));

      for (const [name, hprop] of httv.props) {
        const prop = hprop.clone();
        const tprop = tttv.props.get(name);
        if (!tprop) thereSubHere = false;
        else {
          if (hprop.readTy) {
            if (tprop.readTy) {
              const ty = simplifyIntersection(this.builtinTypes, this.arena, hprop.readTy, tprop.readTy).result;
              // A property of type never makes the whole table never.
              if (get(ty, "NeverType")) return this.builtinTypes.neverType;
              prop.readTy = ty;
              hereSubThere = hereSubThere && ty === hprop.readTy;
              thereSubHere = thereSubHere && ty === tprop.readTy;
            } else {
              prop.readTy = hprop.readTy;
              thereSubHere = false;
            }
          } else if (tprop.readTy) {
            prop.readTy = tprop.readTy;
            hereSubThere = false;
          }
          if (hprop.writeTy) {
            if (tprop.writeTy) {
              prop.writeTy = simplifyIntersection(this.builtinTypes, this.arena, hprop.writeTy, tprop.writeTy).result;
              hereSubThere = hereSubThere && prop.writeTy === hprop.writeTy;
              thereSubHere = thereSubHere && prop.writeTy === tprop.writeTy;
            } else {
              prop.writeTy = hprop.writeTy;
              thereSubHere = false;
            }
          } else if (tprop.writeTy) {
            prop.writeTy = tprop.writeTy;
            hereSubThere = false;
          }
        }
        if (prop.readTy || prop.writeTy) makeResult().props.set(name, prop);
      }
      for (const [name, tprop] of tttv.props) {
        if (!httv.props.has(name)) {
          makeResult().props.set(name, tprop);
          hereSubThere = false;
        }
      }
      if (httv.indexer && tttv.indexer) {
        const index = this.unionType(httv.indexer.indexType, tttv.indexer.indexType);
        const idx = new TableIndexer(index, this.intersectionType(httv.indexer.indexResultType, tttv.indexer.indexResultType));
        if (httv.indexer.isReadOnly && tttv.indexer.isReadOnly) idx.isReadOnly = true;
        const hereModeMatch = httv.indexer.isReadOnly === idx.isReadOnly;
        const thereModeMatch = tttv.indexer.isReadOnly === idx.isReadOnly;
        hereSubThere =
          hereSubThere && hereModeMatch && httv.indexer.indexType === index && httv.indexer.indexResultType === idx.indexResultType;
        thereSubHere =
          thereSubHere && thereModeMatch && tttv.indexer.indexType === index && tttv.indexer.indexResultType === idx.indexResultType;
        makeResult().indexer = idx;
      } else if (httv.indexer) {
        makeResult().indexer = httv.indexer;
        thereSubHere = false;
      } else if (tttv.indexer) {
        makeResult().indexer = tttv.indexer;
        hereSubThere = false;
      }

      let table: TypeId;
      if (hereSubThere) table = htable;
      else if (thereSubHere) table = ttable;
      else table = this.arena.addType(result ?? tableType({ state, level, scope }));

      if (tmtable && hmtable) {
        // Metatables are assumed invariant.
        const mtable = this.intersectionOfTables(hmtable, tmtable, seenSet);
        if (!mtable) return undefined;
        if (table === htable && mtable === hmtable) return here;
        if (table === ttable && mtable === tmtable) return there;
        return this.arena.addType(metatableType(table, mtable));
      } else if (hmtable) {
        if (table === htable) return here;
        return this.arena.addType(metatableType(table, hmtable));
      } else if (tmtable) {
        if (table === ttable) return there;
        return this.arena.addType(metatableType(table, tmtable));
      }
      return table;
    });
  }

  private intersectTablesWithTable(heres: TypeIds, there: TypeId, seenSetTypes: SeenSet): void {
    this.consumeFuel();
    const tmp = new TypeIds();
    for (const here of heres) {
      const inter = this.intersectionOfTables(here, there, seenSetTypes);
      if (inter) tmp.insert(inter);
    }
    heres.retain(tmp);
    heres.insertAll(tmp);
  }

  private intersectTables(heres: TypeIds, theres: TypeIds): void {
    this.consumeFuel();
    const tmp = new TypeIds();
    for (const here of heres) {
      for (const there of theres) {
        const inter = this.intersectionOfTables(here, there, new Set());
        if (inter) tmp.insert(inter);
      }
    }
    heres.retain(tmp);
    heres.insertAll(tmp);
  }

  private intersectionOfFunctions(here: TypeId, there: TypeId): TypeId | undefined {
    this.consumeFuel();
    const hftv = get(here, "FunctionType")!;
    const tftv = get(there, "FunctionType")!;
    if (!this.sameGenerics(hftv.generics, tftv.generics)) return undefined;
    if (!this.sameGenericPacks(hftv.genericPacks, tftv.genericPacks)) return undefined;
    let argTypes: TypePackId;
    let retTypes: TypePackId;
    if (hftv.retTypes === tftv.retTypes) {
      const a = this.unionOfTypePacks(hftv.argTypes, tftv.argTypes);
      if (!a) return undefined;
      argTypes = a;
      retTypes = hftv.retTypes;
    } else if (hftv.argTypes === tftv.argTypes) {
      const r = this.intersectionOfTypePacksInternal(hftv.argTypes, tftv.argTypes);
      if (!r) return undefined;
      argTypes = hftv.argTypes;
      retTypes = r;
    } else return undefined;
    if (argTypes === hftv.argTypes && retTypes === hftv.retTypes) return here;
    if (argTypes === tftv.argTypes && retTypes === tftv.retTypes) return there;
    return this.arena.addType(functionType(argTypes, retTypes, { generics: hftv.generics, genericPacks: hftv.genericPacks }));
  }

  /**
   * The overload that takes the union of two overloads' arguments and returns
   * the union of their results, which union-saturates an overloaded function.
   */
  private unionSaturatedFunctions(here: TypeId, there: TypeId): TypeId | undefined {
    this.consumeFuel();
    const hftv = get(here, "FunctionType");
    const tftv = get(there, "FunctionType");
    if (!hftv || !tftv) return undefined;
    if (!this.sameGenerics(hftv.generics, tftv.generics)) return undefined;
    if (!this.sameGenericPacks(hftv.genericPacks, tftv.genericPacks)) return undefined;
    const argTypes = this.unionOfTypePacks(hftv.argTypes, tftv.argTypes);
    if (!argTypes) return undefined;
    const retTypes = this.unionOfTypePacks(hftv.retTypes, tftv.retTypes);
    if (!retTypes) return undefined;
    return this.arena.addType(functionType(argTypes, retTypes, { generics: hftv.generics, genericPacks: hftv.genericPacks }));
  }

  private intersectFunctionsWithFunction(heres: NormalizedFunctionType, there: TypeId): void {
    this.consumeFuel();
    if (heres.isNever()) return;
    heres.isTop = false;
    for (const here of heres.parts) {
      if (get(here, "ErrorType")) continue;
      const tmp = this.intersectionOfFunctions(here, there);
      if (tmp) {
        heres.parts.erase(here);
        heres.parts.insert(tmp);
        return;
      }
    }
    const tmps = new TypeIds();
    for (const here of heres.parts) {
      const tmp = this.unionSaturatedFunctions(here, there);
      if (tmp) tmps.insert(tmp);
    }
    heres.parts.insert(there);
    heres.parts.insertAll(tmps);
  }

  private intersectFunctions(heres: NormalizedFunctionType, theres: NormalizedFunctionType): void {
    this.consumeFuel();
    if (heres.isNever()) return;
    if (theres.isNever()) {
      heres.resetToNever();
      return;
    }
    for (const there of theres.parts) this.intersectFunctionsWithFunction(heres, there);
  }

  private intersectTyvarsWithTy(here: Map<TypeId, NormalizedType>, there: TypeId, seenSetTypes: SeenSet): NormalizationResult {
    this.consumeFuel();
    for (const [tyvar, inter] of [...here]) {
      const res = this.intersectNormalWithTy(inter, there, seenSetTypes);
      if (res !== NormalizationResult.True) return res;
      if (!isShallowInhabited(inter)) here.delete(tyvar);
    }
    return NormalizationResult.True;
  }

  intersectNormals(here: NormalizedType, there: NormalizedType, ignoreSmallerTyvars = -1): NormalizationResult {
    return this.recurse(() => {
      if (!this.withinResourceLimits()) return NormalizationResult.HitLimits;
      this.consumeFuel();
      if (!get(there.tops, "NeverType")) {
        here.tops = this.intersectionOfTops(here.tops, there.tops);
        return NormalizationResult.True;
      } else if (!get(here.tops, "NeverType")) {
        this.clearNormal(here);
        return this.unionNormals(here, there, ignoreSmallerTyvars);
      }
      for (const tyvar of there.tyvars.keys()) {
        const index = tyvarIndex(tyvar);
        if (ignoreSmallerTyvars < index && !here.tyvars.has(tyvar)) {
          const found = new NormalizedType(this.builtinTypes);
          here.tyvars.set(tyvar, found);
          const res = this.unionNormals(found, here, index);
          if (res !== NormalizationResult.True) return res;
        }
      }
      here.booleans = this.intersectionOfBools(here.booleans, there.booleans);
      this.intersectExternTypes(here.externTypes, there.externTypes);
      here.errors = get(there.errors, "NeverType") ? there.errors : here.errors;
      here.nils = get(there.nils, "NeverType") ? there.nils : here.nils;
      here.numbers = get(there.numbers, "NeverType") ? there.numbers : here.numbers;
      here.integers = get(there.integers, "NeverType") ? there.integers : here.integers;
      this.intersectStrings(here.strings, there.strings);
      here.threads = get(there.threads, "NeverType") ? there.threads : here.threads;
      here.buffers = get(there.buffers, "NeverType") ? there.buffers : here.buffers;
      this.intersectFunctions(here.functions, there.functions);
      this.intersectTables(here.tables, there.tables);
      for (const [tyvar, inter] of [...here.tyvars]) {
        const index = tyvarIndex(tyvar);
        const found = there.tyvars.get(tyvar);
        const res = found ? this.intersectNormals(inter, found, index) : this.intersectNormals(inter, there, index);
        if (res !== NormalizationResult.True) return res;
        if (!isShallowInhabited(inter)) here.tyvars.delete(tyvar);
      }
      return NormalizationResult.True;
    });
  }

  intersectNormalWithTy(here: NormalizedType, there: TypeId, seenSetTypes: SeenSet): NormalizationResult {
    return this.recurse(() => {
      if (!this.withinResourceLimits()) return NormalizationResult.HitLimits;
      this.consumeFuel();
      there = follow(there);
      const b = this.builtinTypes;
      if (get(there, "AnyType") || get(there, "UnknownType")) {
        here.tops = this.intersectionOfTops(here.tops, there);
        return NormalizationResult.True;
      } else if (!get(here.tops, "NeverType")) {
        this.clearNormal(here);
        return this.unionNormalWithTy(here, there, seenSetTypes);
      }
      const utv = get(there, "UnionType");
      if (utv) {
        const norm = new NormalizedType(b);
        for (const option of flatOptions(utv)) {
          const res = this.unionNormalWithTy(norm, option, seenSetTypes);
          if (res !== NormalizationResult.True) return res;
        }
        return this.intersectNormals(here, norm);
      }
      const itv = get(there, "IntersectionType");
      if (itv) {
        for (const part of flatOptions(itv)) {
          const res = this.intersectNormalWithTy(here, part, seenSetTypes);
          if (res !== NormalizationResult.True) return res;
        }
        return NormalizationResult.True;
      }
      if (
        get(there, "GenericType") ||
        get(there, "FreeType") ||
        get(there, "BlockedType") ||
        get(there, "PendingExpansionType") ||
        get(there, "TypeFunctionInstanceType")
      ) {
        const thereNorm = new NormalizedType(b);
        const topNorm = new NormalizedType(b);
        topNorm.tops = b.unknownType;
        thereNorm.tyvars.set(there, topNorm);
        here.isCacheable = false;
        return this.intersectNormals(here, thereNorm);
      }

      const tyvars = here.tyvars;
      here.tyvars = new Map();

      if (get(there, "FunctionType")) {
        const functions = here.functions;
        this.clearNormal(here);
        this.intersectFunctionsWithFunction(functions, there);
        here.functions = functions;
      } else if (get(there, "TableType") || get(there, "MetatableType")) {
        const externTypes = here.externTypes;
        const tables = here.tables;
        this.clearNormal(here);
        // Intersect the table part, which may include the top table type,
        // and the extern types as a shape.
        this.intersectTablesWithTable(tables, there, seenSetTypes);
        if (!externTypes.isNever()) this.intersectExternTypesWithShape(externTypes, there);
        here.tables = tables;
        here.externTypes = externTypes;
      } else if (get(there, "ExternType")) {
        const nct = here.externTypes;
        const tables = here.tables;
        this.clearNormal(here);
        // An extern type intersects with at most one table shape.
        if (tables.size === 0) {
          this.intersectExternTypesWithExternType(nct, there);
          here.externTypes = nct;
        } else if (tables.size === 1) {
          if (nct.isNever()) nct.pushPair(there, new TypeIds());
          else this.intersectExternTypesWithExternType(nct, there);
          this.intersectExternTypesWithShape(nct, tables.front());
          here.externTypes = nct;
        }
      } else if (get(there, "ErrorType")) {
        const errors = here.errors;
        this.clearNormal(here);
        here.errors = get(errors, "ErrorType") ? errors : there;
      } else if (get(there, "PrimitiveType")) {
        const ptv = get(there, "PrimitiveType")!;
        const { booleans, nils, numbers, integers, strings, functions, threads, buffers, tables } = here;
        this.clearNormal(here);
        switch (ptv.type) {
          case PrimitiveKind.Boolean:
            here.booleans = booleans;
            break;
          case PrimitiveKind.NilType:
            here.nils = nils;
            break;
          case PrimitiveKind.Number:
            here.numbers = numbers;
            break;
          case PrimitiveKind.Integer:
            here.integers = integers;
            break;
          case PrimitiveKind.String:
            here.strings = strings;
            break;
          case PrimitiveKind.Thread:
            here.threads = threads;
            break;
          case PrimitiveKind.Buffer:
            here.buffers = buffers;
            break;
          case PrimitiveKind.Function:
            here.functions = functions;
            break;
          case PrimitiveKind.Table:
            here.tables = tables;
            break;
        }
      } else if (get(there, "SingletonType")) {
        const booleans = here.booleans;
        const strings = here.strings;
        this.clearNormal(here);
        if (getSingleton(there, "BooleanSingleton")) here.booleans = this.intersectionOfBools(booleans, there);
        else {
          const ss = getSingleton(there, "StringSingleton")!;
          if (strings.includes(ss.value)) here.strings.singletons.set(ss.value, there);
        }
      } else if (get(there, "NegationType")) {
        const ntv = get(there, "NegationType")!;
        const t = follow(ntv.ty);
        if (get(t, "PrimitiveType")) this.subtractPrimitive(here, ntv.ty);
        else if (get(t, "SingletonType")) this.subtractSingleton(here, follow(ntv.ty));
        else if (get(t, "ExternType")) {
          const res = this.intersectNormalWithNegationTy(t, here);
          if (res === NormalizationResult.HitLimits || res === NormalizationResult.False) return res;
        } else if (get(t, "UnionType")) {
          for (const part of get(t, "UnionType")!.options) {
            const res = this.intersectNormalWithNegationTy(part, here);
            if (res === NormalizationResult.HitLimits || res === NormalizationResult.False) return res;
          }
        } else if (get(t, "AnyType") || get(t, "NoRefineType") || get(t, "NeverType")) {
          // Refinements treat ~any as any; ~*no-refine* and ~never change
          // nothing. As in Luau, the type variables set aside above are not
          // restored on this path.
          return NormalizationResult.True;
        } else if (get(t, "UnknownType")) {
          // ~unknown is never.
          this.clearNormal(here);
          return NormalizationResult.True;
        } else if (get(t, "ErrorType")) {
          // ~error is still an error.
          const errors = here.errors;
          this.clearNormal(here);
          here.errors = get(errors, "ErrorType") ? errors : t;
        } else if (get(t, "NegationType")) {
          here.tyvars = tyvars;
          return this.intersectNormalWithTy(here, get(t, "NegationType")!.ty, seenSetTypes);
        }
        // Negated intersections, tables and functions are not handled.
      } else if (get(there, "NeverType")) {
        here.externTypes.resetToNever();
      } else if (get(there, "NoRefineType")) {
        return NormalizationResult.True;
      }

      const res = this.intersectTyvarsWithTy(tyvars, there, seenSetTypes);
      if (res !== NormalizationResult.True) return res;
      here.tyvars = tyvars;
      return NormalizationResult.True;
    });
  }

  // ------- Back to a type

  typeFromNormal(norm: NormalizedType): TypeId {
    const b = this.builtinTypes;
    if (!get(norm.tops, "NeverType")) return norm.tops;
    const result: TypeId[] = [];
    if (!get(norm.booleans, "NeverType")) result.push(norm.booleans);
    if (isTopExterns(b, norm.externTypes)) {
      if (!norm.externTypes.shapeExtensions.empty()) {
        result.push(this.arena.addType(makeIntersectionType([b.externType, ...norm.externTypes.shapeExtensions])));
      } else {
        result.push(b.externType);
      }
    } else if (!norm.externTypes.isNever()) {
      const parts: TypeId[] = [];
      for (const normTy of norm.externTypes.ordering) {
        const normNegations = norm.externTypes.externTypes.get(normTy)!;
        if (normNegations.empty() && norm.externTypes.shapeExtensions.empty()) parts.push(normTy);
        else {
          const intersection: TypeId[] = [normTy];
          for (const negation of normNegations) intersection.push(this.arena.addType(negationType(negation)));
          for (const shape of norm.externTypes.shapeExtensions) intersection.push(shape);
          parts.push(this.arena.addType(makeIntersectionType(intersection)));
        }
      }
      if (parts.length === 1) result.push(parts[0]!);
      else if (parts.length > 1) result.push(this.arena.addType(makeUnionType(parts)));
    }
    if (!get(norm.errors, "NeverType")) result.push(norm.errors);
    if (norm.functions.isTop) result.push(b.functionType);
    else if (!norm.functions.isNever()) {
      if (norm.functions.parts.size === 1) result.push(norm.functions.parts.front());
      else result.push(this.arena.addType(makeIntersectionType(norm.functions.parts.toArray())));
    }
    if (!get(norm.nils, "NeverType")) result.push(norm.nils);
    if (!get(norm.numbers, "NeverType")) result.push(norm.numbers);
    if (!get(norm.integers, "NeverType")) result.push(norm.integers);
    if (norm.strings.isString()) result.push(b.stringType);
    else if (norm.strings.isUnion()) {
      for (const [, ty] of norm.strings.sortedSingletons()) result.push(ty);
    } else if (norm.strings.isIntersection()) {
      const parts: TypeId[] = [b.stringType];
      for (const [, ty] of norm.strings.sortedSingletons()) parts.push(this.arena.addType(negationType(ty)));
      result.push(this.arena.addType(makeIntersectionType(parts)));
    }
    if (!get(norm.threads, "NeverType")) result.push(b.threadType);
    if (!get(norm.buffers, "NeverType")) result.push(b.bufferType);
    for (const table of norm.tables) result.push(table);
    for (const [tyvar, intersect] of norm.tyvars) {
      if (get(intersect.tops, "NeverType")) {
        const ty = this.typeFromNormal(intersect);
        result.push(addIntersection(this.arena, b, [tyvar, ty]));
      } else result.push(tyvar);
    }
    if (result.length === 0) return b.neverType;
    if (result.length === 1) return result[0]!;
    return this.arena.addType(makeUnionType(result));
  }
}

/** Makes every property of a table (and its metatable) share one type for reading and writing. */
export function makeTableShared(ty: TypeId, seen = new Set<TypeId>()): void {
  ty = follow(ty);
  if (seen.has(ty)) return;
  seen.add(ty);
  const tableTy = get(ty, "TableType");
  if (tableTy) {
    for (const [, prop] of tableTy.props) prop.makeShared();
  } else {
    const mt = get(ty, "MetatableType");
    if (mt) {
      makeTableShared(mt.metatable, seen);
      makeTableShared(mt.table, seen);
    }
  }
}


