// Unification for the new solver, ported from Luau's `Unifier2.h`/
// `Unifier2.cpp`; Luau is MIT-licensed (see `LICENSE-luau.txt`).
//
// `unify` commits the relation "subtype <: supertype" to the type graph: it
// widens the lower bounds and narrows the upper bounds of the free types it
// meets, and binds free type packs. It does no type checking. Incoherent
// types unify successfully: unification stops when it cannot know how to
// relate two types, not when relating them would narrow something to never
// or widen it to unknown. It fails only when binding a free type pack fails
// the occurs check, or when the types are too complex.

import type { ConstraintV } from "./Constraint";
import { Replacer } from "./Instantiation2";
import type { Scope } from "./Scope";
import { simplifyIntersection, simplifyUnion } from "./Simplify";
import {
  boundTypePack,
  emplaceTypePack,
  flatOptions,
  flatten,
  follow,
  followPack,
  freshType,
  get,
  getPack,
  InternalCompilerError,
  isOptional,
  isPack,
  TableIndexer,
  TableState,
  TypeFunctionInstanceState,
  type AnyType,
  type BuiltinTypes,
  type FunctionType,
  type IntersectionType,
  type MetatableType,
  type Polarity,
  type Property,
  type TableType,
  type TypeArena,
  type TypeId,
  type TypePack,
  type TypePackId,
  type UnionType,
} from "./Type";
import type { TypeCheckLimits } from "./TypeFunction";
import { TypeIds } from "./TypeIds";
import { OccursCheckResult, occursCheckPack } from "./TypeUtils";

// Luau's `LuauTypeInferIterationLimit` and `LuauUnifierRecursionLimit`.
const TYPE_INFER_ITERATION_LIMIT = 20000;
const UNIFIER_RECURSION_LIMIT = 100;

export const enum UnifyResult {
  Ok,
  OccursCheckFailed,
  TooComplex,
}

/** Luau's `operator&` on unification results: the first failure wins. */
export function andUnifyResult(lhs: UnifyResult, rhs: UnifyResult): UnifyResult {
  if (lhs === UnifyResult.Ok) return rhs;
  return lhs;
}

function pairKey(a: { serial: number }, b: { serial: number }): string {
  return `${a.serial},${b.serial}`;
}

function isOptionalOrFree(ty: TypeId): boolean {
  ty = follow(ty);
  return isOptional(ty) || get(ty, "FreeType") !== undefined;
}

function areCompatible(left: TypeId, right: TypeId): boolean {
  const leftTable = get(follow(left), "TableType");
  const rightTable = get(follow(right), "TableType");
  if (!leftTable || !rightTable) return true;

  const missingPropIsCompatible = (leftProp: Property, rightTable: TableType): boolean => {
    // Two tables may be compatible even if their shapes differ, when the
    // extra property is optional, or free (and so potentially optional), or
    // when the other table has an indexer, or is free (and so potentially
    // has an indexer or a compatible property).
    if (rightTable.state === TableState.Free || rightTable.indexer !== undefined) return true;

    if (leftProp.isReadOnly() || leftProp.isShared()) {
      if (isOptionalOrFree(leftProp.readTy!)) return true;
    }

    // A missing write-only or divergent property is never compatible.
    return false;
  };

  for (const [name, leftProp] of leftTable.props) {
    if (!rightTable.props.has(name)) {
      if (!missingPropIsCompatible(leftProp, rightTable)) return false;
    }
  }

  for (const [name, rightProp] of rightTable.props) {
    if (!leftTable.props.has(name)) {
      if (!missingPropIsCompatible(rightProp, leftTable)) return false;
    }
  }

  return true;
}

/** Whether a type is irresolvable, so that relating it to another becomes an incomplete subtype constraint. */
function isIrresolvable(ty: TypeId): boolean {
  const tfit = get(ty, "TypeFunctionInstanceType");
  if (tfit && tfit.state !== TypeFunctionInstanceState.Unsolved) return false;

  return get(ty, "BlockedType") !== undefined || get(ty, "TypeFunctionInstanceType") !== undefined;
}

