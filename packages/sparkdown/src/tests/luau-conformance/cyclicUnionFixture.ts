import type { Frontend } from "../../compiler/typecheck/Frontend";
import { tableType, TableState, TypeFun, unionType, type TypeId } from "../../compiler/typecheck/Type";

/** Internal arena setup for the pinned cyclic-union regression. */
export interface CyclicUnionSetup {
  kind: "cyclicUnion";
}

export function validateCyclicUnionSetup(value: unknown): asserts value is CyclicUnionSetup {
  if (
    value === null || typeof value !== "object" || Array.isArray(value) ||
    Reflect.ownKeys(value).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(value, "kind") ||
    (value as Record<string, unknown>)["kind"] !== "cyclicUnion"
  )
    throw new Error('internalTypeSetup must be exactly { kind: "cyclicUnion" }');
}

/**
 * Pinned TypeInfer.unionTypes.test.cpp's indexing_into_a_cyclic_union_doesnt_crash
 * deliberately replaces a fresh arena cell with a union containing itself.
 * This graph cannot be constructed by a source-level recursive type alias.
 * Call only on a fixture owned by the current check/session; never a cache.
 */
export function installCyclicUnionFixture(frontend: Frontend): TypeId {
  const arena = frontend.globals.globalTypes;
  const scope = frontend.globals.globalScope;
  const builtins = frontend.builtinTypes;
  const cyclic = arena.freshType(builtins, scope);
  const table = arena.addType(tableType({
    state: TableState.Sealed,
    scope,
    indexer: { indexType: builtins.numberType, indexResultType: builtins.numberType, isReadOnly: false },
  }));
  cyclic.ty = unionType([cyclic, table]);
  scope.exportedTypeBindings.set("BadCyclicUnion", new TypeFun(cyclic));
  return cyclic;
}
