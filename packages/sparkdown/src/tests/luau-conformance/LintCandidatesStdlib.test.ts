// Ported from Luau's linter tests (`luau/tests/Linter.test.cpp`): lints about
// calls into the standard library and table literals. Snippets and expected
// messages are quoted verbatim inside a function body; the upstream test-case
// name is in the comment above each group.
//
// FormatString stays silent on a format Sparkdown's runtime runs
// (docs/compiler/LINTS.md), so the cases whose format the runtime accepts
// although Luau's linter warns keep their snippet and drop that warning; the
// comment above each such group names what the runtime accepts.

import { describe, expect, test } from "vitest";
import { lintInFunction, lintMessagesInFunction } from "./diagnosticTestHarness";

const UNCLOSED_SET =
  "Invalid match pattern: expected ] at the end of the string to close a set";

// Luau: FormatStringFormat
describe("malformed string.format specifiers", () => {
  test("unfinished and invalid specifiers", () => {
    expect(
      lintMessagesInFunction(`
-- incorrect format strings
string.format("%")
string.format("%??d")
string.format("%Y")

-- incorrect format strings, self call
local _ = ("%"):format()

-- correct format strings, just to uh make sure
string.format("hello %+10d %.02f %%", 4, 5)
`),
    ).toEqual([
      "Invalid format string: unfinished format specifier",
      "Invalid format string: invalid format specifier: must be a string format specifier or %",
      "Invalid format string: invalid format specifier: must be a string format specifier or %",
      "Invalid format string: unfinished format specifier",
    ]);
  });
});

// Luau: FormatStringPack
describe("malformed string.pack formats", () => {
  test("eleven bad formats", () => {
    expect(
      lintMessagesInFunction(`
-- incorrect pack specifiers
string.pack("?")
string.packsize("?")
string.unpack("?")

-- missing size
string.packsize("bc")

-- incorrect X alignment
string.packsize("X")
string.packsize("X i")

-- correct X alignment
string.packsize("Xi")

-- packsize can't be used with variable sized formats
string.packsize("s")

-- out of range size specifiers
string.packsize("i0")
string.packsize("i17")

-- a very very very out of range size specifier
string.packsize("i99999999999999999999")
string.packsize("c99999999999999999999")

-- correct format specifiers
string.packsize("=!1bbbI3c42")
`),
    ).toEqual([
      "Invalid pack format: unexpected character; must be a pack specifier or space",
      "Invalid pack format: unexpected character; must be a pack specifier or space",
      "Invalid pack format: unexpected character; must be a pack specifier or space",
      "Invalid pack format: fixed-sized string format must specify the size",
      "Invalid pack format: X must be followed by a size specifier",
      "Invalid pack format: X must be followed by a size specifier",
      "Invalid pack format: pack specifier must be fixed-size",
      "Invalid pack format: integer size must be in range [1,16]",
      "Invalid pack format: integer size must be in range [1,16]",
      "Invalid pack format: size specifier is too large",
      "Invalid pack format: size specifier is too large",
    ]);
  });
});

// Luau: FormatStringMatch (adapted)
// Sparkdown's runtime runs `%q` and `%,`, an escape of a character that is
// not a class or magic, as that character, and runs `[%1]` as a set holding
// `1`, as Luau does, so their six warnings are dropped.
describe("malformed match patterns", () => {
  test("eight bad patterns", () => {
    expect(
      lintMessagesInFunction(`
local s = ...

-- incorrect character class specifiers
string.match(s, "%q")
string.gmatch(s, "%q")
string.find(s, "%q")
string.gsub(s, "%q", "")

-- various errors
string.match(s, "%")
string.match(s, "[%1]")
string.match(s, "%0")
string.match(s, "(%d)%2")
string.match(s, "%bx")
string.match(s, "%foo")
string.match(s, '(%d))')
string.match(s, '(%d')
string.match(s, '[%d')
string.match(s, '%,')

-- self call - not detected because we don't know the type!
local _ = s:match("%q")

-- correct patterns
string.match(s, "[A-Z]+(%d)%1")
`),
    ).toEqual([
      "Invalid match pattern: unfinished character class",
      "Invalid match pattern: invalid capture reference, must be 1-9",
      "Invalid match pattern: invalid capture reference, must refer to a valid capture",
      "Invalid match pattern: missing brace characters for balanced match",
      "Invalid match pattern: missing set after a frontier pattern",
      "Invalid match pattern: unexpected ) without a matching (",
      "Invalid match pattern: expected ) at the end of the string to close a capture",
      UNCLOSED_SET,
    ]);
  });
});

