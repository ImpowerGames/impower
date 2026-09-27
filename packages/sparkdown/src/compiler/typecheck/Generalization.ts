// Generalization, ported from Luau's `Generalization.h`/`Generalization.cpp`;
// Luau is MIT-licensed (see `LICENSE-luau.txt`).
//
// Once no further constraint can change the free types in a type,
// generalization decides which of them become generics of the enclosing
// function and replaces each of the rest by its bounds. The decision rests on
// the polarities a free type appears with, how often it appears, and whether
// it appears outside any function.

import { IterativeTypeVisitor } from "./IterativeTypeVisitor";
import { subsumes, type Scope } from "./Scope";
import {
  boundType,
  boundTypePack,
  emplaceType,
  emplaceTypePack,
  flatOptions,
  follow,
  followPack,
  genericType,
  genericTypePack,
  get,
  getPack,
  getTail,
  intersectionType,
  invertPolarity,
  is,
  isNegative,
  isPositive,
  Polarity,
  TableState,
  Type,
  unionType,
  type BuiltinTypes,
  type TypeArena,
  type TypeId,
  type TypePackId,
  type TypeVariant,
} from "./Type";
import { TypeIds } from "./TypeIds";
import { IntersectionBuilder, UnionBuilder } from "./TypeUtils";

/**
 * How a free type or pack is used within the type being generalized: whether
 * it appears outside any function, how many times it appears, and the
 * polarities it appears with.
 */
export interface GeneralizationParams {
  foundOutsideFunctions: boolean;
  useCount: number;
  polarity: Polarity;
}

export interface GeneralizationResult<T> {
  /** Undefined when there was nothing to generalize; Luau's `operator bool` tests this field. */
  result: T | undefined;
  /** True if the provided type was replaced with a generic. */
  wasReplacedByGeneric: boolean;
  resourceLimitsExceeded: boolean;
}

function generalizationResult<T>(result: T | undefined, wasReplacedByGeneric: boolean): GeneralizationResult<T> {
  return { result, wasReplacedByGeneric, resourceLimitsExceeded: false };
}

/** The params recorded for a key, inserting default ones when there are none, as `InsertionOrderedMap::operator[]` does. */
function paramsFor<K>(map: Map<K, GeneralizationParams>, key: K): GeneralizationParams {
  let params = map.get(key);
  if (!params) {
    params = { foundOutsideFunctions: false, useCount: 0, polarity: Polarity.None };
    map.set(key, params);
  }
  return params;
}

// ---------------------------------------------------------------------------
// Removing a type from unions and intersections
// ---------------------------------------------------------------------------

/**
 * Removes `needle` from a union or intersection, and from the unions and
 * intersections among its options or parts, rebinding each one that changes.
 * A union also drops `never` options and an intersection `unknown` parts.
 */
class TypeRemover {
  readonly seen = new Set<TypeId>();

  constructor(
    readonly builtinTypes: BuiltinTypes,
    readonly arena: TypeArena,
    readonly needle: TypeId,
  ) {}

  process(item: TypeId): void {
    item = follow(item);

    // A type already visited, or outside this arena, is not mutated.
    if (this.seen.has(item) || item.owningArena !== this.arena || item.persistent) return;
    this.seen.add(item);

    const ut = get(item, "UnionType");
    const it = get(item, "IntersectionType");
    if (ut) {
      const newOptions = new TypeIds();
      for (const o of ut.options) {
        this.process(o);
        const option = follow(o);
        if (option !== this.needle && !is(option, "NeverType") && option !== item) newOptions.insert(option);
      }
      if (ut.options.length !== newOptions.size) {
        if (newOptions.empty()) emplaceType(item, boundType(this.builtinTypes.neverType));
        else if (newOptions.size === 1) emplaceType(item, boundType(newOptions.front()));
        else emplaceType(item, boundType(this.arena.addType(unionType(newOptions.take()))));
      }
    } else if (it) {
      const newParts = new TypeIds();
      for (const p of it.parts) {
        this.process(p);
        const part = follow(p);
        if (part !== this.needle && !is(part, "UnknownType") && part !== item) newParts.insert(part);
      }
      if (it.parts.length !== newParts.size) {
        if (newParts.empty()) emplaceType(item, boundType(this.builtinTypes.unknownType));
        else if (newParts.size === 1) emplaceType(item, boundType(newParts.front()));
        else emplaceType(item, boundType(this.arena.addType(intersectionType(newParts.take()))));
      }
    }
  }
}

