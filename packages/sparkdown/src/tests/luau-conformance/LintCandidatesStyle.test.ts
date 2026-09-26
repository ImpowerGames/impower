// Ported from Luau's linter tests (`luau/tests/Linter.test.cpp`): lints about
// statement layout, control flow and expressions that sparkdown does not have
// yet. Snippets and expected messages are quoted verbatim inside a function
// body; the upstream test-case name is in the comment above each group. Each
// `describe.skip` is the ready specification for a lint not implemented
// (docs/compiler/LINTS.md); a rule that implements one adds its code to
// `LUAU_LINT_CODES` in `collectLuauLints.ts` and unskips it. Upstream cases whose expected
// result is silence run now.

import { describe, expect, test } from "vitest";
import {
  diagnoseWithLintsInFunction,
  lintInFunction,
  lintMessagesInFunction,
} from "./diagnosticTestHarness";

const SAME_LINE =
  "A new statement is on the same line; add semi-colon on previous statement to silence";

// Luau: MultilineBlock
describe.skip("several statements on one line of a block (not implemented: MultiLineStatement)", () => {
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
describe.skip("one missing semicolon among several (not implemented: MultiLineStatement)", () => {
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
describe.skip("a continuation line that is not indented (not implemented: MultiLineStatement)", () => {
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

// Luau: IntegerParsing
describe.skip("binary and hex literals past 2^64 (not implemented: IntegerParsing)", () => {
  test("0b1 followed by 64 zeros and 0x1 followed by 16 zeros", () => {
    expect(
      lintMessagesInFunction(`
local _ = 0b10000000000000000000000000000000000000000000000000000000000000000
local _ = 0x10000000000000000
`),
    ).toEqual([
      "Binary number literal exceeded available precision and was truncated to 2^64",
      "Hexadecimal number literal exceeded available precision and was truncated to 2^64",
    ]);
  });
});

const IMPRECISE =
  "Number literal exceeded available precision and was truncated to closest representable number";

// Luau: IntegerParsingDecimalImprecise
describe.skip("decimal literals a double cannot hold exactly (not implemented: IntegerParsing)", () => {
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
describe.skip("hex literals a double cannot hold exactly (not implemented: IntegerParsing)", () => {
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
