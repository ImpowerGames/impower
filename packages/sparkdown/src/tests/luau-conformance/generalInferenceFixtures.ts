import { addGlobalBindingWithBinding } from "../../compiler/typecheck/BuiltinDefinitions";
import type { Frontend } from "../../compiler/typecheck/Frontend";
import { Location } from "../../compiler/typecheck/Location";
import { externType, functionType, get, persist, Property, Props, tableType, TableState, TypeFun, type TypeId } from "../../compiler/typecheck/Type";

/** TypeInfer.test.cpp:1662 installs only a sealed, empty exported type alias. */
export function installGlobalTable(frontend: Frontend): void {
  const type = frontend.globals.globalTypes.addType(tableType({ state: TableState.Sealed }));
  frontend.globals.globalScope.exportedTypeBindings.set("GlobalTable", new TypeFun(type));
}

/** Fixture.cpp:987 createSomeExternTypes, distinct from ClassFixture and hidden aliases. */
export function createSomeExternTypes(frontend: Frontend): void {
  const arena = frontend.globals.globalTypes;
  const scope = frontend.globals.globalScope;
  // C++ unfreeze/freeze protects arena pages in debug builds. TypeArena in
  // this port has no page-protection API; persist below retains its semantic flags.
  const cls = (name: string, parent: TypeId) =>
    arena.addType(externType(name, new Props(), { parent, definitionModuleName: "Test" }));
  const parent = cls("Parent", frontend.builtinTypes.externType);
  for (const method of ["method", "virtual_method"]) {
    const fn = functionType(arena.addTypePack([parent]), arena.addTypePack([]), { hasSelf: true });
    fn.argNames = [{ name: "self", location: new Location() }];
    get(parent, "ExternType")!.props.set(method, Property.rw(arena.addType(fn)));
  }
  for (const [name, ty] of [
    ["Parent", parent],
    ["Child", cls("Child", parent)],
    ["AnotherChild", cls("AnotherChild", parent)],
    ["Unrelated", cls("Unrelated", frontend.builtinTypes.externType)],
  ] as const) {
    addGlobalBindingWithBinding(frontend.globals, name, { typeId: ty, location: new Location() });
    scope.exportedTypeBindings.set(name, new TypeFun(ty));
  }
  // The pinned helper persists ALL exported aliases, including any pre-existing alias.
  for (const alias of scope.exportedTypeBindings.values()) persist(alias.type);
}