/** Whether a pack is irresolvable, so that relating it to another becomes an incomplete subtype constraint. */
function isIrresolvablePack(tp: TypePackId): boolean {
  return getPack(tp, "BlockedTypePack") !== undefined || getPack(tp, "TypeFunctionInstanceTypePack") !== undefined;
}

/**
 * Luau's `TypePackIterator` (from `TypePack.h`): it walks the head types of a
 * pack and of its tails, following each tail only when the walk reaches it,
 * so a tail bound while the walk is under way is walked into. An iterator
 * made without a pack is the end iterator.
 */
class TypePackIterator {
  private currentTypePack: TypePackId | undefined;
  private tp: TypePack | undefined;
  private currentIndex = 0;

  constructor(typePack?: TypePackId) {
    if (!typePack) return;
    this.currentTypePack = followPack(typePack);
    this.tp = getPack(this.currentTypePack, "TypePack");
    while (this.tp && this.tp.head.length === 0) {
      this.currentTypePack = this.tp.tail ? followPack(this.tp.tail) : undefined;
      this.tp = this.currentTypePack ? getPack(this.currentTypePack, "TypePack") : undefined;
    }
  }

  /** A copy that advances independently, as a C++ iterator passed by value. */
  clone(): TypePackIterator {
    const copy = new TypePackIterator();
    copy.currentTypePack = this.currentTypePack;
    copy.tp = this.tp;
    copy.currentIndex = this.currentIndex;
    return copy;
  }

  /** Luau's `operator++`. */
  advance(): void {
    ++this.currentIndex;
    while (this.tp && this.currentIndex >= this.tp.head.length) {
      this.currentTypePack = this.tp.tail ? followPack(this.tp.tail) : undefined;
      this.tp = this.currentTypePack ? getPack(this.currentTypePack, "TypePack") : undefined;

      if (this.tp) {
        // Stepping twice on each iteration detects cycles.
        const tailCycleCheck = this.tp.tail ? followPack(this.tp.tail) : undefined;
        if (this.currentTypePack === tailCycleCheck) throw new InternalCompilerError("TypePackIterator detected a type pack cycle");
      }

      this.currentIndex = 0;
    }
  }

  /** Luau's `operator==`. */
  equals(rhs: TypePackIterator): boolean {
    return this.tp === rhs.tp && this.currentIndex === rhs.currentIndex;
  }

  /** Luau's `operator*`: the type the iterator points at. */
  current(): TypeId {
    return this.tp!.head[this.currentIndex]!;
  }

  /** The pack the iterator points at the head of, when it points at the head of one. */
  tryGetHead(): TypePackId | undefined {
    if (this.currentIndex === 0) return this.currentTypePack;
    else return undefined;
  }

  /** Where an iterator at the end stopped: the pack's tail, or undefined for a pack of fixed length. */
  tail(): TypePackId | undefined {
    return this.currentTypePack;
  }
}

export class Unifier2 {
  readonly arena: TypeArena;
  readonly builtinTypes: BuiltinTypes;
  readonly scope: Scope;
  limits: TypeCheckLimits = {};

  /** The pairs of types and of packs already unified, keyed by their serials. */
  seenTypePairings = new Set<string>();
  seenTypePackPairings = new Set<string>();

  expandedFreeTypes = new Map<TypeId, TypeId[]>();

  /** Maps generic types to the free types that instantiate them. */
  genericSubstitutions = new Map<TypeId, TypeId>();
  /** Maps generic type packs to the packs of free types that instantiate them. */
  genericPackSubstitutions = new Map<TypePackId, TypePackId>();

  /** The free types and packs unification creates, for other systems to do their bookkeeping. */
  newFreshTypes: TypeId[] = [];
  newFreshTypePacks: TypePackId[] = [];

  iterationCount = 0;
  recursionCount = 0;
  recursionLimit = UNIFIER_RECURSION_LIMIT;

  incompleteSubtypes: ConstraintV[] = [];
  /** Undefined outside constraint solving. */
  uninhabitedTypeFunctions: Set<object> | undefined;

  constructor(arena: TypeArena, builtinTypes: BuiltinTypes, scope: Scope, uninhabitedTypeFunctions?: Set<object>) {
    this.arena = arena;
    this.builtinTypes = builtinTypes;
    this.scope = scope;
    this.uninhabitedTypeFunctions = uninhabitedTypeFunctions;
  }

