import { expect, test } from "vitest";
import { Frontend } from "../../compiler/typecheck/Frontend";
import { first, get, getPack, tableType, TableState, TypeFun, TypeLevel } from "../../compiler/typecheck/Type";
import { createSomeExternTypes, installGlobalTable } from "./generalInferenceFixtures";

test("installs GlobalTable only as the pinned sealed empty exported alias", () => {
  const frontend = new Frontend();
  installGlobalTable(frontend);
  const alias = frontend.globals.globalScope.exportedTypeBindings.get("GlobalTable")!;
  const table = get(alias.type, "TableType")!;
  expect(alias.type.owningArena).toBe(frontend.globals.globalTypes);
  expect(alias.type.persistent).toBe(false);
  expect(frontend.globals.globalScope.bindings.has("GlobalTable")).toBe(false);
  expect(table.state).toBe(TableState.Sealed);
  expect(table.level).toEqual(new TypeLevel());
  expect(table.props.entries()).toEqual([]);
  expect(table.indexer).toBeUndefined();
});

test("installs the pinned Parent/Child graph with identical alias and global bindings", () => {
  const frontend = new Frontend();
  const prior = frontend.globals.globalTypes.addType(tableType());
  frontend.globals.globalScope.exportedTypeBindings.set("Existing", new TypeFun(prior));
  createSomeExternTypes(frontend);
  const scope = frontend.globals.globalScope;
  const parent = scope.exportedTypeBindings.get("Parent")!.type;
  for (const name of ["Parent", "Child", "AnotherChild", "Unrelated"]) {
    const ty = scope.exportedTypeBindings.get(name)!.type;
    expect(scope.bindings.get(name)!.typeId).toBe(ty);
    expect(ty.owningArena).toBe(frontend.globals.globalTypes);
    expect(ty.persistent).toBe(true);
    const external = get(ty, "ExternType")!;
    expect(external.definitionModuleName).toBe("Test");
    expect(external.parent).toBe(name === "Child" || name === "AnotherChild" ? parent : frontend.builtinTypes.externType);
    expect(external.metatable).toBeUndefined();
    expect(external.indexer).toBeUndefined();
    expect(external.props.entries().map(([name]) => name)).toEqual(name === "Parent" ? ["method", "virtual_method"] : []);
  }
  expect(prior.persistent).toBe(true);
  const external = get(parent, "ExternType")!;
  for (const method of ["method", "virtual_method"]) {
    const property = external.props.get(method)!;
    expect(property.readTy).toBe(property.writeTy);
    const fn = get(property.readTy!, "FunctionType")!;
    expect(fn.hasSelf).toBe(true);
    expect(fn.isCheckedFunction).toBe(false);
    expect(fn.generics).toEqual([]);
    expect(fn.genericPacks).toEqual([]);
    expect(fn.argNames.map(x => x?.name)).toEqual(["self"]);
    expect(first(fn.argTypes)).toBe(parent);
    expect(getPack(fn.argTypes, "TypePack")!.head).toEqual([parent]);
    expect(getPack(fn.retTypes, "TypePack")!.head).toEqual([]);
  }
});

test("keeps synthetic extern identities isolated between fixture instances", () => {
  const a = new Frontend(), b = new Frontend();
  createSomeExternTypes(a);
  createSomeExternTypes(b);
  for (const name of ["Parent", "Child", "AnotherChild", "Unrelated"])
    expect(a.globals.globalScope.exportedTypeBindings.get(name)!.type).not.toBe(b.globals.globalScope.exportedTypeBindings.get(name)!.type);
  expect(a.globals.globalScope.exportedTypeBindings.has("BaseClass")).toBe(false);
  expect(a.globals.globalScope.exportedTypeBindings.has("Not")).toBe(false);
});