function removeType(arena: TypeArena, builtinTypes: BuiltinTypes, haystack: TypeId, needle: TypeId): void {
  const tr = new TypeRemover(builtinTypes, arena, needle);
  tr.process(haystack);
}

// ---------------------------------------------------------------------------
// Collapsing free types whose bounds meet
// ---------------------------------------------------------------------------

/**
 * Collects the free types of an arena under a type, without descending into
 * tables, metatables, functions or extern types.
 */
class FreeTypeFinder extends IterativeTypeVisitor {
  readonly freeTys = new TypeIds();

  constructor(readonly arena: TypeArena) {
    super("FreeTypeFinder", /* skipBoundTypes */ true, /* visitOnce */ true);
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    switch (v.kind) {
      case "FreeType":
        if (ty.owningArena !== this.arena) return false;
        this.freeTys.insert(ty);
        return true;
      case "TableType":
      case "MetatableType":
      case "FunctionType":
      case "ExternType":
        return false;
      default:
        return super.visitType(ty, v);
    }
  }
}

function getDirectFreeNeighbor(ty: TypeId): TypeId | undefined {
  ty = follow(ty);
  if (get(ty, "FreeType")) return ty;
  return undefined;
}

/** Binds each free type found under `ty` whose lower and upper bounds are one type to that type. */
function collapseInvariantFreeType(arena: TypeArena, ty: TypeId): void {
  const ftf = new FreeTypeFinder(arena);
  ftf.run(ty);

  for (const t of ftf.freeTys) {
    const ft = get(t, "FreeType")!;

    const ub = follow(ft.upperBound);
    const lb = follow(ft.lowerBound);
    if (ub === lb && ub !== t) emplaceType(t, boundType(ub));
  }
}

/**
 * Walks direct free-type bounds starting from `startTy`. If a cycle is
 * reachable, every member collapses into one representative free type whose
 * bounds are the union of every member's external lower bound and the
 * intersection of every member's external upper bound. Cycle
 * self-references, whether direct or nested in unions and intersections, are
 * stripped from those bounds.
 *
 * A direct bound is a lower or upper bound that is itself a free type, not
 * one nested inside a union, intersection, table or function. Cycles formed by
 * direct bounds (A -> B -> ... -> A) are the only cycles detected; chains
 * without a cycle are left alone. Before the walk, each free type under
 * `startTy` whose bounds are one type is bound to that type.
 *
 * Returns true if any types were collapsed.
 */
function collapseDirectBoundCycleAt(arena: TypeArena, builtinTypes: BuiltinTypes, startTy: TypeId): boolean {
  collapseInvariantFreeType(arena, startTy);

  startTy = follow(startTy);

  if (!get(startTy, "FreeType")) return false;

  const path = new TypeIds();
  let cur: TypeId | undefined = startTy;

  while (cur) {
    if (path.contains(cur)) {
      // The cycle's members are everything on the path from `cur` onward.
      const cycleMembers = new TypeIds();
      let inCycle = false;
      for (const member of path) {
        if (member === cur) inCycle = true;
        if (inCycle) cycleMembers.insert(member);
      }

      // Merges the external bounds of every member into the representative:
      // lower bounds union and upper bounds intersect. Bounds that are
      // entirely cycle self-references are skipped.
      const mergedLowers = new UnionBuilder(arena, builtinTypes);
      const mergedUppers = new IntersectionBuilder(arena, builtinTypes);

      for (const m of cycleMembers) {
        const ft = get(m, "FreeType");
        if (!ft) continue;

        let lb = follow(ft.lowerBound);
        if (!cycleMembers.contains(lb)) {
          for (const other of cycleMembers) removeType(arena, builtinTypes, lb, other);
          lb = follow(lb);
          if (!get(lb, "NeverType") && !cycleMembers.contains(lb)) mergedLowers.add(lb);
        }

        let ub = follow(ft.upperBound);
        if (!cycleMembers.contains(ub)) {
          for (const other of cycleMembers) removeType(arena, builtinTypes, ub, other);
          ub = follow(ub);
          if (!get(ub, "UnknownType") && !cycleMembers.contains(ub)) mergedUppers.add(ub);
        }
      }

      // The back-edge target (the first member, `cur`) is the representative:
      // it takes the merged bounds, and the other members are bound to it.
      const rep = cycleMembers.front();
      const repFree = get(rep, "FreeType")!;

      repFree.lowerBound = mergedLowers.build();
      repFree.upperBound = mergedUppers.build();

      const members = cycleMembers.toArray();
      for (let i = 1; i < members.length; ++i) emplaceType(members[i]!, boundType(rep));

      return true;
    }

    path.insert(cur);

    const ft = get(cur, "FreeType");
    if (!ft) break;

    // Follows a direct free-type bound, preferring the upper bound to the lower.
    let next = getDirectFreeNeighbor(ft.upperBound);
    if (!next || next === cur) next = getDirectFreeNeighbor(ft.lowerBound);
    if (next === cur) next = undefined;

    cur = next;
  }

  return false;
}