// Luau: FormatStringMatchNested
describe("capture references into nested captures", () => {
  test("an unclosed and an out-of-range reference", () => {
    expect(
      lintInFunction(`
local s = ...

-- correct reference to nested pattern
string.match(s, "((a)%2)")

-- incorrect reference to nested pattern (not closed yet)
string.match(s, "((a)%1)")

-- incorrect reference to nested pattern (index out of range)
string.match(s, "((a)%3)")
`),
    ).toEqual([
      {
        line: 7,
        message:
          "Invalid match pattern: invalid capture reference, must refer to a closed capture",
      },
      {
        line: 10,
        message:
          "Invalid match pattern: invalid capture reference, must refer to a valid capture",
      },
    ]);
  });
});

// Luau: FormatStringMatchSets (adapted)
// Sparkdown's runtime runs `[%a-b]` (letters, `-` and `b`), `[a-%b]`, `[%q]`,
// `[%;]` and `[%1]` (which matches `1`, as in Luau), so their five warnings
// are dropped.
describe("malformed sets in match patterns", () => {
  test("two bad sets", () => {
    expect(
      lintMessagesInFunction(`
local s = ...

-- fake empty sets (but actually sets that aren't closed)
string.match(s, "[]")
string.match(s, "[^]")

-- character ranges in sets
string.match(s, "[%a-b]")
string.match(s, "[a-%b]")

-- invalid escapes
string.match(s, "[%q]")
string.match(s, "[%;]")

-- capture refs in sets
string.match(s, "[%1]")

-- valid escapes and - at the end
string.match(s, "[%]x-]")

-- % escapes itself
string.match(s, "[%%]")

-- this abomination is a valid pattern due to rules wrt handling empty sets
string.match(s, "[]|'[]")
string.match(s, "[^]|'[]")
`),
    ).toEqual([
      UNCLOSED_SET,
      UNCLOSED_SET,
    ]);
  });
});

// Luau: FormatStringFindArgs (adapted)
// Sparkdown's runtime runs `%q`, so the pattern is `%`, which it rejects, and
// the warnings are the unfinished class's.
describe("string.find with a plain-text flag", () => {
  test("only the pattern-mode calls are checked", () => {
    expect(
      lintInFunction(`
local s = ...

-- incorrect character class specifier
string.find(s, "%")

-- raw string find
string.find(s, "%", 1, true)
string.find(s, "%", 1, math.random() < 0.5)

-- incorrect character class specifier
string.find(s, "%", 1, false)

-- missing arguments
string.find()
string.find("foo");
("foo"):find()
`),
    ).toEqual([
      { line: 4, message: "Invalid match pattern: unfinished character class" },
      { line: 11, message: "Invalid match pattern: unfinished character class" },
    ]);
  });
});

// Luau: FormatStringReplace (adapted)
// Sparkdown's runtime, like Lua's, replaces `%1` with the whole match when the
// pattern has no capture, so the warning for `''` and `"%1"` is dropped.
describe("malformed string.gsub replacements", () => {
  test("three bad replacements", () => {
    expect(
      lintMessagesInFunction(`
local s = ...

-- incorrect replacements
string.gsub(s, '(%d+)', "%")
string.gsub(s, '(%d+)', "%x")
string.gsub(s, '(%d+)', "%2")
string.gsub(s, '', "%1")

-- correct replacements
string.gsub(s, '[A-Z]+(%d)', "%0%1")
string.gsub(s, 'foo', "%0")
`),
    ).toEqual([
      "Invalid match replacement: unfinished replacement",
      "Invalid match replacement: unexpected replacement character; must be a digit or %",
      "Invalid match replacement: invalid capture index, must refer to pattern capture",
    ]);
  });
});

// Luau: FormatStringDate (adapted)
// Sparkdown's runtime copies a NUL byte in a date format as text, so the
// warning for the format holding one is dropped.
describe("malformed os.date formats", () => {
  test("three bad formats", () => {
    expect(
      lintMessagesInFunction(`
-- incorrect formats
os.date("%")
os.date("%L")
os.date("%?")
os.date("\\0")

-- correct formats
os.date("it's %c now")
os.date("!*t")
`),
    ).toEqual([
      "Invalid date format: unfinished replacement",
      "Invalid date format: unexpected replacement character; must be a date format specifier or %",
      "Invalid date format: unexpected replacement character; must be a date format specifier or %",
    ]);
  });
});