  unify(subTy: TypeId, superTy: TypeId): UnifyResult {
    this.iterationCount = 0;
    return this.unify_(subTy, superTy);
  }

  unifyPack(subTp: TypePackId, superTp: TypePackId): UnifyResult {
    this.iterationCount = 0;
    return this.unifyPack_(subTp, superTp);
  }

  /** Luau's `NonExceptionalRecursionLimiter::isOk`, less its native stack guard. */
  private recursionIsOk(): boolean {
    return !(this.recursionLimit > 0 && this.recursionCount > this.recursionLimit);
  }

  private unify_(subTy: TypeId, superTy: TypeId): UnifyResult {
    if (TYPE_INFER_ITERATION_LIMIT > 0 && this.iterationCount >= TYPE_INFER_ITERATION_LIMIT) return UnifyResult.TooComplex;

    ++this.iterationCount;

    // Running out of recursion depth makes the unification too complex; it
    // does not throw.
    ++this.recursionCount;
    try {
      if (!this.recursionIsOk()) return UnifyResult.TooComplex;

      subTy = follow(subTy);
      superTy = follow(superTy);

      const subGen = this.genericSubstitutions.get(subTy);
      if (subGen) return this.unify_(subGen, superTy);

      const superGen = this.genericSubstitutions.get(superTy);
      if (superGen) return this.unify_(subTy, superGen);

      const pairing = pairKey(subTy, superTy);
      if (this.seenTypePairings.has(pairing)) return UnifyResult.Ok;
      this.seenTypePairings.add(pairing);

      if (subTy === superTy) return UnifyResult.Ok;

      // Dispatching a subtype constraint may already have done some
      // unification, so rather than backtracking or walking the whole type
      // graph again, relating a blocked type becomes a new constraint with
      // its proper bounds. Two relations are tautological and excluded:
      // never <: blocked, and blocked <: unknown.
      if ((isIrresolvable(subTy) || isIrresolvable(superTy)) && !get(subTy, "NeverType") && !get(superTy, "UnknownType")) {
        if (this.uninhabitedTypeFunctions && (this.uninhabitedTypeFunctions.has(subTy) || this.uninhabitedTypeFunctions.has(superTy))) {
          return UnifyResult.Ok;
        }

        this.incompleteSubtypes.push({ kind: "SubtypeConstraint", subType: subTy, superType: superTy });
        return UnifyResult.Ok;
      }

      const subFree = get(subTy, "FreeType");
      const superFree = get(superTy, "FreeType");

      if (superFree) {
        superFree.lowerBound = this.mkUnion(superFree.lowerBound, this.instantiateWithBoundTypes(subTy));
      }

      if (subFree) {
        return this.unifyFreeWithType(subTy, superTy);
      }

      if (subFree || superFree) return UnifyResult.Ok;

      const subFn = get(subTy, "FunctionType");
      const superFn = get(superTy, "FunctionType");
      if (subFn && superFn) return this.unifyFunction(subTy, superFn);

      const subUnion = get(subTy, "UnionType");
      const superUnion = get(superTy, "UnionType");
      if (subUnion) return this.unifyUnionSubtype(subUnion, superTy);
      else if (superUnion) return this.unifyUnionSupertype(subTy, superUnion);

      const subIntersection = get(subTy, "IntersectionType");
      const superIntersection = get(superTy, "IntersectionType");

      if (subIntersection && superIntersection) return this.unifyIntersections(subIntersection, superIntersection);
      else if (subIntersection) return this.unifyIntersectionSubtype(subIntersection, superTy);
      else if (superIntersection) return this.unifyIntersectionSupertype(subTy, superIntersection);

      const subNever = get(subTy, "NeverType");
      const superNever = get(superTy, "NeverType");
      if (subNever && superNever) return UnifyResult.Ok;
      else if (subNever && superFn) {
        // A never subtype propagates inward.
        const argResult = this.unifyPack_(superFn.argTypes, this.builtinTypes.neverTypePack);
        const retResult = this.unifyPack_(this.builtinTypes.neverTypePack, superFn.retTypes);
        return andUnifyResult(argResult, retResult);
      } else if (subFn && superNever) {
        // A never supertype propagates inward.
        const argResult = this.unifyPack_(this.builtinTypes.neverTypePack, subFn.argTypes);
        const retResult = this.unifyPack_(subFn.retTypes, this.builtinTypes.neverTypePack);
        return andUnifyResult(argResult, retResult);
      }

      const subAny = get(subTy, "AnyType");
      const superAny = get(superTy, "AnyType");

      const subTable = get(subTy, "TableType");
      const superTable = get(superTy, "TableType");

      if (subAny && superAny) return UnifyResult.Ok;
      else if (subAny && superFn) return this.unifyAnyWithFunction(subAny, superFn);
      else if (subFn && superAny) return this.unifyFunctionWithAny(subFn, superAny);
      else if (subAny && superTable) return this.unifyAnyWithTable(subAny, superTable);
      else if (subTable && superAny) return this.unifyTableWithAny(subTable, superAny);

      if (subTable && superTable) {
        // A table's `boundTo` works like a bound type, which `follow` has
        // already chased.
        return this.unifyTables(subTable, superTable);
      }

      const subMetatable = get(subTy, "MetatableType");
      const superMetatable = get(superTy, "MetatableType");
      if (subMetatable && superMetatable) return this.unifyMetatables(subMetatable, superMetatable);
      else if (subMetatable && superAny) return this.unifyMetatableWithAny(subMetatable, superAny);
      else if (subAny && superMetatable) return this.unifyAnyWithMetatable(subAny, superMetatable);
      // With only one metatable, its inner table unifies with the other type.
      else if (subMetatable) return this.unify_(subMetatable.table, superTy);
      else if (superMetatable) return this.unify_(subTy, superMetatable.table);

      const subNegation = get(subTy, "NegationType");
      const superNegation = get(superTy, "NegationType");
      if (subNegation && superNegation) return this.unify_(subNegation.ty, superNegation.ty);

      // The unification failed, but this is not type checking.
      return UnifyResult.Ok;
    } finally {
      --this.recursionCount;
    }
  }