/**
 * Collapses the direct-bound cycles among the free types found for
 * generalization. The order does not matter: once a cycle has been
 * collapsed, a walk from any of its members stops at once, because the member
 * is bound to the representative or the representative's bounds no longer
 * name cycle members.
 */
function collapseFreeTypeCycles(arena: TypeArena, builtinTypes: BuiltinTypes, freeTypes: Map<TypeId, GeneralizationParams>): void {
  for (const [startTy] of freeTypes) collapseDirectBoundCycleAt(arena, builtinTypes, startTy);
}

// ---------------------------------------------------------------------------
// Finding free types and generics with their polarity
// ---------------------------------------------------------------------------

interface WorkItem {
  value: TypeId | TypePackId;
  polarity: Polarity;
  isWithinFunction: boolean;
}

/**
 * Walks every type reachable from a root to find the polarity of each free
 * type and generic it reaches.
 *
 * Each type is visited at most once from a negative position and once from a
 * positive one; a mixed position visits both at once. The work list is a
 * stack, so the walk is depth-first, and the order it first meets free types
 * in is the order they are generalized in. The walk stops at the edges of the
 * target arena: types outside it do not decide the polarity of free types or
 * generics during generalization.
 */
class FindTypesWithPolarity {
  readonly seenPositive = new Set<object>();
  readonly seenNegative = new Set<object>();

  readonly types = new Map<TypeId, GeneralizationParams>();
  readonly typePacks = new Map<TypePackId, GeneralizationParams>();

  readonly unsealedTables = new Set<TypeId>();

  work: WorkItem[] = [];

  constructor(
    readonly targetArena: TypeArena,
    readonly scope: Scope,
  ) {}

  seenWithPolarity(ty: object, polarity: Polarity): boolean {
    switch (polarity) {
      case Polarity.Positive:
        return this.seenPositive.has(ty);
      case Polarity.Negative:
        return this.seenNegative.has(ty);
      case Polarity.Mixed:
        return this.seenPositive.has(ty) && this.seenNegative.has(ty);
      default:
        break;
    }
    // Only reached for a polarity that is not positive, negative or mixed.
    return true;
  }

  observe(ty: object, polarity: Polarity): void {
    if (isPositive(polarity)) this.seenPositive.add(ty);

    if (isNegative(polarity)) this.seenNegative.add(ty);
  }

  pushPack(tp: TypePackId, polarity: Polarity, isWithinFunction: boolean): void {
    tp = followPack(tp);
    // Types this arena does not own do not decide polarity.
    if (!this.seenWithPolarity(tp, polarity) && tp.owningArena === this.targetArena) {
      this.observe(tp, polarity);
      this.work.push({ value: tp, polarity, isWithinFunction });
    }
  }

  push(ty: TypeId, polarity: Polarity, isWithinFunction: boolean): void {
    ty = follow(ty);
    // Types this arena does not own do not decide polarity.
    if (!this.seenWithPolarity(ty, polarity) && ty.owningArena === this.targetArena) {
      this.observe(ty, polarity);
      this.work.push({ value: ty, polarity, isWithinFunction });
    }
  }

