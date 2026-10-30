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
          "scene start",
          "  local g = f",
          "  Value {g} and {f}, {tostring(g)}.",
          "  done",
          "end",
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
          "scene start",
          "  local t = { [f] = 42, [tostring(f)] = 99 }",
          "  Keys {t[f]} and {t[tostring(f)]}.",
          "  done",
          "end",
        ].join("\n"),
      ),
    ).toEqual(["Keys 42 and 99."]);
  });

  it("prints a function that captures a local the same way", () => {
    expect(
      texts(
        [
          "scene start",
          "  local n = 1",
          "  local function h()",
          "    return n",
          "  end",
          "",
          "  Value {h}, {tostring(h)}.",
          "  done",
          "end",
        ].join("\n"),
      ),
    ).toEqual(["Value function: h, function: h."]);
  });

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
          "scene start",
          "  Value {pair()}.",
          "  done",
          "end",
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
          "scene start",
          "  local h = make(1)",
          "  local p = print",
          "  Values {h} and {p}.",
          "  Strings {tostring(h)} and {tostring(p)}.",
          "  done",
          "end",
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
        "scene start",
        "  choose",
        "    + Use {f}",
        "      ok",
        "    + Use {pair()}",
        "      ok",
        "  end",
        "  done",
        "end",
      ].join("\n"),
    );
    const story = new ProgramStory(program.chunks!);
    story.ContinueMaximally();
    expect(story.currentChoices.map((c) => c.text)).toEqual([
      "Use function: f",
      "Use function: f",
    ]);
  });

  it("still finds t[f] in a save that holds it under the old key text", () => {
    const { program } = compileScript(
      [
        "store t = nil",
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
    const saved = JSON.parse(
      readFileSync(
        join(HERE, "fixtures", "program-save-function-key.json"),
        "utf-8",
      ),
    );
    expect(Object.keys(saved.variablesState.t.obj)).toContain(
      "DivertTargetValue(" + "f)",
    );
    saved.position[0] -= 1;
    saved.previousAddress -= 1 << 21;
    const story = new ProgramStory(program.chunks!);
    story.state.LoadJson(JSON.stringify(saved));
    expect(story.Continue()).toBe("Keys 42 and 99.\n");
  });
});
