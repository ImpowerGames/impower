// Structural equality of types, ported from Luau's
// `StructuralTypeEquality.cpp` (Luau's `operator==` on `Type` and
// `TypePackVar`); Luau is MIT-licensed (see `LICENSE-luau.txt`). As in Luau,
// only free, generic, primitive, error, function, table, metatable and any
// types can compare equal; two singletons or two `never`s never do.

import { flatten, getPack, type Type, type TypePackId, type TypePackVar } from "./Type";

type SeenSet = Set<string>;

function areSeen(seen: SeenSet, lhs: object, rhs: object, ids: WeakMap<object, number>): boolean {
  if (lhs === rhs) return true;
  const key = `${idOf(lhs, ids)}:${idOf(rhs, ids)}`;
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}

let nextId = 0;
function idOf(o: object, ids: WeakMap<object, number>): number {
  let id = ids.get(o);
  if (id === undefined) ids.set(o, (id = ++nextId));
  return id;
}

const variantIds = new WeakMap<object, number>();

export function areEqualPacks(lhs: TypePackVar, rhs: TypePackVar, seen: SeenSet = new Set()): boolean {
  const l = flatten(lhs);
  const r = flatten(rhs);
  if (l.head.length !== r.head.length) return false;
  for (let i = 0; i < l.head.length; i++) {
    if (!areEqualTypes(l.head[i]!, r.head[i]!, seen)) return false;
  }
  if (!l.tail && !r.tail) return true;
  if (!l.tail || !r.tail) return false;
  const lhsTail: TypePackId = l.tail;
  const rhsTail: TypePackId = r.tail;
  const lf = getPack(lhsTail, "FreeTypePack");
  const rf = getPack(rhsTail, "FreeTypePack");
  if (lf && rf) return lf.index === rf.index;
  const lb = getPack(lhsTail, "BoundTypePack");
  const rb = getPack(rhsTail, "BoundTypePack");
  if (lb && rb) return areEqualPacks(lb.boundTo, rb.boundTo, seen);
  const lg = getPack(lhsTail, "GenericTypePack");
  const rg = getPack(rhsTail, "GenericTypePack");
  if (lg && rg) return lg.index === rg.index;
  const lv = getPack(lhsTail, "VariadicTypePack");
  const rv = getPack(rhsTail, "VariadicTypePack");
  if (lv && rv) return areEqualTypes(lv.ty, rv.ty, seen);
  return false;
}

export function areEqualTypes(lhs: Type, rhs: Type, seen: SeenSet = new Set()): boolean {
  const lv = lhs.ty;
  const rv = rhs.ty;
  if (lv.kind === "BoundType") return areEqualTypes(lv.boundTo, rhs, seen);
  if (rv.kind === "BoundType") return areEqualTypes(lhs, rv.boundTo, seen);
  if (lv.kind !== rv.kind) return false;
  switch (lv.kind) {
    case "FreeType":
      return lv.index === (rv as typeof lv).index;
    case "GenericType":
      return lv.index === (rv as typeof lv).index;
    case "PrimitiveType":
      return lv.type === (rv as typeof lv).type;
    case "ErrorType":
      return lv.index === (rv as typeof lv).index;
    case "FunctionType": {
      const r = rv as typeof lv;
      if (areSeen(seen, lv, r, variantIds)) return true;
      return areEqualPacks(lv.argTypes, r.argTypes, seen) && areEqualPacks(lv.retTypes, r.retTypes, seen);
    }
    case "TableType": {
      const r = rv as typeof lv;
      if (areSeen(seen, lv, r, variantIds)) return true;
      if (lv.state !== r.state) return false;
      if (lv.props.size !== r.props.size) return false;
      if (!!lv.indexer !== !!r.indexer) return false;
      if (lv.indexer && r.indexer) {
        if (lv.indexer.isReadOnly !== r.indexer.isReadOnly) return false;
        if (!areEqualTypes(lv.indexer.indexType, r.indexer.indexType, seen)) return false;
        if (!areEqualTypes(lv.indexer.indexResultType, r.indexer.indexResultType, seen)) return false;
      }
      const lp = lv.props.entries();
      const rp = r.props.entries();
      for (let i = 0; i < lp.length; i++) {
        const [ln, lprop] = lp[i]!;
        const [rn, rprop] = rp[i]!;
        if (ln !== rn) return false;
        if (lprop.readTy && rprop.readTy) {
          if (!areEqualTypes(lprop.readTy, rprop.readTy, seen)) return false;
        } else if (lprop.readTy || rprop.readTy) return false;
        if (lprop.writeTy && rprop.writeTy) {
          if (!areEqualTypes(lprop.writeTy, rprop.writeTy, seen)) return false;
        } else if (lprop.writeTy || rprop.writeTy) return false;
      }
      return true;
    }
    case "MetatableType": {
      const r = rv as typeof lv;
      if (areSeen(seen, lv, r, variantIds)) return true;
      return areEqualTypes(lv.table, r.table, seen) && areEqualTypes(lv.metatable, r.metatable, seen);
    }
    case "AnyType":
      return true;
    default:
      return false;
  }
}
