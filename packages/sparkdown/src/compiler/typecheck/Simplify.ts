// Simplifying unions and intersections, ported from Luau's `Simplify.h`/
// `Simplify.cpp`; Luau is MIT-licensed (see `LICENSE-luau.txt`). `relate` is
// a cheap, approximate subtype test the simplifier and others use.

import { shallowClone } from "./Clone";
import {
  flatOptions,
  follow,
  get,
  getSingleton,
  intersectionType,
  isSubclass,
  lookupExternTypeProp,
  negationType,
  PrimitiveKind,
  Property,
  TableState,
  tableType,
  unionType,
  type BuiltinTypes,
  type ExternType,
  type TableType,
  type TypeArena,
  type TypeId,
} from "./Type";
import { TypeIds } from "./TypeIds";
import {
  addIntersection,
  IntersectionBuilder,
  isApproximatelyFalsyType,
  isApproximatelyTruthyType,
  UnionBuilder,
} from "./TypeUtils";
import { RecursionLimitError } from "./VisitType";

export const enum Relation {
  /** No A is a B or vice versa. */
  Disjoint,
  /** Every A is a B and vice versa. */
  Coincident,
  /** Some As are Bs and some Bs are As. */
  Intersects,
  /** Every A is a B. */
  Subset,
  /** Every B is an A. */
  Superset,
}

export interface SimplifyResult {
  result: TypeId;
  blockedTypes: Set<TypeId>;
}

// Luau's `LuauSimplificationComplexityLimit`.
const SIMPLIFICATION_COMPLEXITY_LIMIT = 8;

function flip(rel: Relation): Relation {
  if (rel === Relation.Subset) return Relation.Superset;
  if (rel === Relation.Superset) return Relation.Subset;
  return rel;
}

function isTypeVariable(ty: TypeId): boolean {
  return !!(get(ty, "FreeType") || get(ty, "GenericType") || get(ty, "BlockedType") || get(ty, "PendingExpansionType"));
}

type SeenPairs = Set<string>;

function relateTableToExternType(table: TableType, cls: ExternType, seen: SeenPairs): Relation {
  // Indexers on either side are not worth reasoning about.
  if (table.indexer || cls.indexer) return Relation.Intersects;
  for (const [name, prop] of table.props) {
    const propInExternType = lookupExternTypeProp(cls, name);
    if (!propInExternType) continue;
    if (!(prop.isReadOnly() || prop.isShared()) || !(propInExternType.isReadOnly() || propInExternType.isShared())) {
      return Relation.Intersects;
    }
    switch (relateSeen(prop.readTy!, propInExternType.readTy!, seen)) {
      case Relation.Disjoint:
        return Relation.Disjoint;
      case Relation.Coincident:
        break;
      case Relation.Intersects:
      case Relation.Subset:
        return Relation.Intersects;
      case Relation.Superset:
        break;
    }
  }
  return Relation.Superset;
}

/** How the left table's property relates to the single property on the right. */
function relateTableToProp(leftTable: TableType, propName: string, rightProp: Property, seen: SeenPairs): Relation {
  const leftProp = leftTable.props.get(propName);
  if (!leftProp) return Relation.Intersects;
  if (leftProp.isShared() && rightProp.isShared()) {
    switch (relateSeen(leftProp.readTy!, rightProp.readTy!, seen)) {
      case Relation.Disjoint:
        return Relation.Disjoint;
      case Relation.Coincident:
        return Relation.Coincident;
      default:
        return Relation.Intersects;
    }
  }
  // Only `{ x: T } & { read x: U }` and `{ read x: T } & { read x: U }` relate by T and U.
  if (!leftProp.readTy || !rightProp.isReadOnly()) return Relation.Intersects;
  switch (relateSeen(leftProp.readTy, rightProp.readTy!, seen)) {
    case Relation.Disjoint:
      return Relation.Disjoint;
    case Relation.Coincident:
      return leftProp.writeTy ? Relation.Subset : Relation.Coincident;
    case Relation.Subset:
      return Relation.Subset;
    default:
      return Relation.Intersects;
  }
}

function relateTables(leftTable: TableType, rightTable: TableType, seen: SeenPairs): Relation {
  if (leftTable.state !== TableState.Sealed || rightTable.state !== TableState.Sealed) return Relation.Intersects;
  if (rightTable.props.size === 1 && !rightTable.indexer) {
    const [name, prop] = rightTable.props.entries()[0]!;
    const res = relateTableToProp(leftTable, name, prop, seen);
    // By width subtyping, the left table is then a subset.
    return res === Relation.Coincident ? Relation.Subset : res;
  }
  if (leftTable.props.size === 1 && !leftTable.indexer) {
    const [name, prop] = leftTable.props.entries()[0]!;
    const res = flip(relateTableToProp(rightTable, name, prop, seen));
    return res === Relation.Coincident ? Relation.Superset : res;
  }
  if (leftTable.props.size !== rightTable.props.size || !!leftTable.indexer !== !!rightTable.indexer) return Relation.Intersects;
  let hasSubset = false;
  for (const [rightName, rightProp] of rightTable.props) {
    switch (relateTableToProp(leftTable, rightName, rightProp, seen)) {
      case Relation.Disjoint:
        return Relation.Disjoint;
      case Relation.Superset:
      case Relation.Intersects:
        return Relation.Intersects;
      case Relation.Subset:
        hasSubset = true;
        break;
      case Relation.Coincident:
        break;
    }
  }
  if (!leftTable.indexer) return hasSubset ? Relation.Subset : Relation.Coincident;
  if (relateSeen(leftTable.indexer.indexType, rightTable.indexer!.indexType, seen) !== Relation.Coincident) return Relation.Intersects;
  if (relateSeen(leftTable.indexer.indexResultType, rightTable.indexer!.indexResultType, seen) !== Relation.Coincident) {
    return Relation.Intersects;
  }
  return hasSubset ? Relation.Subset : Relation.Coincident;
}

