import { describe, expect, test } from "vitest";
import { errorToString } from "../../compiler/typecheck/Error";
import { Frontend } from "../../compiler/typecheck/Frontend";
import { Location } from "../../compiler/typecheck/Location";
import { createSparkdownParser } from "../../compiler/utils/createSparkdownParser";
import checkedAbsDefinition from "../compiler/definition-fixtures/checked-abs.json";
import { checkLuauUnit, luauFileUnit, type LuauUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { Mode } from "../../compiler/typecheck/Module";
import {
  toString,
  toStringDetailed,
  toStringNamedFunction,
  toStringPack,
  type ToStringNameMap,
  type ToStringOptions,
} from "../../compiler/typecheck/ToString";
import {
  blockedType,
  blockedTypePack,
  boundType,
  boundTypePack,
  errorType,
  errorTypePack,
  flatten,
  follow,
  freeType,
  freeTypePack,
  functionType,
  genericType,
  genericTypePack,
  get,
  getPack,
  intersectionType,
  metatableType,
  negationType,
  pendingExpansionType,
  Polarity,
  Property,
  Props,
  stringSingleton,
  TableIndexer,
  TableState,
  tableType,
  Type,
  TypeArena,
  typeFunctionInstanceType,
  typeFunctionInstanceTypePack,
  TypeLevel,
  typePack,
  TypePackVar,
  unionType,
  variadicTypePack,
  type BuiltinTypes,
  type FunctionType,
  type TypeId,
} from "../../compiler/typecheck/Type";
import type { TypeFunction, TypePackFunction } from "../../compiler/typecheck/TypeFunction";
import { checkLuau, describeDiagnostic, type LuauDiagnostic } from "./typecheckTestHarness";

function getBuiltins(): BuiltinTypes {
  return new Frontend().builtinTypes;
}

function toStringOptions(fields: ToStringOptions = {}): ToStringOptions & { nameMap: ToStringNameMap } {
  return { ...fields, nameMap: { types: new Map(), typePacks: new Map() } };
}

function requireNoErrors(diagnostics: readonly LuauDiagnostic[]): void {
  expect(diagnostics.map(describeDiagnostic)).toEqual([]);
}

function ignoreMissingAnnotations(diagnostics: readonly LuauDiagnostic[]): LuauDiagnostic[] {
  return diagnostics.filter((d) => d.code !== "TypeAnnotationRequired");
}

const luauFileParser = createSparkdownParser("inmemory:///snippet.luau");

function luauTextUnit(source: string): LuauUnit {
  return luauFileUnit(source, luauFileParser.parse(source));
}

interface CheckedModule {
  diagnostics: LuauDiagnostic[];
  requireType(name: string): TypeId;
}

function checkModule(source: string, options: { mode?: Mode; frontend?: Frontend } = {}): CheckedModule {
  const frontend = options.frontend ?? new Frontend();
  const checked = checkLuauUnit(frontend, "MainModule", luauTextUnit(source), options.mode ?? Mode.Strict);
  const scope = checked.module.getModuleScope();
  return {
    diagnostics: checked.errors.map((e) => ({
      line: e.location.begin.line,
      column: e.location.begin.column,
      endLine: e.location.end.line,
      endColumn: e.location.end.column,
      message: errorToString(e),
      code: e.data.kind,
    })),
    requireType(name) {
      const binding = scope.linearSearchForBinding(name);
      if (!binding) throw new Error(`Unable to requireType "${name}"`);
      return follow(binding.typeId);
    },
  };
}

function functionOf(ty: TypeId): FunctionType {
  const ftv = get(follow(ty), "FunctionType");
  if (!ftv) throw new Error(`not a function type: ${toString(ty)}`);
  return ftv;
}

describe("ToString", () => {
  test("primitive", () => {
    const result = checkLuau("local a = nil    local b = 44    local c = 'lalala'    local d = true");
    requireNoErrors(result.diagnostics);

    expect(result.typeOf("a")).toBe("nil");

    expect(result.typeOf("b")).toBe("number");
    expect(result.typeOf("c")).toBe("string");
    expect(result.typeOf("d")).toBe("boolean");
  });

  test("builtin_top_extern_types", () => {
    const builtins = getBuiltins();
    expect(toString(builtins.objectType)).toBe("object");
    expect(toString(builtins.classType)).toBe("class");
  });

  test("bound_types", () => {
    const result = checkLuau("local a = 444    local b = a");
    requireNoErrors(result.diagnostics);

    expect(result.typeOf("b")).toBe("number");
  });

  test.skip("free_types", () => {});

  test("free_types_stringify_the_same_regardless_of_solver", () => {
    const frontend = new Frontend();
    const a = new TypeArena();
    const t = a.addType(freeType(frontend.globals.globalScope, frontend.builtinTypes.neverType, frontend.builtinTypes.unknownType));

    expect(toString(t)).toBe("'a");
  });

  test("cyclic_table", () => {
    const cyclicTable = new Type(tableType());
    const tableOne = get(cyclicTable, "TableType")!;
    tableOne.props.set("self", Property.rw(cyclicTable));

    expect(toString(cyclicTable)).toBe("t1 where t1 = {| self: t1 |}");
  });

  test("named_table", () => {
    const table = new Type(tableType());
    const t = get(table, "TableType")!;
    t.name = "TheTable";

    expect(toString(table)).toBe("TheTable");
  });

  test("empty_table", () => {
    const result = checkLuau(`
        local a: {}
    `);

    expect(result.typeOf("a")).toBe("{  }");

    expect(result.typeOf("a", { useLineBreaks: true })).toBe("{  }");
  });

  test("table_respects_use_line_break", () => {
    const result = checkLuau(`
        local a: { prop: string, anotherProp: number, thirdProp: boolean }
    `);

    expect(result.typeOf("a", { useLineBreaks: true })).toBe(
      "{\n" + "    anotherProp: number,\n" + "    prop: string,\n" + "    thirdProp: boolean\n" + "}",
    );
  });

  test("nil_or_nil_is_nil_not_question_mark", () => {
    const result = checkLuau(`
      type nil_ty = nil | nil
      local a : nil_ty = nil
  `);
    expect(result.typeOf("a", { useLineBreaks: false })).toBe("nil");
  });

  test("long_disjunct_of_nil_is_nil_not_question_mark", () => {
    const result = checkLuau(`
      type nil_ty = nil | nil | nil | nil | nil
      local a : nil_ty = nil
  `);
    expect(result.typeOf("a", { useLineBreaks: false })).toBe("nil");
  });

  test("metatable", () => {
    const table = new Type(tableType());
    const metatable = new Type(tableType());
    const mtv = new Type(metatableType(table, metatable));
    expect(toString(mtv)).toBe("setmetatable<{|  |}, {|  |}>");
  });

  test("named_metatable", () => {
    const table = new Type(tableType());
    const metatable = new Type(tableType());
    const mtv = new Type(metatableType(table, metatable, "NamedMetatable"));
    expect(toString(mtv)).toBe("NamedMetatable");
  });

  test.skip("named_metatable_toStringNamedFunction", () => {});

  test("exhaustive_toString_of_cyclic_table", () => {
    const result = checkLuau(
      `
        --!strict
        local Vec3 = {}
        Vec3.__index = Vec3
        function Vec3.new()
            return setmetatable({x=0, y=0, z=0}, Vec3)
        end

        export type Vec3 = typeof(Vec3.new())

        local thefun: any = function(self, o) return self end

        local multiply: ((Vec3, Vec3) -> Vec3) & ((Vec3, number) -> Vec3) = thefun

        Vec3.__mul = multiply

        local a = Vec3.new()
    `,
      { fixture: "BuiltinsFixture" },
    );

    const a = result.typeOf("a", { exhaustive: true });

    expect(a).not.toContain("CYCLE");
    expect(a).not.toContain("TRUNCATED");

    expect(a).toBe(
      "t2 where " +
        "t1 = { __index: t1, __mul: ((t2, number) -> t2) & ((t2, t2) -> t2), new: () -> t2 } ; " +
        "t2 = setmetatable<{ x: number, y: number, z: number }, t1>",
    );
  });

  test("intersection_parenthesized_only_if_needed", () => {
    const builtins = getBuiltins();
    const utv = new Type(unionType([builtins.numberType, builtins.stringType]));
    const itv = new Type(intersectionType([utv, builtins.booleanType]));

    expect(toString(itv)).toBe("(number | string) & boolean");
  });

  test("union_parenthesized_only_if_needed", () => {
    const builtins = getBuiltins();
    const itv = new Type(intersectionType([builtins.numberType, builtins.stringType]));
    const utv = new Type(unionType([itv, builtins.booleanType]));

    expect(toString(utv)).toBe("(number & string) | boolean");
  });

  test("functions_are_always_parenthesized_in_unions_or_intersections", () => {
    const frontend = new Frontend();
    const builtins = frontend.builtinTypes;
    const stringAndNumberPack = new TypePackVar(typePack([builtins.stringType, builtins.numberType]));
    const numberAndStringPack = new TypePackVar(typePack([builtins.numberType, builtins.stringType]));

    const sn2ns = new Type(functionType(stringAndNumberPack, numberAndStringPack));
    const ns2sn = new Type(functionType(numberAndStringPack, stringAndNumberPack, { level: frontend.globals.globalScope.level }));

    const utv = new Type(unionType([ns2sn, sn2ns]));
    const itv = new Type(intersectionType([ns2sn, sn2ns]));

    expect(toString(utv)).toBe("((number, string) -> (string, number)) | ((string, number) -> (number, string))");
    expect(toString(itv)).toBe("((number, string) -> (string, number)) & ((string, number) -> (number, string))");
  });

  test("simple_intersections_printed_on_one_line", () => {
    const result = checkLuau(`
        local a: string & number
    `);

    expect(result.typeOf("a", { useLineBreaks: true })).toBe("number & string");
  });

  test("complex_intersections_printed_on_multiple_lines", () => {
    const result = checkModule(`
        local a: string & number & boolean
    `);

    const opts: ToStringOptions = { useLineBreaks: true, compositeTypesSingleLineLimit: 2 };

    expect(toString(result.requireType("a"), opts)).toBe("boolean\n" + "& number\n" + "& string");
  });

  test("overloaded_functions_always_printed_on_multiple_lines", () => {
    const result = checkLuau(`
        local a: ((string) -> string) & ((number) -> number)
    `);

    expect(result.typeOf("a", { useLineBreaks: true })).toBe("((number) -> number)\n" + "& ((string) -> string)");
  });

  test("simple_unions_printed_on_one_line", () => {
    const result = checkLuau(`
        local a: number | boolean
    `);

    expect(result.typeOf("a", { useLineBreaks: true })).toBe("boolean | number");
  });

  test("complex_unions_printed_on_multiple_lines", () => {
    const result = checkModule(`
        local a: string | number | boolean
    `);

    const opts: ToStringOptions = { compositeTypesSingleLineLimit: 2, useLineBreaks: true };

    expect(toString(result.requireType("a"), opts)).toBe("boolean\n" + "| number\n" + "| string");
  });

  test("quit_stringifying_table_type_when_length_is_exceeded", () => {
    const builtins = getBuiltins();
    const ttv = tableType();
    for (const c of "abcdefghijklmno") ttv.props.set(c, Property.rw(builtins.numberType));

    const tv = new Type(ttv);

    const o: ToStringOptions = { exhaustive: false, maxTableLength: 40 };
    expect(toString(tv, o)).toBe("{| a: number, b: number, c: number, d: number, e: number, ... 10 more ... |}");
  });

  test("stringifying_table_type_is_still_capped_when_exhaustive", () => {
    const builtins = getBuiltins();
    const ttv = tableType();
    for (const c of "abcdefg") ttv.props.set(c, Property.rw(builtins.numberType));

    const tv = new Type(ttv);

    const o: ToStringOptions = { exhaustive: true, maxTableLength: 40 };
    expect(toString(tv, o)).toBe("{| a: number, b: number, c: number, d: number, e: number, ... 2 more ... |}");
  });

  test("quit_stringifying_type_when_length_is_exceeded", () => {
    const result = checkModule(`
        function f0() end
        function f1(f) return f or f0 end
        function f2(f) return f or f1 end
        function f3(f) return f or f2 end
    `);

    const diagnostics = ignoreMissingAnnotations(result.diagnostics);

    requireNoErrors(diagnostics);

    const o = toStringOptions({ exhaustive: false, maxTypeLength: 20 });
    expect(toString(result.requireType("f0"), o)).toBe("() -> ()");
    expect(toString(result.requireType("f1"), o)).toBe("<T>(T) -> (() -> ()) ... *TRUNCATED*");
    expect(toString(result.requireType("f2"), o)).toBe("<U>(U) -> (<T>(T) -> (() -> ())... *TRUNCATED*");
    expect(toString(result.requireType("f3"), o)).toBe("<V>(V) -> (<U>(U) -> (<T>(T) -> (() -> ())... *TRUNCATED*");
  });

  test("stringifying_type_is_still_capped_when_exhaustive", () => {
    const result = checkModule(`
        function f0() end
        function f1(f) return f or f0 end
        function f2(f) return f or f1 end
        function f3(f) return f or f2 end
    `);

    const diagnostics = ignoreMissingAnnotations(result.diagnostics);

    requireNoErrors(diagnostics);

    const o = toStringOptions({ exhaustive: true, maxTypeLength: 20 });
    expect(toString(result.requireType("f0"), o)).toBe("() -> ()");
    expect(toString(result.requireType("f1"), o)).toBe("<T>(T) -> (() -> ()) ... *TRUNCATED*");
    expect(toString(result.requireType("f2"), o)).toBe("<U>(U) -> (<T>(T) -> (() -> ())... *TRUNCATED*");
    expect(toString(result.requireType("f3"), o)).toBe("<V>(V) -> (<U>(U) -> (<T>(T) -> (() -> ())... *TRUNCATED*");
  });

  test("stringifying_table_type_correctly_use_matching_table_state_braces", () => {
    const builtins = getBuiltins();
    const ttv = tableType({ state: TableState.Sealed, level: new TypeLevel() });
    for (const c of "abcdefghij") ttv.props.set(c, Property.rw(builtins.numberType));

    const tv = new Type(ttv);

    const o: ToStringOptions = { maxTableLength: 40 };
    expect(toString(tv, o)).toBe("{ a: number, b: number, c: number, d: number, e: number, ... 5 more ... }");
  });

  test("stringifying_cyclic_union_type_bails_early", () => {
    const builtins = getBuiltins();
    const tv = new Type(unionType([builtins.stringType, builtins.numberType]));
    const utv = get(tv, "UnionType")!;
    utv.options.push(tv);
    utv.options.push(tv);

    expect(toString(tv)).toBe("t1 where t1 = number | string");
  });

  test("stringifying_cyclic_intersection_type_bails_early", () => {
    const tv = new Type(intersectionType([]));
    const itv = get(tv, "IntersectionType")!;
    itv.parts.push(tv);
    itv.parts.push(tv);

    expect(toString(tv)).toBe("t1 where t1 = t1 & t1");
  });

  test("stringifying_array_uses_array_syntax", () => {
    const builtins = getBuiltins();
    const ttv = tableType({ state: TableState.Sealed, level: new TypeLevel() });
    ttv.indexer = new TableIndexer(builtins.numberType, builtins.stringType);

    expect(toString(new Type(ttv))).toBe("{string}");

    ttv.props.set("A", Property.rw(builtins.numberType));
    expect(toString(new Type(ttv))).toBe("{ [number]: string, A: number }");

    ttv.props.clear();
    ttv.state = TableState.Unsealed;
    expect(toString(new Type(ttv))).toBe("{string}");
  });

  test("the_empty_type_pack_should_be_parenthesized", () => {
    const emptyTypePack = new TypePackVar(typePack([]));
    expect(toStringPack(emptyTypePack)).toBe("()");

    const unitToUnit = new Type(functionType(emptyTypePack, emptyTypePack));
    expect(toString(unitToUnit)).toBe("() -> ()");
  });

  test("generic_packs_are_stringified_differently_from_generic_types", () => {
    const tpv = new TypePackVar(genericTypePack({ name: "a" }));
    expect(toStringPack(tpv)).toBe("a...");

    const tv = new Type(genericType({ name: "a", polarity: Polarity.Mixed }));
    expect(toString(tv)).toBe("a");
  });

  test("function_type_with_argument_names", () => {
    const result = checkLuau("type MyFunc = (a: number, string, c: number) -> string; local a : MyFunc");
    requireNoErrors(result.diagnostics);

    expect(result.typeOf("a", { functionTypeArguments: true })).toBe("(a: number, string, c: number) -> string");
  });

  test("function_type_with_argument_names_generic", () => {
    const result = checkLuau("local function f<a...>(n: number, ...: a...): (a...) return ... end");
    requireNoErrors(result.diagnostics);

    expect(result.typeOf("f", { functionTypeArguments: true })).toBe("<a...>(n: number, a...) -> (a...)");
  });

  test("function_type_with_argument_names_and_self", () => {
    const result = checkLuau(`
local tbl = {}
tbl.a = 2
function tbl:foo(b: number, c: number) return (self.a :: number) + b + c end
type Table = typeof(tbl)
type Foo = typeof(tbl.foo)
local u: Foo
`);

    const diagnostics = ignoreMissingAnnotations(result.diagnostics);

    requireNoErrors(diagnostics);

    result.typeOf("u", { functionTypeArguments: true });
  });

  test("generate_friendly_names_for_inferred_generics", () => {
    const result = checkLuau(`
        function id(x) return x end

        function id2(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15, a16, a17, a18, a19, a20, a21, a22, a23, a24, a25, a26, a27, a28, a29, a30)
            return a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15, a16, a17, a18, a19, a20, a21, a22, a23, a24, a25, a26, a27, a28, a29, a30
        end
    `);

    const diagnostics = ignoreMissingAnnotations(result.diagnostics);

    requireNoErrors(diagnostics);

    expect(result.typeOf("id")).toBe("<T>(T) -> T");

    expect(result.typeOf("id2")).toBe(
      "<T, U, V, W, X, Y, Z, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T1, U1, V1, W1>(T, U, V, W, X, Y, Z, A, B, C, D, E, F, " +
        "G, H, I, J, K, L, M, N, O, P, Q, R, S, T1, U1, V1, W1) -> (T, U, V, W, X, Y, Z, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, " +
        "R, S, T1, U1, V1, W1)",
    );
  });

  test("toStringDetailed", () => {
    const result = checkModule(`
        function id3(a, b, c)
            return a, b, c
        end
    `);

    const diagnostics = ignoreMissingAnnotations(result.diagnostics);

    requireNoErrors(diagnostics);

    const opts = toStringOptions();

    const id3Type = result.requireType("id3");
    const nameData = toStringDetailed(id3Type, opts);

    expect(opts.nameMap.types.size).toBe(3);

    expect(nameData.name).toBe("<T, U, V>(T, U, V) -> (T, U, V)");

    const ftv = get(follow(id3Type), "FunctionType");
    expect(ftv).toBeDefined();

    const params = flatten(ftv!.argTypes).head;
    expect(params).toHaveLength(3);

    expect(toString(params[0]!, opts)).toBe("T");
    expect(toString(params[1]!, opts)).toBe("U");
    expect(toString(params[2]!, opts)).toBe("V");
  });

  test("toStringErrorPack", () => {
    const result = checkLuau(`
local function target(callback: nil) return callback(4, "hello") end
    `);

    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.typeOf("target")).toBe("(nil) -> (*error-type*)");
  });

  test("toStringGenericPack", () => {
    const result = checkLuau(`
function foo(a, b) return a(b) end
    `);

    const diagnostics = ignoreMissingAnnotations(result.diagnostics);

    requireNoErrors(diagnostics);
    expect(result.typeOf("foo")).toBe("<T, U...>((T) -> (U...), T) -> (U...)");
  });

  test("toString_the_boundTo_table_type_contained_within_a_TypePack", () => {
    const builtins = getBuiltins();
    const tv1 = new Type(tableType());
    const ttv = get(tv1, "TableType")!;
    ttv.state = TableState.Sealed;
    ttv.props.set("hello", Property.rw(builtins.numberType));
    ttv.props.set("world", Property.rw(builtins.numberType));

    const tpv1 = new TypePackVar(typePack([tv1]));

    const tv2 = new Type(tableType());
    const bttv = get(tv2, "TableType")!;
    bttv.state = TableState.Free;
    bttv.props.set("hello", Property.rw(builtins.numberType));
    bttv.boundTo = tv1;

    const tpv2 = new TypePackVar(typePack([tv2]));

    expect(toStringPack(tpv1)).toBe("{ hello: number, world: number }");
    expect(toStringPack(tpv2)).toBe("{ hello: number, world: number }");
  });

  test("no_parentheses_around_return_type_if_pack_has_an_empty_head_link", () => {
    const builtins = getBuiltins();
    const arena = new TypeArena();
    const realTail = arena.addTypePack([builtins.stringType]);
    const emptyTail = arena.addTypePack([], realTail);

    const argList = arena.addTypePack([builtins.stringType]);

    const fn = arena.addType(functionType(argList, emptyTail));

    expect(toString(fn)).toBe("(string) -> string");
  });

  test("no_parentheses_around_cyclic_function_type_in_union", () => {
    const result = checkLuau(`
        type F = ((() -> number)?) -> F?
        local function f(p) return f end
        local g: F = f
    `);

    const diagnostics = ignoreMissingAnnotations(result.diagnostics);

    requireNoErrors(diagnostics);

    expect(result.typeOf("g")).toBe("t1 where t1 = ((() -> number)?) -> t1?");
  });

  test("no_parentheses_around_cyclic_function_type_in_intersection", () => {
    const result = checkLuau(`
        function f() return f end
        local a: ((number) -> ()) & typeof(f)
    `);

    const diagnostics = ignoreMissingAnnotations(result.diagnostics);

    requireNoErrors(diagnostics);

    expect(result.typeOf("a")).toBe("((number) -> ()) & t1 where t1 = () -> t1");
  });

  test("self_recursive_instantiated_param", () => {
    const tableTy = new Type(tableType());
    const ttv = get(tableTy, "TableType")!;
    ttv.name = "Table";
    ttv.instantiatedTypeParams.push(tableTy);

    expect(toString(tableTy)).toBe("Table<Table>");
  });

  test("toStringNamedFunction_id", () => {
    const result = checkModule(`
        local function id(x) return x end
    `);

    const ty = result.requireType("id");
    const ftv = functionOf(ty);

    expect(toStringNamedFunction("id", ftv)).toBe("id<T>(x: T): T");
  });

  test("toStringNamedFunction_map", () => {
    const result = checkModule(`
        local function map(arr, fn)
            local t = {}
            for i = 0, #arr do
                t[i] = fn(arr[i])
            end
            return t
        end
    `);

    const ty = result.requireType("map");
    const ftv = functionOf(ty);

    expect(toStringNamedFunction("map", ftv)).toBe("map<T, U>(arr: {T}, fn: (T) -> (U, ...unknown)): {U}");
  });

  test("toStringNamedFunction_generic_pack", () => {
    const result = checkModule(`
        local function f(a: number, b: string) end
        local function test<T..., U...>(...: T...): U...
            f(...)
            return 1, 2, 3
        end
    `);

    const ty = result.requireType("test");
    const ftv = functionOf(ty);

    expect(toStringNamedFunction("test", ftv)).toBe("test<T..., U...>(...: T...): U...");
  });

  test("toStringNamedFunction_unit_f", () => {
    const empty = new TypePackVar(typePack([]));
    const ftv = functionType(empty, empty);
    expect(toStringNamedFunction("f", ftv)).toBe("f(): ()");
  });

  test("toStringNamedFunction_variadics", () => {
    const result = checkModule(`
        local function f<a, b...>(x: a, ...): (a, a, b...)
            return x, x, ...
        end
    `);

    const ty = result.requireType("f");
    const ftv = functionOf(ty);

    expect(toStringNamedFunction("f", ftv)).toBe("f<a, b...>(x: a, ...: any): (a, a, b...)");
  });

  test("toStringNamedFunction_variadics2", () => {
    const result = checkModule(`
        local function f(): ...number
            return 1, 2, 3
        end
    `);

    const ty = result.requireType("f");
    const ftv = functionOf(ty);

    expect(toStringNamedFunction("f", ftv)).toBe("f(): ...number");
  });

  test("toStringNamedFunction_variadics3", () => {
    const result = checkModule(`
        local function f(): (string, ...number)
            return 'a', 1, 2, 3
        end
    `);

    const ty = result.requireType("f");
    const ftv = functionOf(ty);

    expect(toStringNamedFunction("f", ftv)).toBe("f(): (string, ...number)");
  });

  test("toStringNamedFunction_type_annotation_has_partial_argnames", () => {
    const result = checkModule(`
        local f: (number, y: number) -> number
    `);

    const ty = result.requireType("f");
    const ftv = functionOf(ty);

    expect(toStringNamedFunction("f", ftv)).toBe("f(_: number, y: number): number");
  });

  test("toStringNamedFunction_hide_type_params", () => {
    const result = checkModule(`
        local function f<T>(x: T, g: <U>(T) -> U)): ()
        end
    `);

    const ty = result.requireType("f");
    const ftv = functionOf(ty);

    const opts: ToStringOptions = { hideNamedFunctionTypeParameters: true };
    expect(toStringNamedFunction("f", ftv, opts)).toBe("f(x: T, g: <U>(T) -> U): ()");
  });

  test("toStringNamedFunction_overrides_param_names", () => {
    const result = checkModule(`
        local function test(a, b : string, ... : number) return a end
    `);

    const ty = result.requireType("test");
    const ftv = functionOf(ty);

    const opts: ToStringOptions = { namedFunctionOverrideArgNames: ["first", "second", "third"] };
    expect(toStringNamedFunction("test", ftv, opts)).toBe("test<T>(first: T, second: string, ...: number): T");
  });

  test("pick_distinct_names_for_mixed_explicit_and_implicit_generics", () => {
    const result = checkLuau(`
        function foo<a>(x: a, y) end
    `);

    expect(result.typeOf("foo")).toBe("<a>(a, unknown) -> ()");
  });

  test("tostring_unsee_ttv_if_array", () => {
    const result = checkLuau(`
        local x: {string}
        -- This code is constructed very specifically to use the same (by pointer
        -- identity) type in the function twice.
        local y: (typeof(x), typeof(x)) -> ()
    `);

    requireNoErrors(result.diagnostics);

    expect(result.typeOf("y")).toBe("({string}, {string}) -> ()");
  });

  test("tostring_error_mismatch", () => {
    const result = checkLuau(`
        --!strict
        function f1(t: {a : number, b: string, c: {d: string}}) : {a : number, b : string, c : { d : number}}
            return t
        end
    `);

    const expected =
      "Expected this to be\n\t" +
      "'{ a: number, b: string, c: { d: number } }'\n" +
      "but got\n\t" +
      "'{ a: number, b: string, c: { d: string } }'; \n" +
      "Expected property `c.d` to be exactly `number`, but got `string`";

    expect(result.diagnostics.map(describeDiagnostic)).toHaveLength(1);
    const actual = result.diagnostics[0]!.message;
    expect(actual).toBe(expected);
  });

  test("checked_fn_toString", () => {
    const frontend = new Frontend();
    const loaded = frontend.loadDefinitionFile(
      frontend.globals,
      frontend.globals.globalScope,
      checkedAbsDefinition,
      "@test",
    );
    expect(loaded.success).toBe(true);

    const result = checkModule(
      `
local f = abs
`,
      { mode: Mode.Nonstrict, frontend },
    );

    requireNoErrors(result.diagnostics);

    const fn = result.requireType("f");
    expect(toString(fn)).toBe("@checked (number) -> number");
  });

  test("read_only_properties", () => {
    const result = checkLuau(`
        type A = {x: string}
        type B = {read x: string}
    `);

    requireNoErrors(result.diagnostics);

    expect(result.find({ alias: "A" }).print({ exhaustive: true })).toBe("{ x: string }");
    expect(result.find({ alias: "B" }).print({ exhaustive: true })).toBe("{ read x: string }");
  });

  test("cycle_rooted_in_a_pack", () => {
    const builtins = getBuiltins();
    const arena = new TypeArena();

    const thePack = arena.addTypePack([builtins.numberType, builtins.numberType]);
    const packPtr = getPack(thePack, "TypePack");
    expect(packPtr).toBeDefined();

    const theProps = new Props([
      ["BaseField", Property.readonly(builtins.unknownType)],
      ["BaseMethod", Property.readonly(arena.addType(functionType(thePack, arena.addTypePack([]))))],
    ]);

    const theTable = arena.addType(tableType({ props: theProps, state: TableState.Sealed, level: new TypeLevel() }));

    packPtr!.head[0] = theTable;

    expect(toStringPack(thePack)).toBe("tp1 where tp1 = { read BaseField: unknown, read BaseMethod: (tp1) -> () }, number");
  });

  test("correct_stringification_user_defined_type_functions", () => {
    const user: TypeFunction = {
      name: "user",
      reducer: () => {
        throw new Error("printing reduces no type function");
      },
      canReduceGenerics: false,
    };
    const tftt = typeFunctionInstanceType(user, [getBuiltins().numberType], [], "woohoo");

    const tv = new Type(tftt);

    expect(toString(tv, {})).toBe("woohoo<number>");
  });

  test.skip("record_type_compositions_table", () => {});

  test.skip("record_type_compositions_union_intersection", () => {});

  test("record_type_compositions_union_handle_resorted_results", () => {
    const result = checkLuau(`
        type Zebra = {}
        type Alpha = {}

        type Composite = Zebra | Alpha
    `);

    requireNoErrors(result.diagnostics);

    expect(result.find({ alias: "Composite" }).print()).toBe("Alpha | Zebra");
  });

  test.skip("record_type_compositions_generic", () => {});

  test.skip("suggest_syntactically_legal_annotation", () => {
    const result = checkLuau(`
        export function foo(t)
            t.x = 10
        end
    `);

    expect(result.diagnostics.map(describeDiagnostic)).toHaveLength(1);
    const e = result.diagnostics.find((d) => d.code === "TypeAnnotationRequired");
    expect(e).toBeDefined();
    expect(e!.message).toBe("Type annotation required here.  Consider (t: { x: number }) -> ()");
  });

  test.skip("dont_suggest_syntactically_illegal_annotation", () => {
    const result = checkLuau(`
        export function foo(t)
            t.x = is_not_defined
        end
    `);

    expect(result.diagnostics.map(describeDiagnostic)).toHaveLength(2);
    expect(result.diagnostics.map((d) => d.code)).toContain("UnknownSymbol");
    const e = result.diagnostics.find((d) => d.code === "TypeAnnotationRequired");
    expect(e).toBeDefined();
    expect(e!.message).toBe("Type annotation required here.  Unable to infer the type of this function.");
  });

  test.skip("dont_suggest_type_that_is_too_long", () => {
    const result = checkLuau(`
        export function foo(t)
            t.x.x.x.x.x.x = true
        end
    `);

    expect(result.diagnostics.map(describeDiagnostic)).toHaveLength(1);
    const e = result.diagnostics.find((d) => d.code === "TypeAnnotationRequired");
    expect(e).toBeDefined();
    expect(e!.message).toBe("Type annotation required here.  Unable to infer the type of this function.");
  });
});

