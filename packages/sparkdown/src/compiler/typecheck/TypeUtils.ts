// Helpers shared across the checker, ported from Luau's `TypeUtils.h`/`.cpp`;
// Luau is MIT-licensed (see `LICENSE-luau.txt`).

import {
  AstExpr,
  AstExprConstantBool,
  AstExprConstantNil,
  AstExprConstantNumber,
  AstExprConstantString,
  AstExprFunction,
  AstExprGroup,
  AstExprTable,
  TableItemKind,
  type AstExprTableItem,
} from "./Ast";
import { LuauTypeError } from "./Error";
import type { Location } from "./Location";
import type { Normalizer } from "./Normalize";
import type { Scope } from "./Scope";
import { relate, Relation, simplifyIntersection } from "./Simplify";
import { toString } from "./ToString";
import {
  finite,
  first,
  flatOptions,
  flatten,
  follow,
  followPack,
  freeType,
  get,
  getMetatable,
  getPack,
  getSingleton,
  getTableType,
  intersectionType,
  isNil,
  isOptional,
  isVariadicTail,
  PrimitiveKind,
  Type,
  typePack,
  TypeFunctionInstanceState,
  unionType,
  type BuiltinTypes,
  type TypeArena,
  type TypeId,
  type TypePack,
  type TypePackId,
} from "./Type";
import { TypeIds } from "./TypeIds";
import { ValueContext } from "./Constraint";
import { TypeOnceVisitor } from "./VisitType";

export { ValueContext };

export const enum TypeContext {
  Default,
  Condition,
}

export function inConditional(context: TypeContext): boolean {
  return context === TypeContext.Condition;
}

/** Whether a blocked or pending type occurs in a union or intersection it is compared with. */
export function occursCheck(needle: TypeId, haystack: TypeId): boolean {
  haystack = follow(haystack);
  if (needle === haystack) return true;
  const ut = get(haystack, "UnionType");
  if (ut) return flatOptions(ut).some((h) => occursCheck(needle, h));
  const it = get(haystack, "IntersectionType");
  if (it) return flatOptions(it).some((h) => occursCheck(needle, h));
  return false;
}

export const enum OccursCheckResult {
  Pass,
  Fail,
}

export function occursCheckPack(needle: TypePackId, haystack: TypePackId): OccursCheckResult {
  needle = followPack(needle);
  haystack = followPack(haystack);
  if (getPack(needle, "ErrorTypePack")) return OccursCheckResult.Pass;
  while (!getPack(haystack, "ErrorTypePack")) {
    if (needle === haystack) return OccursCheckResult.Fail;
    const a = getPack(haystack, "TypePack");
    if (a && a.tail) {
      haystack = followPack(a.tail);
      continue;
    }
    break;
  }
  return OccursCheckResult.Pass;
}

export function findMetatableEntry(
  builtinTypes: BuiltinTypes,
  errors: LuauTypeError[],
  type: TypeId,
  entry: string,
  location: Location,
): TypeId | undefined {
  type = follow(type);
  const metatable = getMetatable(type, builtinTypes);
  if (!metatable) return undefined;
  const unwrapped = follow(metatable);
  if (get(unwrapped, "AnyType")) return builtinTypes.anyType;
  const mtt = getTableType(unwrapped);
  if (!mtt) {
    errors.push(new LuauTypeError(location, { kind: "GenericError", message: "Metatable was not a table" }));
    return undefined;
  }
  const prop = mtt.props.get(entry);
  if (prop) return prop.readTy ?? prop.writeTy;
  return undefined;
}

