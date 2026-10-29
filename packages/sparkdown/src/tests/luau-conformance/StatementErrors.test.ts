import { describe, expect, test } from "vitest";
import {
  diagnose,
  diagnoseDetailed,
  diagnoseInFunction,
} from "./diagnosticTestHarness";

describe("an assignment with no value", () => {
  test("local a = ", () => {
    const msgs = diagnose("-> s\nscene s\n  local a = \nend\n");
    expect(msgs).toEqual([
      "Expected identifier when parsing expression, got <eof>",
    ]);
  });
});

describe("const without an initializer", () => {
  test("const c", () => {
    expect(diagnoseInFunction("const c")).toEqual([
      "Missing initializer in const declaration",
    ]);
  });

  test("const c at the top level, on the declaration", () => {
    expect(diagnoseDetailed("const c").map((d) => [d.message, d.range])).toEqual(
      [
        [
          "Missing initializer in const declaration",
          { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
        ],
      ],
    );
  });

  test("const c = ", () => {
    expect(diagnose("const c = ")).toEqual([
      "Expected identifier when parsing expression, got <eof>",
    ]);
  });
});

describe("const with several names", () => {
  test.each([
    ["const a, b = nil", "const a, b = nil"],
    ["const a, b, c = f(), 42", "const a, b, c = f(), 42"],
    ["const a, b, c = ..., 42", "const a, b, c = ..., 42"],
  ])("%s", (_label, source) => {
    expect(diagnoseInFunction(source)).toContain(
      "Missing initializer in const declaration",
    );
  });
});

describe("const reassignment", () => {
  test.each([
    ["const a = 42; a = 43", "const a = 42; a = 43"],
    ["local b; const a = 42; a, b = 43", "local b; const a = 42; a, b = 43"],
    ["local b; const a = 42; b, a = 43", "local b; const a = 42; b, a = 43"],
    ["local b; const a = 42; b, a = ...", "local b; const a = 42; b, a = ..."],
    ["const a = 42; function a() end", "const a = 42; function a() end"],
    [
      "const function a() return 42 end; a = 43",
      "const function a() return 42 end; a = 43",
    ],
  ])("%s", (_label, source) => {
    expect(diagnoseInFunction(source)).toContain(
      "Variable 'a' is constant and may not be reassigned",
    );
  });
});

describe.skip("statements after return/break/continue (diverges: accepted silently)", () => {
  test.each([
    ["return 0 print(5)", "return 0 print(5)", "Expected <eof>, got 'print'"],
    [
      "while true do break print(5) end",
      "while true do break print(5) end",
      "Expected 'end' (to close 'do' at column 12), got 'print'",
    ],
    [
      "while true do continue print(5) end",
      "while true do continue print(5) end",
      "Expected 'end' (to close 'do' at column 12), got 'print'",
    ],
  ])("%s", (_label, source, expected) => {
    expect(diagnoseInFunction(source)).toContain(expected);
  });
});

describe("loop control outside a loop", () => {
  test.each([
    ["break", "repeat local function a() break end until false"],
    ["continue", "repeat local function a() continue end until false"],
  ])("%s inside a nested function is an error", (_label, source) => {
    expect(
      diagnoseInFunction(source).some((m) =>
        m.startsWith("Functions may not contain diverts"),
      ),
    ).toBe(true);
  });

  describe.skip("verbatim (diverges: a bare `break` is accepted silently; the nested-function case names the divert lowering)", () => {
    test.each([
      ["break", "break", "break statement must be inside a loop"],
      [
        "repeat local function a() break end until false",
        "repeat local function a() break end until false",
        "break statement must be inside a loop",
      ],
      ["continue", "continue", "continue statement must be inside a loop"],
      [
        "repeat local function a() continue end until false",
        "repeat local function a() continue end until false",
        "continue statement must be inside a loop",
      ],
    ])("%s", (_label, source, expected) => {
      expect(diagnoseInFunction(source)).toContain(expected);
    });
  });
});

describe.skip("incomplete statement (diverges: a bare name is a call)", () => {
  test("fiddlesticks", () => {
    expect(diagnoseInFunction("fiddlesticks")).toContain(
      "Incomplete statement: expected assignment or a function call",
    );
  });

  test("some", () => {
    expect(
      diagnoseInFunction("function a(a, b) return a + b end\nsome\na(2, 5)"),
    ).toHaveLength(1);
  });

  test("+", () => {
    expect(diagnoseInFunction("+")).toHaveLength(1);
  });
});

describe("unexpected token", () => {
  test("function test + (a, f)", () => {
    const msgs = diagnoseInFunction(
      "function test + (a, f) return a + f end\nreturn test(2, 3)",
    );
    expect(msgs).toEqual(["Expected '(' when parsing function, got '+'"]);
  });

  test("function test(a, f+)", () => {
    const msgs = diagnoseInFunction(
      "function test(a, f+) return a + f end\nreturn test(2, 3)",
    );
    expect(msgs).toEqual([
      "Expected ')' (to close '(' at column 14), got '+'",
    ]);
  });

  test("then ... then", () => {
    const msgs = diagnoseInFunction("if true then\n    return 12\nthen\nend");
    expect(msgs).toEqual([
      "Expected 'end' (to close 'then' at line 2), got 'then'",
    ]);
  });
});

describe.skip("missing `end` (diverges: an unclosed block runs to the end of the file silently)", () => {
  test("parse_nesting_based_end_detection", () => {
    const msgs = diagnoseInFunction(`-- i am line 1
function BottomUpTree(item, depth)
  if depth > 0 then
    local i = item + item
    depth = depth - 1
    local left, right = BottomUpTree(i-1, depth), BottomUpTree(i, depth)
    return { item, left, right }
  else
    return { item }
end

function ItemCheck(tree)
  if tree[2] then
    return tree[1] + ItemCheck(tree[2]) - ItemCheck(tree[3])
  else
    return tree[1]
  end
end`);
    expect(msgs).toContain(
      "Expected 'end' (to close 'function' at line 2), got <eof>; did you forget to close 'else' at line 8?",
    );
  });

  test("parse_nesting_based_end_detection_single_line", () => {
    const msgs = diagnoseInFunction(`-- i am line 1
function ItemCheck(tree)
  if tree[2] then return tree[1] + ItemCheck(tree[2]) - ItemCheck(tree[3]) else return tree[1]
end
function BottomUpTree(item, depth)
  if depth > 0 then
    local i = item + item
    depth = depth - 1
    local left, right = BottomUpTree(i-1, depth), BottomUpTree(i, depth)
    return { item, left, right }
  else
    return { item }
  end
end`);
    expect(msgs).toContain(
      "Expected 'end' (to close 'function' at line 2), got <eof>; did you forget to close 'else' at line 3?",
    );
  });

  test("parse_nesting_based_end_detection_local_repeat", () => {
    const msgs = diagnoseInFunction(`-- i am line 1
repeat
  print(1)
  repeat
    print(2)
  print(3)
until false`);
    expect(msgs).toContain(
      "Expected 'until' (to close 'repeat' at line 2), got <eof>; did you forget to close 'repeat' at line 4?",
    );
  });

  test("parse_nesting_based_end_detection_local_function", () => {
    const msgs = diagnoseInFunction(`-- i am line 1
local function BottomUpTree(item, depth)
  if depth > 0 then
    local i = item + item
    depth = depth - 1
    local left, right = BottomUpTree(i-1, depth), BottomUpTree(i, depth)
    return { item, left, right }
  else
    return { item }
end
local function ItemCheck(tree)
  if tree[2] then
    return tree[1] + ItemCheck(tree[2]) - ItemCheck(tree[3])
  else
    return tree[1]
  end
end`);
    expect(msgs).toContain(
      "Expected 'end' (to close 'function' at line 2), got <eof>; did you forget to close 'else' at line 8?",
    );
  });

  test("parse_nesting_based_end_detection_failsafe_earlier", () => {
    const msgs = diagnoseInFunction(`-- i am line 1
local function ItemCheck(tree)
  if tree[2] then
    return tree[1] + ItemCheck(tree[2]) - ItemCheck(tree[3])
  else
    return tree[1]
      end
end
local function BottomUpTree(item, depth)
  if depth > 0 then
    local i = item + item
    depth = depth - 1
    local left, right = BottomUpTree(i-1, depth), BottomUpTree(i, depth)
    return { item, left, right }
  else
    return { item }
  end`);
    expect(msgs).toContain(
      "Expected 'end' (to close 'function' at line 10), got <eof>",
    );
  });

  test("parse_nesting_based_end_detection_nested", () => {
    const msgs = diagnoseInFunction(`-- i am line 1
function stringifyTable(t)
    local entries = {}
    for k, v in pairs(t) do
        -- if we find a nested table, convert that recursively
        if type(v) == "table" then
            v = stringifyTable(v)
        else
            v = tostring(v)
        k = tostring(k)
        -- add another entry to our stringified table
        entries[#entries + 1] = ("s = s"):format(k, v)
    end
    -- the memory location of the table
    local id = tostring(t):sub(8)
    return ("{s}@s"):format(table.concat(entries, ", "), id)
end`);
    expect(msgs).toContain(
      "Expected 'end' (to close 'function' at line 2), got <eof>; did you forget to close 'else' at line 8?",
    );
  });
});

describe("compound assignment targets", () => {
  test("a() += 5", () => {
    expect(diagnoseInFunction("a() += 5")).toContain(
      "Expected identifier when parsing expression, got '+='",
    );
  });

  test("(a) += 5", () => {
    expect(diagnoseInFunction("(a) += 5")).toContain(
      "Assigned expression must be a variable or a field",
    );
  });

  test("a, b += 5", () => {
    expect(diagnoseInFunction("a, b += 5")).toContain(
      "Expected '=' when parsing assignment, got '+='",
    );
  });
});

describe("parenthesized assignment target", () => {
  test.each([
    ["(2), b = b, a", "local a, b\n(2), b = b, a"],
    ["a, (3) = b, a", "local a, b\na, (3) = b, a"],
  ])("%s", (_label, source) => {
    expect(diagnoseInFunction(source)).toContain(
      "Assigned expression must be a variable or a field",
    );
  });
});

describe("ambiguous call across a newline", () => {
  const expected =
    "Ambiguous syntax: this looks like an argument list for a function call, but could also be a start of new statement; use ';' to separate statements";

  test.each([
    [
      "add\\n(4, 7)",
      "function add(x, y) return x + y end\nadd\n(4, 7)",
    ],
    [
      "local f = add\\n(f :: any)['x'] = 2",
      "function add(x, y) return x + y end\nlocal f = add\n(f :: any)['x'] = 2",
    ],
    [
      "x:add\\n(1, 2)",
      "local x = {}\nfunction x:add(a, b) return a + b end\nx:add\n(1, 2)",
    ],
    [
      "t.x, (f)\\n().y = 5, 6",
      "local t = {}\nfunction f() return t end\nt.x, (f)\n().y = 5, 6",
    ],
  ])("%s", (_label, source) => {
    const msgs = diagnoseInFunction(source);
    expect(msgs).toEqual([expected]);
  });
});

describe.skip("non-ASCII where an identifier is expected (diverges: accepted as narrative text)", () => {
  test("local ☃ = 10", () => {
    expect(diagnoseInFunction("local ☃ = 10")).toContain(
      "Expected identifier when parsing variable name, got Unicode character U+2603",
    );
  });

  test("local pi = 3․13", () => {
    expect(diagnoseInFunction("local pi = 3․13")).toContain(
      "Expected identifier when parsing expression, got Unicode character U+2024 (did you mean '.'?)",
    );
  });

  test("local pi = \\xFF!", () => {
    expect(diagnoseInFunction("local pi = �!")).toContain(
      "Expected identifier when parsing expression, got invalid UTF-8 sequence",
    );
  });
});

describe.skip("error limit (N/A: no parse-error limit)", () => {
  test("escape escape escape", () => {
    const msgs = diagnoseInFunction("escape escape escape");
    expect(msgs).toHaveLength(3);
    expect(msgs[msgs.length - 1]).toBe("Reached error limit (2)");
  });
});