  stepType(ty: TypeId, polarity: Polarity, isWithinFunction: boolean): void {
    const v = ty.ty;
    switch (v.kind) {
      case "FreeType": {
        if (subsumes(this.scope, v.scope)) {
          const params = paramsFor(this.types, ty);
          params.useCount++;
          if (!isWithinFunction) params.foundOutsideFunctions = true;

          params.polarity |= polarity;
        }

        this.push(v.lowerBound, polarity, isWithinFunction);
        this.push(v.upperBound, polarity, isWithinFunction);
        break;
      }
      case "GenericType": {
        const params = paramsFor(this.types, ty);
        params.useCount++;
        params.polarity |= polarity;
        break;
      }
      case "FunctionType":
        this.pushPack(v.argTypes, invertPolarity(polarity), true);
        this.pushPack(v.retTypes, polarity, true);
        break;
      case "TableType":
        if ((v.state === TableState.Free || v.state === TableState.Unsealed) && subsumes(this.scope, v.scope)) this.unsealedTables.add(ty);

        if (v.indexer) {
          const p = v.indexer.isReadOnly ? polarity : Polarity.Mixed;
          this.push(v.indexer.indexResultType, p, isWithinFunction);
          this.push(v.indexer.indexType, p, isWithinFunction);
        }

        for (const [, prop] of v.props) {
          if (prop.isShared()) this.push(prop.readTy!, Polarity.Mixed, isWithinFunction);
          else {
            if (prop.readTy) this.push(prop.readTy, polarity, isWithinFunction);
            if (prop.writeTy) this.push(prop.writeTy, invertPolarity(polarity), isWithinFunction);
          }
        }
        break;
      case "LazyType":
        if (v.unwrapped) this.push(v.unwrapped, polarity, isWithinFunction);
        break;
      case "MetatableType":
        this.push(v.metatable, polarity, isWithinFunction);
        this.push(v.table, polarity, isWithinFunction);
        break;
      case "UnionType":
        for (const option of flatOptions(v)) this.push(option, polarity, isWithinFunction);
        break;
      case "IntersectionType":
        for (const part of flatOptions(v)) this.push(part, polarity, isWithinFunction);
        break;
      case "NegationType":
        this.push(v.ty, polarity, isWithinFunction);
        break;
      case "TypeFunctionInstanceType":
        for (const typeArg of v.typeArguments) this.push(typeArg, polarity, isWithinFunction);

        for (const packArg of v.packArguments) this.pushPack(packArg, polarity, isWithinFunction);
        break;
      default:
        // Pending expansion, blocked, error, primitive, singleton, any,
        // no-refine, unknown, never and extern types lead nowhere.
        break;
    }
  }

  stepTypePack(tp: TypePackId, polarity: Polarity, isWithinFunction: boolean): void {
    const v = tp.ty;
    switch (v.kind) {
      case "FreeTypePack":
        if (subsumes(this.scope, v.scope)) {
          const params = paramsFor(this.typePacks, tp);
          params.useCount++;

          if (!isWithinFunction) params.foundOutsideFunctions = true;

          params.polarity |= polarity;
        }
        break;
      case "TypePack":
        for (const hd of v.head) this.push(hd, polarity, isWithinFunction);

        if (v.tail) this.pushPack(v.tail, polarity, isWithinFunction);
        break;
      case "VariadicTypePack":
        this.push(v.ty, polarity, isWithinFunction);
        break;
      case "TypeFunctionInstanceTypePack":
        for (const typeArg of v.typeArguments) this.push(typeArg, polarity, isWithinFunction);

        for (const packArg of v.packArguments) this.pushPack(packArg, polarity, isWithinFunction);
        break;
      case "GenericTypePack": {
        const params = paramsFor(this.typePacks, tp);
        params.useCount++;
        params.polarity |= polarity;
        break;
      }
      default:
        // Blocked and error packs lead nowhere.
        break;
    }
  }

  run(ty: TypeId): void {
    this.work = [];
    this.seenNegative.clear();
    this.seenPositive.clear();
    this.types.clear();
    this.typePacks.clear();
    this.push(ty, Polarity.Positive, false);

    while (this.work.length > 0) {
      const item = this.work.pop()!;
      if (item.value instanceof Type) this.stepType(item.value, item.polarity, item.isWithinFunction);
      else this.stepTypePack(item.value, item.polarity, item.isWithinFunction);
    }
  }
}

