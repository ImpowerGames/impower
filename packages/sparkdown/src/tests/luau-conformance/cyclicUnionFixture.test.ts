import { describe, expect, test } from "vitest";
import { Frontend } from "../../compiler/typecheck/Frontend";
import { checkLuauUnit, runFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { Mode } from "../../compiler/typecheck/Module";
import { get, TableState } from "../../compiler/typecheck/Type";
import { runWrapperText } from "../../compiler/utils/runWrapper";
import { parseSource } from "../compiler/grammarSnapshot";
import { installCyclicUnionFixture, validateCyclicUnionSetup } from "./cyclicUnionFixture";

describe("the pinned internal cyclic union fixture", () => {
  test("the exact upstream source reaches the real checker with the installed graph", () => {
    const source = `
        function f(x: BadCyclicUnion)
            return x[0]
        end
    `;
    const text = runWrapperText("W", source);
    const unit = runFileUnit("inmemory:///cyclic.luau?run=W", text, parseSource(text));
    expect(unit !== undefined).toBe(true);
    const frontend = new Frontend();
    installCyclicUnionFixture(frontend);
    const result = checkLuauUnit(frontend, "MainModule", unit!, Mode.Strict);
    expect(result.unit.errors).toEqual([]);
    expect(result.errors.filter((error) => error.data.kind !== "TypeAnnotationRequired").map((error) => error.data.kind)).toEqual([]);
  });

  test("a plain fixture has intact builtin number identity and no synthetic binding", () => {
    const frontend = new Frontend();
    expect(frontend.globals.globalScope.exportedTypeBindings.get("number")?.type === frontend.builtinTypes.numberType).toBe(true);
    expect(frontend.globals.globalScope.exportedTypeBindings.has("BadCyclicUnion")).toBe(false);
  });

  test("the first union member is its own TypeId and the second is a sealed numeric table", () => {
    const frontend = new Frontend();
    const scope = frontend.globals.globalScope;
    const before = frontend.globals.globalTypes.types.length;
    const cyclic = installCyclicUnionFixture(frontend);
    const union = get(cyclic, "UnionType");
    expect(union !== undefined).toBe(true);
    expect(union?.options.length).toBe(2);
    expect(union?.options[0] === cyclic).toBe(true);
    const tableId = union?.options[1];
    const table = tableId && get(tableId, "TableType");
    expect(table !== undefined).toBe(true);
    expect(table?.state).toBe(TableState.Sealed);
    expect(table?.scope === scope).toBe(true);
    expect(table?.indexer?.indexType === frontend.builtinTypes.numberType).toBe(true);
    expect(table?.indexer?.indexResultType === frontend.builtinTypes.numberType).toBe(true);
    expect(table?.indexer?.isReadOnly).toBe(false);
    expect(table?.props.size).toBe(0);
    expect(cyclic.owningArena === frontend.globals.globalTypes).toBe(true);
    expect(tableId?.owningArena === frontend.globals.globalTypes).toBe(true);
    expect(frontend.globals.globalTypes.types.length - before).toBe(2);
    expect(scope.exportedTypeBindings.get("BadCyclicUnion")?.type === cyclic).toBe(true);
    expect(scope.exportedTypeBindings.get("BadCyclicUnion")?.typeParams).toEqual([]);
  });

  test("installation preserves builtin variants and independent fixture graphs", () => {
    const first = new Frontend();
    const number = first.builtinTypes.numberType;
    const variant = number.ty;
    const cyclic = installCyclicUnionFixture(first);
    const second = new Frontend();
    expect(number.ty === variant).toBe(true);
    expect(first.globals.globalScope.exportedTypeBindings.get("number")?.type === number).toBe(true);
    expect(second.globals.globalScope.exportedTypeBindings.has("BadCyclicUnion")).toBe(false);
    const other = installCyclicUnionFixture(second);
    expect(other === cyclic).toBe(false);
    expect(get(other, "UnionType")?.options[0] === other).toBe(true);
    expect(other.owningArena === cyclic.owningArena).toBe(false);
  });

  test("repeated installation allocates a fresh graph without rewriting the earlier graph", () => {
    const frontend = new Frontend();
    const first = installCyclicUnionFixture(frontend);
    const second = installCyclicUnionFixture(frontend);
    expect(first === second).toBe(false);
    expect(get(first, "UnionType")?.options[0] === first).toBe(true);
    expect(get(second, "UnionType")?.options[0] === second).toBe(true);
    expect(frontend.globals.globalScope.exportedTypeBindings.get("BadCyclicUnion")?.type === second).toBe(true);
  });

  test("only the bounded descriptor is accepted", () => {
    expect(() => validateCyclicUnionSetup({ kind: "cyclicUnion" })).not.toThrow();
    for (const invalid of [null, [], "cyclicUnion", {}, { kind: "recursiveAlias" }, { kind: "cyclicUnion", binding: "other" }])
      expect(() => validateCyclicUnionSetup(invalid)).toThrow(/internalTypeSetup/);
  });
});
