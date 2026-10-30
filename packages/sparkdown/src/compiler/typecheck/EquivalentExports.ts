import { Location, Position } from "./Location";
import type { Scope } from "./Scope";
import { Props, Property, TableIndexer, Type, TypeFun, TypeLevel, TypePackVar } from "./Type";

export function equivalentExports(a: Scope, b: Scope): boolean {
  if (a.parent !== b.parent) return false;
  const queue: [unknown, unknown][] = [];
  const forward = new Map<Type | TypePackVar, Type | TypePackVar>();
  const reverse = new Map<Type | TypePackVar, Type | TypePackVar>();
  const map = (left: Map<unknown, unknown>, right: Map<unknown, unknown>) => {
    if (left.size !== right.size) return false;
    const entries = [...right];
    let i = 0;
    for (const [key, value] of left) {
      if (key !== entries[i]![0]) return false;
      queue.push([value, entries[i++]![1]]);
    }
    return true;
  };
  if (!map(a.bindings, b.bindings) || !map(a.privateTypeBindings, b.privateTypeBindings)) return false;
  for (let i = 0; i < queue.length; i++) {
    if (queue.length > 100000) return false;
    const [left, right] = queue[i]!;
    if (left instanceof Type || left instanceof TypePackVar) {
      if (!(right instanceof left.constructor)) return false;
      const other = right as Type | TypePackVar;
      const prior = forward.get(left);
      if (prior) {
        if (prior !== other) return false;
        continue;
      }
      if (reverse.has(other)) return false;
      forward.set(left, other);
      reverse.set(other, left);
      if (left === other) continue;
      if (left.ty.kind !== other.ty.kind || left.persistent !== other.persistent) return false;
      switch (left.ty.kind) {
        case "PrimitiveType": case "SingletonType": case "FunctionType":
        case "TableType": case "MetatableType": case "AnyType":
        case "UnionType": case "IntersectionType": case "UnknownType":
        case "NeverType": case "NegationType": case "NoRefineType":
        case "GenericType": case "GenericTypePack":
        case "TypePack": case "VariadicTypePack":
          break;
        default:
          return false;
      }
      if (left instanceof Type && other instanceof Type) queue.push([left.documentationSymbol, other.documentationSymbol]);
      queue.push([left.ty, other.ty]);
      continue;
    }
    if (left === right) continue;
    if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
    if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
    if (left instanceof Props && right instanceof Props) {
      queue.push([left.entries(), right.entries()]);
      continue;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) return false;
      for (let j = 0; j < left.length; j++) queue.push([left[j], right[j]]);
      continue;
    }
    if (![Object.prototype, Location.prototype, Position.prototype, TypeFun.prototype, TypeLevel.prototype,
      Property.prototype, TableIndexer.prototype].includes(Object.getPrototypeOf(left))) return false;
    const l = left as Record<string, unknown>;
    const r = right as Record<string, unknown>;
    const generic = l["kind"] === "GenericType" || l["kind"] === "GenericTypePack";
    const keys = Object.keys(l).filter((key) => !(generic && key === "index")).sort();
    const otherKeys = Object.keys(r).filter((key) => !(generic && key === "index")).sort();
    if (keys.length !== otherKeys.length) return false;
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j]!;
      if (key !== otherKeys[j]) return false;
      queue.push([l[key], r[key]]);
    }
  }
  const pairs = [...forward].sort(([left], [right]) => left.serial - right.serial);
  for (let i = 1; i < pairs.length; i++) if (pairs[i - 1]![1].serial >= pairs[i]![1].serial) return false;
  return true;
}