// ---------------------------------------------------------------------------
// Generalization
// ---------------------------------------------------------------------------

/** Replaces a single free type by its bounds according to the polarity provided. */
export function generalizeType(
  arena: TypeArena,
  builtinTypes: BuiltinTypes,
  scope: Scope,
  freeTy: TypeId,
  params: GeneralizationParams,
): GeneralizationResult<TypeId> {
  freeTy = follow(freeTy);

  // Collapses any direct-bound cycle this free type is part of before
  // deciding how to generalize it. This covers the solver's own calls, which
  // bypass the batch pass in `generalize`, and does nothing when that pass has
  // already collapsed the cycle. `freeTy` may now be bound to the cycle's
  // representative, so it is followed again.
  collapseDirectBoundCycleAt(arena, builtinTypes, freeTy);
  freeTy = follow(freeTy);

  const ft = get(freeTy, "FreeType");
  if (!ft) return generalizationResult(freeTy, /* wasReplacedByGeneric */ false);

  const hasLowerBound = !get(follow(ft.lowerBound), "NeverType");
  const hasUpperBound = !get(follow(ft.upperBound), "UnknownType");

  const isWithinFunction = !params.foundOutsideFunctions;

  if (!hasLowerBound && !hasUpperBound) {
    if (!isWithinFunction) emplaceType(freeTy, boundType(builtinTypes.unknownType));
    else {
      emplaceType(freeTy, genericType({ scope, polarity: params.polarity }));
      return generalizationResult(freeTy, /* wasReplacedByGeneric */ true);
    }
  }
  // This free type may have other free types in its upper or lower bounds.
  // Those references are replaced with never (for the lower bound) or unknown
  // (for the upper bound); otherwise the bounds come out tautological, like
  // a <: a <: unknown.
  else if (isPositive(params.polarity) && !hasUpperBound) {
    const lb = follow(ft.lowerBound);
    removeType(arena, builtinTypes, lb, freeTy);

    if (follow(lb) !== freeTy) emplaceType(freeTy, boundType(lb));
    else if (!isWithinFunction) emplaceType(freeTy, boundType(builtinTypes.unknownType));
    else {
      // A lower bound that is the type in question ('a <: 'a) is no lower bound at all.
      emplaceType(freeTy, genericType({ scope, polarity: params.polarity }));
      return generalizationResult(freeTy, /* wasReplacedByGeneric */ true);
    }
  } else {
    const ub = follow(ft.upperBound);
    // `collapseDirectBoundCycleAt` has already collapsed any 2-cycle here, so
    // there is no neighbor bound to forward: the free type is only stripped
    // from the upper bound.
    removeType(arena, builtinTypes, ub, freeTy);

    if (follow(ub) !== freeTy) emplaceType(freeTy, boundType(ub));
    else if (!isWithinFunction || params.useCount === 1) {
      // A free type A <: 'b <: C generalizes approximately to the
      // intersection of its bounds. The free type is clipped from the upper
      // and lower bounds, and from the resulting intersection, so that no
      // degenerate union or intersection is built.
      removeType(arena, builtinTypes, ft.lowerBound, freeTy);
      const cleanedTy = arena.addType(intersectionType([ft.lowerBound, ub]));
      removeType(arena, builtinTypes, cleanedTy, freeTy);
      emplaceType(freeTy, boundType(cleanedTy));
    } else {
      // An upper bound that is the type in question is no upper bound at all.
      emplaceType(freeTy, genericType({ scope, polarity: params.polarity }));
      return generalizationResult(freeTy, /* wasReplacedByGeneric */ true);
    }
  }

  return generalizationResult(freeTy, /* wasReplacedByGeneric */ false);
}