  private instantiateWithBoundTypes(ty: TypeId): TypeId {
    const r = new Replacer(this.arena, this.genericSubstitutions, this.genericPackSubstitutions);
    const newTy = r.substitute(ty);
    if (newTy) return newTy;
    return ty;
  }

  private instantiateWithBoundTypesPack(tp: TypePackId): TypePackId {
    const r = new Replacer(this.arena, this.genericSubstitutions, this.genericPackSubstitutions);
    const newTp = r.substitutePack(tp);
    if (newTp) return newTp;
    return tp;
  }

  // When superTy is a function and subTy's upper bound already holds a
  // potentially compatible function, the function is assumed not to be
  // overloaded, and superTy combines into subTy's existing function bound.
  private unifyFreeWithType(subTy: TypeId, superTy: TypeId): UnifyResult {
    const subFree = get(subTy, "FreeType")!;

    const doDefault = (): UnifyResult => {
      const newSuperTy = this.instantiateWithBoundTypes(superTy);
      subFree.upperBound = this.mkIntersection(subFree.upperBound, newSuperTy);
      let expanded = this.expandedFreeTypes.get(subTy);
      if (!expanded) {
        expanded = [];
        this.expandedFreeTypes.set(subTy, expanded);
      }
      expanded.push(newSuperTy);
      return UnifyResult.Ok;
    };

    const upperBound = follow(subFree.upperBound);

    if (get(upperBound, "FunctionType")) return this.unify_(subFree.upperBound, superTy);

    // When superTy is a union or intersection, subTy becomes a lower bound of
    // the members that are free types, or generics substituted by free types.
    // Otherwise `freeA <: 'T | nil` (or `freeA <: 'T & C`) would never
    // constrain 'T, as a free subtype is handled before structural dispatch.
    const propagateToFreeMembers = (memberRange: TypeId[]): void => {
      for (const member of memberRange) {
        let m = follow(member);
        const subst = this.genericSubstitutions.get(m);
        if (subst) m = follow(subst);
        const memberFree = get(m, "FreeType");
        if (memberFree) {
          memberFree.lowerBound = this.mkUnion(memberFree.lowerBound, this.instantiateWithBoundTypes(subTy));
        }
      }
    };

    const superUnion = get(superTy, "UnionType");
    if (superUnion) {
      propagateToFreeMembers(superUnion.options);
      return doDefault();
    }

    const superIntersection = get(superTy, "IntersectionType");
    if (superIntersection) {
      propagateToFreeMembers(superIntersection.parts);
      return doDefault();
    }

    const superFunction = get(superTy, "FunctionType");
    if (!superFunction) return doDefault();

    const { head: superArgHead, tail: superArgTail } = flatten(superFunction.argTypes);
    if (superArgTail) return doDefault();

    const upperBoundIntersection = get(upperBound, "IntersectionType");
    if (!upperBoundIntersection) return doDefault();

    let result = UnifyResult.Ok;
    let foundOne = false;

    for (const part of upperBoundIntersection.parts) {
      const ft = get(follow(part), "FunctionType");
      if (!ft) continue;

      const { head: subArgHead, tail: subArgTail } = flatten(ft.argTypes);

      if (!subArgTail && subArgHead.length === superArgHead.length) {
        foundOne = true;
        result = andUnifyResult(result, this.unify_(part, superTy));
      }
    }

    if (foundOne) return result;
    else return doDefault();
  }