describe("ToString.cpp paths that upstream's cases leave out", () => {
  test("each primitive type", () => {
    const builtins = getBuiltins();
    expect(toString(builtins.nilType)).toBe("nil");
    expect(toString(builtins.booleanType)).toBe("boolean");
    expect(toString(builtins.numberType)).toBe("number");
    expect(toString(builtins.integerType)).toBe("integer");
    expect(toString(builtins.stringType)).toBe("string");
    expect(toString(builtins.threadType)).toBe("thread");
    expect(toString(builtins.bufferType)).toBe("buffer");
    expect(toString(builtins.functionType)).toBe("function");
    expect(toString(builtins.tableType)).toBe("table");
  });

  test("any, unknown and never", () => {
    const builtins = getBuiltins();
    expect(toString(builtins.anyType)).toBe("any");
    expect(toString(builtins.unknownType)).toBe("unknown");
    expect(toString(builtins.neverType)).toBe("never");
  });

  test("the error type", () => {
    const builtins = getBuiltins();
    expect(toString(builtins.errorType)).toBe("*error-type*");
    expect(toString(new Type(errorType(builtins.numberType)))).toBe("*error-type<number>*");
  });

  test("the no-refine type", () => {
    expect(toString(getBuiltins().noRefineType)).toBe("*no-refine*");
  });

  test("boolean and string singletons", () => {
    const builtins = getBuiltins();
    expect(toString(builtins.trueType)).toBe("true");
    expect(toString(builtins.falseType)).toBe("false");
    expect(toString(new Type(stringSingleton("hello")))).toBe('"hello"');

    const escapes: [byte: string, printed: string][] = [
      ["\x07", "\\a"],
      ["\b", "\\b"],
      ["\f", "\\f"],
      ["\n", "\\n"],
      ["\r", "\\r"],
      ["\t", "\\t"],
      ["\v", "\\v"],
      ["'", "\\'"],
      ['"', '\\"'],
      ["\\", "\\\\"],
      ["\x00", "\\000"],
      ["\x01", "\\001"],
      ["\x1f", "\\031"],
      ["`", "\\096"],
      ["{", "\\123"],
      ["}", "}"],
      [" ", " "],
      ["\x7f", "\x7f"],
      ["\xe9", "\xe9"],
    ];
    for (const [byte, printed] of escapes) {
      expect(toString(new Type(stringSingleton(`a${byte}z`)))).toBe(`"a${printed}z"`);
    }
  });

  test("free and generic table braces", () => {
    const builtins = getBuiltins();
    const props = () => new Props([["a", Property.rw(builtins.numberType)]]);
    const free = new Type(tableType({ props: props(), state: TableState.Free }));
    const generic = new Type(tableType({ props: props(), state: TableState.Generic }));

    expect(toString(free)).toBe("{- a: number -}");
    expect(toString(generic)).toBe("{+ a: number +}");
    expect(toString(new Type(tableType({ state: TableState.Free })))).toBe("{-  -}");
    expect(toString(free, { hideTableKind: true })).toBe("{ a: number }");
    expect(toString(generic, { hideTableKind: true })).toBe("{ a: number }");
  });

  test("read-only, write-only and divergent properties", () => {
    const builtins = getBuiltins();
    const t = new Type(
      tableType({
        props: new Props([
          ["r", Property.readonly(builtins.numberType)],
          ["w", Property.writeonly(builtins.stringType)],
          ["rw", Property.rw(builtins.booleanType)],
          ["split", Property.rw(builtins.numberType, builtins.stringType)],
        ]),
        state: TableState.Sealed,
      }),
    );

    expect(toString(t)).toBe("{ read r: number, rw: boolean, read split: number, write split: string, write w: string }");
    expect(toString(t, { useLineBreaks: true })).toBe(
      "{\n" +
        "    read r: number,\n" +
        "    rw: boolean,\n" +
        "    read split: number,\n" +
        "    write split: string,\n" +
        "    write w: string\n" +
        "}",
    );
  });

  test("property names that are not identifiers", () => {
    const builtins = getBuiltins();
    const t = new Type(
      tableType({
        props: new Props([
          ["x-y", Property.rw(builtins.numberType)],
          ["a b", Property.rw(builtins.numberType)],
          ["1st", Property.rw(builtins.numberType)],
          ['say "hi"', Property.rw(builtins.numberType)],
        ]),
        state: TableState.Sealed,
      }),
    );

    expect(toString(t)).toBe('{ 1st: number, ["a b"]: number, ["say \\"hi\\""]: number, ["x-y"]: number }');
  });

  test("indexers", () => {
    const builtins = getBuiltins();
    const dict = new Type(tableType({ indexer: new TableIndexer(builtins.stringType, builtins.numberType), state: TableState.Sealed }));
    const readOnlyDict = new Type(
      tableType({ indexer: new TableIndexer(builtins.stringType, builtins.numberType, true), state: TableState.Sealed }),
    );
    const readOnlyArray = new Type(
      tableType({ indexer: new TableIndexer(builtins.numberType, builtins.stringType, true), state: TableState.Sealed }),
    );

    expect(toString(dict)).toBe("{ [string]: number }");
    expect(toString(dict, { useLineBreaks: true })).toBe("{\n    [string]: number\n}");
    expect(toString(readOnlyDict)).toBe("{ read [string]: number }");
    expect(toString(readOnlyArray)).toBe("{read string}");
  });

  test("synthetic and hidden table names", () => {
    const builtins = getBuiltins();
    const props = () => new Props([["a", Property.rw(builtins.numberType)]]);
    const synthetic = new Type(tableType({ props: props(), state: TableState.Sealed }));
    get(synthetic, "TableType")!.syntheticName = "Synthetic";
    const outer = new Type(tableType({ props: new Props([["inner", Property.rw(synthetic)]]), state: TableState.Sealed }));

    expect(toString(synthetic)).toBe("Synthetic");
    expect(toString(synthetic, { ignoreSyntheticName: true })).toBe("{ a: number }");
    expect(toString(synthetic, { exhaustive: true })).toBe("{ a: number }");
    expect(toString(outer)).toBe("{ inner: Synthetic }");
    expect(toString(outer, { ignoreSyntheticName: true })).toBe("{ inner: { a: number } }");

    const named = new Type(tableType({ props: props(), state: TableState.Sealed }));
    get(named, "TableType")!.name = "Named";
    expect(toString(named, { exhaustive: true })).toBe("{ a: number }");
    expect(toString(named, { exhaustive: true, hideTableAliasExpansions: true })).toBe("Named");
  });

  test("a named table's type arguments", () => {
    const builtins = getBuiltins();
    const box = new Type(tableType({ state: TableState.Sealed }));
    const ttv = get(box, "TableType")!;
    ttv.name = "Box";
    ttv.instantiatedTypeParams.push(builtins.numberType);
    ttv.instantiatedTypePackParams.push(new TypePackVar(typePack([builtins.stringType, builtins.booleanType])));

    expect(toString(box)).toBe("Box<number, string, boolean>");

    ttv.instantiatedTypePackParams.push(new TypePackVar(typePack([])));
    expect(toString(box)).toBe("Box<number, (string, boolean), ()>");
  });

  test("a method's self argument", () => {
    const builtins = getBuiltins();
    const arena = new TypeArena();
    const selfTy = arena.addType(tableType({ props: new Props([["n", Property.rw(builtins.numberType)]]), state: TableState.Sealed }));
    const method = functionType(arena.addTypePack([selfTy, builtins.stringType]), arena.addTypePack([builtins.numberType]), { hasSelf: true });
    method.argNames = [
      { name: "self", location: new Location() },
      { name: "s", location: new Location() },
    ];

    expect(toString(arena.addType(method), { functionTypeArguments: true })).toBe("(self: { n: number }, s: string) -> number");
    expect(toStringNamedFunction("m", method)).toBe("m(self: { n: number }, s: string): number");
    expect(toStringNamedFunction("m", method, { hideFunctionSelfArgument: true })).toBe("m(s: string): number");
  });

  test("optional unions", () => {
    const builtins = getBuiltins();
    const optionalNumber = new Type(unionType([builtins.numberType, builtins.nilType]));
    const optionalUnion = new Type(unionType([builtins.stringType, builtins.nilType, builtins.numberType]));

    expect(toString(optionalNumber)).toBe("number?");
    expect(toString(optionalUnion)).toBe("(number | string)?");
    expect(toString(optionalNumber, { useQuestionMarks: false })).toBe("nil | number");
    expect(toString(optionalUnion, { useQuestionMarks: false })).toBe("nil | number | string");
  });

  test("negations", () => {
    const builtins = getBuiltins();
    expect(toString(new Type(negationType(builtins.numberType)))).toBe("~number");
    expect(toString(new Type(negationType(new Type(unionType([builtins.numberType, builtins.stringType])))))).toBe(
      "~(number | string)",
    );
    expect(toString(new Type(negationType(new Type(intersectionType([builtins.numberType, builtins.stringType])))))).toBe(
      "~(number & string)",
    );
    expect(toString(builtins.notNilType)).toBe("~nil");
    expect(toString(builtins.truthyType)).toBe("~(false?)");
  });

  test("free types with bounds", () => {
    const builtins = getBuiltins();
    const numberOrString = new Type(unionType([builtins.numberType, builtins.stringType]));

    expect(toString(new Type(freeType(undefined, builtins.neverType, builtins.unknownType)))).toBe("'a");
    expect(toString(new Type(freeType(undefined, builtins.numberType, builtins.unknownType)))).toBe("(number <: 'a)");
    expect(toString(new Type(freeType(undefined, builtins.neverType, builtins.stringType)))).toBe("('a <: string)");
    expect(toString(new Type(freeType(undefined, builtins.numberType, numberOrString)))).toBe("(number <: 'a <: number | string)");
  });

  test("generics without explicit names", () => {
    const builtins = getBuiltins();
    const arena = new TypeArena();
    const t = arena.addType(genericType());
    const u = arena.addType(genericType());
    const pack = arena.addTypePack(genericTypePack());
    const args = arena.addTypePack([t], pack);
    const results = arena.addTypePack([u, builtins.numberType]);
    const fn = arena.addType(functionType(args, results, { generics: [t, u], genericPacks: [pack] }));

    expect(toString(t)).toBe("T");
    expect(toStringPack(pack)).toBe("T...");
    expect(toString(fn)).toBe("<T, U, V...>(T, V...) -> (U, number)");
  });

  test("blocked types and packs", () => {
    const blocked = new Type(blockedType());
    const blockedPack = new TypePackVar(blockedTypePack());

    expect(toString(blocked)).toBe(`*blocked-${get(blocked, "BlockedType")!.index}*`);
    expect(toStringPack(blockedPack)).toBe(`*blocked-tp-${getPack(blockedPack, "BlockedTypePack")!.index}*`);
  });

  test("pending expansion types", () => {
    const pending = new Type(pendingExpansionType(undefined, "Foo", [getBuiltins().numberType], []));

    expect(toString(pending)).toBe(`*pending-expansion-${get(pending, "PendingExpansionType")!.index}*`);
  });

  test("type function instances", () => {
    const builtins = getBuiltins();
    const pack = new TypePackVar(typePack([builtins.stringType, builtins.booleanType]));
    const packFunction: TypePackFunction = {
      name: "packed",
      reducer: () => {
        throw new Error("printing reduces no type function");
      },
      canReduceGenerics: false,
    };

    expect(toString(new Type(typeFunctionInstanceType(builtins.typeFunctions.addFunc, [builtins.numberType, builtins.stringType])))).toBe(
      "add<number, string>",
    );
    expect(toString(new Type(typeFunctionInstanceType(builtins.typeFunctions.unionFunc, [builtins.numberType], [pack])))).toBe(
      "union<number, string, boolean>",
    );
    expect(toStringPack(new TypePackVar(typeFunctionInstanceTypePack(packFunction, [builtins.numberType], [pack])))).toBe(
      "packed<number, string, boolean>",
    );
  });

  test("bound types and packs", () => {
    const builtins = getBuiltins();
    const bound = new Type(boundType(builtins.numberType));
    const table = new Type(tableType({ props: new Props([["x", Property.rw(bound)]]), state: TableState.Sealed }));

    expect(toString(bound)).toBe("number");
    expect(toString(table)).toBe("{ x: number }");
    expect(toStringPack(new TypePackVar(boundTypePack(new TypePackVar(typePack([builtins.stringType])))))).toBe("string");
  });

  test("type packs", () => {
    const builtins = getBuiltins();
    const variadicString = new TypePackVar(variadicTypePack(builtins.stringType));

    expect(toStringPack(variadicString)).toBe("...string");
    expect(toStringPack(new TypePackVar(typePack([builtins.numberType], variadicString)))).toBe("number, ...string");
    expect(toStringPack(new TypePackVar(typePack([builtins.numberType], new TypePackVar(variadicTypePack(builtins.anyType, true)))))).toBe(
      "number",
    );
    expect(toStringPack(new TypePackVar(freeTypePack(undefined)))).toBe("a...");
    expect(toStringPack(builtins.errorTypePack)).toBe("*error-type*");
    expect(toStringPack(new TypePackVar(errorTypePack(new TypePackVar(typePack([builtins.numberType, builtins.stringType])))))).toBe(
      "*number, string*",
    );
  });
});
