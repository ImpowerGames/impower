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

// A local named like a library shadows it only after its declaration and
// inside its block; everywhere else the name is still the library (#1035).
describe("a local named like a library", () => {
  const MISSING = ["Cannot find item or path named `table.nogetn`"];
  const SHADOW = "local table = { nogetn = function() return 1 end }";

  test("does not hide a missing member read before it", () => {
    expect(diagnoseWithLints(`& print(table.nogetn)\n${SHADOW}\n`)).toEqual(
      MISSING,
    );
  });

  test("does not hide a missing member called before it", () => {
    expect(diagnoseWithLints(`& print(table.nogetn())\n${SHADOW}\n`)).toEqual(
      MISSING,
    );
  });

  test("does not hide a missing member in a function declared before it", () => {
    expect(
      diagnoseWithLints(
        `function run()\n    print(table.nogetn())\nend\n${SHADOW}\n`,
      ),
    ).toEqual(MISSING);
  });

  test("does not hide a missing member earlier in the same function", () => {
    expect(
      diagnoseWithLints(
        `function run()\n    print(table.nogetn())\n    ${SHADOW}\n    print(table.nogetn())\nend\n`,
      ),
    ).toEqual(MISSING);
  });

  test("does not hide a missing member after the block that declares it", () => {
    expect(
      diagnoseWithLints(
        `function run()\n    do\n        ${SHADOW}\n        print(table.nogetn())\n    end\n    print(table.nogetn())\nend\n`,
      ),
    ).toEqual(MISSING);
  });

  test("does not hide a missing member after a loop or arm that declares it", () => {
    for (const block of [
      `for i = 1, 2 do\n        ${SHADOW}\n    end`,
      `while true do\n        ${SHADOW}\n        break\n    end`,
      `if true then\n        ${SHADOW}\n    end`,
      `for _, table in ipairs({}) do\n    end`,
    ]) {
      expect(
        diagnoseWithLints(
          `function run()\n    ${block}\n    print(table.nogetn())\nend\n`,
        ).filter((m) => !m.includes("never used")),
      ).toEqual(MISSING);
    }
  });

  test("does not hide a missing member in another function", () => {
    expect(
      diagnoseWithLints(
        `function a()\n    ${SHADOW}\n    print(table.nogetn())\nend\nfunction b()\n    print(table.nogetn())\nend\n`,
      ),
    ).toEqual(MISSING);
  });

  test("provides its own member after its declaration", () => {
    expect(
      diagnoseWithLints(`${SHADOW}\n& print(table.nogetn())\n& print(table.nogetn)\n`),
    ).toEqual([]);
  });

  test("provides its own member inside a function declared after it", () => {
    expect(
      diagnoseWithLints(
        `${SHADOW}\nfunction run()\n    print(table.nogetn())\nend\n`,
      ),
    ).toEqual([]);
  });

  test("provides its own member later in the same block", () => {
    expect(
      diagnoseWithLints(
        `function run()\n    do\n        ${SHADOW}\n        print(table.nogetn())\n    end\nend\n`,
      ),
    ).toEqual([]);
  });

  test("provides its own member in blocks nested after it", () => {
    expect(
      diagnoseWithLints(
        `function run()\n    ${SHADOW}\n    do\n        if true then\n            print(table.nogetn())\n        end\n    end\n    while table.nogetn() == 0 do\n    end\nend\n`,
      ),
    ).toEqual([]);
  });

  test("provides its own member when declared with another local", () => {
    expect(
      diagnoseWithLints(
        `function run()\n    local table, other = { nogetn = function() return 1 end }, 1\n    print(table.nogetn(), other)\nend\n`,
      ),
    ).toEqual([]);
  });

  test("provides its own member to the condition of its repeat loop", () => {
    expect(
      diagnoseWithLints(
        `function run()\n    repeat\n        ${SHADOW}\n    until table.nogetn() == 1\nend\n`,
      ),
    ).toEqual([]);
  });

  test("provides its own member when it is a loop variable", () => {
    expect(
      diagnoseWithLints(
        `function run()\n    for _, table in ipairs({}) do\n        print(table.nogetn)\n    end\nend\n`,
      ),
    ).toEqual([]);
  });

  test("leaves an existing library member read before it unreported", () => {
    expect(
      diagnoseWithLints(`& print(table.concat({"a"}))\n${SHADOW}\n`),
    ).toEqual([]);
    expect(
      diagnoseWithLints(
        `function run()\n    print(table.concat({"a"}))\n    ${SHADOW}\nend\n`,
      ).filter((m) => !m.includes("never used")),
    ).toEqual([]);
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

  test("before a local that shadows a library, the name is the library", () => {
    const r = runConformanceSource(`assert(table.nogetn == nil, "read the local early")
assert(table.concat({"a"}) == "a", "table.concat missing")
local table = { nogetn = function() return 1 end }
assert(table.nogetn() == 1, "got " .. tostring(table.nogetn()))`);
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