  private unifyFunction(subTy: TypeId, superFn: FunctionType): UnifyResult {
    const subFn = get(subTy, "FunctionType")!;

    const shouldInstantiate =
      (superFn.generics.length === 0 && subFn.generics.length !== 0) || (superFn.genericPacks.length === 0 && subFn.genericPacks.length !== 0);

    if (shouldInstantiate) {
      for (let generic of subFn.generics) {
        generic = follow(generic);
        const gen = get(generic, "GenericType");
        if (gen) this.genericSubstitutions.set(generic, this.freshType(this.scope, gen.polarity));
      }

      for (let genericPack of subFn.genericPacks) {
        genericPack = followPack(genericPack);

        const gen = getPack(genericPack, "GenericTypePack");
        if (gen) this.genericPackSubstitutions.set(genericPack, this.freshTypePack(this.scope, gen.polarity));
      }
    }

    const argResult = this.unifyPack_(superFn.argTypes, subFn.argTypes);
    const retResult = this.unifyPack_(subFn.retTypes, superFn.retTypes);
    return andUnifyResult(argResult, retResult);
  }

  private unifyUnionSubtype(subUnion: UnionType, superTy: TypeId): UnifyResult {
    let result = UnifyResult.Ok;

    // An occurs check failure for any option fails the whole.
    for (const subOption of subUnion.options) {
      if (areCompatible(subOption, superTy)) result = andUnifyResult(result, this.unify_(subOption, superTy));
    }

    return result;
  }

  private unifyUnionSupertype(subTy: TypeId, superUnion: UnionType): UnifyResult {
    subTy = follow(subTy);
    // T <: T | U1 | U2 | ... | Un is trivially true, so unifying gains no information.
    for (const superOption of flatOptions(superUnion)) {
      if (subTy === superOption) return UnifyResult.Ok;
    }

    let result = UnifyResult.Ok;

    // An occurs check failure for any option fails the whole.
    for (const superOption of superUnion.options) {
      if (areCompatible(subTy, superOption)) result = andUnifyResult(result, this.unify_(subTy, superOption));
    }

    return result;
  }

  private unifyIntersections(subIntersection: IntersectionType, superIntersection: IntersectionType): UnifyResult {
    const superIntersectionMembers = new TypeIds(flatOptions(superIntersection));

    const sharedMembers = new TypeIds(flatOptions(subIntersection));

    sharedMembers.retain(superIntersectionMembers);

    let result = UnifyResult.Ok;

    for (const subPart of flatOptions(subIntersection)) {
      if (sharedMembers.contains(subPart)) continue;

      for (const superPart of flatOptions(superIntersection)) {
        if (sharedMembers.contains(superPart)) continue;

        result = andUnifyResult(result, this.unify_(subPart, superPart));
      }
    }

    return result;
  }