export function findTablePropertyRespectingMeta(
  builtinTypes: BuiltinTypes,
  errors: LuauTypeError[],
  ty: TypeId,
  name: string,
  context: ValueContext,
  location: Location,
): TypeId | undefined {
  if (get(ty, "AnyType")) return ty;
  const tableType = getTableType(ty);
  if (tableType) {
    const prop = tableType.props.get(name);
    if (prop) return context === ValueContext.RValue ? prop.readTy : prop.writeTy;
  }
  let mtIndex = findMetatableEntry(builtinTypes, errors, ty, "__index", location);
  let count = 0;
  while (mtIndex) {
    const index = follow(mtIndex);
    if (count >= 100) return undefined;
    ++count;
    const itt = getTableType(index);
    if (itt) {
      const fit = itt.props.get(name);
      if (fit) return context === ValueContext.RValue ? fit.readTy : fit.writeTy;
    } else if (get(index, "FunctionType")) {
      return first(followPack(get(index, "FunctionType")!.retTypes)) ?? builtinTypes.nilType;
    } else if (get(index, "AnyType")) {
      return builtinTypes.anyType;
    } else {
      errors.push(
        new LuauTypeError(location, { kind: "GenericError", message: `__index should either be a function or table. Got ${toString(index)}` }),
      );
    }
    mtIndex = findMetatableEntry(builtinTypes, errors, mtIndex, "__index", location);
  }
  return undefined;
}

/** The fewest arguments a parameter pack needs, and the most it takes (undefined for any number). */
export function getParameterExtents(tp: TypePackId, includeHiddenVariadics = false): { min: number; max: number | undefined } {
  let minCount = 0;
  let optionalCount = 0;
  const { head, tail } = flatten(tp);
  for (const ty of head) {
    if (isOptional(ty)) ++optionalCount;
    else {
      minCount += optionalCount;
      optionalCount = 0;
      minCount++;
    }
  }
  if (tail && isVariadicTail(tail, includeHiddenVariadics)) return { min: minCount, max: undefined };
  return { min: minCount, max: minCount + optionalCount };
}

/**
 * The first `length` types of a pack, with its remaining tail. A free pack
 * is made to have at least `length` elements, with fresh free types.
 */
export function extendTypePack(arena: TypeArena, builtinTypes: BuiltinTypes, pack: TypePackId, length: number): TypePack {
  const result: TypePack = typePack([]);
  for (;;) {
    pack = followPack(pack);
    const p = getPack(pack, "TypePack");
    if (p) {
      let i = 0;
      while (i < p.head.length && result.head.length < length) {
        result.head.push(p.head[i]!);
        ++i;
      }
      if (result.head.length === length) {
        if (i === p.head.length) result.tail = p.tail;
        else result.tail = arena.addTypePack(p.head.slice(i), p.tail);
        return result;
      } else if (p.tail) {
        pack = p.tail;
        continue;
      }
      return result;
    }
    const vtp = getPack(pack, "VariadicTypePack");
    if (vtp) {
      while (result.head.length < length) result.head.push(vtp.ty);
      result.tail = pack;
      return result;
    }
    const ftp = getPack(pack, "FreeTypePack");
    if (ftp) {
      // Taking types out of a free pack proves it has at least `length` of them.
      const newTail = arena.freshTypePack(ftp.scope, ftp.polarity);
      trackInteriorFreeTypePack(ftp.scope, newTail);
      const newHead: TypeId[] = [];
      result.tail = newTail;
      while (result.head.length < length) {
        const t = arena.addType(freeType(ftp.scope, builtinTypes.neverType, builtinTypes.unknownType, ftp.polarity));
        trackInteriorFreeType(ftp.scope, t);
        newHead.push(t);
        result.head.push(t);
      }
      pack.ty = { kind: "BoundTypePack", boundTo: arena.addTypePack(newHead, newTail) };
      return result;
    }
    if (getPack(pack, "ErrorTypePack")) {
      while (result.head.length < length) result.head.push(builtinTypes.errorType);
      result.tail = pack;
      return result;
    }
    // A blocked or generic pack cannot be extended.
    result.tail = pack;
    return result;
  }
}

