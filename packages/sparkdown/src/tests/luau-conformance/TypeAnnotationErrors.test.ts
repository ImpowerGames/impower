// Ported from Luau's parser tests for malformed type annotations
// (`luau/tests/Parser.test.cpp`). Snippets and expected messages are quoted
// verbatim; the upstream test-case name is in the comment above each group.
//
// Every group here is N/A rather than a todo: sparkdown parses a type
// annotation only far enough to skip it and never interprets it (see
// "Type annotations are parsed but ignored" in DIVERGENCES.md), so there is
// no type parser to report a malformed one. They are recorded so the gap is
// visible, and so that a future type parser has its cases ready.

import { describe, expect, test } from "vitest";
import { diagnoseInFunction } from "./diagnosticTestHarness";

// Luau: parse_error_messages
describe.skip("function and table types (N/A: type annotations are ignored)", () => {
  test.each([
    [
      "local a: (number, number) -> (string",
      "Expected ')' (to close '(' at line 2), got <eof>",
    ],
    [
      "local a: (number, number) -> (\n    string",
      "Expected ')' (to close '(' at line 2), got <eof>",
    ],
    [
      "local a: (number, number)",
      "Expected '->' when parsing function type, got <eof>",
    ],
    [
      "local a: (number, number",
      "Expected ')' (to close '(' at line 2), got <eof>",
    ],
    [
      "local a: {foo: string,",
      "Expected identifier when parsing table field, got <eof>",
    ],
    [
      "local a: {foo: string",
      "Expected '}' (to close '{' at line 2), got <eof>",
    ],
    [
      "local a: { [string]: number, [number]: string }",
      "Cannot have more than one table indexer",
    ],
    [
      "type T = <a>foo",
      "Expected '(' when parsing function parameters, got 'foo'",
    ],
  ])("%s", (source, expected) => {
    expect(diagnoseInFunction(source)).toContain(expected);
  });
});

// Luau: mixed_intersection_and_union_not_allowed
describe.skip("mixed union and intersection (N/A: type annotations are ignored)", () => {
  test("type A = number & string | boolean", () => {
    expect(
      diagnoseInFunction("type A = number & string | boolean"),
    ).toContain(
      "Mixing union and intersection types is not allowed; consider wrapping in parentheses.",
    );
  });
});

// Luau: parse_error_type_annotation / parse_error_missing_type_annotation
describe.skip("a value where a type is expected (N/A: type annotations are ignored)", () => {
  test("local a : 2 = 2", () => {
    expect(diagnoseInFunction("local a : 2 = 2")).toContain(
      "Expected type, got '2'",
    );
  });

  test("local x:", () => {
    expect(diagnoseInFunction("local x:")).toEqual(["Expected type, got <eof>"]);
  });
});

// Luau: type_alias_error_messages
describe.skip("type alias headers (N/A: type annotations are ignored)", () => {
  test.each([
    ["type 5 = number", "Expected identifier when parsing type name, got '5'"],
    ["type A", "Expected '=' when parsing type alias, got <eof>"],
    ["type A<", "Expected identifier, got <eof>"],
    ["type A<B", "Expected '>' (to close '<' at column 7), got <eof>"],
  ])("%s", (source, expected) => {
    expect(diagnoseInFunction(source)).toContain(expected);
  });
});

// Luau: unparenthesized_function_return_type_list
describe.skip("unparenthesized return type list (N/A: type annotations are ignored)", () => {
  test.each([
    ["function foo(): string, number end"],
    ["function foo(): (number) -> string, string"],
  ])("%s", (source) => {
    expect(diagnoseInFunction(source)).toContain(
      "Expected a statement, got ','; did you forget to wrap the list of return types in parentheses?",
    );
  });
});

// Luau: short_array_types_must_be_alone /
// short_array_types_are_not_field_names_when_complex / nil_can_not_be_a_field_name
describe.skip("table type fields (N/A: type annotations are ignored)", () => {
  test.each([
    [
      "local n: {string, number}",
      "Expected '}' (to close '{' at column 10), got ','",
    ],
    [
      "local n: {[number]: string, number}",
      "Expected ':' when parsing table field, got '}'",
    ],
    [
      "local n: {x: string, number}",
      "Expected ':' when parsing table field, got '}'",
    ],
    [
      "local n: {x: string, nil}",
      "Expected identifier when parsing table field, got 'nil'",
    ],
    [
      "local n: {string | number: number}",
      "Expected '}' (to close '{' at column 10), got ':'",
    ],
    [
      "local n: {nil: number}",
      "Expected '}' (to close '{' at column 10), got ':'",
    ],
  ])("%s", (source, expected) => {
    expect(diagnoseInFunction(source)).toContain(expected);
  });
});

// Luau: extra_table_indexer_recovery — exactly one error.
describe.skip("second table indexer (N/A: type annotations are ignored)", () => {
  test("local a : { [string] : number, [number] : string, count: number }", () => {
    expect(
      diagnoseInFunction(
        "local a : { [string] : number, [number] : string, count: number }",
      ),
    ).toHaveLength(1);
  });
});

// Also N/A, and not ported line by line because they exercise Luau-only
// syntax with no sparkdown spelling: parse_error_type_name,
// parse_type_alias_default_type_errors, parse_type_pack_errors,
// invalid_type_forms, invalid_user_defined_type_functions,
// function_type_named_arguments, function_type_matching_parenthesis,
// explicit_type_instantiation_errors, generic_type_list_recovery,
// empty_function_type_error_recovery, the `declare` cases
// (variadic_definition_parsing, missing_declaration_prop,
// deprecated_declare_class_syntax_is_rejected), the extern `class` cases
// (class_*, classes_*, duplicate_class_methods, reassigned_class,
// overlapping_property_and_method_names, disallow_double_underscore_properties)
// and the `export` value cases (export_value_parse_failures,
// export_value_parse_edge_cases, export_is_an_identifier_only_when_followed_by_type).
// The recursion-limit cases (parse_error_with_too_many_nested_*) depend on
// `LuauRecursionLimit`, which has no counterpart here.

describe("type annotations are skipped without complaint", () => {
  test.each([
    ["local a: number = 1"],
    ["local a: (number, number) -> string = nil"],
    ["local a: {foo: string} = {}"],
  ])("%s", (source) => {
    expect(diagnoseInFunction(source)).toEqual([]);
  });
});
