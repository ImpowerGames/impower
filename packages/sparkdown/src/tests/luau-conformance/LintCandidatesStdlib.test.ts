// Ported from Luau's linter tests (`luau/tests/Linter.test.cpp`): lints about
// calls into the standard library and table literals that sparkdown does not
// have yet. Snippets and expected messages are quoted verbatim inside a
// function body; the upstream test-case name is in the comment above each
// group. Each `describe.skip` is the ready specification for a lint not
// implemented (docs/compiler/LINTS.md); a rule that implements one adds its
// code to `LINT_CODES` in the harness and unskips it.

import { describe, expect, test } from "vitest";
import { lintInFunction, lintMessagesInFunction } from "./diagnosticTestHarness";

const BAD_CLASS =
  "Invalid match pattern: invalid character class, must refer to a defined class or its inverse";
const UNCLOSED_SET =
  "Invalid match pattern: expected ] at the end of the string to close a set";

// Luau: FormatStringFormat
describe.skip("malformed string.format specifiers (not implemented: FormatString)", () => {
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
describe.skip("malformed string.pack formats (not implemented: FormatString)", () => {
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

// Luau: FormatStringMatch
describe.skip("malformed match patterns (not implemented: FormatString)", () => {
  test("fourteen bad patterns", () => {
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
      BAD_CLASS,
      BAD_CLASS,
      BAD_CLASS,
      BAD_CLASS,
      "Invalid match pattern: unfinished character class",
      "Invalid match pattern: sets can not contain capture references",
      "Invalid match pattern: invalid capture reference, must be 1-9",
      "Invalid match pattern: invalid capture reference, must refer to a valid capture",
      "Invalid match pattern: missing brace characters for balanced match",
      "Invalid match pattern: missing set after a frontier pattern",
      "Invalid match pattern: unexpected ) without a matching (",
      "Invalid match pattern: expected ) at the end of the string to close a capture",
      UNCLOSED_SET,
      "Invalid match pattern: expected a magic character after %",
    ]);
  });
});

// Luau: FormatStringMatchNested
describe.skip("capture references into nested captures (not implemented: FormatString)", () => {
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

// Luau: FormatStringMatchSets
describe.skip("malformed sets in match patterns (not implemented: FormatString)", () => {
  test("seven bad sets", () => {
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
      "Invalid match pattern: character range can't include character sets",
      "Invalid match pattern: character range can't include character sets",
      BAD_CLASS,
      "Invalid match pattern: expected a magic character after %",
      "Invalid match pattern: sets can not contain capture references",
    ]);
  });
});

// Luau: FormatStringFindArgs
describe.skip("string.find with a plain-text flag (not implemented: FormatString)", () => {
  test("only the pattern-mode calls are checked", () => {
    expect(
      lintInFunction(`
local s = ...

-- incorrect character class specifier
string.find(s, "%q")

-- raw string find
string.find(s, "%q", 1, true)
string.find(s, "%q", 1, math.random() < 0.5)

-- incorrect character class specifier
string.find(s, "%q", 1, false)

-- missing arguments
string.find()
string.find("foo");
("foo"):find()
`),
    ).toEqual([
      { line: 4, message: BAD_CLASS },
      { line: 11, message: BAD_CLASS },
    ]);
  });
});

// Luau: FormatStringReplace
describe.skip("malformed string.gsub replacements (not implemented: FormatString)", () => {
  test("four bad replacements", () => {
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
      "Invalid match replacement: invalid capture index, must refer to pattern capture",
    ]);
  });
});

// Luau: FormatStringDate
describe.skip("malformed os.date formats (not implemented: FormatString)", () => {
  test("four bad formats", () => {
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
      "Invalid date format: date format can not contain null characters",
    ]);
  });
});

// Luau: TableLiteral
describe.skip("duplicate keys in table literals and table types (not implemented: TableLiteral)", () => {
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

// Luau: TableOperations
describe.skip("suspicious table.insert, remove, move and create calls (not implemented: TableOperations)", () => {
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
// Sparkdown reports nothing for either call today. Upstream uses type casts
// to choose which calls warn, and type casts are parsed but ignored, so only
// the uncast first call of each group is kept.
describe.skip("getfenv and setfenv (not implemented: DeprecatedApi for fenv)", () => {
  test("getfenv(1) and setfenv(1, {})", () => {
    expect(
      lintMessagesInFunction(`
local f, g, h = ...

getfenv(1)
setfenv(1, {})
`),
    ).toEqual([
      "Function 'getfenv' is deprecated; consider using 'debug.info' instead",
      "Function 'setfenv' is deprecated",
    ]);
  });
});
