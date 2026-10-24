import { describe, expect, test } from "vitest";
import { BuiltinTypes, boundType, follow, metatableType, TableState, tableType, TypeArena, Property } from "../../compiler/typecheck/Type";
import { metatablePart, printedTypesDiffer, tableHasIndexer, tableHasOwnProperty } from "./tableInferenceObservations";

describe("table inference object observations", () => {
  test("reads actual optional indexer and own property map", () => {
    const builtins = new BuiltinTypes();
    const arena = new TypeArena();
    const table = tableType({ state: TableState.Sealed });
    const type = arena.addType(table);
    const wrapped = arena.addType(boundType(type));
    expect(tableHasIndexer(wrapped)).toBe(false);
    expect(tableHasOwnProperty(wrapped, "bad")).toBe(false);
    table.props.set("bad", Property.rw(builtins.numberType));
    table.indexer = { indexType: builtins.stringType, indexResultType: builtins.numberType, isReadOnly: false };
    expect(tableHasIndexer(wrapped)).toBe(true);
    expect(tableHasOwnProperty(wrapped, "bad")).toBe(true);
    expect(tableHasOwnProperty(wrapped, "")).toBe(false);
    expect(() => tableHasIndexer(builtins.numberType)).toThrow("requires TableType");
    expect(() => tableHasOwnProperty(builtins.numberType, "bad")).toThrow("requires TableType");
  });

  test("preserves original table and metatable identities", () => {
    const arena = new TypeArena();
    const table = arena.addType(tableType({ state: TableState.Sealed }));
    const metatable = arena.addType(tableType({ state: TableState.Sealed }));
    const other = arena.addType(tableType({ state: TableState.Sealed }));
    const type = arena.addType(metatableType(table, metatable));
    const bound = arena.addType(boundType(type));
    expect(metatablePart(bound, "table")).toBe(table);
    expect(metatablePart(bound, "metatable")).toBe(metatable);
    expect(follow(metatablePart(bound, "metatable"))).not.toBe(other);
    expect(() => metatablePart(table, "table")).toThrow("requires MetatableType");
  });

  test("keeps printed inequality distinct from object identity", () => {
    const builtins = new BuiltinTypes();
    const arena = new TypeArena();
    const first = arena.addType(tableType({ state: TableState.Sealed }));
    const second = arena.addType(tableType({ state: TableState.Sealed }));
    expect(first).not.toBe(second);
    expect(printedTypesDiffer(first, second)).toBe(false);
    expect(printedTypesDiffer(builtins.numberType, builtins.stringType)).toBe(true);
  });
});
