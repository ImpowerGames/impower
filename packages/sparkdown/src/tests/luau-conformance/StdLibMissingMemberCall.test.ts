// A call to a member a standard library table does not have names the
// missing member, as the uncalled form does, never the library (#915).
import { describe, expect, test } from "vitest";
import {
  diagnoseDetailed,
  diagnoseWithLints,
} from "./diagnosticTestHarness";
import { runConformanceSource } from "./conformanceTestHarness";

const spans = (source: string) =>
  diagnoseDetailed(source).map((d) => [
    d.message,
    d.range?.start,
    d.range?.end,
  ]);

describe("calling a missing stdlib member", () => {
  test("names the member at top level", () => {
    expect(spans("& print(table.nogetn())\n")).toEqual([
      [
        "Cannot find item or path named `table.nogetn`",
        { line: 0, character: 8 },
        { line: 0, character: 20 },
      ],
    ]);
  });

  test("names the member of another library", () => {
    expect(diagnoseWithLints("& print(math.nosuch(1))\n")).toEqual([
      "Cannot find item or path named `math.nosuch`",
    ]);
  });

  test("names the member inside a returned anonymous function", () => {
    expect(
      diagnoseWithLints(
        "function run()\nreturn function ()\n    print(table.nogetn())\nend\nend\n",
      ),
    ).toEqual(["Cannot find item or path named `table.nogetn`"]);
  });

  test("an existing member reports nothing", () => {
    expect(diagnoseWithLints('& print(table.concat({"a"}))\n')).toEqual([]);
  });

  test("a deprecated member keeps its deprecation", () => {
    expect(diagnoseWithLints("& print(table.getn({}))\n")).toEqual([
      "`table.getn(t)` is deprecated in Luau. Use the length operator `#t` instead.",
    ]);
  });

  test("an unknown global keeps its message", () => {
    expect(diagnoseWithLints("& print(foo.bar())\n")).toEqual([
      "Cannot find variable named `foo`",
    ]);
  });

  test("calling a stdlib constant reports nothing at compile time", () => {
    expect(diagnoseWithLints("& print(math.pi())\n")).toEqual([]);
  });
});

describe("at run time", () => {
  test("the call fails and pcall catches it", () => {
    const r = runConformanceSource(`local ok = pcall(function() return table.nogetn() end)
assert(ok == false, "table.nogetn() succeeded")
local okMath = pcall(function() return math.nosuch(1) end)
assert(okMath == false, "math.nosuch(1) succeeded")
local okPi = pcall(function() return math.pi() end)
assert(okPi == false, "math.pi() succeeded")`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("a local that shadows a library calls its own member named like a constant", () => {
    const r = runConformanceSource(`local math = { pi = function() return 1 end }
assert(math.pi() == 1, "got " .. tostring(math.pi()))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("a local that shadows a library still calls its own member", () => {
    const r = runConformanceSource(`local table = { nogetn = function() return 1 end }
assert(table.nogetn() == 1, "got " .. tostring(table.nogetn()))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
