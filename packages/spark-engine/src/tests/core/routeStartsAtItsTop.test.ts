import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { paramKey } from "@impower/sparkdown/src/program/startingValueLiterals";
import { START_FLOW_NAME } from "@impower/sparkdown/src/program/ProgramSymbols";
import { routeTo, shown } from "../harness/startingValuesGame";

const PARAMETER_SCENE = [
  "scene start",
  "  -> s(10)",
  "end",
  "",
  "scene s(a)",
  "  First {a}.",
  "  Second {a}.",
  "end",
];

const DOTTED = readFileSync(
  fileURLToPath(
    new URL(
      "../../../../sparkdown/src/tests/runtime/fixtures/diverts/dotted-divert-targets-with-arguments.sd",
      import.meta.url,
    ),
  ),
  "utf8",
)
  .replace(/\r\n/g, "\n")
  .split("\n");

describe("a line in a scene with parameters", () => {
  test("starts at the top of its scene, its parameter nil when unset", () => {
    const { game } = routeTo(PARAMETER_SCENE, 6);
    expect(game.simulation).toBe("success");
    expect(game.plannedRoute.from).toBe("s");
    expect(shown(game)).toContain("First nil.");
  });

  test("starts at the top of its scene with its parameter from the starting values", () => {
    const { game } = routeTo(PARAMETER_SCENE, 7, { s: { [paramKey("a")]: "10" } });
    expect(game.simulation).toBe("success");
    expect(game.plannedRoute.from).toBe("s");
    expect(shown(game)).toContain("Second 10.");
  });

  test("in the start scene starts at the story's start", () => {
    const { game } = routeTo(PARAMETER_SCENE, 2);
    expect(game.simulation).toBe("success");
    expect(game.plannedRoute.from).toBe(START_FLOW_NAME);
  });
});

describe("a line in a branch only a divert from elsewhere enters", () => {
  test.each([
    [6, "outer.inner", "Inner nil."],
    [13, "outer.visit", "Visit nil nil."],
    [17, "outer.aside", "Aside nil."],
    [21, "outer.second", "Second nil nil."],
    [27, "outer.leave", "Leave nil."],
    [31, "outer.last", "Last nil."],
  ])("at line %i starts at the top of %s", (line, branch, text) => {
    const { game } = routeTo(DOTTED, line);
    expect(game.simulation).toBe("success");
    expect(game.plannedRoute.from).toBe(branch);
    expect(shown(game)).toContain(text);
  });

  test("starts with the branch's parameters from the branch's own starting values", () => {
    const { game } = routeTo(DOTTED, 6, {
      "outer.inner": { [paramKey("a")]: "5" },
    });
    expect(game.simulation).toBe("success");
    expect(game.plannedRoute.from).toBe("outer.inner");
    expect(shown(game)).toContain("Inner 5.");
  });
});

describe("a tunnel's return with nothing to return to, in a route from a branch's top", () => {
  test("ends the run as done does", () => {
    const { game } = routeTo(DOTTED, 14);
    expect(game.simulation).toBe("success");
    expect(game.plannedRoute.from).toBe("outer.visit");
    const errors: string[] = [];
    game.story.onError = (message: string) => errors.push(message);
    while (game.story.canContinue) {
      game.story.Continue();
    }
    expect(errors).toEqual([]);
    expect(game.story.currentChoices).toEqual([]);
  });

  test("is the route's last entry", () => {
    const { game } = routeTo(DOTTED, 14);
    expect(game.previewRouteOf(game.plannedRoute).tunnelEnds).toBe(true);
    const before = routeTo(DOTTED, 13).game;
    expect(before.previewRouteOf(before.plannedRoute).tunnelEnds).toBeUndefined();
  });

  test("goes on to the divert it names", () => {
    const { game } = routeTo(DOTTED, 27, {
      "outer.leave": { [paramKey("k")]: "4" },
    });
    expect(game.simulation).toBe("success");
    const errors: string[] = [];
    game.story.onError = (message: string) => errors.push(message);
    const text: string[] = [];
    while (game.story.canContinue) {
      text.push(game.story.Continue());
    }
    expect(errors).toEqual([]);
    expect(text.join("")).toContain("Last 5.");
  });
});

describe("a tunnel's return with nothing to return to, in a route from a scene's top", () => {
  test("is an error, as in the game", () => {
    const { game } = routeTo(
      ["scene start", "  Top.", "end", "", "scene s", "  Before.", "  ->->", "end"],
      7,
    );
    expect(game.plannedRoute.from).toBe("s");
    expect(game.previewRouteOf(game.plannedRoute).tunnelEnds).toBeUndefined();
    game.jumpToFlow("s");
    const errors: string[] = [];
    game.story.onError = (message: string) => errors.push(message);
    try {
      while (game.story.canContinue) {
        game.story.Continue();
      }
    } catch (e) {
      errors.push(String(e));
    }
    expect(errors.join(" ")).toContain("->->");
  });
});