function relateSeen(left: TypeId, right: TypeId, seen: SeenPairs): Relation {
  left = follow(left);
  right = follow(right);
  if (left === right) return Relation.Coincident;
  const key = `${left.serial}:${right.serial}`;
  // A pair seen again is a cycle, taken as coincident.
  if (seen.has(key)) return Relation.Coincident;
  seen.add(key);

  if (get(left, "UnknownType")) {
    if (get(right, "AnyType")) return Relation.Subset;
    if (get(right, "UnknownType")) return Relation.Coincident;
    if (get(right, "ErrorType")) return Relation.Disjoint;
    return Relation.Superset;
  }
  if (get(right, "UnknownType")) return flip(relateSeen(right, left, seen));
  if (get(left, "AnyType")) {
    if (get(right, "AnyType")) return Relation.Coincident;
    return Relation.Superset;
  }
  if (get(right, "AnyType")) return flip(relateSeen(right, left, seen));
  if (isTypeVariable(left) || isTypeVariable(right)) return Relation.Intersects;
  if (get(left, "TypeFunctionInstanceType") || get(right, "TypeFunctionInstanceType")) return Relation.Intersects;
  if (get(left, "ErrorType")) {
    if (get(right, "ErrorType")) return Relation.Coincident;
    if (get(right, "AnyType")) return Relation.Subset;
    return Relation.Disjoint;
  } else if (get(right, "ErrorType")) return flip(relateSeen(right, left, seen));
  if (get(left, "NeverType")) {
    if (get(right, "NeverType")) return Relation.Coincident;
    return Relation.Subset;
  } else if (get(right, "NeverType")) return flip(relateSeen(right, left, seen));
  if (get(left, "IntersectionType") || get(right, "IntersectionType")) return Relation.Intersects;

  const lut = get(left, "UnionType");
  if (lut) {
    for (const part of flatOptions(lut)) {
      const r = relateSeen(part, right, seen);
      if (r === Relation.Superset || r === Relation.Coincident) return Relation.Superset;
    }
    return Relation.Intersects;
  }
  const rut = get(right, "UnionType");
  if (rut) {
    for (const part of flatOptions(rut)) {
      const r = relateSeen(left, part, seen);
      if (r === Relation.Subset || r === Relation.Coincident) return Relation.Subset;
    }
    return Relation.Intersects;
  }

  const rnt = get(right, "NegationType");
  if (rnt) {
    switch (relateSeen(left, rnt.ty, seen)) {
      case Relation.Coincident:
        return Relation.Disjoint;
      case Relation.Disjoint:
        return get(left, "NegationType") ? Relation.Intersects : Relation.Subset;
      case Relation.Intersects:
        return Relation.Intersects;
      case Relation.Subset:
        return Relation.Disjoint;
      case Relation.Superset:
        return Relation.Intersects;
    }
  } else if (get(left, "NegationType")) return flip(relateSeen(right, left, seen));

  const lp = get(left, "PrimitiveType");
  if (lp) {
    const rp = get(right, "PrimitiveType");
    if (rp) return lp.type === rp.type ? Relation.Coincident : Relation.Disjoint;
    if (get(right, "SingletonType")) {
      if (lp.type === PrimitiveKind.String && getSingleton(right, "StringSingleton")) return Relation.Superset;
      if (lp.type === PrimitiveKind.Boolean && getSingleton(right, "BooleanSingleton")) return Relation.Superset;
      return Relation.Disjoint;
    }
    if (lp.type === PrimitiveKind.Function) return get(right, "FunctionType") ? Relation.Superset : Relation.Disjoint;
    if (lp.type === PrimitiveKind.Table) return get(right, "TableType") ? Relation.Superset : Relation.Disjoint;
    if (get(right, "FunctionType") || get(right, "TableType") || get(right, "MetatableType") || get(right, "ExternType")) {
      return Relation.Disjoint;
    }
  }

  const ls = get(left, "SingletonType");
  if (ls) {
    if (get(right, "FunctionType") || get(right, "TableType") || get(right, "MetatableType") || get(right, "ExternType")) {
      return Relation.Disjoint;
    }
    if (get(right, "PrimitiveType")) return flip(relateSeen(right, left, seen));
    const rs = get(right, "SingletonType");
    if (rs) {
      const same = ls.variant.kind === rs.variant.kind && ls.variant.value === rs.variant.value;
      return same ? Relation.Coincident : Relation.Disjoint;
    }
  }

  if (get(left, "FunctionType")) {
    const rp = get(right, "PrimitiveType");
    if (rp) return rp.type === PrimitiveKind.Function ? Relation.Subset : Relation.Disjoint;
    return Relation.Intersects;
  }

  const lt = get(left, "TableType");
  if (lt) {
    const rp = get(right, "PrimitiveType");
    if (rp) return rp.type === PrimitiveKind.Table ? Relation.Subset : Relation.Disjoint;
    const rt = get(right, "TableType");
    if (rt) return relateTables(lt, rt, seen);
    const re = get(right, "ExternType");
    if (re) return relateTableToExternType(lt, re, seen);
    return Relation.Disjoint;
  }

  const ct = get(left, "ExternType");
  if (ct) {
    const rct = get(right, "ExternType");
    if (rct) {
      if (isSubclass(ct, rct)) return Relation.Subset;
      if (isSubclass(rct, ct)) return Relation.Superset;
      return Relation.Disjoint;
    }
    const tbl = get(right, "TableType");
    if (tbl) return flip(relateTableToExternType(tbl, ct, seen));
    return Relation.Disjoint;
  }

  return Relation.Intersects;
}

