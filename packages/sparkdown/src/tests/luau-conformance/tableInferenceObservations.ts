// Bounded object observations from TypeInfer.tables.test.cpp at 7d5f733.
import { toString, type ToStringOptions } from "../../compiler/typecheck/ToString";
import { follow, get, type TypeId } from "../../compiler/typecheck/Type";

/** The exact optional indexer predicate at upstream line 1098. */
export function tableHasIndexer(type: TypeId): boolean {
  const table = get(follow(type), "TableType");
  if (!table) throw new Error("indexer observation requires TableType");
  return table.indexer !== undefined;
}

/** Counts only this table's property map, as upstream lines 2196 and 4183 do. */
export function tableHasOwnProperty(type: TypeId, name: string): boolean {
  const table = get(follow(type), "TableType");
  if (!table) throw new Error("property observation requires TableType");
  return table.props.has(name);
}

/** Selects the original TypeId from MetatableType, preserving its identity. */
export function metatablePart(type: TypeId, part: "table" | "metatable"): TypeId {
  const metatable = get(follow(type), "MetatableType");
  if (!metatable) throw new Error("metatable observation requires MetatableType");
  return metatable[part];
}

/** Upstream line 894 compares the printed strings, without comparing TypeIds. */
export function printedTypesDiffer(left: TypeId, right: TypeId, options: ToStringOptions = {}): boolean {
  return toString(left, options) !== toString(right, options);
}
