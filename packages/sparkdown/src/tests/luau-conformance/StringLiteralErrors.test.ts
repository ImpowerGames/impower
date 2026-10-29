import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";
import { diagnoseInFunction } from "./diagnosticTestHarness";

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

  test("single quotes are checked the same way", () => {
    expect(diagnoseInFunction("return '\\xFO'")).toContain(expected);
  });

  test("multiline strings are not checked", () => {
    expect(diagnoseInFunction("return [[\\xFO \\u{ \\359]]")).toEqual([]);
  });

  test("well-formed escapes are not flagged", () => {
    const source =
      'return "\\a\\b\\f\\n\\r\\t\\v\\\\\\"\\\'\\z\\x41\\u{41}\\u{10FFFF}\\65\\255\\q"';
    expect(diagnoseInFunction(source)).toEqual([]);
  });

  test("code points above U+10FFFF are malformed, not crashed on", () => {
    expect(diagnoseInFunction('return "\\u{110000}"')).toEqual([expected]);
  });
});

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

  test("a quoted string does not continue onto the next line", () => {
    expect(
      diagnoseInFunction('local a = "abc\nlocal b = "x"'),
    ).toContain(expected);
  });

  test.each([
    ["escaped newline", 'return "abc\\\ndef"'],
    ["escaped CRLF", 'return "abc\\\r\ndef"'],
    ["\\z then the newline", 'return "abc\\z\ndef"'],
    ["\\z then spaces then the newline", 'return "abc\\z   \ndef"'],
    ["\\z then a tab then the newline", 'return "abc\\z\t\ndef"'],
    ["\\z then two newlines", 'return "abc\\z\n\ndef"'],
    ["\\z then an indented next line", 'return "abc\\z\n    def"'],
    ["multiline string spans lines", "return [[abc\ndef]]"],
    ["levelled multiline string spans lines", "return [==[abc\n]]\ndef]==]"],
  ])("%s is well-formed", (_label, source) => {
    expect(diagnoseInFunction(source)).toEqual([]);
  });

  test("\\z does not excuse a later unescaped newline", () => {
    expect(diagnoseInFunction('return "abc\\z\ndef\nghi"')).toContain(
      expected,
    );
  });

  test.each([
    ["non-breaking space", 'return "abc\\z \ndef"'],
    ["byte order mark", 'return "abc\\z﻿\ndef"'],
  ])("\\z then a %s then the newline is unfinished", (_label, source) => {
    expect(diagnoseInFunction(source)).toContain(expected);
  });

  test("an unfinished levelled multiline string", () => {
    expect(diagnoseInFunction("return [==[abc]]")).toContain(expected);
  });
});

describe("code points above U+10FFFF", () => {
  test('"\\u{110000}" and "\\u{7FFFFFFF}" are malformed escapes', () => {
    const r = runConformanceSource(
      'assert(utf8.codepoint("\\u{110000}") == 0xFFFD, "expected U+FFFD")\n' +
        'assert(utf8.codepoint("\\u{7FFFFFFF}") == 0xFFFD, "expected U+FFFD")\n',
    );
    expect(r.errorMessages).toEqual([
      "String literal contains malformed escape sequence",
      "String literal contains malformed escape sequence",
    ]);
  });

  test('"\\u{10FFFF}" stays U+10FFFF', () => {
    const r = runConformanceSource('assert(utf8.codepoint("\\u{10FFFF}") == 0x10FFFF, "in range stays")\n');
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

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
