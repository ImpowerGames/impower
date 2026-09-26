import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Luau reads an expression list after `return` unless the next token ends
// the block (`end`, `else`, `elseif`, `until`, end of file) or is `;`, so a
// value that starts on the line after `return` is the value returned.

function expectRuns(source: string) {
  const r = runConformanceSource(source);
  expect(r.errorMessages).toEqual([]);
  expect(r.returnedOK).toBe(true);
}

describe("a value on the line after return is returned", () => {
  test("an expression on the next line", () => {
    expectRuns(`local function f()
  return
    1 + 2
end
assert(f() == 3)`);
  });

  test("several values on the next line", () => {
    expectRuns(`local function f()
  return
    1, 2
end
local a, b = f()
assert(a == 1)
assert(b == 2)`);
  });

  test("a blank line between return and its value", () => {
    expectRuns(`local function f()
  return

    "v"
end
assert(f() == "v")`);
  });

  test("a comment after return and on the line before the value", () => {
    expectRuns(`local function f()
  return -- the sum
    -- of two numbers
    1 + 2
end
assert(f() == 3)`);
  });

  test("inside an if block", () => {
    expectRuns(`local function f(x)
  if x then
    return
      "yes"
  end
  return "no"
end
assert(f(true) == "yes")
assert(f(false) == "no")`);
  });
});

describe("a return with nothing before the end of its block returns nothing", () => {
  test("end on the next line", () => {
    expectRuns(`local function f()
  return
end
assert(f() == nil)
assert(select("#", f()) == 0)`);
  });

  test("else and elseif on the next line", () => {
    expectRuns(`local function f(x)
  if x == 1 then
    return
  elseif x == 2 then
    return
  else
    return 3
  end
end
assert(f(1) == nil)
assert(f(2) == nil)
assert(f(3) == 3)`);
  });

  test("until on the next line", () => {
    expectRuns(`local function f()
  repeat
    return
  until true
  return 1
end
assert(f() == nil)`);
  });

  test("a comment and then end", () => {
    expectRuns(`local function f()
  return -- nothing
end
assert(f() == nil)`);
  });
});