  private unifyIntersectionSubtype(subIntersection: IntersectionType, superTy: TypeId): UnifyResult {
    superTy = follow(superTy);
    // T & I1 & I2 & ... & In <: T is trivially true, so unifying gains no information.
    for (const subOption of flatOptions(subIntersection)) {
      if (superTy === subOption) return UnifyResult.Ok;
    }

    let result = UnifyResult.Ok;

    // An occurs check failure for any part fails the whole.
    for (const subPart of subIntersection.parts) result = andUnifyResult(result, this.unify_(subPart, superTy));

    return result;
  }

  private unifyIntersectionSupertype(subTy: TypeId, superIntersection: IntersectionType): UnifyResult {
    let result = UnifyResult.Ok;

    // An occurs check failure for any part fails the whole.
    for (const superPart of superIntersection.parts) result = andUnifyResult(result, this.unify_(subTy, superPart));

    return result;
  }

  private unifyTables(subTable: TableType, superTable: TableType): UnifyResult {
    let result = UnifyResult.Ok;

    // Checking the properties in one direction suffices: there is work to do
    // only for a property present in both tables.
    for (const [propName, subProp] of subTable.props) {
      const superProp = superTable.props.get(propName);

      if (superProp) {
        if (subProp.readTy && superProp.readTy) result = andUnifyResult(result, this.unify_(subProp.readTy, superProp.readTy));

        if (subProp.writeTy && superProp.writeTy) result = andUnifyResult(result, this.unify_(superProp.writeTy, subProp.writeTy));
      }
    }

    const subTypeParams = subTable.instantiatedTypeParams;
    const superTypeParams = superTable.instantiatedTypeParams;

    for (let i = 0; i < subTypeParams.length && i < superTypeParams.length; i++) {
      result = andUnifyResult(result, this.unify_(subTypeParams[i]!, superTypeParams[i]!));
    }

    const subTypePackParams = subTable.instantiatedTypePackParams;
    const superTypePackParams = superTable.instantiatedTypePackParams;

    for (let i = 0; i < subTypePackParams.length && i < superTypePackParams.length; i++) {
      result = andUnifyResult(result, this.unifyPack_(subTypePackParams[i]!, superTypePackParams[i]!));
    }

    if (subTable.indexer && superTable.indexer) {
      result = andUnifyResult(result, this.unify_(subTable.indexer.indexType, superTable.indexer.indexType));
      result = andUnifyResult(result, this.unify_(subTable.indexer.indexResultType, superTable.indexer.indexResultType));

      if (!superTable.indexer.isReadOnly && !subTable.indexer.isReadOnly) {
        result = andUnifyResult(result, this.unify_(superTable.indexer.indexType, subTable.indexer.indexType));
        result = andUnifyResult(result, this.unify_(superTable.indexer.indexResultType, subTable.indexer.indexResultType));
      }
    }

    if (!subTable.indexer && subTable.state === TableState.Unsealed && superTable.indexer) {
      // Unsealed tables come from table literals, whose expression alone
      // cannot tell whether the table has an indexer. An unsealed table
      // reconciled with a table that has an indexer therefore takes on the
      // same indexer.
      subTable.indexer = new TableIndexer(
        this.instantiateWithBoundTypes(superTable.indexer.indexType),
        this.instantiateWithBoundTypes(superTable.indexer.indexResultType),
      );

      subTable.indexer.isReadOnly = superTable.indexer.isReadOnly;
    }

    return result;
  }

  private unifyMetatables(subMetatable: MetatableType, superMetatable: MetatableType): UnifyResult {
    const metatableResult = this.unify_(subMetatable.metatable, superMetatable.metatable);
    if (metatableResult !== UnifyResult.Ok) return metatableResult;
    return this.unify_(subMetatable.table, superMetatable.table);
  }

  private unifyAnyWithFunction(_subAny: AnyType, superFn: FunctionType): UnifyResult {
    // An any subtype propagates inward.
    const argResult = this.unifyPack_(superFn.argTypes, this.builtinTypes.anyTypePack);
    const retResult = this.unifyPack_(this.builtinTypes.anyTypePack, superFn.retTypes);
    return andUnifyResult(argResult, retResult);
  }

  private unifyFunctionWithAny(subFn: FunctionType, _superAny: AnyType): UnifyResult {
    // An any supertype propagates inward.
    const argResult = this.unifyPack_(this.builtinTypes.anyTypePack, subFn.argTypes);
    const retResult = this.unifyPack_(subFn.retTypes, this.builtinTypes.anyTypePack);
    return andUnifyResult(argResult, retResult);
  }

