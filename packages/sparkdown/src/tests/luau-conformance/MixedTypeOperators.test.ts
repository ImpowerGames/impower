import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Each script is a fixture body; the harness wraps it in
// `function run() ... end`, installs the `<fixture>:<line>: ` error
// formatter, and reports a failed `assert` as a runtime error.
const passes = (source: string, name = "repro.luau") => {
  const r = runConformanceSource(source, undefined, name);
  expect(r.errorMessages.join("\n")).toBe("");
  expect(r.returnedOK).toBe(true);
};

// `check(f, want)` runs `f` under pcall and compares `ok|v` with `want`,
// an error message read without its `<fixture>:<line>: ` prefix, and
// `done()` reports every mismatch at once.
const CHECK = `local bad = {}
local function check(f, want)
  local ok, v = pcall(f)
  if not ok and type(v) == "string" then
    v = v:sub((v:find(": ") or -1) + 2, #v)
  end
  local got = tostring(ok) .. "|" .. tostring(v)
  if got ~= want then
    table.insert(bad, "got " .. got .. ", want " .. want)
  end
end
local function done()
  assert(#bad == 0, table.concat(bad, "; "))
end
`;

// I-1413: binary operators follow Luau's rules for operands of
// different types instead of casting them to one type, as ink does.
describe("mixed-type binary operators", () => {
  test("equality of different types is false and never raises", () => {
    passes(`${CHECK}
check(function() return 1 == "1" end, "true|false")
check(function() return 1 ~= "1" end, "true|true")
check(function() return {} == "x" end, "true|false")
check(function() return "x" ~= {} end, "true|true")
check(function() return true == 1 end, "true|false")
check(function() return 0 == false end, "true|false")
check(function() return "true" == true end, "true|false")
check(function() return print == "print" end, "true|false")
check(function() return (function() end) == 0 end, "true|false")
check(function() return {} ~= true end, "true|true")
done()`);
  });

  test("equality of one type still compares values", () => {
    passes(`${CHECK}
check(function() return 1 == 1.0 end, "true|true")
check(function() return "a" == "a" end, "true|true")
check(function() return true == true end, "true|true")
check(function() return true == false end, "true|false")
check(function() return false ~= false end, "true|false")
check(function() local t = {} return t == t end, "true|true")
check(function() return {} == {} end, "true|false")
local function f() end
local g = function() return 1 end
check(function() return f == f end, "true|true")
check(function() return f == g end, "true|false")
check(function() return f == print end, "true|false")
check(function() return print == print end, "true|true")
done()`);
  });

  test("arithmetic on a boolean raises", () => {
    passes(`${CHECK}
check(function() return true + 1 end, "false|attempt to perform arithmetic (add) on boolean and number")
check(function() return 1 - false end, "false|attempt to perform arithmetic (sub) on number and boolean")
check(function() return true * true end, "false|attempt to perform arithmetic (mul) on boolean")
check(function() return "2" / true end, "false|attempt to perform arithmetic (div) on string and boolean")
check(function() return false % 2 end, "false|attempt to perform arithmetic (mod) on boolean and number")
check(function() return 2 ^ true end, "false|attempt to perform arithmetic (pow) on number and boolean")
check(function() return true // 1 end, "false|attempt to perform arithmetic (idiv) on boolean and number")
check(function() local b = true return -b end, "false|attempt to perform arithmetic (unm) on boolean")
done()`);
  });

  test("ordering of mixed types or two booleans raises", () => {
    passes(`${CHECK}
check(function() return 1 < "a" end, "false|attempt to compare number < string")
check(function() return "a" <= 5 end, "false|attempt to compare string <= number")
check(function() return 1 > "a" end, "false|attempt to compare string < number")
check(function() return 1 >= "1" end, "false|attempt to compare string <= number")
check(function() return true < false end, "false|attempt to compare boolean < boolean")
check(function() return 1 <= true end, "false|attempt to compare number <= boolean")
check(function() return true > 1 end, "false|attempt to compare number < boolean")
done()`);
  });

  test("what Luau coerces stays coerced", () => {
    passes(`${CHECK}
check(function() return "10" + 1 end, "true|11")
check(function() return 1 .. "" end, "true|1")
check(function() return "a" < "b" end, "true|true")
check(function() return 1 < 2.5 end, "true|true")
check(function() return "x" .. 2 end, "true|x2")
done()`);
  });

  // A float operand made a one-argument builtin's boolean result the
  // float 0 or 1, which only equality's cast hid.
  test("a builtin predicate on a float returns a boolean", () => {
    passes(`${CHECK}
check(function() return math.isnan(math.huge) == false end, "true|true")
check(function() return type(math.isnan(1.5)) end, "true|boolean")
check(function() return math.isinf(math.huge) == true end, "true|true")
check(function() return math.isfinite(1.5) == true end, "true|true")
check(function() return math.isfinite(math.huge) end, "true|false")
check(function() return math.floor(2.5) end, "true|2")
check(function() return -2.5 end, "true|-2.5")
done()`);
  });

  test("metamethods run before the type checks raise", () => {
    passes(`${CHECK}
local mt = {
  __add = function(a, b) return "add" end,
  __lt = function(a, b) return true end,
  __le = function(a, b) return false end,
  __eq = function(a, b) return true end,
}
local a = setmetatable({}, mt)
local b = setmetatable({}, mt)
check(function() return a + true end, "true|add")
check(function() return false + a end, "true|add")
check(function() return a < b end, "true|true")
check(function() return a <= b end, "true|false")
check(function() return a == b end, "true|true")
check(function() return a == true end, "true|false")
check(function() return a < 1 end, "false|attempt to compare table < number")
done()`);
  });
});
