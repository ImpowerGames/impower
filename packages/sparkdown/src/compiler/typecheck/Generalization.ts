// Generalization, ported from Luau's `Generalization.h`/`Generalization.cpp`;
// Luau is MIT-licensed (see `LICENSE-luau.txt`).

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

export interface GeneralizationParams {
  foundOutsideFunctions: boolean;
  useCount: number;
  polarity: Polarity;
}

export interface GeneralizationResult<T> {
  result: T | undefined;
  wasReplacedByGeneric: boolean;
  resourceLimitsExceeded: boolean;
}

function generalizationResult<T>(result: T | undefined, wasReplacedByGeneric: boolean): GeneralizationResult<T> {
  return { result, wasReplacedByGeneric, resourceLimitsExceeded: false };
}

function paramsFor<K>(map: Map<K, GeneralizationParams>, key: K): GeneralizationParams {
  let params = map.get(key);
  if (!params) {
    params = { foundOutsideFunctions: false, useCount: 0, polarity: Polarity.None };
    map.set(key, params);
  }
  return params;
}

class TypeRemover {
  readonly seen = new Set<TypeId>();

  constructor(
    readonly builtinTypes: BuiltinTypes,
    readonly arena: TypeArena,
    readonly needle: TypeId,
  ) {}

  process(item: TypeId): void {
    item = follow(item);

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

class FreeTypeFinder extends IterativeTypeVisitor {
  readonly freeTys = new TypeIds();

  constructor(readonly arena: TypeArena) {
    super("FreeTypeFinder", true, true);
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

function collapseDirectBoundCycleAt(arena: TypeArena, builtinTypes: BuiltinTypes, startTy: TypeId): boolean {
  collapseInvariantFreeType(arena, startTy);

  startTy = follow(startTy);

  if (!get(startTy, "FreeType")) return false;

  const path = new TypeIds();
  let cur: TypeId | undefined = startTy;

  while (cur) {
    if (path.contains(cur)) {
      const cycleMembers = new TypeIds();
      let inCycle = false;
      for (const member of path) {
        if (member === cur) inCycle = true;
        if (inCycle) cycleMembers.insert(member);
      }

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

    let next = getDirectFreeNeighbor(ft.upperBound);
    if (!next || next === cur) next = getDirectFreeNeighbor(ft.lowerBound);
    if (next === cur) next = undefined;

    cur = next;
  }

  return false;
}

function collapseFreeTypeCycles(arena: TypeArena, builtinTypes: BuiltinTypes, freeTypes: Map<TypeId, GeneralizationParams>): void {
  for (const [startTy] of freeTypes) collapseDirectBoundCycleAt(arena, builtinTypes, startTy);
}

interface WorkItem {
  value: TypeId | TypePackId;
  polarity: Polarity;
  isWithinFunction: boolean;
}

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
    return true;
  }

  observe(ty: object, polarity: Polarity): void {
    if (isPositive(polarity)) this.seenPositive.add(ty);

    if (isNegative(polarity)) this.seenNegative.add(ty);
  }

  pushPack(tp: TypePackId, polarity: Polarity, isWithinFunction: boolean): void {
    tp = followPack(tp);
    if (!this.seenWithPolarity(tp, polarity) && tp.owningArena === this.targetArena) {
      this.observe(tp, polarity);
      this.work.push({ value: tp, polarity, isWithinFunction });
    }
  }

  push(ty: TypeId, polarity: Polarity, isWithinFunction: boolean): void {
    ty = follow(ty);
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

export function generalizeType(
  arena: TypeArena,
  builtinTypes: BuiltinTypes,
  scope: Scope,
  freeTy: TypeId,
  params: GeneralizationParams,
): GeneralizationResult<TypeId> {
  freeTy = follow(freeTy);

  collapseDirectBoundCycleAt(arena, builtinTypes, freeTy);
  freeTy = follow(freeTy);

  const ft = get(freeTy, "FreeType");
  if (!ft) return generalizationResult(freeTy, false);

  const hasLowerBound = !get(follow(ft.lowerBound), "NeverType");
  const hasUpperBound = !get(follow(ft.upperBound), "UnknownType");

  const isWithinFunction = !params.foundOutsideFunctions;

  if (!hasLowerBound && !hasUpperBound) {
    if (!isWithinFunction) emplaceType(freeTy, boundType(builtinTypes.unknownType));
    else {
      emplaceType(freeTy, genericType({ scope, polarity: params.polarity }));
      return generalizationResult(freeTy, true);
    }
  }
  else if (isPositive(params.polarity) && !hasUpperBound) {
    const lb = follow(ft.lowerBound);
    removeType(arena, builtinTypes, lb, freeTy);

    if (follow(lb) !== freeTy) emplaceType(freeTy, boundType(lb));
    else if (!isWithinFunction) emplaceType(freeTy, boundType(builtinTypes.unknownType));
    else {
      emplaceType(freeTy, genericType({ scope, polarity: params.polarity }));
      return generalizationResult(freeTy, true);
    }
  } else {
    const ub = follow(ft.upperBound);
    removeType(arena, builtinTypes, ub, freeTy);

    if (follow(ub) !== freeTy) emplaceType(freeTy, boundType(ub));
    else if (!isWithinFunction || params.useCount === 1) {
      removeType(arena, builtinTypes, ft.lowerBound, freeTy);
      const cleanedTy = arena.addType(intersectionType([ft.lowerBound, ub]));
      removeType(arena, builtinTypes, cleanedTy, freeTy);
      emplaceType(freeTy, boundType(cleanedTy));
    } else {
      emplaceType(freeTy, genericType({ scope, polarity: params.polarity }));
      return generalizationResult(freeTy, true);
    }
  }

  return generalizationResult(freeTy, false);
}

export function generalizeTypePack(
  arena: TypeArena,
  builtinTypes: BuiltinTypes,
  scope: Scope,
  tp: TypePackId,
  params: GeneralizationParams,
): GeneralizationResult<TypePackId> {
  tp = followPack(tp);

  if (tp.owningArena !== arena) return generalizationResult(tp, false);

  const ftp = getPack(tp, "FreeTypePack");
  if (!ftp) return generalizationResult(tp, false);

  if (!subsumes(scope, ftp.scope)) return generalizationResult(tp, false);

  if (1 === params.useCount) emplaceTypePack(tp, boundTypePack(builtinTypes.unknownTypePack));
  else {
    emplaceTypePack(tp, genericTypePack({ scope, polarity: params.polarity }));
    return generalizationResult(tp, true);
  }

  return generalizationResult(tp, false);
}

export function sealTable(scope: Scope, ty: TypeId): void {
  const tableTy = get(follow(ty), "TableType");
  if (!tableTy) return;

  if (!subsumes(scope, tableTy.scope)) return;

  if (tableTy.state === TableState.Unsealed || tableTy.state === TableState.Free) tableTy.state = TableState.Sealed;
}

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

  for (let i = 0; i < functionTy.genericPacks.length; ++i) {
    const genericPack = followPack(functionTy.genericPacks[i]!);

    const tail = getTail(genericPack);

    if (tail !== genericPack) functionTy.genericPacks.push(tail);
  }

  for (let i = 0; i < functionTy.generics.length; ) {
    const generic = follow(functionTy.generics[i]!);
    const genericTy = get(generic, "GenericType");

    if (!genericTy) {
      functionTy.generics.splice(i, 1);
      continue;
    }

    if (seenTypes.has(generic)) {
      functionTy.generics.splice(i, 1);
      continue;
    }

    if (arena !== generic.owningArena) {
      i++;
      continue;
    }

    const entry = ftwp.types.get(generic);

    if (genericTy.explicitName) {
      seenTypes.add(generic);
      if (entry) genericTy.polarity = entry.polarity;
      i++;
      continue;
    }

    if (!entry) {
      functionTy.generics.splice(i, 1);
      continue;
    }

    switch (entry.polarity) {
      case Polarity.Positive:
        emplaceType(generic, boundType(builtinTypes.neverType));
        functionTy.generics.splice(i, 1);
        break;

      case Polarity.Negative:
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
        i++;
        break;
    }
  }

  for (let i = 0; i < functionTy.genericPacks.length; ) {
    const generic = followPack(functionTy.genericPacks[i]!);

    const genericTy = getPack(generic, "GenericTypePack");

    if (!genericTy) {
      functionTy.genericPacks.splice(i, 1);
      continue;
    }

    if (seenPacks.has(generic)) {
      functionTy.genericPacks.splice(i, 1);
      continue;
    }

    if (arena !== generic.owningArena) {
      i++;
      continue;
    }

    const entry = ftwp.typePacks.get(generic);

    if (genericTy.explicitName) {
      seenPacks.add(generic);
      if (entry) genericTy.polarity = entry.polarity;
      i++;
      continue;
    }

    if (!entry) {
      functionTy.genericPacks.splice(i, 1);
      continue;
    }

    switch (entry.polarity) {
      case Polarity.Positive:
      case Polarity.Negative:
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