/** A cheap and approximate subtype test. */
export function relate(left: TypeId, right: TypeId): Relation {
  return relateSeen(left, right, new Set());
}

const enum Inhabited {
  Yes,
  No,
}

class TypeSimplifier {
  readonly blockedTypes = new Set<TypeId>();
  private recursionDepth = 0;

  constructor(
    readonly builtinTypes: BuiltinTypes,
    readonly arena: TypeArena,
  ) {}

  private limited<T>(what: string, limit: number, f: () => T): T {
    if (++this.recursionDepth > limit) {
      this.recursionDepth--;
      throw new RecursionLimitError(what);
    }
    try {
      return f();
    } finally {
      this.recursionDepth--;
    }
  }

  mkNegation(ty: TypeId): TypeId {
    const b = this.builtinTypes;
    if (ty === b.truthyType) return b.falsyType;
    if (ty === b.falsyType) return b.truthyType;
    const ntv = get(ty, "NegationType");
    if (ntv) return follow(ntv.ty);
    return this.arena.addType(negationType(ty));
  }

  private intersectOneWithIntersection(source: TypeIds, dest: TypeIds, candidate: TypeId): Inhabited {
    if (dest.contains(candidate)) return Inhabited.Yes;
    const itv = get(candidate, "IntersectionType");
    if (itv) {
      for (const subPart of flatOptions(itv)) {
        if (this.intersectOneWithIntersection(source, dest, subPart) === Inhabited.No) return Inhabited.No;
      }
      return Inhabited.Yes;
    }
    if (source.empty()) {
      dest.insert(candidate);
      return Inhabited.Yes;
    }
    for (const ty of source) {
      switch (relate(candidate, ty)) {
        case Relation.Disjoint:
          return Inhabited.No;
        case Relation.Subset:
          dest.insert(candidate);
          break;
        case Relation.Coincident:
        case Relation.Superset:
          dest.insert(ty);
          break;
        case Relation.Intersects: {
          const simplified = this.basicIntersect(candidate, ty);
          if (simplified) dest.insert(simplified);
          else {
            dest.insert(candidate);
            dest.insert(ty);
          }
          break;
        }
      }
    }
    return Inhabited.Yes;
  }

  intersectFromParts(parts: TypeIds): TypeId {
    if (parts.size === 0) return this.builtinTypes.unknownType;
    if (parts.size === 1) return parts.front();
    let source = new TypeIds();
    let dest = new TypeIds();
    for (const part of parts) {
      if (this.intersectOneWithIntersection(source, dest, part) === Inhabited.No) return this.builtinTypes.neverType;
      [source, dest] = [dest, source];
      dest.clear();
    }
    const ib = new IntersectionBuilder(this.arena, this.builtinTypes);
    for (const ty of source) ib.add(ty);
    return ib.build();
  }

  private intersectUnionWithType(left: TypeId, right: TypeId): TypeId {
    const leftUnion = get(left, "UnionType")!;
    let changed = false;
    if (leftUnion.options.length > SIMPLIFICATION_COMPLEXITY_LIMIT) return addIntersection(this.arena, this.builtinTypes, [left, right]);
    const ub = new UnionBuilder(this.arena, this.builtinTypes);
    for (const part of flatOptions(leftUnion)) {
      const simplified = this.intersect(right, part);
      changed = changed || simplified !== part;
      if (get(simplified, "NeverType")) {
        changed = true;
        continue;
      }
      ub.add(simplified);
      if (ub.size > SIMPLIFICATION_COMPLEXITY_LIMIT) return addIntersection(this.arena, this.builtinTypes, [left, right]);
    }
    if (!changed) return left;
    return ub.build();
  }