export function reduceUnion(types: TypeId[]): TypeId[] {
  const result: TypeId[] = [];
  for (let t of types) {
    t = follow(t);
    if (get(t, "NeverType")) continue;
    if (get(t, "ErrorType") || get(t, "AnyType")) return [t];
    const utv = get(t, "UnionType");
    if (utv) {
      for (let ty of flatOptions(utv)) {
        ty = follow(ty);
        if (get(ty, "NeverType")) continue;
        if (get(ty, "ErrorType") || get(ty, "AnyType")) return [ty];
        if (!result.includes(ty)) result.push(ty);
      }
    } else if (!result.includes(t)) result.push(t);
  }
  return result;
}

export function stripNil(builtinTypes: BuiltinTypes, arena: TypeArena, ty: TypeId): TypeId {
  ty = follow(ty);
  const utv = get(ty, "UnionType");
  if (utv) {
    const options = flatOptions(utv);
    if (!options.some(isNil)) return ty;
    const result = options.filter((o) => !isNil(o));
    if (result.length === 0) return builtinTypes.nilType;
    return follow(result.length === 1 ? result[0]! : arena.addType(unionType(result)));
  }
  return ty;
}

export const enum ErrorSuppression {
  Suppress,
  DoNotSuppress,
  NormalizationFailed,
}

export function orElse(a: ErrorSuppression, b: ErrorSuppression): ErrorSuppression {
  return a === ErrorSuppression.DoNotSuppress ? b : a;
}

export function shouldSuppressErrors(normalizer: Normalizer, ty: TypeId): ErrorSuppression {
  const tfit = get(follow(ty), "TypeFunctionInstanceType");
  if (tfit) {
    for (const arg of tfit.typeArguments) {
      const normType = normalizer.normalize(arg);
      if (!normType) return ErrorSuppression.NormalizationFailed;
      if (normType.shouldSuppressErrors()) return ErrorSuppression.Suppress;
    }
    return ErrorSuppression.DoNotSuppress;
  }
  const normType = normalizer.normalize(ty);
  if (!normType) return ErrorSuppression.NormalizationFailed;
  return normType.shouldSuppressErrors() ? ErrorSuppression.Suppress : ErrorSuppression.DoNotSuppress;
}

export function shouldSuppressErrorsPack(normalizer: Normalizer, tp: TypePackId): ErrorSuppression {
  const vtp = getPack(followPack(tp), "VariadicTypePack");
  if (vtp && get(follow(vtp.ty), "AnyType")) return ErrorSuppression.Suppress;
  const { head, tail } = flatten(tp);
  for (const ty of head) {
    const result = shouldSuppressErrors(normalizer, ty);
    if (result !== ErrorSuppression.DoNotSuppress) return result;
  }
  if (tail && tp !== tail && finite(tail)) return shouldSuppressErrorsPack(normalizer, tail);
  return ErrorSuppression.DoNotSuppress;
}

export function shouldSuppressErrors2(normalizer: Normalizer, ty1: TypeId, ty2: TypeId): ErrorSuppression {
  const result = shouldSuppressErrors(normalizer, ty1);
  if (result === ErrorSuppression.DoNotSuppress) return shouldSuppressErrors(normalizer, ty2);
  return result;
}

export function shouldSuppressErrorsPack2(normalizer: Normalizer, tp1: TypePackId, tp2: TypePackId): ErrorSuppression {
  const result = shouldSuppressErrorsPack(normalizer, tp1);
  if (result === ErrorSuppression.DoNotSuppress) return shouldSuppressErrorsPack(normalizer, tp2);
  return result;
}

export function isLiteral(expr: AstExpr): boolean {
  return (
    expr instanceof AstExprTable ||
    expr instanceof AstExprFunction ||
    expr instanceof AstExprConstantNumber ||
    expr instanceof AstExprConstantString ||
    expr instanceof AstExprConstantBool ||
    expr instanceof AstExprConstantNil
  );
}

/** Records a free type with the nearest enclosing scope that generalizes. */
export function trackInteriorFreeType(scope: Scope | undefined, ty: TypeId): void {
  for (; scope; scope = scope.parent) {
    if (scope.interiorFreeTypes) {
      scope.interiorFreeTypes.push(ty);
      return;
    }
  }
}

