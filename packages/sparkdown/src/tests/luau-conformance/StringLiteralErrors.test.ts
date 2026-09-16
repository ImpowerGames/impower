// Ported from Luau's parser tests for malformed string literals and block
// comments (`luau/tests/Parser.test.cpp`), so "we match Luau here" is an
// executable claim. Snippets and expected messages are quoted verbatim from
// upstream; the upstream test-case name is in the comment above each group.
//
// Luau's lexer emits a `BrokenString` / `BrokenComment` token for an
// unfinished literal; sparkdown's grammar cannot fail a token, so the
// equivalent is the validator noticing a string or comment node with no
// closing part. Escape sequences are checked per escape node, mirroring
// `Lexer::fixupQuotedString`.

import { describe, expect, test } from "vitest";
import { diagnoseInFunction } from "./diagnosticTestHarness";

// Luau: string_literals_escapes_broken
describe("string literal escapes", () => {
  const expected = "String literal contains malformed escape sequence";

  test.each([
    ['return "\\u{"', 'return "\\u{"'],
    ['return "\\u{FO}"', 'return "\\u{FO}"'],
    ['return "\\u{123456789}"', 'return "\\u{123456789}"'],
    ['return "\\359"', 'return "\\359"'],
    ['return "\\xFO"', 'return "\\xFO"'],
    ['return "\\xF"', 'return "\\xF"'],
    ['return "\\x"', 'return "\\x"'],
  ])("%s", (_label, source) => {
    expect(diagnoseInFunction(source)).toContain(expected);
  });

  // `'...'` takes the same escapes as `"..."` in Luau.
  test("single quotes are checked the same way", () => {
    expect(diagnoseInFunction("return '\\xFO'")).toContain(expected);
  });

  // `[[...]]` is raw in Luau: a backslash is just a backslash.
  test("multiline strings are not checked", () => {
    expect(diagnoseInFunction("return [[\\xFO \\u{ \\359]]")).toEqual([]);
  });

  // Every escape `fixupQuotedString` accepts. An unknown letter after a
  // backslash (`\q`) is not an error in Luau either: it yields the letter.
  test("well-formed escapes are not flagged", () => {
    const source =
      'return "\\a\\b\\f\\n\\r\\t\\v\\\\\\"\\\'\\z\\x41\\u{41}\\u{10FFFF}\\65\\255\\q"';
    expect(diagnoseInFunction(source)).toEqual([]);
  });

  // Luau accepts code points up to `\u{7FFFFFFF}` (extended UTF-8); a JS
  // string cannot represent one above U+10FFFF, so sparkdown lowers those to
  // U+FFFD rather than crashing. Documented in DIVERGENCES.md.
  test("code points above U+10FFFF are accepted, not crashed on", () => {
    expect(diagnoseInFunction('return "\\u{110000}"')).toEqual([]);
  });
});

// Luau: string_literals_broken
describe("unfinished string literals", () => {
  const expected = "Malformed string; did you forget to finish it?";

  test.each([
    ['return "', 'return "'],
    ['return "\\', 'return "\\'],
    ['return "\\r\\r', 'return "\r\r'],
  ])("%s", (_label, source) => {
    expect(diagnoseInFunction(source)).toContain(expected);
  });

  test.each([
    ["single quote", "return 'abc"],
    ["backtick", "return `abc"],
    ["multiline", "return [[abc"],
  ])("%s", (_label, source) => {
    expect(diagnoseInFunction(source)).toContain(expected);
  });

  // The grammar closes an unfinished `"` at the next `"` it finds, which may
  // be lines away; in Luau a quoted string ends at its line.
  test("a quoted string does not continue onto the next line", () => {
    expect(
      diagnoseInFunction('local a = "abc\nlocal b = "x"'),
    ).toContain(expected);
  });

  test.each([
    ["escaped newline", 'return "abc\\\ndef"'],
    ["\\z skips the newline", 'return "abc\\z\ndef"'],
    ["multiline string spans lines", "return [[abc\ndef]]"],
  ])("%s is well-formed", (_label, source) => {
    expect(diagnoseInFunction(source)).toEqual([]);
  });
});

// Luau: parse_error_broken_comment
//
// Luau's parser reports the broken comment from wherever it was looking for
// its next token, and the upstream test pins the expression-position wording
// for all three placements. Sparkdown uses that wording for every unfinished
// `--[[`, including one after a complete statement.
describe("unfinished block comment", () => {
  const expected =
    "Expected identifier when parsing expression, got unfinished comment";

  test.each([
    ["--[[unfinished work", "--[[unfinished work"],
    ["--!strict\\n--[[unfinished work", "--!strict\n--[[unfinished work"],
    ["local x = 1 --[[unfinished work", "local x = 1 --[[unfinished work"],
  ])("%s", (_label, source) => {
    expect(diagnoseInFunction(source)).toContain(expected);
  });

  test("a closed block comment is not flagged", () => {
    expect(
      diagnoseInFunction("local x = 1 --[[finished\nwork]]\nreturn x"),
    ).toEqual([]);
  });
});
