// A call to a member a standard library table does not have names the
// missing member, as the uncalled form does, never the library (#915).
import { describe, expect, test } from "vitest";
import {
  diagnoseDetailed,
  diagnoseFilesDetailed,
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

  test.each([
    ["a numeric for loop", `for i = 1, 2 do\n        ${SHADOW}\n    end`],
    ["a while loop", `while true do\n        ${SHADOW}\n        break\n    end`],
    ["an if arm", `if true then\n        ${SHADOW}\n    end`],
    ["a generic for loop's variable", `for _, table in ipairs({}) do\n    end`],
  ])("does not hide a missing member after %s that declares it", (_, block) => {
    expect(
      diagnoseWithLints(
        `function run()\n    ${block}\n    print(table.nogetn())\nend\n`,
      ).filter((m) => !m.includes("never used")),
    ).toEqual(MISSING);
  });

  test.each([
    ["a top-level do block", "do"],
    ["a top-level if arm", "if true then"],
  ])("does not hide a missing member in a function after %s that declares it", (_, opener) => {
    expect(
      diagnoseWithLints(
        `${opener}\n    ${SHADOW}\nend\nfunction run()\n    print(table.nogetn())\nend\n`,
      ),
    ).toEqual(MISSING);
  });

  test("does not hide a missing member in a function written before it in the same top-level block", () => {
    expect(
      diagnoseWithLints(
        `do\n    function run()\n        print(table.nogetn())\n    end\n    ${SHADOW}\nend\n`,
      ),
    ).toEqual(MISSING);
  });

  test.each([
    ["a closure", "local f = function() return table.nogetn() end"],
    ["a local function", "local function f() return table.nogetn() end"],
    ["a closure's closure", "local f = function() return function() return table.nogetn() end end"],
  ])("does not hide a missing member in %s created before it", (_, closure) => {
    expect(
      diagnoseWithLints(
        `function run()\n    ${closure}\n    ${SHADOW}\n    return f\nend\n`,
      ).filter((m) => !m.includes("never used")),
    ).toEqual(MISSING);
  });

  // Each function is written in `run` and returned, with the local between.
  const NESTED = [
    ["a variadic function", "function f(...)\n        return table.nogetn()\n    end"],
    ["a function stored on a table", "local obj = {}\n    function obj.f()\n        return table.nogetn()\n    end"],
    ["a method", "local obj = {}\n    function obj:f()\n        return table.nogetn()\n    end"],
    ["a named function", "function f()\n        return table.nogetn()\n    end"],
  ];

  test.each(NESTED)("does not hide a missing member in %s written before it", (_, fn) => {
    expect(
      diagnoseWithLints(
        `function run()\n    ${fn}\n    ${SHADOW}\n    return table\nend\n`,
      ),
    ).toEqual(MISSING);
  });

  test.each(NESTED)("provides its own member inside %s written after it", (_, fn) => {
    expect(
      diagnoseWithLints(
        `function run()\n    ${SHADOW}\n    ${fn}\n    return table\nend\n`,
      ),
    ).toEqual([]);
  });

  test.each([
    ["one level", "local function inner()\n        return table.nogetn()\n    end\n    return inner()"],
    ["two levels", "local function mid()\n        local function inner()\n            return table.nogetn()\n        end\n        return inner()\n    end\n    return mid()"],
  ])("a local function nested %s in a function follows the top level around that function", (_, body) => {
    const outer = `function outer()\n    ${body}\nend\n`;
    expect(diagnoseWithLints(`${outer}${SHADOW}\n`)).toEqual(MISSING);
    expect(diagnoseWithLints(`do\n    ${SHADOW}\nend\n${outer}`)).toEqual(MISSING);
    expect(diagnoseWithLints(`${SHADOW}\n${outer}`)).toEqual([]);
  });

  test.each([
    ["an if arm", "if true then", "else"],
    ["a while body", "while false do", null],
  ])("a function written inside %s at the top level follows its place in it", (_, opener, other) => {
    const fn = "function inner()\n        print(table.nogetn())\n    end";
    expect(
      diagnoseWithLints(`${opener}\n    ${SHADOW}\n    ${fn}\nend\n`),
    ).toEqual([]);
    expect(diagnoseWithLints(`${opener}\n    ${fn}\nend\n${SHADOW}\n`)).toEqual(
      MISSING,
    );
    if (other) {
      expect(
        diagnoseWithLints(`${opener}\n    ${SHADOW}\n${other}\n    ${fn}\nend\n`),
      ).toEqual(MISSING);
    }
  });

  test.each([
    ["a variadic function", "function f(...)\n            return table.nogetn()\n        end"],
    ["a named function", "function f()\n            return table.nogetn()\n        end"],
  ])("%s written in an if arm of a function follows its place in the arm", (_, fn) => {
    const outer = (arm: string) =>
      `function outer()\n    if true then\n        ${arm}\n    end\nend\n`;
    expect(
      diagnoseWithLints(outer(`${SHADOW}\n        ${fn}`)).filter(
        (m) => !m.includes("never used"),
      ),
    ).toEqual([]);
    expect(
      diagnoseWithLints(outer(`${fn}\n        ${SHADOW}`)).filter(
        (m) => !m.includes("never used"),
      ),
    ).toEqual(MISSING);
  });

  test("a define method follows the top level around the define", () => {
    const define =
      "define Penguin with\n  swim()\n    print(table.nogetn())\n  end\nend\n";
    expect(diagnoseWithLints(define)).toEqual(MISSING);
    expect(diagnoseWithLints(`${define}${SHADOW}\n`)).toEqual(MISSING);
    expect(diagnoseWithLints(`do\n  ${SHADOW}\nend\n${define}`)).toEqual(
      MISSING,
    );
    expect(diagnoseWithLints(`${SHADOW}\n${define}`)).toEqual([]);
  });

  test("a scene follows the top level before it and its own content", () => {
    const scene = (body: string) => `scene start\n  ${body}\nend\n`;
    expect(diagnoseWithLints(scene("& print(table.nogetn)"))).toEqual(MISSING);
    expect(
      diagnoseWithLints(`${SHADOW}\n${scene("& print(table.nogetn)")}`),
    ).toEqual([]);
    expect(
      diagnoseWithLints(scene(`${SHADOW}\n  & print(table.nogetn)`)),
    ).toEqual([]);
    expect(
      diagnoseWithLints(scene(`& print(table.nogetn)\n  ${SHADOW}`)),
    ).toEqual(MISSING);
  });

  test("does not hide a missing member in a closure created after the block that declares it", () => {
    expect(
      diagnoseWithLints(
        `function run()\n    do\n        ${SHADOW}\n    end\n    return function() return table.nogetn() end\nend\n`,
      ).filter((m) => !m.includes("never used")),
    ).toEqual(MISSING);
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

  test("provides its own member inside a function written after it in the same top-level block", () => {
    expect(
      diagnoseWithLints(
        `do\n    ${SHADOW}\n    function run()\n        print(table.nogetn())\n    end\nend\n& print(1)\n`,
      ),
    ).toEqual([]);
  });

  test.each([
    ["a closure", "local f = function() return table.nogetn() end"],
    ["a local function", "local function f() return table.nogetn() end"],
    ["a closure's closure", "local f = function() return function() return table.nogetn() end end"],
  ])("provides its own member inside %s created after it", (_, closure) => {
    expect(
      diagnoseWithLints(
        `function run()\n    ${SHADOW}\n    ${closure}\n    return f\nend\n`,
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

// An included script's top-level content runs before the top-level content of
// the script that includes it, wherever the `include` line is.
describe("a local named like a library in a project of several scripts", () => {
  const SHADOW = "local table = { nogetn = function() return 1 end }";
  const missing = (sources: Record<string, string>) =>
    diagnoseFilesDetailed(sources)
      .filter((d) => d.message.startsWith("Cannot find item or path named"))
      .map((d) => `${d.file}:${d.range!.start.line + 1}`);

  test("is in scope in the including script, which runs after it", () => {
    expect(
      missing({
        "main.sd": `& print(table.nogetn)\ninclude scripts/chapter.sd\nfunction late()\n    print(table.nogetn())\nend\n`,
        "scripts/chapter.sd": `${SHADOW}\n`,
      }),
    ).toEqual([]);
  });

  test("is out of scope before it in its own script", () => {
    expect(
      missing({
        "main.sd": `include scripts/chapter.sd\n`,
        "scripts/chapter.sd": `function early()\n    print(table.nogetn())\nend\n${SHADOW}\ndo\n    function late()\n        print(table.nogetn())\n    end\nend\n`,
      }),
    ).toEqual(["scripts/chapter.sd:2"]);
  });

  test("is out of scope in an included script, which runs before it", () => {
    expect(
      missing({
        "main.sd": `include scripts/chapter.sd\n${SHADOW}\n`,
        "scripts/chapter.sd": `& print(table.nogetn)\nfunction chap()\n    print(table.nogetn())\nend\n`,
      }),
    ).toEqual(["scripts/chapter.sd:1", "scripts/chapter.sd:3"]);
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
