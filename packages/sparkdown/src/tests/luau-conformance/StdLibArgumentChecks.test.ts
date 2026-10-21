// Luau's argument checks for the state-aware builtins and the method forms:
//   - a builtin called with fewer arguments than it requires raises
//     `missing argument #N to '<name>'`, named without its library, on the
//     direct call and through `pcall` (I-1357);
//   - a method's numeric argument raises `invalid argument #N to '<name>'
//     (number expected, got <type>)`, counted without the receiver, rejects a
//     boolean, and reads a trailing nil as absent (I-1376).
import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

const missing: [call: string, fn: string, args: string, message: string][] = [
  ["string.rep()", "string.rep", "", "missing argument #1 to 'rep'"],
  ["string.rep('x')", "string.rep", "'x'", "missing argument #2 to 'rep'"],
  ["string.sub()", "string.sub", "", "missing argument #1 to 'sub'"],
  ["string.format()", "string.format", "", "missing argument #1 to 'format'"],
  ["string.byte()", "string.byte", "", "missing argument #1 to 'byte'"],
  ["string.len()", "string.len", "", "missing argument #1 to 'len'"],
  ["string.find('x')", "string.find", "'x'", "missing argument #2 to 'find'"],
  ["table.concat()", "table.concat", "", "missing argument #1 to 'concat'"],
  ["select()", "select", "", "missing argument #1 to 'select'"],
];

describe("a state-aware builtin given too few arguments", () => {
  test.each(missing)("%s raises Luau's error", (call, _fn, _args, message) => {
    const result = runConformanceSource(`local v = ${call}`);
    expect(result.returnedOK).toBe(false);
    expect(result.errorMessages.join("\n")).toContain(message);
  });

  test.each(missing)(
    "%s raises it through pcall",
    (call, fn, args, message) => {
      const pcallArgs = args ? `${fn}, ${args}` : fn;
      const result = runConformanceSource(`
local ok, e = pcall(${pcallArgs})
assert(not ok, "pcall(${fn}) succeeded")
assert(e == "${message}", e)
local ok2, e2 = pcall(function() return ${call} end)
assert(not ok2, "the wrapped call succeeded")
assert(string.find(e2, "${message}", 1, true), e2)
`);
      expect(result.errorMessages).toEqual([]);
      expect(result.returnedOK).toBe(true);
    },
  );

  test("a builtin called through a value raises it too", () => {
    const result = runConformanceSource(`
local rep = string.rep
local ok, e = pcall(function() return rep() end)
assert(not ok, "rep() succeeded")
assert(string.find(e, "missing argument #1 to 'rep'", 1, true), e)
local len = string.len
local ok2, e2 = pcall(function() return len() end)
assert(not ok2, "len() succeeded")
assert(string.find(e2, "missing argument #1 to 'len'", 1, true), e2)
local v = rep()
`);
    expect(result.returnedOK).toBe(false);
    expect(result.errorMessages.join("\n")).toContain(
      "missing argument #1 to 'rep'",
    );
  });

  test("assert keeps Luau's message, which names no function", () => {
    const result = runConformanceSource(`
local ok, e = pcall(function() assert() end)
assert(not ok)
assert(e:sub(e:find(": ") + 2, #e) == "missing argument #1", e)
`);
    expect(result.errorMessages).toEqual([]);
    expect(result.returnedOK).toBe(true);
  });
});

const invalid: [line: string, message: string][] = [
  [`local s = ("abc"):rep("x")`, "invalid argument #1 to 'rep' (number expected, got string)"],
  [`local s = ("abc"):rep(true)`, "invalid argument #1 to 'rep' (number expected, got boolean)"],
  [`local s = ("abc"):rep(nil)`, "invalid argument #1 to 'rep' (number expected, got nil)"],
  [`local s = ("abc"):at("x")`, "invalid argument #1 to 'at' (number expected, got string)"],
  [`local s = ("abc"):padstart("x")`, "invalid argument #1 to 'padstart' (number expected, got string)"],
  [`local s = ("abc"):padstart(true)`, "invalid argument #1 to 'padstart' (number expected, got boolean)"],
  [`local s = ("abc"):padend("x")`, "invalid argument #1 to 'padend' (number expected, got string)"],
  [`local t = {1, 2}\nt:remove("x")`, "invalid argument #1 to 'remove' (number expected, got string)"],
  [`local t = {1, 2}\nt:remove(true)`, "invalid argument #1 to 'remove' (number expected, got boolean)"],
  [`local t = {}\nt:remove("x")`, "invalid argument #1 to 'remove' (number expected, got string)"],
  [`local t = {1, 2}\nt:insert("x", 5)`, "invalid argument #1 to 'insert' (number expected, got string)"],
  [`local t = {1, 2}\nlocal s = t:concat(",", "x")`, "invalid argument #2 to 'concat' (number expected, got string)"],
];

describe("a method's numeric argument", () => {
  test.each(invalid)("%s raises Luau's invalid argument", (line, message) => {
    const result = runConformanceSource(line);
    expect(result.returnedOK).toBe(false);
    expect(result.errorMessages.join("\n")).toContain(message);
  });

  test("a trailing nil is absent and a numeric string is a number", () => {
    const result = runConformanceSource(`
local t = {1, 2, 3}
assert(t:concat(",", nil) == "1,2,3", t:concat(",", nil))
assert(t:concat(",", 1, nil) == "1,2,3", t:concat(",", 1, nil))
assert(t:concat(",", 2, 3) == "2,3")
assert(("ab"):rep("2") == "abab")
local appended = t:insert("x")
assert(#appended == 4 and appended[4] == "x")
`);
    expect(result.errorMessages).toEqual([]);
    expect(result.returnedOK).toBe(true);
  });
});