export function trackInteriorFreeTypePack(scope: Scope | undefined, tp: TypePackId): void {
  for (; scope; scope = scope.parent) {
    if (scope.interiorFreeTypePacks) {
      scope.interiorFreeTypePacks.push(tp);
      return;
    }
  }
}

export function fastIsSubtype(subTy: TypeId, superTy: TypeId): boolean {
  const r = relate(superTy, subTy);
  return r === Relation.Coincident || r === Relation.Superset;
}

/**
 * The one member of an expected union that a table literal can be meant as,
 * judged by its properties rather than by subtyping.
 */
export function extractMatchingTableType(
  expectedUnion: { options: TypeId[] },
  exprType: TypeId,
  builtinTypes: BuiltinTypes,
  arena: TypeArena,
): TypeId | undefined {
  const exprTable = get(follow(exprType), "TableType");
  if (!exprTable) return undefined;
  const potentialTables = new TypeIds();
  for (let ty of flatOptions({ kind: "UnionType", options: expectedUnion.options })) {
    const itv = get(ty, "IntersectionType");
    if (itv) ty = simplifyIntersection(builtinTypes, arena, new TypeIds(flatOptions(itv))).result;
    const tt = get(ty, "TableType");
    if (!tt) continue;
    let isDisjoint = false;
    for (const [name, expectedProp] of tt.props) {
      const exprProp = exprTable.props.get(name);
      if (!exprProp) continue;
      if (!expectedProp.readTy) continue;
      if (!exprProp.readTy) continue;
      const expectedPropType = follow(expectedProp.readTy);
      const exprPropType = follow(exprProp.readTy);
      if (relate(expectedPropType, exprPropType) === Relation.Disjoint) {
        isDisjoint = true;
        break;
      }
      const ft = get(exprPropType, "FreeType");
      if (ft && relate(ft.lowerBound, expectedPropType) === Relation.Disjoint) {
        isDisjoint = true;
        break;
      }
    }
    if (!isDisjoint) potentialTables.insert(ty);
  }
  if (potentialTables.size === 1) return potentialTables.front();
  return undefined;
}

export function isRecord(item: AstExprTableItem): boolean {
  if (item.kind === TableItemKind.Record) return true;
  return item.kind === TableItemKind.General && item.key instanceof AstExprConstantString;
}

export function unwrapGroup(expr: AstExpr): AstExpr {
  while (expr instanceof AstExprGroup) expr = expr.expr;
  return expr;
}

export function isOptionalType(ty: TypeId, builtinTypes: BuiltinTypes): boolean {
  ty = follow(ty);
  const isNilLike = (t: TypeId) =>
    t === builtinTypes.nilType ||
    t === builtinTypes.anyType ||
    t === builtinTypes.unknownType ||
    get(t, "PrimitiveType")?.type === PrimitiveKind.NilType;
  if (isNilLike(ty)) return true;
  const ut = get(ty, "UnionType");
  if (ut) return flatOptions(ut).some((o) => isNilLike(follow(o)));
  return false;
}

/** Whether a type is exactly `false | nil`, in either order. */
export function isApproximatelyFalsyType(ty: TypeId): boolean {
  ty = follow(ty);
  let seenNil = false;
  let seenFalse = false;
  const ut = get(ty, "UnionType");
  if (ut) {
    for (const option of flatOptions(ut)) {
      if (get(option, "PrimitiveType")?.type === PrimitiveKind.NilType) seenNil = true;
      else if (getSingleton(option, "BooleanSingleton")?.value === false) seenFalse = true;
      else return false;
    }
  }
  return seenFalse && seenNil;
}

/** Whether a type is exactly `~(false | nil)`. */
export function isApproximatelyTruthyType(ty: TypeId): boolean {
  ty = follow(ty);
  const nt = get(ty, "NegationType");
  if (nt) return isApproximatelyFalsyType(nt.ty);
  return false;
}

export class UnionBuilder {
  private readonly options = new TypeIds();
  private isTop = false;

  constructor(
    private readonly arena: TypeArena,
    private readonly builtinTypes: BuiltinTypes,
  ) {}

