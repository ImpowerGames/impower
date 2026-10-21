import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, storyBeats } from "./programHarness";

const HERE = dirname(fileURLToPath(import.meta.url));

const texts = (script: string) => {
  const { program } = compileScript(script);
  expect(program.chunks).toBeDefined();
  return storyBeats(new ProgramStory(program.chunks!)).beats.map((b) =>
    b.text.trimEnd(),
  );
};

describe("a function value written into a line", () => {
  it("prints as function: <name>, as tostring does", () => {
    expect(
      texts(
        [
          "function f()",
          "  return 1",
          "end",
          "",
          "local g = f",
          "Value {g} and {f}, {tostring(g)}.",
          "done",
        ].join("\n"),
      ),
    ).toEqual(["Value function: f and function: f, function: f."]);
  });

  it("keeps its table key distinct from the string tostring gives", () => {
    expect(
      texts(
        [
          "function f()",
          "  return 1",
          "end",
          "",
          "local t = { [f] = 42, [tostring(f)] = 99 }",
          "Keys {t[f]} and {t[tostring(f)]}.",
          "done",
        ].join("\n"),
      ),
    ).toEqual(["Keys 42 and 99."]);
  });

  it("prints a function that captures a local the same way", () => {
    expect(
      texts(
        [
          "local n = 1",
          "local function h()",
          "  return n",
          "end",
          "",
          "Value {h}, {tostring(h)}.",
          "done",
        ].join("\n"),
      ),
    ).toEqual(["Value function: h, function: h."]);
  });

  // Round 1 of the review of #2116 (report 6305108271): a multiple value, a
  // closure and a builtin printed their table text in a line.
  it("prints the first of several returned values as a function", () => {
    expect(
      texts(
        [
          "function f()",
          "  return 1",
          "end",
          "",
          "function pair()",
          "  return f, 2",
          "end",
          "",
          "Value {pair()}.",
          "done",
        ].join("\n"),
      ),
    ).toEqual(["Value function: f."]);
  });

  it("prints a closure and a builtin as tostring does", () => {
    expect(
      texts(
        [
          "function make(n)",
          "  return function() return n end",
          "end",
          "",
          "local h = make(1)",
          "local p = print",
          "Values {h} and {p}.",
          "Strings {tostring(h)} and {tostring(p)}.",
          "done",
        ].join("\n"),
      ),
    ).toEqual([
      "Values function: make.<anonymous> and function: builtin: print.",
      "Strings function: make.<anonymous> and function: builtin: print.",
    ]);
  });

  it("prints a function value in a choice's text", () => {
    const { program } = compileScript(
      [
        "function f()",
        "  return 1",
        "end",
        "",
        "function pair()",
        "  return f, 2",
        "end",
        "",
        "choose",
        "  + Use {f}",
        "    ok",
        "  + Use {pair()}",
        "    ok",
        "end",
        "done",
      ].join("\n"),
    );
    const story = new ProgramStory(program.chunks!);
    story.ContinueMaximally();
    expect(story.currentChoices.map((c) => c.text)).toEqual([
      "Use function: f",
      "Use function: f",
    ]);
  });

  // `program-save-function-key.json` is the state main's engine (9c826c4b1)
  // saved after the first line of this script: it holds `t[f]` under the key
  // text saves have always held a function under, the class name of the
  // deleted object engine around the label.
  it("still finds t[f] in a save that holds it under the old key text", () => {
    const { program } = compileScript(
      [
        "store t = nil",
        "",
        "-> start",
        "",
        "scene start",
        "  & t = { [f] = 42, [tostring(f)] = 99 }",
        "  First.",
        "  Keys {t[f]} and {t[tostring(f)]}.",
        "end",
        "",
        "function f()",
        "  return 1",
        "end",
        "",
      ].join("\n"),
    );
    const saved = readFileSync(
      join(HERE, "fixtures", "program-save-function-key.json"),
      "utf-8",
    );
    expect(Object.keys(JSON.parse(saved).variablesState.t.obj)).toContain(
      "DivertTargetValue(" + "f)",
    );
    const story = new ProgramStory(program.chunks!);
    story.state.LoadJson(saved);
    expect(story.Continue()).toBe("Keys 42 and 99.\n");
  });
});