  private intersectUnions(left: TypeId, right: TypeId): TypeId {
    const leftUnion = get(left, "UnionType")!;
    const rightUnion = get(right, "UnionType")!;
    if (leftUnion.options.length * rightUnion.options.length > SIMPLIFICATION_COMPLEXITY_LIMIT) {
      return this.arena.addType(intersectionType([left, right]));
    }
    const ub = new UnionBuilder(this.arena, this.builtinTypes);
    for (const leftPart of flatOptions(leftUnion)) {
      for (const rightPart of flatOptions(rightUnion)) {
        ub.add(this.intersect(leftPart, rightPart));
        if (ub.size > SIMPLIFICATION_COMPLEXITY_LIMIT) return addIntersection(this.arena, this.builtinTypes, [left, right]);
      }
    }
    return ub.build();
  }

  /** `~(A | B) & C`, as `(~A & C) & (~B & C)`. */
  private intersectNegatedUnion(left: TypeId, right: TypeId): TypeId {
    const negatedTy = follow(get(left, "NegationType")!.ty);
    const negatedUnion = get(negatedTy, "UnionType")!;
    let changed = false;
    const newParts = new TypeIds();
    for (const part of flatOptions(negatedUnion)) {
      switch (relate(part, right)) {
        case Relation.Disjoint:
          newParts.insert(right);
          break;
        case Relation.Coincident:
        case Relation.Superset:
          return this.builtinTypes.neverType;
        case Relation.Subset:
        case Relation.Intersects: {
          const simplified = this.intersectTypeWithNegation(this.mkNegation(part), right);
          changed = changed || simplified !== right;
          if (get(simplified, "NeverType")) changed = true;
          else newParts.insert(simplified);
          break;
        }
      }
    }
    if (!changed) return right;
    return this.intersectFromParts(newParts);
  }

  basicIntersectWithTruthy(target: TypeId): TypeId | undefined {
    target = follow(target);
    const b = this.builtinTypes;
    if (isApproximatelyTruthyType(target)) return target;
    if (isApproximatelyFalsyType(target)) return b.neverType;
    if (get(target, "UnknownType")) return b.truthyType;
    if (get(target, "AnyType")) return this.arena.addType(unionType([b.truthyType, b.errorType]));
    if (get(target, "NeverType") || get(target, "ErrorType")) return target;
    if (get(target, "FunctionType") || get(target, "TableType") || get(target, "MetatableType") || get(target, "ExternType")) return target;
    const pt = get(target, "PrimitiveType");
    if (pt) {
      if (pt.type === PrimitiveKind.NilType) return b.neverType;
      if (pt.type === PrimitiveKind.Boolean) return b.trueType;
      return target;
    }
    if (get(target, "SingletonType")) return getSingleton(target, "BooleanSingleton")?.value === false ? b.neverType : target;
    return undefined;
  }

  basicIntersectWithFalsy(target: TypeId): TypeId | undefined {
    target = follow(target);
    const b = this.builtinTypes;
    if (isApproximatelyTruthyType(target)) return b.neverType;
    if (isApproximatelyFalsyType(target)) return target;
    if (get(target, "NeverType") || get(target, "ErrorType")) return target;
    if (get(target, "AnyType")) return this.arena.addType(unionType([b.falsyType, b.errorType]));
    if (get(target, "UnknownType")) return b.falsyType;
    if (get(target, "FunctionType") || get(target, "TableType") || get(target, "MetatableType") || get(target, "ExternType")) {
      return b.neverType;
    }
    const pt = get(target, "PrimitiveType");
    if (pt) {
      if (pt.type === PrimitiveKind.NilType) return b.nilType;
      if (pt.type === PrimitiveKind.Boolean) return b.falseType;
      return b.neverType;
    }
    if (get(target, "SingletonType")) return getSingleton(target, "BooleanSingleton")?.value === false ? b.falseType : b.neverType;
    return undefined;
  }

  intersectTypeWithNegation(left: TypeId, right: TypeId): TypeId {
    const negatedTy = follow(get(left, "NegationType")!.ty);
    const b = this.builtinTypes;
    if (negatedTy === right) return b.neverType;
    const ut = get(negatedTy, "UnionType");
    if (ut) {
      // ~(A | B) & C is (~A & C) & (~B & C).
      let changed = false;
      const newParts = new TypeIds();
      for (const part of flatOptions(ut)) {
        switch (relate(part, right)) {
          case Relation.Coincident:
          case Relation.Superset:
            return b.neverType;
          case Relation.Disjoint:
            newParts.insert(right);
            break;
          case Relation.Subset:
          case Relation.Intersects:
            changed = true;
            newParts.insert(right);
            newParts.insert(this.mkNegation(part));
            break;
        }
      }
      if (!changed) return right;
      return this.intersectFromParts(newParts);
    }
    const rightUnion = get(right, "UnionType");
    if (rightUnion) {
      // ~A & (B | C)
      let changed = false;
      const newParts = new Set<TypeId>();
      for (const part of flatOptions(rightUnion)) {
        switch (relate(negatedTy, part)) {
          case Relation.Coincident:
          case Relation.Superset:
            changed = true;
            continue;
          case Relation.Disjoint:
            newParts.add(part);
            break;
          case Relation.Subset:
          case Relation.Intersects:
            changed = true;
            newParts.add(this.arena.addType(intersectionType([left, part])));
            break;
        }
      }
      if (!changed) return right;
      const sorted = [...newParts].sort((a, c) => a.serial - c.serial);
      if (sorted.length === 0) return b.neverType;
      if (sorted.length === 1) return sorted[0]!;
      return this.arena.addType(unionType(sorted));
    }
    const pt = get(right, "PrimitiveType");
    if (pt && pt.type === PrimitiveKind.Boolean && get(negatedTy, "SingletonType")) {
      const bs = getSingleton(negatedTy, "BooleanSingleton");
      if (bs?.value === true) return b.falseType;
      if (bs?.value === false) return b.trueType;
      return b.booleanType;
    }
    switch (relate(negatedTy, right)) {
      case Relation.Disjoint:
        return right;
      case Relation.Coincident:
      case Relation.Superset:
        return b.neverType;
      default:
        return this.arena.addType(intersectionType([left, right]));
    }
  }

