// Synthetic setup from Luau 7d5f73364fdbbaa984fa545071630eba73cfea98,
// tests/TypeInfer.externTypes.test.cpp:803, read_write_class_properties.
import { addGlobalBindingWithBinding } from "../../compiler/typecheck/BuiltinDefinitions";
import type { Frontend } from "../../compiler/typecheck/Frontend";
import { Location } from "../../compiler/typecheck/Location";
import { externType, get, Property, Props, type TypeId } from "../../compiler/typecheck/Type";

/** One bounded setup; it is not a source-level class declaration or graph language. */
export interface AsymmetricRwExternSetup {
  kind: "asymmetricRwExtern";
}

export function validateAsymmetricRwExternSetup(value: unknown): asserts value is AsymmetricRwExternSetup {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== 1 || (value as AsymmetricRwExternSetup).kind !== "asymmetricRwExtern")
    throw new Error("expected exactly { kind: asymmetricRwExtern }");
}

export interface AsymmetricRwExternIdentities {
  instance: TypeId;
  workspace: TypeId;
  script: TypeId;
  part: TypeId;
}

/**
 * Install in a fresh fixture Frontend before checking any source. Each call
 * allocates its own graph while retaining that Frontend's builtin identities.
 * Upstream freezes arena memory after setup; TypeScript has no C++ debug page
 * protection. In particular, freeze does not make these types persistent, so
 * this setup must not call persist() or change their solver/clone semantics.
 */
export function installAsymmetricRwExternFixture(frontend: Frontend): AsymmetricRwExternIdentities {
  const arena = frontend.globals.globalTypes;
  const allocate = (name: string, props = new Props(), parent?: TypeId) =>
    arena.addType(externType(name, props, { parent, definitionModuleName: "Test" }));
  const instance = allocate("Instance");
  get(instance, "ExternType")!.props.set("Parent", Property.rw(instance));
  const workspace = allocate("Workspace");
  const script = allocate("Script", new Props([
    ["Parent", Property.rw(workspace, instance)],
  ]), instance);
  const part = allocate("Part", new Props([
    ["BrickColor", Property.rw(frontend.builtinTypes.stringType)],
    ["Parent", Property.rw(workspace, instance)],
  ]), instance);
  const workspaceProps = get(workspace, "ExternType")!.props;
  workspaceProps.set("Script", Property.readonly(script));
  workspaceProps.set("Part", Property.readonly(part));
  addGlobalBindingWithBinding(frontend.globals, "script", {
    typeId: script,
    location: new Location(),
    deprecated: false,
    deprecatedSuggestion: "",
  });
  return { instance, workspace, script, part };
}
