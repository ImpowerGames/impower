import { describe, expect, test } from "vitest";
import { addGlobalBinding } from "../../compiler/typecheck/BuiltinDefinitions";
import { LuauTypeError, typeMismatch, TypeMismatchContext, UnknownSymbolContext } from "../../compiler/typecheck/Error";
import { Frontend } from "../../compiler/typecheck/Frontend";
import { Location, Position } from "../../compiler/typecheck/Location";
import { boundType, functionType, get, InternalCompilerError, primitiveType, PrimitiveKind, Property, tableType, TableState, TypeArena } from "../../compiler/typecheck/Type";
import { captureGlobalFunctionLevel, equalTypeMismatchData, firstErrorAtBegin, observeCheck, tableState } from "./diagnosticObservations";

const location = (line = 1, column = 2, end = 3) => new Location(new Position(line, column), new Position(line, end));

describe("pinned built-in/non-strict observations", () => {
  test("begin-position selection preserves first-match order and requires a match", () => {
    const f = new Frontend();
    const fields = { expected: f.builtinTypes.numberType, passed: f.builtinTypes.stringType, argumentIndex: 0 };
    const a = new LuauTypeError(location(1, 0), { kind: "CheckedFunctionCallError", checkedFunctionName: "wrong", ...fields });
    const b = new LuauTypeError(location(1, 2, 7), { kind: "CheckedFunctionCallError", checkedFunctionName: "first", ...fields });
    const c = new LuauTypeError(location(1, 2, 9), { kind: "CheckedFunctionCallError", checkedFunctionName: "second", ...fields });
    expect(firstErrorAtBegin([a, b, c], [1, 2])).toEqual({ index: 1, error: b });
    expect(firstErrorAtBegin([c, b, a], [1, 2]).error).toBe(c);
    expect(() => firstErrorAtBegin([a, b], [2, 2])).toThrow("Expected error at 2:2");
    expect(() => firstErrorAtBegin([], [1, 2])).toThrow();
  });

  test("TypeMismatch compares dereferenced primitives structurally", () => {
    const arena = new TypeArena();
    const n = arena.addType(primitiveType(PrimitiveKind.Number));
    const s = arena.addType(primitiveType(PrimitiveKind.String));
    const anotherNumber = arena.addType(primitiveType(PrimitiveKind.Number, s));
    const anotherString = arena.addType(primitiveType(PrimitiveKind.String));
    expect(anotherNumber).not.toBe(n);
    expect(equalTypeMismatchData(typeMismatch(s, n), typeMismatch(anotherString, anotherNumber))).toBe(true);
    expect(equalTypeMismatchData(typeMismatch(s, n), typeMismatch(anotherString, arena.addType(boundType(anotherNumber))))).toBe(true);
    expect(equalTypeMismatchData(typeMismatch(s, n), typeMismatch(n, s))).toBe(false);
    expect(equalTypeMismatchData(typeMismatch(s, n), typeMismatch(s, n, { reason: "changed" }))).toBe(false);
    expect(equalTypeMismatchData(typeMismatch(s, n), typeMismatch(s, n, { context: TypeMismatchContext.InvariantContext }))).toBe(false);
  });

  test("nested error presence, location and data use the upstream comparator", () => {
    const f = new Frontend(), n = f.builtinTypes.numberType, s = f.builtinTypes.stringType;
    const nested = new LuauTypeError(location(), { kind: "UnknownSymbol", name: "x", context: UnknownSymbolContext.Binding }, "A");
    const other = new LuauTypeError(location(), { kind: "UnknownSymbol", name: "x", context: UnknownSymbolContext.Type }, "B");
    expect(equalTypeMismatchData(typeMismatch(s, n, { error: nested }), typeMismatch(s, n, { error: other }))).toBe(true);
    expect(equalTypeMismatchData(typeMismatch(s, n, { error: nested }), typeMismatch(s, n))).toBe(false);
    other.location = location(2);
    expect(equalTypeMismatchData(typeMismatch(s, n, { error: nested }), typeMismatch(s, n, { error: other }))).toBe(false);
    other.location = location();
    other.data = { kind: "UnknownSymbol", name: "y", context: UnknownSymbolContext.Binding };
    expect(equalTypeMismatchData(typeMismatch(s, n, { error: nested }), typeMismatch(s, n, { error: other }))).toBe(false);
    expect(() => equalTypeMismatchData(typeMismatch(f.builtinTypes.anyType, n), typeMismatch(f.builtinTypes.anyType, n))).toThrow("unsupported structural");
  });

  test("captured levels read the original function even after a binding is replaced", () => {
    const f = new Frontend(), a = f.globals.globalTypes;
    const fnType = a.addType(functionType(a.addTypePack([]), a.addTypePack([])));
    const table = a.addType(tableType());
    get(table, "TableType")!.props.set("frexp", Property.rw(fnType));
    addGlobalBinding(f.globals, "math", table, "@test");
    const captured = captureGlobalFunctionLevel(f, "math", "frexp");
    const fn = get(fnType, "FunctionType")!;
    expect(captured.function).toBe(fn);
    const before = captured.before;
    fn.level.level += 1;
    fn.level.subLevel += 2;
    expect(captured.current()).toEqual({ level: before.level + 1, subLevel: before.subLevel + 2 });
    get(table, "TableType")!.props.set("frexp", Property.rw(a.addType(functionType(a.addTypePack([]), a.addTypePack([])))));
    expect(captured.current()).not.toEqual(captureGlobalFunctionLevel(f, "math", "frexp").current());
    expect(captured.before).toEqual(before);
    expect(() => captureGlobalFunctionLevel(f, "missing", "frexp")).toThrow("missing global");
  });

  test("table state and actual exception class distinguish negative controls", () => {
    const a = new TypeArena(), t = a.addType(tableType({ state: TableState.Sealed }));
    expect(tableState(t)).toBe(TableState.Sealed);
    get(t, "TableType")!.state = TableState.Unsealed;
    expect(tableState(t)).toBe(TableState.Unsealed);
    const ice = new InternalCompilerError("actual");
    expect(observeCheck(() => { throw ice; })).toEqual({ kind: "threw", error: ice, internalCompilerError: true });
    expect(observeCheck(() => { throw new Error("InternalCompilerError"); })).toMatchObject({ kind: "threw", internalCompilerError: false });
    expect(observeCheck(() => 42)).toEqual({ kind: "returned", value: 42 });
  });
});