  add(ty: TypeId): void {
    ty = follow(ty);
    if (get(ty, "NeverType") || this.isTop) return;
    if (get(ty, "UnknownType")) {
      this.isTop = true;
      return;
    }
    const utv = get(ty, "UnionType");
    if (utv) for (const option of flatOptions(utv)) this.options.insert(option);
    else this.options.insert(ty);
  }

  build(): TypeId {
    if (this.isTop) return this.builtinTypes.unknownType;
    if (this.options.empty()) return this.builtinTypes.neverType;
    if (this.options.size === 1) return this.options.front();
    return this.arena.addType(unionType(this.options.take()));
  }

  get size(): number {
    return this.options.size;
  }
}

export class IntersectionBuilder {
  private readonly parts = new TypeIds();
  private isBottom = false;

  constructor(
    private readonly arena: TypeArena,
    private readonly builtinTypes: BuiltinTypes,
  ) {}

  add(ty: TypeId): void {
    ty = follow(ty);
    if (get(ty, "NeverType")) {
      this.isBottom = true;
      return;
    }
    if (get(ty, "UnknownType")) return;
    const itv = get(ty, "IntersectionType");
    if (itv) for (const part of flatOptions(itv)) this.parts.insert(part);
    else this.parts.insert(ty);
  }

  build(): TypeId {
    if (this.isBottom) return this.builtinTypes.neverType;
    if (this.parts.empty()) return this.builtinTypes.unknownType;
    if (this.parts.size === 1) return this.parts.front();
    return this.arena.addType(intersectionType(this.parts.take()));
  }

  get size(): number {
    return this.parts.size;
  }
}

export function addIntersection(arena: TypeArena, builtinTypes: BuiltinTypes, list: TypeId[]): TypeId {
  const ib = new IntersectionBuilder(arena, builtinTypes);
  for (const part of list) ib.add(part);
  return ib.build();
}

export function addUnion(arena: TypeArena, builtinTypes: BuiltinTypes, list: TypeId[]): TypeId {
  const ub = new UnionBuilder(arena, builtinTypes);
  for (const option of list) ub.add(option);
  return ub.build();
}

class ContainsGenerics extends TypeOnceVisitor {
  found = false;

  constructor(readonly generics: Set<object>) {
    super("ContainsGenerics", true);
  }

  override visit(): boolean {
    return !this.found;
  }

  override visitType(ty: TypeId, v: TypeId["ty"]): boolean {
    if (v.kind === "GenericType") {
      this.found = this.found || this.generics.has(ty);
      return true;
    }
    if (v.kind === "TypeFunctionInstanceType") return !this.found;
    return this.visit();
  }

  override visitTypePack(tp: TypePackId, v: TypePackId["ty"]): boolean {
    if (v.kind === "GenericTypePack") {
      this.found = this.found || this.generics.has(tp);
      return !this.found;
    }
    return this.visit();
  }
}

export function containsGeneric(ty: TypeId | TypePackId, generics: Set<object>): boolean {
  const cg = new ContainsGenerics(generics);
  if (ty instanceof Type) cg.traverse(ty);
  else cg.traversePack(ty);
  return cg.found;
}

export function isBlocked(ty: TypeId): boolean {
  ty = follow(ty);
  const tfit = get(ty, "TypeFunctionInstanceType");
  if (tfit) return tfit.state === TypeFunctionInstanceState.Unsolved;
  return get(ty, "BlockedType") !== undefined || get(ty, "PendingExpansionType") !== undefined;
}

export function getApproximateReturnTypeForFunctionCall(ty: TypeId, seen = new Set<TypeId>()): TypePackId | undefined {
  ty = follow(ty);
  if (seen.has(ty)) return undefined;
  seen.add(ty);
  const ftv = get(ty, "FunctionType");
  if (ftv) return ftv.retTypes;
  const utv = get(ty, "UnionType");
  if (utv && utv.options.length) return getApproximateReturnTypeForFunctionCall(flatOptions(utv)[0]!, seen);
  return undefined;
}
