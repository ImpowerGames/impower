// A call to a member a standard library table does not have names the
// missing member, as the uncalled form does, never the library (#915).
import { describe, expect, test } from "vitest";
import {
  diagnoseFilesDetailed as diagnoseAllFiles,
} from "./diagnosticTestHarness";
import { runConformanceSource } from "./conformanceTestHarness";

// The functions these sources define only hold the call under test, and
// nothing calls them, so their FunctionUnused warnings are left out, as are
// the GlobalUsedAsLocal warnings of a global function one of them defines.
const diagnoseFilesDetailed = (sources: Record<string, string>) =>
  diagnoseAllFiles(sources).filter((d) => d.code !== "FunctionUnused" && d.code !== "GlobalUsedAsLocal");
const diagnoseDetailed = (source: string) =>
  diagnoseFilesDetailed({ "main.sd": source });
const diagnoseWithLints = (source: string) =>
  diagnoseDetailed(source).map((d) => d.message);

// A local belongs in a scene or a function: these write lines as a scene's
// body, or as the body of a function `host` that nothing calls.
const inScene = (body: string) => `scene start\n${body.split("\n").map((line) => `  ${line}`).join("\n")}\nend\n`;
const inHost = (body: string) => `function host()\n${body.split("\n").map((line) => `    ${line}`).join("\n")}\nend\n`;
const notUnusedLint = (m: string) => !m.includes("never used");

const spans = (source: string) =>
  diagnoseDetailed(source).map((d) => [
    d.message,
    d.range?.start,
    d.range?.end,
  ]);