// Luau: TableLiteral
describe("duplicate keys in table literals and table types", () => {
  test("seven duplicates", () => {
    expect(
      lintMessagesInFunction(`-- line 1
_ = {
    first = 1,
    second = 2,
    first = 3,
}

_ = {
    first = 1,
    ["first"] = 2,
}

_ = {
    1, 2, 3,
    [1] = 42
}

_ = {
    [3] = 42,
    1, 2, 3,
}

local _: {
    first: number,
    second: string,
    first: boolean
}

_ = {
    1, 2, 3,
    [0] = 42,
    [4] = 42,
}

_ = {
    [1] = 1,
    [2] = 2,
    [1] = 3,
}

function _foo(): { first: number, second: string, first: boolean }
end
`),
    ).toEqual([
      "Table field 'first' is a duplicate; previously defined at line 3",
      "Table field 'first' is a duplicate; previously defined at line 9",
      "Table index 1 is a duplicate; previously defined as a list entry",
      "Table index 3 is a duplicate; previously defined as a list entry",
      "Table type field 'first' is a duplicate; previously defined at line 24",
      "Table index 1 is a duplicate; previously defined at line 36",
      "Table type field 'first' is a duplicate; previously defined at line 41",
    ]);
  });
});

// Luau: read_write_table_props
// Upstream runs it under the new solver only, whose table types sparkdown's
// type checker follows: a `read` and a `write` property of one name are not
// duplicates of each other.
describe("read and write table type properties", () => {
  test("six overlapping properties", () => {
    expect(
      lintInFunction(`-- line 1
        type A = {x: number}
        type B = {read x: number, write x: number}
        type C = {x: number, read x: number} -- line 4
        type D = {x: number, write x: number}
        type E = {read x: number, x: boolean}
        type F = {read x: number, read x: number}
        type G = {write x: number, x: boolean}
        type H = {write x: number, write x: boolean}
    `),
    ).toEqual([
      { line: 3, message: "Table type field 'x' is already read-write; previously defined at line 4" },
      { line: 4, message: "Table type field 'x' is already read-write; previously defined at line 5" },
      { line: 5, message: "Table type field 'x' already has a read type defined at line 6" },
      { line: 6, message: "Table type field 'x' is a duplicate; previously defined at line 7" },
      { line: 7, message: "Table type field 'x' already has a write type defined at line 8" },
      { line: 8, message: "Table type field 'x' is a duplicate; previously defined at line 9" },
    ]);
  });
});

// Luau: TableOperations
describe("suspicious table.insert, remove, move and create calls", () => {
  test("ten suspicious calls", () => {
    expect(
      lintMessagesInFunction(`
local t = {}
local tt = {}

table.insert(t, #t, 42)
table.insert(t, (#t), 42) -- silenced

table.insert(t, #t + 1, 42)
table.insert(t, #tt + 1, 42) -- different table, ok

table.insert(t, 0, 42)

table.remove(t, 0)

table.remove(t, #t-1)

table.insert(t, string.find("hello", "h"))

table.move(t, 0, #t, 1, tt)
table.move(t, 1, #t, 0, tt)

table.create(42, {})
table.create(42, {} :: {})
`),
    ).toEqual([
      "table.insert will insert the value before the last element, which is likely a bug; consider removing the second argument or wrap it in parentheses to silence",
      "table.insert will append the value to the table; consider removing the second argument for efficiency",
      "table.insert uses index 0 but arrays are 1-based; did you mean 1 instead?",
      "table.remove uses index 0 but arrays are 1-based; did you mean 1 instead?",
      "table.remove will remove the value before the last element, which is likely a bug; consider removing the second argument or wrap it in parentheses to silence",
      "table.insert may change behavior if the call returns more than one result; consider adding parentheses around second argument",
      "table.move uses index 0 but arrays are 1-based; did you mean 1 instead?",
      "table.move uses index 0 but arrays are 1-based; did you mean 1 instead?",
      "table.create with a table literal will reuse the same object for all elements; consider using a for loop instead",
      "table.create with a table literal will reuse the same object for all elements; consider using a for loop instead",
    ]);
  });
});

// Luau: DeprecatedApiFenv (adapted)
// Upstream uses type casts to choose which calls warn, and the rule reads no
// types, so only the uncast first call of each group is kept. Without the
// casts that read them, `f`, `g` and `h` are unused, so only this rule's
// warnings are compared.
describe("getfenv and setfenv", () => {
  test("getfenv(1) and setfenv(1, {})", () => {
    expect(
      lintMessagesInFunction(`
local f, g, h = ...

getfenv(1)
setfenv(1, {})
`, "DeprecatedApi"),
    ).toEqual([
      "Function 'getfenv' is deprecated; consider using 'debug.info' instead",
      "Function 'setfenv' is deprecated",
    ]);
  });
});