  private unifyAnyWithTable(_subAny: AnyType, superTable: TableType): UnifyResult {
    for (const [, prop] of superTable.props) {
      if (prop.readTy) this.unify_(this.builtinTypes.anyType, prop.readTy);

      if (prop.writeTy) this.unify_(prop.writeTy, this.builtinTypes.anyType);
    }

    if (superTable.indexer) {
      this.unify_(this.builtinTypes.anyType, superTable.indexer.indexType);
      this.unify_(this.builtinTypes.anyType, superTable.indexer.indexResultType);
    }

    return UnifyResult.Ok;
  }

  private unifyTableWithAny(subTable: TableType, _superAny: AnyType): UnifyResult {
    for (const [, prop] of subTable.props) {
      if (prop.readTy) this.unify_(prop.readTy, this.builtinTypes.anyType);

      if (prop.writeTy) this.unify_(this.builtinTypes.anyType, prop.writeTy);
    }

    if (subTable.indexer) {
      this.unify_(subTable.indexer.indexType, this.builtinTypes.anyType);
      this.unify_(subTable.indexer.indexResultType, this.builtinTypes.anyType);
    }

    return UnifyResult.Ok;
  }

  private unifyMetatableWithAny(subMetatable: MetatableType, _superAny: AnyType): UnifyResult {
    const metatableResult = this.unify_(subMetatable.metatable, this.builtinTypes.anyType);
    if (metatableResult !== UnifyResult.Ok) return metatableResult;

    return this.unify_(subMetatable.table, this.builtinTypes.anyType);
  }

  private unifyAnyWithMetatable(_subAny: AnyType, superMetatable: MetatableType): UnifyResult {
    const metatableResult = this.unify_(this.builtinTypes.anyType, superMetatable.metatable);
    if (metatableResult !== UnifyResult.Ok) return metatableResult;

    return this.unify_(this.builtinTypes.anyType, superMetatable.table);
  }

