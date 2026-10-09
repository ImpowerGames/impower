// Ported from Luau's linter tests (`luau/tests/Linter.test.cpp`): lints about
// statement layout, control flow and expressions that sparkdown does not have
// yet. Snippets and expected messages are quoted verbatim inside a function
// body; the upstream test-case name is in the comment above each group. Each
// `describe.skip` is the ready specification for a lint not implemented
// (docs/compiler/LINTS.md); a rule that implements one adds its code to
// `LUAU_LINT_CODES` in `collectLuauLints.ts` and unskips it. Upstream cases whose expected
// result is silence run now.

import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";
import {
  diagnoseDetailed,
  diagnoseWithLintsInFunction,
  lintInFunction,
  lintMessagesInFunction,
} from "./diagnosticTestHarness";

const SAME_LINE =
  "A new statement is on the same line; add semi-colon on previous statement to silence";

// Luau: MultilineBlock
describe("several statements on one line of a block", () => {
  test("if true then print(1) print(2) print(3) end", () => {
    expect(
      lintMessagesInFunction(`
if true then print(1) print(2) print(3) end
`),
    ).toEqual([SAME_LINE]);
  });
});

// Luau: MultilineBlockSemicolonsWhitelisted
describe("statements separated by semicolons are not reported", () => {
  test("print(1); print(2); print(3)", () => {
    expect(
      diagnoseWithLintsInFunction(`
print(1); print(2); print(3)
`),
    ).toEqual([]);
  });
});

// Luau: MultilineBlockMissedSemicolon
describe("one missing semicolon among several", () => {
  test("print(1); print(2) print(3)", () => {
    expect(
      lintMessagesInFunction(`
print(1); print(2) print(3)
`),
    ).toEqual([SAME_LINE]);
  });
});

// Luau: MultilineBlockLocalDo
describe("a declaration followed by do on its line is not reported", () => {
  test("local _x do ... end", () => {
    expect(
      diagnoseWithLintsInFunction(`
local _x do
    _x = 5
end
`),
    ).toEqual([]);
  });
});

// Luau: ConfusingIndentation
describe("a continuation line that is not indented", () => {
  test("print(math.max(1,\\n2))", () => {
    expect(
      lintMessagesInFunction(`
print(math.max(1,
2))
`),
    ).toEqual(["Statement spans multiple lines; use indentation to silence"]);
  });
});

// Luau: UnbalancedAssignment
describe.skip("value lists shorter or longer than the names (not implemented: UnbalancedAssignment)", () => {
  test("pcall() with 1 to 4 values for 3 names", () => {
    expect(
      lintInFunction(`
do
local _a,_b,_c = pcall()
end
do
local _a,_b,_c = pcall(), 5
end
do
local _a,_b,_c = pcall(), 5, 6
end
do
local _a,_b,_c = pcall(), 5, 6, 7
end
do
local _a,_b,_c = pcall(), nil
end
`),
    ).toEqual([
      {
        line: 5,
        message:
          "Assigning 2 values to 3 variables initializes extra variables with nil; add 'nil' to value list to silence",
      },
      {
        line: 11,
        message: "Assigning 4 values to 3 variables leaves some values unused",
      },
    ]);
  });
});

// Luau: ImplicitReturn
describe.skip("functions that can fall off the end after returning a value (not implemented: ImplicitReturn)", () => {
  test("f1, f4 and the anonymous f6", () => {
    expect(
      lintInFunction(`
--!nonstrict
function f1(a)
    if not a then
        return 5
    end
end

function f2(a)
    if not a then
        return
    end
end

function f3(a)
    if not a then
        return 5
    else
        return
    end
end

function f4(a)
    for i in pairs(a) do
        if i > 5 then
            return i
        end
    end

    print("element not found")
end

function f5(a)
    for i in pairs(a) do
        if i > 5 then
            return i
        end
    end

    error("element not found")
end

f6 = function(a)
    if a == 0 then
        return 42
    end
end

function f7(a)
    repeat
        return 10
    until a ~= nil
end

return f1,f2,f3,f4,f5,f6,f7
`),
    ).toEqual([
      {
        line: 5,
        message:
          "Function 'f1' can implicitly return no values even though there's an explicit return at line 5; add explicit return to silence",
      },
      {
        line: 29,
        message:
          "Function 'f4' can implicitly return no values even though there's an explicit return at line 26; add explicit return to silence",
      },
      {
        line: 45,
        message:
          "Function can implicitly return no values even though there's an explicit return at line 45; add explicit return to silence",
      },
    ]);
  });
});

