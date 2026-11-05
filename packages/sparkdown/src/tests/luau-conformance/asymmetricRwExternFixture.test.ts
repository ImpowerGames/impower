import { describe, expect, test } from "vitest";
import { Frontend } from "../../compiler/typecheck/Frontend";
import { checkLuauUnit, luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { Mode } from "../../compiler/typecheck/Module";
import { parseSource } from "../compiler/grammarSnapshot";
import { addGlobalBinding } from "../../compiler/typecheck/BuiltinDefinitions";
import { BuiltinTypes, get, Property } from "../../compiler/typecheck/Type";
import { installAsymmetricRwExternFixture, validateAsymmetricRwExternSetup, type AsymmetricRwExternIdentities } from "./asymmetricRwExternFixture";

// Exact R"(...)" bytes from pinned TypeInfer.externTypes.test.cpp.
const source = `
        script.Parent.Part.BrickColor = 0xFFFFFF
        script.Parent.Part.Parent = script
    `;

// The same identity assertions must accept the real graph and reject each
// independently damaged graph. Compare booleans to avoid printing cycles.
function assertParentAndBindingIdentities(frontend: Frontend, ids: AsymmetricRwExternIdentities): void {
  for (const ty of [ids.script, ids.part]) {
    const cls = get(ty, "ExternType")!;
    expect(cls.parent === ids.instance).toBe(true);
    expect(cls.props.get("Parent")!.readTy === ids.workspace).toBe(true);
    expect(cls.props.get("Parent")!.writeTy === ids.instance).toBe(true);
  }
  expect(frontend.globals.globalScope.bindings.get("script")?.typeId === ids.script).toBe(true);
}

describe("asymmetric read/write extern fixture", () => {
  test("checks the exact upstream assignments with builtin mismatch identities", () => {
    const frontend = new Frontend();
    installAsymmetricRwExternFixture(frontend);
    const unit = luauFileUnit(source, parseSource)!;
    expect(unit.errors).toEqual([]);
    const checked = checkLuauUnit(frontend, "MainModule", unit, Mode.Strict);
    expect(checked.errors.map((error) => error.data.kind)).toEqual(["TypeMismatch"]);
    const error = checked.errors[0]!;
    expect([error.location.begin.line, error.location.begin.column, error.location.end.line, error.location.end.column]).toEqual([1, 40, 1, 48]);
    if (error.data.kind !== "TypeMismatch") throw new Error("expected TypeMismatch");
    expect(error.data.wantedType === frontend.builtinTypes.stringType).toBe(true);
    expect(error.data.givenType === frontend.builtinTypes.numberType).toBe(true);
  });

  test("allocates the exact identities, inheritance, property access and persistence", () => {
    const frontend = new Frontend();
    const ids = installAsymmetricRwExternFixture(frontend);
    assertParentAndBindingIdentities(frontend, ids);
    const instance = get(ids.instance, "ExternType")!;
    const workspace = get(ids.workspace, "ExternType")!;
    const script = get(ids.script, "ExternType")!;
    const part = get(ids.part, "ExternType")!;
    expect(instance.props.get("Parent")!.readTy === ids.instance).toBe(true);
    expect(instance.props.get("Parent")!.writeTy === ids.instance).toBe(true);
    expect(instance.parent).toBeUndefined();
    expect(workspace.parent).toBeUndefined();
    for (const cls of [script, part]) {
      expect(cls.parent === ids.instance).toBe(true);
      expect(cls.props.get("Parent")!.readTy === ids.workspace).toBe(true);
      expect(cls.props.get("Parent")!.writeTy === ids.instance).toBe(true);
      expect(cls.props.get("Parent")!.isShared()).toBe(false);
    }
    expect(part.props.get("BrickColor")!.readTy === frontend.builtinTypes.stringType).toBe(true);
    expect(part.props.get("BrickColor")!.writeTy === frontend.builtinTypes.stringType).toBe(true);
    for (const [name, ty] of [["Script", ids.script], ["Part", ids.part]] as const) {
      expect(workspace.props.get(name)!.readTy === ty).toBe(true);
      expect(workspace.props.get(name)!.writeTy).toBeUndefined();
    }
    expect(frontend.globals.globalScope.bindings.get("script")!.typeId === ids.script).toBe(true);
    expect(frontend.globals.globalScope.bindings.get("script")!.documentationSymbol).toBeUndefined();
    expect(frontend.globals.globalTypes.types.length).toBe(4);
    for (const [name, ty] of Object.entries(ids)) {
      expect(ty.owningArena === frontend.globals.globalTypes).toBe(true);
      expect(ty.persistent).toBe(false);
      expect(get(ty, "ExternType")!.name.toLowerCase()).toBe(name);
      expect(get(ty, "ExternType")!.definitionModuleName).toBe("Test");
    }
    expect(frontend.builtinTypes.stringType.persistent).toBe(true);
  });

  test("keeps independent graphs, unrelated globals and shared builtins isolated", () => {
    const builtins = new BuiltinTypes();
    const first = new Frontend(builtins);
    const second = new Frontend(builtins);
    addGlobalBinding(first.globals, "unrelated", builtins.numberType, "Test");
    const unrelated = first.globals.globalScope.bindings.get("unrelated");
    const builtinCount = builtins.arena.types.length;
    const a = installAsymmetricRwExternFixture(first);
    const b = installAsymmetricRwExternFixture(second);
    for (const name of ["instance", "workspace", "script", "part"] as const)
      expect(a[name] === b[name]).toBe(false);
    get(a.part, "ExternType")!.props.set("BrickColor", Property.rw(builtins.numberType));
    expect(get(b.part, "ExternType")!.props.get("BrickColor")!.readTy === builtins.stringType).toBe(true);
    expect(first.globals.globalScope.bindings.get("unrelated") === unrelated).toBe(true);
    expect(second.globals.globalScope.bindings.has("unrelated")).toBe(false);
    expect(builtins.arena.types.length).toBe(builtinCount);
    expect(builtins.stringType.persistent).toBe(true);
  });

  test.each(["script RW", "part RW", "script inheritance", "part inheritance", "script binding"])("identity assertions reject damaged %s", (damage) => {
    const frontend = new Frontend();
    const ids = installAsymmetricRwExternFixture(frontend);
    assertParentAndBindingIdentities(frontend, ids);
    const target = get(damage.startsWith("part") ? ids.part : ids.script, "ExternType")!;
    if (damage.endsWith("RW")) target.props.get("Parent")!.makeShared();
    else if (damage.endsWith("inheritance")) target.parent = ids.workspace;
    else frontend.globals.globalScope.bindings.delete("script");
    expect(() => assertParentAndBindingIdentities(frontend, ids)).toThrow();
    if (damage === "script binding") {
      const unit = luauFileUnit(source, parseSource)!;
      const result = checkLuauUnit(frontend, "MainModule", unit, Mode.Strict);
      expect(result.errors.some((error) => error.data.kind === "UnknownSymbol")).toBe(true);
    }
  });

  test("validates the bounded descriptor before allocating", () => {
    expect(() => validateAsymmetricRwExternSetup({ kind: "asymmetricRwExtern" })).not.toThrow();
    for (const value of [null, [], {}, { kind: "unknown" }, { kind: "asymmetricRwExtern", extra: true }])
      expect(() => validateAsymmetricRwExternSetup(value)).toThrow("expected exactly");
  });
});