  private intersectNegations(left: TypeId, right: TypeId): TypeId {
    const leftNegation = get(left, "NegationType")!;
    if (get(follow(leftNegation.ty), "UnionType")) return this.intersectNegatedUnion(left, right);
    const rightNegation = get(right, "NegationType")!;
    if (get(follow(rightNegation.ty), "UnionType")) return this.intersectNegatedUnion(right, left);
    switch (relate(leftNegation.ty, rightNegation.ty)) {
      case Relation.Coincident:
        return left;
      case Relation.Subset:
        return right;
      case Relation.Superset:
        return left;
      default:
        return this.arena.addType(intersectionType([left, right]));
    }
  }

  private intersectIntersectionWithType(left: TypeId, right: TypeId): TypeId {
    const leftIntersection = get(left, "IntersectionType")!;
    if (leftIntersection.parts.length > SIMPLIFICATION_COMPLEXITY_LIMIT) return addIntersection(this.arena, this.builtinTypes, [left, right]);
    let changed = false;
    const newParts = new TypeIds();
    for (const part of flatOptions(leftIntersection)) {
      switch (relate(part, right)) {
        case Relation.Disjoint:
          return this.builtinTypes.neverType;
        case Relation.Coincident:
        case Relation.Subset:
          newParts.insert(part);
          continue;
        case Relation.Superset:
          newParts.insert(right);
          changed = true;
          continue;
        default:
          newParts.insert(part);
          newParts.insert(right);
          changed = true;
          continue;
      }
    }
    // Only the type variables that remain in the result are reported as blocking.
    for (const part of newParts) if (isTypeVariable(part)) this.blockedTypes.add(part);
    if (!changed) return left;
    return this.intersectFromParts(newParts);
  }

  /** Intersects two types without recursing, or gives up; unions, intersections and negations are not handled. */
  basicIntersect(left: TypeId, right: TypeId): TypeId | undefined {
    left = follow(left);
    right = follow(right);
    const b = this.builtinTypes;
    if (get(left, "AnyType") && get(right, "ErrorType")) return right;
    if (get(right, "AnyType") && get(left, "ErrorType")) return left;
    if (get(left, "AnyType")) return this.arena.addType(unionType([right, b.errorType]));
    if (get(right, "AnyType")) return this.arena.addType(unionType([left, b.errorType]));
    if (get(left, "UnknownType")) return right;
    if (get(right, "UnknownType")) return left;
    if (get(left, "NeverType")) return left;
    if (get(right, "NeverType")) return right;

    const lpt = get(left, "PrimitiveType");
    const rpt = get(right, "PrimitiveType");
    if (lpt && lpt.type === PrimitiveKind.Boolean) {
      if (getSingleton(right, "BooleanSingleton")) return right;
      const nt = get(right, "NegationType");
      if (nt) {
        const bs = getSingleton(follow(nt.ty), "BooleanSingleton");
        if (bs) return bs.value ? b.falseType : b.trueType;
      }
    } else if (rpt && rpt.type === PrimitiveKind.Boolean) {
      if (getSingleton(left, "BooleanSingleton")) return left;
      const nt = get(left, "NegationType");
      if (nt) {
        const bs = getSingleton(follow(nt.ty), "BooleanSingleton");
        if (bs) return bs.value ? b.falseType : b.trueType;
      }
    }

    const lt = get(left, "TableType");
    const rt = get(right, "TableType");
    if (lt && rt) {
      if (lt.props.size === 1) {
        const [propName, leftProp] = lt.props.entries()[0]!;
        const leftPropIsRefinable = leftProp.isShared() || leftProp.isReadOnly();
        const rightProp = rt.props.get(propName);
        if (rightProp && leftPropIsRefinable && rightProp.isShared()) {
          switch (relate(leftProp.readTy!, rightProp.readTy!)) {
            case Relation.Disjoint:
              return b.neverType;
            case Relation.Superset:
            case Relation.Coincident:
              return right;
            case Relation.Subset:
              if (rt.props.size === 1 && leftProp.isShared()) return left;
              break;
            default:
              break;
          }
        }
      } else if (rt.props.size === 1) {
        return this.basicIntersect(right, left);
      }
      // Two sealed tables with disjoint properties and no indexers merge.
      if (!lt.indexer && !rt.indexer && lt.state === TableState.Sealed && rt.state === TableState.Sealed) {
        if (rt.props.size === 0) return left;
        const areDisjoint = !lt.props.keys().some((name) => rt.props.has(name));
        if (areDisjoint) {
          const merged = tableType({ state: TableState.Sealed, scope: lt.scope });
          for (const [name, prop] of lt.props) merged.props.set(name, prop);
          for (const [name, prop] of rt.props) merged.props.set(name, prop);
          return this.arena.addType(merged);
        }
      }
      return undefined;
    }

    if (isApproximatelyTruthyType(left)) {
      const res = this.basicIntersectWithTruthy(right);
      if (res) return res;
    }
    if (isApproximatelyTruthyType(right)) {
      const res = this.basicIntersectWithTruthy(left);
      if (res) return res;
    }
    if (isApproximatelyFalsyType(left)) {
      const res = this.basicIntersectWithFalsy(right);
      if (res) return res;
    }
    if (isApproximatelyFalsyType(right)) {
      const res = this.basicIntersectWithFalsy(left);
      if (res) return res;
    }

    const relation = relate(left, right);
    if (left === right || relation === Relation.Coincident) return left;
    if (relation === Relation.Disjoint) return b.neverType;
    if (relation === Relation.Subset) return left;
    if (relation === Relation.Superset) return right;
    return undefined;
  }

