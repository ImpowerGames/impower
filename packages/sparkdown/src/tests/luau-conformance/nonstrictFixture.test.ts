import { describe, expect, test } from "vitest";
import { Frontend } from "../../compiler/typecheck/Frontend";
import { get } from "../../compiler/typecheck/Type";
import { nonStrictBlockRecursionSource, nonStrictCheckDefinitions, NONSTRICT_BUFFER_DEFINITIONS, NONSTRICT_DEFINITIONS, registerNonStrictBuiltinsVariant, registerNonStrictTestGlobals } from "./nonstrictFixture";

describe("distinct non-strict fixture setup components", () => {
  test("test globals retain this frontend's any identity without normal builtin globals", () => {
    const f = new Frontend();
    registerNonStrictTestGlobals(f);
    for (const name of ["game", "workspace", "script"])
      expect(f.globals.globalScope.lookup(name)).toBe(f.builtinTypes.anyType);
    for (const name of ["math", "print", "table", "string"])
      expect(f.globals.globalScope.lookup(name)).toBeUndefined();
    expect(new Frontend().globals.globalScope.lookup("game")).toBeUndefined();
  });
  test("the explicit builtin variant installs real globals and keeps test identities", () => {
    const f = new Frontend();
    registerNonStrictTestGlobals(f);
    registerNonStrictBuiltinsVariant(f);
    expect(get(f.globals.globalScope.lookup("math")!, "TableType")).toBeDefined();
    expect(get(f.globals.globalScope.lookup("print")!, "FunctionType")).toBeDefined();
    expect(f.globals.globalScope.lookup("script")).toBe(f.builtinTypes.anyType);
    expect(new Frontend().globals.globalScope.lookup("math")).toBeUndefined();
  });
  test("the repeated-check declaration list is fresh and preserves additive-before-standard order", () => {
    const first = nonStrictCheckDefinitions([NONSTRICT_BUFFER_DEFINITIONS]);
    expect(first).toEqual([NONSTRICT_BUFFER_DEFINITIONS, NONSTRICT_DEFINITIONS]);
    first.pop();
    expect(nonStrictCheckDefinitions()).toEqual([NONSTRICT_DEFINITIONS]);
  });
  test("the generated block source keeps the full upstream depth", () => {
    const source = nonStrictBlockRecursionSource();
    expect(source).toBe("do ".repeat(250) + "local a = 1" + " end".repeat(250));
    expect(source.match(/do /g)).toHaveLength(250);
    expect(source.match(/ end/g)).toHaveLength(250);
  });
});
