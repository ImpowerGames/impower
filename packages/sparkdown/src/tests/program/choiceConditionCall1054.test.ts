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
    ["if t:open(#[=[)]=])", "if t:open(#[=[))]=])"],
    ["if t:open(--[[ ) ]] 1)", "if t:open(--[[ ) ]] 2)"],
    ["if (t:open(--[==[ ( ]==] 1))", "if (t:open([[)]] and 2))"],
    ["if t:open(#[====[) ] ]====] - 3)", "if t:open(--[====[) ] ]====] 2)"],
    ["if t:open(#`{ `)` }`)", "if t:open(#`{ `) ` }`)"],
  ];
  for (const [first, second] of cases) {
    it(`${first} / ${second}`, () => {
      expect(menuTexts(first, second)).toEqual(["First"]);
    });
  }
});

describe("a choice line whose condition cannot be read stays a choice (I-1054)", () => {
  for (const region of ["[[x]] ", "--[[x]] "]) {
    it(`thirty unclosed ${JSON.stringify(region.trim())} regions`, () => {
      const { program } = compileScript(
        [
          "scene start",
          "  choose",
          `    * if f(${region.repeat(30)}First`,
          "    * Fallback",
          "  end",
          "end",
          "",
        ].join("\n"),
      );
      const run = storyRun(new ProgramStory(program.chunks!), []);
      const menu = run.menus[0]?.choices.map((c) => c.text) ?? [];
      expect(menu.length).toBe(2);
      expect(menu[0].startsWith("if f(")).toBe(true);
      expect(menu[1]).toBe("Fallback");
    });
  }
});

describe("a long string or block comment in a choice's condition ends at its own first close (I-1054)", () => {
  for (const level of [1, 2, 3, 4]) {
    const eq = "=".repeat(level);
    for (const [kind, condition] of [
      ["string", `(#[${eq}[a]]${eq}] == 2)`],
      ["comment", `(t:open(1) --[${eq}[a]]${eq}] )`],
    ]) {
      it(`level ${level} ${kind}`, () => {
        expect(menuTexts(`if ${condition} ]${eq}]) Tail`, "if denied()")).toEqual([`]${eq}]) Tail First`]);
      });
    }
  }
});