  intersect(left: TypeId, right: TypeId): TypeId {
    return this.limited("TypeSimplifier::intersect", 15, () => {
      left = this.simplify(left);
      right = this.simplify(right);
      const b = this.builtinTypes;
      if (left === right) return left;
      if (get(left, "AnyType") && get(right, "ErrorType")) return right;
      if (get(right, "AnyType") && get(left, "ErrorType")) return left;
      if (get(left, "UnknownType") && !get(right, "ErrorType")) return right;
      if (get(right, "UnknownType") && !get(left, "ErrorType")) return left;
      if (get(left, "AnyType") && get(right, "UnionType")) return this.union(b.errorType, right);
      if (get(left, "UnionType") && get(right, "AnyType")) return this.union(b.errorType, left);
      if (get(left, "AnyType")) return this.arena.addType(unionType([right, b.errorType]));
      if (get(right, "AnyType")) return this.arena.addType(unionType([left, b.errorType]));
      if (get(left, "UnknownType")) return right;
      if (get(right, "UnknownType")) return left;
      if (get(left, "NeverType")) return left;
      if (get(right, "NeverType")) return right;

      const lf = get(left, "FreeType");
      const rf = get(right, "FreeType");
      if (lf) {
        const r = relate(lf.upperBound, right);
        if (r === Relation.Subset || r === Relation.Coincident) return left;
      } else if (rf) {
        const r = relate(left, rf.upperBound);
        if (r === Relation.Superset || r === Relation.Coincident) return right;
      }

      if (isTypeVariable(left)) {
        this.blockedTypes.add(left);
        return addIntersection(this.arena, b, [left, right]);
      }
      if (isTypeVariable(right)) {
        this.blockedTypes.add(right);
        return addIntersection(this.arena, b, [left, right]);
      }

      if (get(left, "UnionType")) {
        if (get(right, "UnionType")) return this.intersectUnions(left, right);
        return this.intersectUnionWithType(left, right);
      } else if (get(right, "UnionType")) {
        return this.intersectUnionWithType(right, left);
      }
      if (get(left, "IntersectionType")) return this.intersectIntersectionWithType(left, right);
      if (get(right, "IntersectionType")) return this.intersectIntersectionWithType(right, left);
      if (get(left, "NegationType")) {
        if (get(right, "NegationType")) return this.intersectNegations(left, right);
        return this.intersectTypeWithNegation(left, right);
      } else if (get(right, "NegationType")) {
        return this.intersectTypeWithNegation(right, left);
      }
      return this.basicIntersect(left, right) ?? this.arena.addType(intersectionType([left, right]));
    });
  }

  union(left: TypeId, right: TypeId): TypeId {
    return this.limited("TypeSimplifier::union", 15, () => {
      left = this.simplify(left);
      right = this.simplify(right);
      const b = this.builtinTypes;
      if (get(left, "NeverType")) return right;
      if (get(right, "NeverType")) return left;
      const leftUnion = get(left, "UnionType");
      if (leftUnion) {
        let changed = false;
        const ub = new UnionBuilder(this.arena, b);
        for (const part of flatOptions(leftUnion)) {
          if (get(part, "NeverType")) {
            changed = true;
            continue;
          }
          switch (relate(part, right)) {
            case Relation.Coincident:
            case Relation.Superset:
              return left;
            case Relation.Subset:
              ub.add(right);
              changed = true;
              break;
            default:
              ub.add(part);
              ub.add(right);
              changed = true;
              break;
          }
        }
        if (!changed) return left;
        // A changed union with no parts left was uninhabited.
        if (ub.size === 0) return right;
        return ub.build();
      } else if (get(right, "UnionType")) {
        return this.union(right, left);
      }
      const r = relate(left, right);
      if (left === right || r === Relation.Coincident || r === Relation.Superset) return left;
      if (r === Relation.Subset) return right;
      const abs = getSingleton(left, "BooleanSingleton");
      const bbs = getSingleton(right, "BooleanSingleton");
      if (abs && bbs && abs.value !== bbs.value) return b.booleanType;

      const lt = get(left, "TableType");
      const rt = get(right, "TableType");
      if (lt && rt && lt.props.size === 1 && rt.props.size === 1) {
        const [propName, leftProp] = lt.props.entries()[0]!;
        const [rightPropName, rightProp] = rt.props.entries()[0]!;
        if (rightPropName !== propName) return this.arena.addType(unionType([left, right]));
        // Sharing a property is not enough to merge, or `{ prop: number? }`
        // could be laundered into `{ prop: string? }`; only two read-only
        // properties of sealed tables merge.
        if (!leftProp.isReadOnly() || !rightProp.isReadOnly() || lt.state !== TableState.Sealed || rt.state !== TableState.Sealed) {
          return this.arena.addType(unionType([left, right]));
        }
        switch (relate(leftProp.readTy!, rightProp.readTy!)) {
          case Relation.Coincident:
          case Relation.Superset:
            return left;
          case Relation.Subset:
            return right;
          default: {
            const result = tableType({ state: TableState.Sealed });
            result.props.set(propName, Property.readonly(this.union(leftProp.readTy!, rightProp.readTy!)));
            return this.arena.addType(result);
          }
        }
      }
      return this.arena.addType(unionType([left, right]));
    });
  }

