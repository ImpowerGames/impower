// DuplicateLocal (I-606): a name that one `local` statement or one function's
// parameter list declares again. The upstream case is in
// `luau-conformance/LintCandidatesScope.test.ts`; these are the controls
// around it, and the LocalUnused warning for the first of the two names.

import { describe, expect, test } from "vitest";
import { diagnoseDetailed } from "../luau-conformance/diagnosticTestHarness";

const lints = (source: string, code: string) => diagnoseDetailed(source).filter((d) => d.code === code);
const messages = (source: string) => lints(source, "DuplicateLocal").map((d) => d.message);
const inFunction = (body: string) => messages(`& run()\nfunction run()\n${body}\nend\n`);

describe("DuplicateLocal", () => {
  test("warns on the later parameter, against the earlier one's column", () => {
    expect(lints("& f(1, 2)\nfunction f(a, b, a)\n return a, b\nend\n", "DuplicateLocal")).toEqual([
      {
        file: "main.sd",
        code: "DuplicateLocal",
        message: "Function parameter 'a' already defined on column 12",
        severity: 2,
        range: { start: { line: 1, character: 17 }, end: { line: 1, character: 18 } },
      },
    ]);
  });

  test("names the earlier declaration's line when it is on another line", () => {
    expect(inFunction(" local a,\n  a = 1, 2\n return a")).toEqual(["Variable 'a' already defined on line 3"]);
    expect(inFunction(" local function g(a,\n  a) return a end\n return g")).toEqual(["Function parameter 'a' already defined on line 3"]);
  });

  test("an explicit self repeats a method's implicit one, and a second self a field function's first", () => {
    expect(inFunction(" local T = {}\n function T:m(self) end\n function T.n(self, self) end\n return T")).toEqual([
      "Function parameter 'self' already defined implicitly",
      "Function parameter 'self' already defined on column 15",
    ]);
  });

  test("a name declared three times warns twice, each against the one before it", () => {
    expect(inFunction(" local a, a, a = 1, 2, 3\n return a")).toEqual(["Variable 'a' already defined on column 8", "Variable 'a' already defined on column 11"]);
  });

  test("runs outside functions too, as in Luau", () => {
    expect(messages("& local a, a = 1, 2\nValue {a}.\n")).toEqual(["Variable 'a' already defined on column 9"]);
  });

  test.each([
    ["the placeholder", " local _, _ = 1, 2\n local function g(_, _) end\n return g"],
    ["separate statements", " local a = 1\n local a = 2\n return a"],
    ["a parameter and a local in its body", " local function g(a) local a = 1 return a end\n return g"],
    ["an inner function's parameter of an outer one's name", " local function g(a) return function(a) return a end end\n return g"],
    ["a loop's variables, which Luau's rule does not read", " for k, k in pairs({}) do print(k) end"],
    ["a function written in a type", " local t: typeof(function(a, a) end) = nil\n return t"],
    ["a parameter list holding a syntax error", " local function g(a, b c, a) return a end\n return g"],
    ["a local list holding a syntax error", " local a, b c, a = 1, 2\n print(a)"],
  ])("is silent for %s", (_label, body) => {
    expect(inFunction(body)).toEqual([]);
  });

  test("an error in a value or the body does not change the names", () => {
    expect(inFunction(" local a, a = ...\n return a")).toEqual(["Variable 'a' already defined on column 8"]);
    expect(inFunction(" local function g(a, a)\n  public y\n  return a\n end\n return g")).toEqual(["Function parameter 'a' already defined on column 19"]);
  });

  test("a name the grammar can read as a keyword is still a name in a list", () => {
    expect(inFunction(" local match, b, match = 1, 2, 3\n return b")).toEqual(["Variable 'match' already defined on column 8"]);
  });
});

describe("LocalUnused for a name declared twice in one statement", () => {
  test("warns on the first, which the later reads do not reach", () => {
    expect(lints("& run()\nfunction run()\n local a1, a2, a1 = 1, 2, 3\n return a1, a2\nend\n", "LocalUnused").map((d) => d.range)).toEqual([
      { start: { line: 2, character: 7 }, end: { line: 2, character: 9 } },
    ]);
  });
});