  private unifyPack_(subTp: TypePackId, superTp: TypePackId): UnifyResult {
    if (TYPE_INFER_ITERATION_LIMIT > 0 && this.iterationCount >= TYPE_INFER_ITERATION_LIMIT) return UnifyResult.TooComplex;

    ++this.iterationCount;

    // Running out of recursion depth makes the unification too complex; it
    // does not throw.
    ++this.recursionCount;
    try {
      if (!this.recursionIsOk()) return UnifyResult.TooComplex;

      subTp = followPack(subTp);
      superTp = followPack(superTp);

      const pairing = pairKey(subTp, superTp);
      if (this.seenTypePackPairings.has(pairing)) return UnifyResult.Ok;
      this.seenTypePackPairings.add(pairing);

      if (subTp === superTp) return UnifyResult.Ok;

      const emplaceFreeTypePack = (target: TypePackId, boundTo: TypePackId): UnifyResult => {
        boundTo = this.instantiateWithBoundTypesPack(boundTo);

        if (occursCheckPack(target, boundTo) === OccursCheckResult.Fail) {
          emplaceTypePack(target, boundTypePack(this.builtinTypes.errorTypePack));
          return UnifyResult.OccursCheckFailed;
        }
        emplaceTypePack(target, boundTypePack(boundTo));
        return UnifyResult.Ok;
      };

      // A free pack given directly is bound right away: left for later, its
      // free types could be generalized incorrectly (Luau's CLI-188000).
      if (isPack(subTp, "FreeTypePack")) return emplaceFreeTypePack(subTp, superTp);

      if (isPack(superTp, "FreeTypePack")) return emplaceFreeTypePack(superTp, subTp);

      // The pack an iterator points at the head of, or else a fresh pack of
      // the types from the iterator on.
      const makeTail = (iterArg: TypePackIterator, endIter: TypePackIterator): TypePackId => {
        const iter = iterArg.clone();
        const newSuper = iter.tryGetHead();
        if (newSuper) return newSuper;

        const newHead: TypeId[] = [];
        while (!iter.equals(endIter)) {
          newHead.push(iter.current());
          iter.advance();
        }

        return this.arena.addTypePack(newHead, iter.tail());
      };

      // A blocked pack becomes a constraint for the solver to come back to;
      // other packs unify.
      const deferOrUnify = (subTp: TypePackId, superTp: TypePackId): UnifyResult => {
        if (isIrresolvablePack(subTp) || isIrresolvablePack(superTp)) {
          if (this.uninhabitedTypeFunctions !== undefined && (this.uninhabitedTypeFunctions.has(subTp) || this.uninhabitedTypeFunctions.has(superTp))) {
            return UnifyResult.Ok;
          }

          this.incompleteSubtypes.push({ kind: "PackSubtypeConstraint", subPack: subTp, superPack: superTp, returns: false });
          return UnifyResult.Ok;
        } else return this.unifyPack_(subTp, superTp);
      };

      const maybeReplaceTail = (maybeTp: TypePackId | undefined): TypePackId => {
        if (!maybeTp) return this.builtinTypes.emptyTypePack;

        const tp = followPack(maybeTp);
        const replacement = this.genericPackSubstitutions.get(tp);
        if (replacement) return followPack(replacement);
        return tp;
      };

      const subIter = new TypePackIterator(subTp);
      const subEnd = new TypePackIterator();
      const superIter = new TypePackIterator(superTp);
      const superEnd = new TypePackIterator();

      while (!subIter.equals(subEnd) && !superIter.equals(superEnd)) {
        this.unify_(subIter.current(), superIter.current());
        subIter.advance();
        superIter.advance();
      }

      // When one walk has ended at a variadic tail, the variadic type unifies
      // with each remaining type of the other pack. Two variadic tails are
      // not expanded.
      if (subIter.equals(subEnd) && !superIter.equals(superEnd) && subIter.tail()) {
        const vtp = getPack(followPack(subIter.tail()!), "VariadicTypePack");
        if (vtp) {
          while (!superIter.equals(superEnd)) {
            this.unify_(vtp.ty, superIter.current());
            superIter.advance();
          }
        }
      }
      if (superIter.equals(superEnd) && !subIter.equals(subEnd) && superIter.tail()) {
        const vtp = getPack(followPack(superIter.tail()!), "VariadicTypePack");
        if (vtp) {
          while (!subIter.equals(subEnd)) {
            this.unify_(subIter.current(), vtp.ty);
            subIter.advance();
          }
        }
      }

      if (subIter.equals(subEnd) && superIter.equals(superEnd)) {
        const subTail = subIter.tail();
        const superTail = superIter.tail();

        if (!subTail && !superTail) return UnifyResult.Ok;

        return deferOrUnify(maybeReplaceTail(subTail), maybeReplaceTail(superTail));
      } else if (subIter.equals(subEnd)) {
        const newSub = maybeReplaceTail(subIter.tail());
        const newSuper = makeTail(superIter, superEnd);

        return deferOrUnify(newSub, newSuper);
      } else if (superIter.equals(superEnd)) {
        const newSub = makeTail(subIter, subEnd);
        const newSuper = maybeReplaceTail(superIter.tail());
        return deferOrUnify(newSub, newSuper);
      }

      // Unreachable: the walk above ends when either pack ends.
      return UnifyResult.Ok;
    } finally {
      --this.recursionCount;
    }
  }

  /** simplify(left | right) */
  private mkUnion(left: TypeId, right: TypeId): TypeId {
    left = follow(left);
    right = follow(right);

    return simplifyUnion(this.builtinTypes, this.arena, left, right).result;
  }

  /** simplify(left & right) */
  private mkIntersection(left: TypeId, right: TypeId): TypeId {
    left = follow(left);
    right = follow(right);

    return simplifyIntersection(this.builtinTypes, this.arena, left, right).result;
  }

  private freshType(scope: Scope, polarity: Polarity): TypeId {
    const result = freshType(this.arena, this.builtinTypes, scope, polarity);
    this.newFreshTypes.push(result);
    return result;
  }

  private freshTypePack(scope: Scope, polarity: Polarity): TypePackId {
    const result = this.arena.freshTypePack(scope);

    const ftp = getPack(result, "FreeTypePack")!;
    ftp.polarity = polarity;

    this.newFreshTypePacks.push(result);
    return result;
  }
}