  simplify(ty: TypeId, seen = new Set<TypeId>()): TypeId {
    return this.limited("TypeSimplifier::simplify", 60, () => {
      ty = follow(ty);
      if (seen.has(ty)) return ty;
      seen.add(ty);
      const b = this.builtinTypes;
      const nt = get(ty, "NegationType");
      if (nt) {
        const negatedTy = follow(nt.ty);
        if (get(negatedTy, "AnyType")) return this.arena.addType(unionType([b.neverType, b.errorType]));
        if (get(negatedTy, "UnknownType")) return b.neverType;
        if (get(negatedTy, "NeverType")) return b.unknownType;
        const nnt = get(negatedTy, "NegationType");
        if (nnt) return this.simplify(nnt.ty, seen);
      }
      // {x: never} is never.
      const tt = get(ty, "TableType");
      if (tt && tt.props.size === 1) {
        const readTy = tt.props.entries()[0]![1].readTy;
        if (readTy && get(this.simplify(readTy, seen), "NeverType")) return b.neverType;
      }
      return ty;
    });
  }

  private intersectOne(target: TypeId, discriminant: TypeId): TypeId | undefined {
    switch (relate(target, discriminant)) {
      case Relation.Disjoint:
        return this.builtinTypes.neverType;
      case Relation.Subset:
      case Relation.Coincident:
        return target;
      case Relation.Superset:
        return discriminant;
      default:
        return undefined;
    }
  }

  private subtractOne(target: TypeId, discriminant: TypeId): TypeId | undefined {
    target = follow(target);
    discriminant = follow(discriminant);
    const nt = get(discriminant, "NegationType");
    if (nt) return this.intersectOne(target, nt.ty);
    switch (relate(target, discriminant)) {
      case Relation.Disjoint:
        return target;
      case Relation.Subset:
      case Relation.Coincident:
        return this.builtinTypes.neverType;
      default:
        return undefined;
    }
  }

  private intersectProperty(target: Property, discriminant: Property, seen: Set<TypeId>): Property | undefined {
    const prop = new Property();
    prop.deprecated = target.deprecated || discriminant.deprecated;
    if (target.readTy && discriminant.readTy) {
      prop.readTy = this.intersectWithSimpleDiscriminant(target.readTy, discriminant.readTy, seen);
      if (!prop.readTy) return undefined;
    } else if (target.readTy) prop.readTy = target.readTy;
    else if (discriminant.readTy) prop.readTy = discriminant.readTy;
    if (target.writeTy && discriminant.writeTy) {
      prop.writeTy = this.intersectWithSimpleDiscriminant(target.writeTy, discriminant.writeTy, seen);
      if (!prop.writeTy) return undefined;
    } else if (target.writeTy) prop.writeTy = target.writeTy;
    else if (discriminant.writeTy) prop.writeTy = discriminant.writeTy;
    return prop;
  }

