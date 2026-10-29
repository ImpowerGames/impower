import { describe, expect, test } from "vitest";
import { diagnose, diagnoseInFunction } from "./diagnosticTestHarness";

const MISSING_BRACE = "Malformed interpolated string; did you forget to add a";

// Luau: parse_interpolated_string_without_end_brace
describe("interpolated string without end brace", () => {
  test.each([
    ["backtick, single char", "store a = `{a`\n"],
    ["backtick, longer", "store a = `{abcdefg`\n"],
    ["backtick, text before", "store a = `x {abc`\n"],
    ["double quote, single char", 'store a = "{a"\n'],
    ["double quote, text before", 'store a = "x {abc"\n'],
  ])("%s", (_label, source) => {
    const msgs = diagnose(source);
    expect(
      msgs.some((m) => m.includes(MISSING_BRACE)),
      `expected a missing-brace diagnostic, got ${JSON.stringify(msgs)}`,
    ).toBe(true);
  });

  // Luau: parse_interpolated_string_mid_without_end_brace_in_table.
  test("a closed interpolation followed by an unclosed one", () => {
    const msgs = diagnose('store a = `x {"y"} {z`\n');
    expect(msgs.some((m) => m.includes(MISSING_BRACE))).toBe(true);
  });

  test("an unterminated `{` does not swallow the following lines", () => {
    const msgs = diagnose("store a = `{x`\nstore after = 1\n");
    expect(msgs.some((m) => m.includes(MISSING_BRACE))).toBe(true);
    expect(msgs.some((m) => m.includes("closing `end`"))).toBe(false);
  });
});

describe("well-formed interpolations are not flagged", () => {
  test.each([
    ["backtick", "store b = 1\nstore a = `x {b} y`\n"],
    ["double quote", 'store b = 1\nstore a = "x {b} y"\n'],
    ["two interpolations", "store b = 1\nstore a = `{b} and {b}`\n"],
    ["escaped brace", 'store a = "x \\{y} z"\n'],
    ["single quotes are literal", "store a = '{a'\n"],
    ["multiline strings are literal", "store a = [[{a]]\n"],
  ])("%s", (_label, source) => {
    expect(diagnose(source)).toEqual([]);
  });
});

// Luau: parse_interpolated_string_without_expression
describe("empty interpolation", () => {
  test.each([
    ["backtick", "store a = `{}`\n"],
    ["backtick, mid", "store a = `{}{1}`\n"],
    ["backtick, inner space", "store a = `{ }`\n"],
    ["double quote", 'store a = "{}"\n'],
    ["double quote, mid", 'store a = "{}{1}"\n'],
    ["double quote, inner space", 'store a = "{ }"\n'],
  ])("%s", (_label, source) => {
    expect(
      diagnose(source).some((m) => m.includes("expected expression inside")),
      "expected an empty-interpolation diagnostic",
    ).toBe(true);
  });

  test.each([
    ["single quotes stay literal", "store a = '{}'\n"],
    ["a Lua pattern in single quotes", "store a = '%b{}'\n"],
    ["multiline strings stay literal", "store a = [[{}]]\n"],
  ])("%s", (_label, source) => {
    expect(diagnose(source)).toEqual([]);
  });
});

// Luau: parse_interpolated_string_double_brace_begin / _mid
describe.skip("double braces (diverges: `{{fn}}` is the call shorthand)", () => {
  test.each([
    ["begin", "store a = `{{oops}}`\n"],
    ["mid", "store a = `{nice} {{oops}}`\n"],
  ])("%s", (_label, source) => {
    expect(
      diagnose(source).some((m) => m.includes("Double braces")),
    ).toBe(true);
  });
});

// Luau: parse_interpolated_string_malformed_escape
describe("malformed escape", () => {
  test("`\\xQQ`", () => {
    expect(diagnoseInFunction("local a = `???\\xQQ {1}`")).toContain(
      "Interpolated string literal contains malformed escape sequence",
    );
  });

  test('"\\xQQ"', () => {
    expect(diagnoseInFunction('local a = "???\\xQQ {1}"')).toContain(
      "String literal contains malformed escape sequence",
    );
  });
});

// Luau: parse_interpolated_string_call_without_parens
describe.skip("call without parens (diverges: a backtick after a name is not a call, and the leftover string is accepted silently)", () => {
  test("_ = print `{42}`", () => {
    expect(diagnoseInFunction("_ = print `{42}`")).toContain(
      "Expected identifier when parsing expression, got `{",
    );
  });
});

// Luau: parse_interpolated_string_weird_token
describe("a stray token inside an interpolation", () => {
  test("`??? {42 !!}`", () => {
    expect(diagnoseInFunction("local a = `??? {42 !!}`")).toContain(
      "Malformed interpolated string, got '!'",
    );
  });
});

// Luau: parse_interpolated_string_as_type_fail
describe.skip("as a type (N/A: type annotations are parsed but ignored)", () => {
  test("in a type annotation", () => {
    expect(
      diagnose("store a: `what` = `???`\n").some((m) =>
        m.includes("cannot be used as types"),
      ),
    ).toBe(true);
  });
});
