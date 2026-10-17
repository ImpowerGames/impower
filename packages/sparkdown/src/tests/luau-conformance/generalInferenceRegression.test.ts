import { expect, test } from "vitest";
import { Normalizer, UnifierSharedState } from "../../compiler/typecheck/Normalize";
import { Scope } from "../../compiler/typecheck/Scope";
import { Subtyping } from "../../compiler/typecheck/Subtyping";
import { TypeFunctionRuntime } from "../../compiler/typecheck/TypeFunction";
import { BuiltinTypes, Property, tableType, TypeArena, type TypeId } from "../../compiler/typecheck/Type";

// Pinned TypeInfer.provisional.test.cpp:1267, explicitly SolverMode::New.
// Its provisional CHECK asserts identity despite the comment saying this
// caching is undesirable. No source alias substitutes for the exact graph.
test("table_containing_non_final_type_is_erroneously_cached", () => {
  const arena = new TypeArena();
  const builtins = new BuiltinTypes();
  const scope = Scope.root(builtins.anyTypePack);
  const normalizer = new Normalizer(arena, builtins, new UnifierSharedState());
  const table = tableType();
  const tableTypeId = arena.addType(table);
  const free = arena.freshType(builtins, scope);
  table.props.set("foo", Property.rw(free));
  const first = normalizer.normalize(tableTypeId);
  const second = normalizer.normalize(tableTypeId);
  expect(first).toBeDefined();
  expect(second).toBe(first);
});

test("normalizer cache limits are per instance, and zero disables the limit", () => {
  const builtins = new BuiltinTypes();
  const limited = new Normalizer(new TypeArena(), builtins, new UnifierSharedState(), false, 1);
  const unlimited = new Normalizer(new TypeArena(), builtins, new UnifierSharedState(), false, 0);
  const standard = new Normalizer(new TypeArena(), builtins, new UnifierSharedState());
  for (const type of [builtins.numberType, builtins.stringType]) {
    expect(limited.normalize(type)).toBeDefined();
    expect(unlimited.normalize(type)).toBeDefined();
    expect(standard.normalize(type)).toBeDefined();
  }
  // Cache usage equals two, strictly greater than the configured limit one.
  expect(limited.normalize(builtins.booleanType) === undefined).toBe(true);
  expect(unlimited.normalize(builtins.booleanType)).toBeDefined();
  expect(standard.normalize(builtins.booleanType)).toBeDefined();
  // A failed limited traversal clears that instance's caches, permitting retry.
  expect(limited.normalize(builtins.booleanType)).toBeDefined();
});

test("subtyping recursion limits preserve the positive boundary and disabled zero semantics", () => {
  const arena = new TypeArena(), builtins = new BuiltinTypes();
  const scope = Scope.root(builtins.anyTypePack);
  const chain = (depth: number): TypeId => {
    let type = builtins.numberType;
    for (let i = 0; i < depth; i++) {
      const table = tableType();
      table.props.set("x", Property.readonly(type));
      type = arena.addType(table);
    }
    return type;
  };
  const normalizer = () => new Normalizer(arena, builtins, new UnifierSharedState());
  const limitedNormalizer = normalizer();
  const limited = new Subtyping(builtins, arena, limitedNormalizer, new TypeFunctionRuntime(), 1);
  const boundary = new Subtyping(builtins, arena, normalizer(), new TypeFunctionRuntime(), 2);
  const unlimited = new Subtyping(builtins, arena, normalizer(), new TypeFunctionRuntime(), 0);
  const standard = new Subtyping(builtins, arena, normalizer(), new TypeFunctionRuntime());
  const left = chain(1), right = chain(1);
  expect(limited.isSubtype(left, right, scope).normalizationTooComplex).toBe(true);
  expect(limitedNormalizer.sharedState.counters.recursionCount).toBe(0);
  expect(boundary.isSubtype(left, right, scope).isSubtype).toBe(true);
  const deepLeft = chain(105), deepRight = chain(105);
  expect(standard.isSubtype(deepLeft, deepRight, scope).normalizationTooComplex).toBe(true);
  expect(unlimited.isSubtype(deepLeft, deepRight, scope).isSubtype).toBe(true);
  expect(limited.isSubtype(builtins.numberType, builtins.numberType, scope).isSubtype).toBe(true);
});