  intersectWithSimpleDiscriminant(target: TypeId, discriminant: TypeId, seen = new Set<TypeId>()): TypeId | undefined {
    if (seen.has(target)) return undefined;
    target = follow(target);
    discriminant = follow(discriminant);
    const b = this.builtinTypes;
    const ut = get(target, "UnionType");
    if (ut) {
      seen.add(target);
      const options = new TypeIds();
      for (const option of flatOptions(ut)) {
        const result = this.intersectWithSimpleDiscriminant(option, discriminant, seen);
        if (!result) return undefined;
        if (get(result, "UnknownType")) return b.unknownType;
        if (!get(result, "NeverType")) options.insert(result);
      }
      if (options.empty()) return b.neverType;
      if (options.size === 1) return options.front();
      return this.arena.addType(unionType(options.take()));
    }
    const it = get(target, "IntersectionType");
    if (it) {
      seen.add(target);
      const parts = new TypeIds();
      for (const part of flatOptions(it)) {
        const result = this.intersectWithSimpleDiscriminant(part, discriminant, seen);
        if (!result) return undefined;
        if (get(result, "NeverType")) return b.neverType;
        const sub = get(result, "IntersectionType");
        if (sub) {
          for (const subOption of flatOptions(sub)) {
            if (get(subOption, "NeverType")) return b.neverType;
            if (!get(result, "UnknownType")) parts.insert(result);
          }
        } else if (!get(result, "UnknownType")) parts.insert(result);
      }
      if (parts.empty()) return b.unknownType;
      if (parts.size === 1) return parts.front();
      return this.arena.addType(intersectionType(parts.take()));
    }
    const ttv = get(target, "TableType");
    if (ttv) {
      const discTtv = get(discriminant, "TableType");
      if (discTtv) {
        // A simple table discriminant has one property and no indexer.
        const [discName, discProp] = discTtv.props.entries()[0]!;
        const tyProp = ttv.props.get(discName);
        if (tyProp) {
          const property = this.intersectProperty(tyProp, discProp, seen);
          if (!property) return undefined;
          if (property.readTy && get(follow(property.readTy), "NeverType")) return b.neverType;
          if (property.writeTy && get(follow(property.writeTy), "NeverType")) return b.neverType;
          if (tyProp.readTy === property.readTy && tyProp.writeTy === property.writeTy) return target;
          const result = shallowClone(target, this.arena, true);
          const resultTtv = get(result, "TableType")!;
          resultTtv.props.set(discName, property);
          resultTtv.scope = ttv.scope;
          return result;
        }
        const result = shallowClone(target, this.arena, true);
        const resultTtv = get(result, "TableType")!;
        if (!resultTtv.props.has(discName)) resultTtv.props.set(discName, discProp);
        resultTtv.scope = ttv.scope;
        return result;
      }
      // Otherwise, as `{ ... } & ~nil`, fall through.
    }
    if (
      get(target, "FreeType") ||
      get(target, "GenericType") ||
      get(target, "BlockedType") ||
      get(target, "PendingExpansionType") ||
      get(target, "TypeFunctionInstanceType")
    ) {
      return undefined;
    }
    if (isApproximatelyTruthyType(discriminant)) return this.basicIntersectWithTruthy(target);
    if (isApproximatelyTruthyType(target)) return this.basicIntersectWithTruthy(discriminant);
    if (isApproximatelyFalsyType(discriminant)) return this.basicIntersectWithFalsy(target);
    if (isApproximatelyFalsyType(target)) return this.basicIntersectWithFalsy(discriminant);
    if (get(target, "AnyType")) return this.arena.addType(unionType([b.errorType, discriminant]));
    if (get(target, "ErrorType")) return b.errorType;
    const nty = get(discriminant, "NegationType");
    if (nty) return this.subtractOne(target, nty.ty);
    return this.intersectOne(target, discriminant);
  }
}

function isSimpleDiscriminantSeen(ty: TypeId, seen: Set<TypeId>): boolean {
  ty = follow(ty);
  // A recursive type is never simple.
  if (seen.has(ty)) return false;
  seen.add(ty);
  const ttv = get(ty, "TableType");
  if (ttv && ttv.props.size === 1 && !ttv.indexer) {
    const prop = ttv.props.entries()[0]![1];
    return (!prop.readTy || isSimpleDiscriminantSeen(prop.readTy, seen)) && (!prop.writeTy || isSimpleDiscriminantSeen(prop.writeTy, seen));
  }
  const nt = get(ty, "NegationType");
  if (nt) return isSimpleDiscriminantSeen(nt.ty, seen);
  return (
    !!(get(ty, "PrimitiveType") || get(ty, "SingletonType") || get(ty, "ExternType")) ||
    isApproximatelyTruthyType(ty) ||
    isApproximatelyFalsyType(ty)
  );
}

export function simplifyIntersection(builtinTypes: BuiltinTypes, arena: TypeArena, left: TypeId | TypeIds, right?: TypeId): SimplifyResult {
  const s = new TypeSimplifier(builtinTypes, arena);
  const result = left instanceof TypeIds ? s.intersectFromParts(left) : s.intersect(left, right!);
  return { result, blockedTypes: s.blockedTypes };
}

export function simplifyUnion(builtinTypes: BuiltinTypes, arena: TypeArena, left: TypeId, right: TypeId): SimplifyResult {
  const s = new TypeSimplifier(builtinTypes, arena);
  return { result: s.union(left, right), blockedTypes: s.blockedTypes };
}

/** Intersects a type with a simple discriminant (a primitive, singleton, extern type or one-property table), or gives up. */
export function intersectWithSimpleDiscriminant(
  builtinTypes: BuiltinTypes,
  arena: TypeArena,
  target: TypeId,
  discriminant: TypeId,
): TypeId | undefined {
  if (!isSimpleDiscriminantSeen(discriminant, new Set())) {
    if (isSimpleDiscriminantSeen(target, new Set())) return intersectWithSimpleDiscriminant(builtinTypes, arena, discriminant, target);
    return undefined;
  }
  return new TypeSimplifier(builtinTypes, arena).intersectWithSimpleDiscriminant(target, discriminant);
}
