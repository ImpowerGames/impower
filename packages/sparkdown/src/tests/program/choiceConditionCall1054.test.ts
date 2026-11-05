import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, storyRun } from "./programHarness";

const script = (first: string, second: string) =>
  [
    "store calls = 0",
    "store t = { n = 1 }",
    "function allowed()",
    "  return true",
    "end",
    "function denied()",
    "  return false",
    "end",
    "function t:open(k)",
    "  return k == self.n",
    "end",
    "scene start",
    "  choose",
    `    * ${first} First`,
    `    * ${second} Second`,
    "  end",
    "end",
    "",
  ].join("\n");

const menuTexts = (first: string, second: string) => {
  const { program } = compileScript(script(first, second));
  const run = storyRun(new ProgramStory(program.chunks!), []);
  const errors = Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d) => d.severity === 1)
    .map((d) => d.message);
  expect(errors).toEqual([]);
  expect(run.errors).toEqual([]);
  return run.menus[0]?.choices.map((c) => c.text);
};

describe("a choice's own condition may call a function (I-1054)", () => {
  const cases: [string, string][] = [
    ["if (calls == 0)", "if (calls == 1)"],
    ["if allowed()", "if denied()"],
    ["if (allowed())", "if (denied())"],
    ["if not denied()", "if not allowed()"],
    ["if ((allowed()) and (calls == 0))", "if (denied() or (calls > 0))"],
    ["if t:open(1)", "if t:open(2)"],
    ["if (math.max(calls, 1) == 1)", "if (math.max(calls, 1) == 2)"],
    ['if (#("(") == 1)', 'if (#(")") == 2)'],
  ];
  for (const [first, second] of cases) {
    it(`${first} / ${second}`, () => {
      expect(menuTexts(first, second)).toEqual(["First"]);
    });
  }
});