/** Generalizes one type pack. */
export function generalizeTypePack(
  arena: TypeArena,
  builtinTypes: BuiltinTypes,
  scope: Scope,
  tp: TypePackId,
  params: GeneralizationParams,
): GeneralizationResult<TypePackId> {
  tp = followPack(tp);

  if (tp.owningArena !== arena) return generalizationResult(tp, /* wasReplacedByGeneric */ false);

  const ftp = getPack(tp, "FreeTypePack");
  if (!ftp) return generalizationResult(tp, /* wasReplacedByGeneric */ false);

  if (!subsumes(scope, ftp.scope)) return generalizationResult(tp, /* wasReplacedByGeneric */ false);

  if (1 === params.useCount) emplaceTypePack(tp, boundTypePack(builtinTypes.unknownTypePack));
  else {
    emplaceTypePack(tp, genericTypePack({ scope, polarity: params.polarity }));
    return generalizationResult(tp, /* wasReplacedByGeneric */ true);
  }

  return generalizationResult(tp, /* wasReplacedByGeneric */ false);
}

/** Seals a free or unsealed table that belongs to `scope` or a scope within it. */
export function sealTable(scope: Scope, ty: TypeId): void {
  const tableTy = get(follow(ty), "TableType");
  if (!tableTy) return;

  if (!subsumes(scope, tableTy.scope)) return;

  if (tableTy.state === TableState.Unsealed || tableTy.state === TableState.Free) tableTy.state = TableState.Sealed;
}

/**
 * Attempts to generalize a type.
 *
 * If `generalizationTarget` is set, only that type is replaced by its bounds.
 * Then `ty` is some function that is not fully generalized, and
 * `generalizationTarget` is a type within its signature whose bounds no
 * further constraint can affect.
 *
 * Returns undefined if generalization failed due to resource limits.
 */
export function generalize(
  arena: TypeArena,
  builtinTypes: BuiltinTypes,
  scope: Scope,
  _cachedTypes: Set<TypeId>,
  ty: TypeId,
  generalizationTarget?: TypeId,
): TypeId | undefined {
  ty = follow(ty);

  if (ty.owningArena !== arena || ty.persistent) return ty;

  const ftwp = new FindTypesWithPolarity(arena, scope);
  ftwp.run(ty);

  const functionTy = get(ty, "FunctionType");
  const pushGeneric = (t: TypeId): void => {
    if (functionTy) functionTy.generics.push(t);
  };

  const pushGenericPack = (tp: TypePackId): void => {
    if (functionTy) functionTy.genericPacks.push(tp);
  };

  if (!generalizationTarget) collapseFreeTypeCycles(arena, builtinTypes, ftwp.types);

  const generalizeJustOne = (freeTy: TypeId, params: GeneralizationParams): GeneralizationResult<TypeId> => {
    if (!get(follow(freeTy), "FreeType")) return { result: undefined, wasReplacedByGeneric: false, resourceLimitsExceeded: false };

    const res = generalizeType(arena, builtinTypes, scope, freeTy, params);

    if (res.resourceLimitsExceeded) return res;

    if (res.result !== undefined && res.wasReplacedByGeneric) pushGeneric(res.result);

    return res;
  };

  if (generalizationTarget) {
    const params = ftwp.types.get(generalizationTarget);
    if (params) {
      const res = generalizeJustOne(generalizationTarget, params);
      if (res.resourceLimitsExceeded) return undefined;
    }
  } else {
    for (const [freeTy, params] of ftwp.types) {
      const res = generalizeJustOne(freeTy, params);
      if (res.resourceLimitsExceeded) return undefined;
    }
  }

  for (const unsealedTableTy of ftwp.unsealedTables) {
    if (generalizationTarget && unsealedTableTy !== generalizationTarget) continue;

    sealTable(scope, unsealedTableTy);
  }

  for (const [freePackId, params] of ftwp.typePacks) {
    const freePack = followPack(freePackId);
    if (!generalizationTarget) {
      const generalizedTp = generalizeTypePack(arena, builtinTypes, scope, freePack, params);

      if (generalizedTp.resourceLimitsExceeded) return undefined;

      if (generalizedTp.result !== undefined && generalizedTp.wasReplacedByGeneric) pushGenericPack(freePack);
    }
  }

  return ty;
}

/**
 * Trims the generics of a generalized function to the ones it needs. Entries
 * that are no longer generic, duplicates, and unnamed generics the function
 * never mentions are dropped. An unnamed generic seen only in positive
 * positions becomes `never`, one seen only in negative positions becomes
 * `unknown`, and an unnamed generic pack seen with a single polarity becomes
 * `unknown...`. Explicitly named generics stay, taking the polarity they are
 * seen with.
 */