// Luau: ImplicitReturnInfiniteLoop
describe.skip("infinite loops with and without a break (not implemented: ImplicitReturn)", () => {
  test("f3 and f4 can leave their loops", () => {
    expect(
      lintInFunction(`
--!nonstrict
function f1(a)
    while true do
        if math.random() > 0.5 then
            return 5
        end
    end
end

function f2(a)
    repeat
        if math.random() > 0.5 then
            return 5
        end
    until false
end

function f3(a)
    while true do
        if math.random() > 0.5 then
            return 5
        end
        if math.random() < 0.1 then
            break
        end
    end
end

function f4(a)
    repeat
        if math.random() > 0.5 then
            return 5
        end
        if math.random() < 0.1 then
            break
        end
    until false
end

return f1,f2,f3,f4
`),
    ).toEqual([
      {
        line: 26,
        message:
          "Function 'f3' can implicitly return no values even though there's an explicit return at line 22; add explicit return to silence",
      },
      {
        line: 37,
        message:
          "Function 'f4' can implicitly return no values even though there's an explicit return at line 33; add explicit return to silence",
      },
    ]);
  });
});

// Luau: MisleadingAndOr
describe.skip("a and b or c where b is falsy (not implemented: MisleadingAndOr)", () => {
  test("false and nil as the middle operand", () => {
    expect(
      lintMessagesInFunction(`
_ = math.random() < 0.5 and true or 42
_ = math.random() < 0.5 and false or 42 -- misleading
_ = math.random() < 0.5 and nil or 42 -- misleading
_ = math.random() < 0.5 and 0 or 42
_ = (math.random() < 0.5 and false) or 42 -- currently ignored
`),
    ).toEqual([
      "The and-or expression always evaluates to the second alternative because the first alternative is false; consider using if-then-else expression instead",
      "The and-or expression always evaluates to the second alternative because the first alternative is nil; consider using if-then-else expression instead",
    ]);
  });
});

// Luau: ComparisonPrecedence
describe.skip("not and chained comparisons without parentheses (not implemented: ComparisonPrecedence)", () => {
  test("five misleading forms, each silenced by parentheses", () => {
    expect(
      lintMessagesInFunction(`
local a, b = ...

local _ = not a == b
local _ = not a ~= b
local _ = not a <= b
local _ = a <= b == 0
local _ = a <= b <= 0

local _ = not a == not b -- weird but ok

-- silence tests for all of the above
local _ = not (a == b)
local _ = (not a) == b
local _ = not (a ~= b)
local _ = (not a) ~= b
local _ = not (a <= b)
local _ = (not a) <= b
local _ = (a <= b) == 0
local _ = a <= (b == 0)
`),
    ).toEqual([
      "not X == Y is equivalent to (not X) == Y; consider using X ~= Y, or add parentheses to silence",
      "not X ~= Y is equivalent to (not X) ~= Y; consider using X == Y, or add parentheses to silence",
      "not X <= Y is equivalent to (not X) <= Y; add parentheses to silence",
      "X <= Y == Z is equivalent to (X <= Y) == Z; add parentheses to silence",
      "X <= Y <= Z is equivalent to (X <= Y) <= Z; did you mean X <= Y and Y <= Z?",
    ]);
  });
});

const IMPRECISE =
  "Number literal exceeded available precision and was truncated to closest representable number";

// Luau: IntegerParsing
// Adapted: Sparkdown's runtime preserves exact powers beyond uint64, so the
// original overflow inputs are silent controls; their inexact neighbors warn.
describe("binary and hex literals past 2^64", () => {
  test("original powers stay exact, while their neighbors lose precision", () => {
    expect(
      lintMessagesInFunction(`
local _ = 0b10000000000000000000000000000000000000000000000000000000000000000
local _ = 0x10000000000000000
local _ = 0b10000000000000000000000000000000000000000000000000000000000000001
local _ = 0x10000000000000001
`),
    ).toEqual([
      IMPRECISE,
      IMPRECISE,
    ]);
  });
});