describe("calling a missing stdlib member", () => {
  test("names the member in a scene", () => {
    expect(spans(inScene("& print(table.nogetn())"))).toEqual([
      [
        "Cannot find item or path named `table.nogetn`",
        { line: 1, character: 10 },
        { line: 1, character: 22 },
      ],
    ]);
  });

  test("names the member of another library", () => {
    expect(diagnoseWithLints(inScene("& print(math.nosuch(1))"))).toEqual([
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
    expect(diagnoseWithLints(inScene('& print(table.concat({"a"}))'))).toEqual([]);
  });

  test("a deprecated member keeps its deprecation", () => {
    expect(diagnoseWithLints(inScene("& print(table.getn({}))"))).toEqual([
      "`table.getn(t)` is deprecated in Luau. Use the length operator `#t` instead.",
    ]);
  });

  test("an unknown global keeps its message", () => {
    expect(diagnoseWithLints(inScene("& print(foo.bar())"))).toEqual([
      "Cannot find variable named `foo`",
    ]);
  });

  test("calling a stdlib constant reports nothing at compile time", () => {
    expect(diagnoseWithLints(inScene("& print(math.pi())"))).toEqual([]);
  });
});

// A local named like a library shadows it only after its declaration and
// inside its block; everywhere else the name is still the library (#1035).
describe("a local named like a library", () => {
  const MISSING = ["Cannot find item or path named `table.nogetn`"];
  const SHADOW = "local table = { nogetn = function() return 1 end }";

  test("does not hide a missing member read before it", () => {
    expect(diagnoseWithLints(inScene(`& print(table.nogetn)\n${SHADOW}`))).toEqual(
      MISSING,
    );
  });

  test("does not hide a missing member called before it", () => {
    expect(diagnoseWithLints(inScene(`& print(table.nogetn())\n${SHADOW}`))).toEqual(
      MISSING,
    );
  });

  test("does not hide a missing member in a function declared before it", () => {
    expect(
      diagnoseWithLints(
        `function run()\n    print(table.nogetn())\nend\n${inScene(SHADOW)}`,
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
    ["a do block", "do"],
    ["an if arm", "if true then"],
  ])("does not hide a missing member in a function after %s of the enclosing function that declares it", (_, opener) => {
    expect(
      diagnoseWithLints(
        inHost(`${opener}\n    ${SHADOW}\nend\nfunction run()\n    print(table.nogetn())\nend`),
      ).filter(notUnusedLint),
    ).toEqual(MISSING);
  });

  test("does not hide a missing member in a function written before it in the same block", () => {
    expect(
      diagnoseWithLints(
        inHost(`do\n    function run()\n        print(table.nogetn())\n    end\n    ${SHADOW}\nend`),
      ).filter(notUnusedLint),
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
  ])("a local function nested %s in a function follows the body around that function", (_, body) => {
    const outer = `function outer()\n    ${body}\nend`;
    expect(diagnoseWithLints(inHost(`${outer}\n${SHADOW}`)).filter(notUnusedLint)).toEqual(MISSING);
    expect(diagnoseWithLints(inHost(`do\n    ${SHADOW}\nend\n${outer}`)).filter(notUnusedLint)).toEqual(MISSING);
    expect(diagnoseWithLints(inHost(`${SHADOW}\n${outer}`))).toEqual([]);
  });

  test.each([
    ["an if arm", "if true then", "else"],
    ["a while body", "while false do", null],
  ])("a function written inside %s of a function follows its place in it", (_, opener, other) => {
    const fn = "function inner()\n        print(table.nogetn())\n    end";
    expect(
      diagnoseWithLints(inHost(`${opener}\n    ${SHADOW}\n    ${fn}\nend`)),
    ).toEqual([]);
    expect(diagnoseWithLints(inHost(`${opener}\n    ${fn}\nend\n${SHADOW}`)).filter(notUnusedLint)).toEqual(
      MISSING,
    );
    if (other) {
      expect(
        diagnoseWithLints(inHost(`${opener}\n    ${SHADOW}\n${other}\n    ${fn}\nend`)).filter(notUnusedLint),
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

  test.each([
    ["an if arm", "if true then", "end"],
    ["a do block", "do", "end"],
    ["a while body", "while false do", "end"],
  ])("a variadic function written in a function after %s that declares it does not see it", (_, opener, closer) => {
    expect(
      diagnoseWithLints(
        `function outer()\n    ${opener}\n        ${SHADOW}\n    ${closer}\n    function f(...)\n        return table.nogetn()\n    end\nend\n`,
      ).filter((m) => !m.includes("never used")),
    ).toEqual(MISSING);
  });

  test("a define method reads the library, whatever scene declares a local of its name", () => {
    const define =
      "define Penguin with\n  swim()\n    print(table.nogetn())\n  end\nend\n";
    expect(diagnoseWithLints(define)).toEqual(MISSING);
    expect(diagnoseWithLints(`${define}${inScene(SHADOW)}`)).toEqual(MISSING);
    expect(diagnoseWithLints(`${inScene(SHADOW)}${define}`)).toEqual(MISSING);
  });

  test("a scene follows its own content", () => {
    expect(diagnoseWithLints(inScene("& print(table.nogetn)"))).toEqual(MISSING);
    expect(
      diagnoseWithLints(inScene(`${SHADOW}\n& print(table.nogetn)`)),
    ).toEqual([]);
    expect(
      diagnoseWithLints(inScene(`& print(table.nogetn)\n${SHADOW}`)),
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
      diagnoseWithLints(inScene(`${SHADOW}\n& print(table.nogetn())\n& print(table.nogetn)`)),
    ).toEqual([]);
  });

  test("provides its own member inside a function written after it in the same block", () => {
    expect(
      diagnoseWithLints(
        inHost(`do\n    ${SHADOW}\n    function run()\n        print(table.nogetn())\n    end\nend`),
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
      diagnoseWithLints(inScene(`& print(table.concat({"a"}))\n${SHADOW}`)),
    ).toEqual([]);
    expect(
      diagnoseWithLints(
        `function run()\n    print(table.concat({"a"}))\n    ${SHADOW}\nend\n`,
      ).filter((m) => !m.includes("never used")),
    ).toEqual([]);
  });
});

// A local belongs to the scene or function that declares it, so it reaches no
// other script of the project. A local at a script's top level is refused,
// since the top level holds declarations only.
describe("a local named like a library in a project of several scripts", () => {
  const SHADOW = "local table = { nogetn = function() return 1 end }";
  const missing = (sources: Record<string, string>) =>
    diagnoseFilesDetailed(sources)
      .filter((d) => d.message.startsWith("Cannot find item or path named"))
      .map((d) => `${d.file}:${d.range!.start.line + 1}`);
  const refused = (sources: Record<string, string>) =>
    diagnoseFilesDetailed(sources)
      .filter((d) => d.message.startsWith("local declaration must be inside a scene"))
      .map((d) => `${d.file}:${d.range!.start.line + 1}`);

  test("is out of scope outside its scene in its own script", () => {
    expect(
      missing({
        "main.sd": `function early()\n    print(table.nogetn())\nend\n${inScene(SHADOW)}`,
        "scripts/chapter.sd": `scene chap_scene\n    Hello.\nend\n`,
      }),
    ).toEqual(["main.sd:2"]);
  });

  const chapter = `scene chap_scene\n    & print(table.nogetn)\nend\nfunction chap()\n    print(table.nogetn())\nend\n`;
  const named = ["scripts/chapter.sd:2", "scripts/chapter.sd:5"];

  test("stays in its scene, so another script of the project names the missing member", () => {
    expect(missing({ "main.sd": inScene(SHADOW), "scripts/chapter.sd": chapter })).toEqual(named);
  });

  test("at the top level of main is refused and hides nothing in another script", () => {
    const sources = { "main.sd": `${SHADOW}\nscene start\nend\n`, "scripts/chapter.sd": chapter };
    expect(refused(sources)).toEqual(["main.sd:1"]);
    expect(missing(sources)).toEqual(named);
  });
});

describe("calling a missing stdlib member with a colon", () => {
  test("names the member in a scene", () => {
    expect(spans(inScene("& print(table:nogetn())"))).toEqual([
      [
        "Cannot find item or path named `table.nogetn`",
        { line: 1, character: 10 },
        { line: 1, character: 22 },
      ],
    ]);
  });

  test("names the member inside a returned anonymous function", () => {
    expect(
      diagnoseWithLints(
        "function run()\nreturn function ()\n    print(table:nogetn())\nend\nend\n",
      ),
    ).toEqual(["Cannot find item or path named `table.nogetn`"]);
  });

  test("spans the call below earlier statements", () => {
    expect(
      spans("store n = 0\n\nfunction tally()\n  n = table:nogetn()\nend\n"),
    ).toEqual([
      [
        "Cannot find item or path named `table.nogetn`",
        { line: 3, character: 6 },
        { line: 3, character: 18 },
      ],
    ]);
  });

  test("an existing member reports nothing", () => {
    expect(diagnoseWithLints(inScene('& print(table:concat({"a"}))'))).toEqual([]);
  });

  test("the call fails at run time and pcall catches it", () => {
    const r = runConformanceSource(`local ok = pcall(function() return table:nogetn() end)
assert(ok == false, "table:nogetn() succeeded")`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("a local that shadows a library receives itself as self", () => {
    const r = runConformanceSource(`local table = { tag = 7, nogetn = function(self, n) return self.tag + n end }
assert(table:nogetn(1) == 8, "got " .. tostring(table:nogetn(1)))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("the receiver is evaluated once, before the arguments", () => {
    const r = runConformanceSource(`local table = { tag = 1, nogetn = function(self, _) return self.tag end }
local replace = function()
  table = { tag = 2, nogetn = function(self, _) return 99 end }
  return 0
end
local got = table:nogetn(replace())
assert(got == 1, "got " .. tostring(got))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("a local that shadows a library keeps its builtin methods", () => {
    const r = runConformanceSource(`local table = { "a", "b", "c" }
assert(table:len() == 3, "len got " .. tostring(table:len()))
assert(table:at(1) == "a", "at got " .. tostring(table:at(1)))
local string = "ab"
assert(string:padstart(4, "-") == "--ab", "padstart got " .. tostring(string:padstart(4, "-")))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("calling a stdlib constant reports nothing at compile time", () => {
    expect(diagnoseWithLints(inScene("& print(math:pi())"))).toEqual([]);
  });

  test("a builtin method name on an unshadowed library names the member", () => {
    expect(diagnoseWithLints(inScene("& print(table:len())"))).toEqual([
      "Cannot find item or path named `table.len`",
    ]);
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

describe("a colon call on a library and a local named like it", () => {
  const MISSING = ["Cannot find item or path named `table.nogetn`"];
  const SHADOW = "local table = { nogetn = function(self) return 1 end }";

  test("in a scene, before the local", () => {
    expect(
      diagnoseWithLints(inScene(`& print(table:nogetn())\n${SHADOW}`)),
    ).toEqual(MISSING);
  });

  test("in a top-level function, with a scene's local", () => {
    expect(
      diagnoseWithLints(
        `function run()\n    print(table:nogetn())\nend\n${inScene(SHADOW)}`,
      ),
    ).toEqual(MISSING);
  });

  test("in the same function, before the local", () => {
    expect(
      diagnoseWithLints(
        `function run()\n    print(table:nogetn())\n    ${SHADOW}\n    print(table:nogetn())\nend\n`,
      ),
    ).toEqual(MISSING);
  });

  test("outside the block that declares the local", () => {
    expect(
      diagnoseWithLints(
        `function run()\n    do\n        ${SHADOW}\n        print(table:nogetn())\n    end\n    print(table:nogetn())\nend\n`,
      ),
    ).toEqual(MISSING);
  });

  test("after the local in a scene, it reads the local", () => {
    expect(
      diagnoseWithLints(inScene(`${SHADOW}\n& print(table:nogetn())`)),
    ).toEqual([]);
  });

  test("in a function written after the local, it reads the local", () => {
    expect(
      diagnoseWithLints(
        inHost(`${SHADOW}\nfunction run()\n    print(table:nogetn())\nend`),
      ),
    ).toEqual([]);
  });

  test("in a closure created after the local, it reads the local", () => {
    expect(
      diagnoseWithLints(
        inHost(`${SHADOW}\nlocal f = function() return table:nogetn() end\nreturn f`),
      ),
    ).toEqual([]);
  });

  test("inside the declaring block, it reads the local", () => {
    expect(
      diagnoseWithLints(
        `function run()\n    do\n        ${SHADOW}\n        print(table:nogetn())\n    end\nend\n`,
      ),
    ).toEqual([]);
  });

  test("in the condition of its repeat loop, it reads the local", () => {
    expect(
      diagnoseWithLints(
        `function run()\n    repeat\n        ${SHADOW}\n    until table:nogetn() == 1\nend\n`,
      ),
    ).toEqual([]);
  });

  test("as a loop variable, it reads the local", () => {
    expect(
      diagnoseWithLints(
        `function run()\n    for _, table in ipairs({}) do\n        print(table:nogetn())\n    end\nend\n`,
      ),
    ).toEqual([]);
  });
});

describe("a colon call on a library and a local named like it in a project of several scripts", () => {
  const SHADOW = "local table = { nogetn = function(self) return 1 end }";
  const missing = (sources: Record<string, string>) =>
    diagnoseFilesDetailed(sources)
      .filter((d) => d.message.startsWith("Cannot find item or path named"))
      .map((d) => `${d.file}:${d.range!.start.line + 1}`);
  const refused = (sources: Record<string, string>) =>
    diagnoseFilesDetailed(sources)
      .filter((d) => d.message.startsWith("local declaration must be inside a scene"))
      .map((d) => `${d.file}:${d.range!.start.line + 1}`);

  test("is out of scope outside its scene in its own script", () => {
    expect(
      missing({
        "main.sd": `function early()\n    print(table:nogetn())\nend\n${inScene(SHADOW)}`,
        "scripts/chapter.sd": `scene chap_scene\n    Hello.\nend\n`,
      }),
    ).toEqual(["main.sd:2"]);
  });

  const chapter = `scene chap_scene\n    & print(table:nogetn())\nend\nfunction chap()\n    print(table:nogetn())\nend\n`;
  const named = ["scripts/chapter.sd:2", "scripts/chapter.sd:5"];

  test("stays in its scene, so another script of the project names the missing member", () => {
    expect(missing({ "main.sd": inScene(SHADOW), "scripts/chapter.sd": chapter })).toEqual(named);
  });

  test("at the top level of main is refused and hides nothing in another script", () => {
    const sources = { "main.sd": `${SHADOW}\nscene start\nend\n`, "scripts/chapter.sd": chapter };
    expect(refused(sources)).toEqual(["main.sd:1"]);
    expect(missing(sources)).toEqual(named);
  });
});