export function pruneUnnecessaryGenerics(
  arena: TypeArena,
  builtinTypes: BuiltinTypes,
  scope: Scope,
  _cachedTypes: Set<TypeId>,
  ty: TypeId,
): void {
  ty = follow(ty);

  if (ty.owningArena !== arena || ty.persistent) return;

  const functionTy = get(ty, "FunctionType");

  if (!functionTy) return;

  const ftwp = new FindTypesWithPolarity(arena, scope);
  ftwp.run(ty);

  const seenTypes = new Set<TypeId>();
  const seenPacks = new Set<TypePackId>();

  // A pack in the generic list may have become a pack that (transitively) has
  // a generic tail. That tail then joins the generic pack list.
  for (let i = 0; i < functionTy.genericPacks.length; ++i) {
    const genericPack = followPack(functionTy.genericPacks[i]!);

    const tail = getTail(genericPack);

    if (tail !== genericPack) functionTy.genericPacks.push(tail);
  }

  for (let i = 0; i < functionTy.generics.length; ) {
    const generic = follow(functionTy.generics[i]!);
    const genericTy = get(generic, "GenericType");

    if (!genericTy) {
      // This type is no longer generic, so it is clipped.
      functionTy.generics.splice(i, 1);
      continue;
    }

    if (seenTypes.has(generic)) {
      functionTy.generics.splice(i, 1);
      continue;
    }

    if (arena !== generic.owningArena) {
      // Generics from other arenas should never flow into the generics of a
      // function being generalized; any that do are left in place.
      i++;
      continue;
    }

    const entry = ftwp.types.get(generic);

    if (genericTy.explicitName) {
      // The user said this should be generic, so it is.
      seenTypes.add(generic);
      if (entry) genericTy.polarity = entry.polarity;
      i++;
      continue;
    }

    if (!entry) {
      // The function never mentions this generic, so it is clipped.
      functionTy.generics.splice(i, 1);
      continue;
    }

    switch (entry.polarity) {
      case Polarity.Positive:
        // A generic seen only in positive positions is clipped to `never`.
        emplaceType(generic, boundType(builtinTypes.neverType));
        functionTy.generics.splice(i, 1);
        break;

      case Polarity.Negative:
        // A generic seen only in negative positions is clipped to `unknown`.
        emplaceType(generic, boundType(builtinTypes.unknownType));
        functionTy.generics.splice(i, 1);
        break;

      case Polarity.Mixed:
        genericTy.polarity = Polarity.Mixed;
        seenTypes.add(generic);
        i++;
        break;

      case Polarity.None:
      case Polarity.Unknown:
        // An entry in `ftwp.types` always has some polarity recorded.
        i++;
        break;
    }
  }

  for (let i = 0; i < functionTy.genericPacks.length; ) {
    const generic = followPack(functionTy.genericPacks[i]!);

    const genericTy = getPack(generic, "GenericTypePack");

    if (!genericTy) {
      // This pack is no longer generic, so it is clipped.
      functionTy.genericPacks.splice(i, 1);
      continue;
    }

    if (seenPacks.has(generic)) {
      functionTy.genericPacks.splice(i, 1);
      continue;
    }

    if (arena !== generic.owningArena) {
      // Generics from other arenas should never flow into the generics of a
      // function being generalized; any that do are left in place.
      i++;
      continue;
    }

    const entry = ftwp.typePacks.get(generic);

    if (genericTy.explicitName) {
      // The user said this should be generic, so it is.
      seenPacks.add(generic);
      if (entry) genericTy.polarity = entry.polarity;
      i++;
      continue;
    }

    if (!entry) {
      // The function never mentions this generic pack, so it is clipped.
      functionTy.genericPacks.splice(i, 1);
      continue;
    }

    switch (entry.polarity) {
      case Polarity.Positive:
      case Polarity.Negative:
        // `never...` would also do here; `unknown...` is used.
        emplaceTypePack(generic, boundTypePack(builtinTypes.unknownTypePack));
        functionTy.genericPacks.splice(i, 1);
        break;

      case Polarity.Mixed:
        genericTy.polarity = Polarity.Mixed;
        seenPacks.add(generic);
        i++;
        break;

      case Polarity.None:
      case Polarity.Unknown:
        i++;
        break;
    }
  }
}