describe("IntegerParsing boundaries and spellings", () => {
  test("the largest uint64 rounds, while the next integer stays exact", () => {
    expect(lintMessagesInFunction(`
local _ = 0xffffffffffffffff
local _ = 0x10000000000000000
local _ = 0b100000000000000000000000000000000000000000000000000001
`)).toEqual([
      IMPRECISE,
      IMPRECISE,
    ]);
  });

  test("warnings reflect actual runtime rounding beyond uint64", () => {
    const result = runConformanceSource(`
assert(0xffffffffffffffff == 2^64)
assert(0x10000000000000000 == 2^64)
assert(0x20000000000000000 == 2^65)
assert(0x20000000000000001 == 2^65)
assert(0x20000000000000003 == 2^65)
assert(0b100000000000000000000000000000000000000000000000000000000000000000 == 2^65)
assert(0b100000000000000000000000000000000000000000000000000000000000000001 == 2^65)
assert(18446744073709551616 == 2^64)
assert(18446744073709551617 == 2^64)
`);
    expect(result.returnedOK).toBe(true);
    expect(result.errorMessages).toEqual([]);
    expect(result.warningMessages).toEqual([IMPRECISE, IMPRECISE, IMPRECISE, IMPRECISE, IMPRECISE]);
  });

  test("fraction and exponent spellings stay silent, as Luau's parseDouble requires digits only", () => {
    expect(lintMessagesInFunction(`
local _ = 0.1
local _ = 9007199254740993.0
local _ = 9007199254740993e0
local _ = 1e309
local _ = 9_007_199_254_740_992
local _ = 0x20_0000_0000_0000
`)).toEqual([]);
  });

  test("separators preserve the integer's exact value", () => {
    expect(lintMessagesInFunction(`local _ = 9_007_199_254_740_993`)).toEqual([IMPRECISE]);
    expect(lintMessagesInFunction(`local _ = 0x20_0000_0000_0001`)).toEqual([IMPRECISE]);
  });

  test("embedded literals warn once, at the literal's range and warning severity", () => {
    const source = "Precision: {9007199254740993}\n";
    const diagnostics = diagnoseDetailed(source).filter(d => d.code === "IntegerParsing");
    expect(diagnostics).toEqual([{
      file: "main.sd", code: "IntegerParsing", severity: 2, message: IMPRECISE,
      range: { start: { line: 0, character: 12 }, end: { line: 0, character: 28 } },
    }]);
  });

  test("strings, comments, narrative digits and malformed numeric text are not integer literals", () => {
    expect(diagnoseDetailed(`
9007199254740993
function run()
  local _ = "9007199254740993"
  -- 9007199254740993
  local _ = 0xnothex
  local _ = 0x1234567890ABCDEFi
  local _ = 0xFEDCBA0987654321i
  local _ = 0x10000000000000000oops
  local _ = 9007199254740993oops
  local _ = 9007199254740993.."text"
end
`).filter(d => d.code === "IntegerParsing")).toEqual([]);
  });
});

// Luau: IntegerParsingDecimalImprecise
describe("decimal literals a double cannot hold exactly", () => {
  test("five imprecise literals", () => {
    expect(
      lintInFunction(`
local _ = 10000000000000000000000000000000000000000000000000000000000000000
local _ = 10000000000000001
local _ = -10000000000000001

-- 10^16 = 2^16 * 5^16, 5^16 only requires 38 bits
local _ = 10000000000000000
local _ = -10000000000000000

-- smallest possible number that is parsed imprecisely
local _ = 9007199254740993
local _ = -9007199254740993

-- note that numbers before and after parse precisely (number after is even => 1 more mantissa bit)
local _ = 9007199254740992
local _ = 9007199254740994

-- large powers of two should work as well (this is 2^63)
local _ = -9223372036854775808
`),
    ).toEqual([
      { line: 1, message: IMPRECISE },
      { line: 2, message: IMPRECISE },
      { line: 3, message: IMPRECISE },
      { line: 10, message: IMPRECISE },
      { line: 11, message: IMPRECISE },
    ]);
  });
});

// Luau: IntegerParsingHexImprecise
describe("hex literals a double cannot hold exactly", () => {
  test("two imprecise literals", () => {
    expect(
      lintInFunction(`
local _ = 0x1234567812345678

-- smallest possible number that is parsed imprecisely
local _ = 0x20000000000001

-- note that numbers before and after parse precisely (number after is even => 1 more mantissa bit)
local _ = 0x20000000000000
local _ = 0x20000000000002

-- large powers of two should work as well (this is 2^63)
local _ = 0x80000000000000
`),
    ).toEqual([
      { line: 1, message: IMPRECISE },
      { line: 4, message: IMPRECISE },
    ]);
  });
});
