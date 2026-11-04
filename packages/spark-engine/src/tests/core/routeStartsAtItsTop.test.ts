import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { paramKey } from "@impower/sparkdown/src/program/startingValueLiterals";
import { START_FLOW_NAME } from "@impower/sparkdown/src/program/ProgramSymbols";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { URI, routeTo, shown } from "../harness/startingValuesGame";

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

const run = (game: any, start: () => void) => {
  start();
  const errors: string[] = [];
  const text: string[] = [];
  game.story.onError = (message: string) => errors.push(message);
  try {
    while (game.story.canContinue) {
      text.push(game.story.Continue() ?? "");
    }
  } catch (e) {
    errors.push(String(e));
  }
  return { errors, text: text.join("") };
};

describe("a tunnel's return with nothing to return to, in a route from a branch's top", () => {
  test("ends the run as done does", () => {
    const { game } = routeTo(DOTTED, 14);
    expect(game.simulation).toBe("success");
    expect(game.plannedRoute.from).toBe("outer.visit");
    const { errors, text } = run(game, () => game.jumpToFlow(game.plannedRoute.from));
    expect(text).toContain("Visit nil nil.");
    expect(errors).toEqual([]);
    expect(game.story.canContinue).toBe(false);
    expect(game.story.currentChoices).toEqual([]);
  });

  test("is the route's last entry", () => {
    const { game } = routeTo(DOTTED, 14);
    expect(game.previewRouteOf(game.plannedRoute).tunnelEnds).toBe(true);
    const before = routeTo(DOTTED, 13).game;
    expect(before.previewRouteOf(before.plannedRoute).tunnelEnds).toBeUndefined();
  });

  test("is not the route's last entry when the route reaches it inside a tunnel the branch entered", () => {
    const { game } = routeTo(
      [
        "scene start",
        "  Top.",
        "end",
        "scene outer",
        "  branch b(a)",
        "    if a == nil then",
        "      -> outer.b(1) ->",
        "      After caller.",
        "      done",
        "    end",
        "    ->->",
        "  end",
        "end",
      ],
      11,
    );
    expect(game.simulation).toBe("success");
    expect(game.plannedRoute.from).toBe("outer.b");
    expect(game.previewRouteOf(game.plannedRoute).tunnelEnds).toBeUndefined();
  });

  test("goes on to the divert it names", () => {
    const { game } = routeTo(DOTTED, 27, {
      "outer.leave": { [paramKey("k")]: "4" },
    });
    expect(game.simulation).toBe("success");
    const { errors, text } = run(game, () => game.jumpToFlow(game.plannedRoute.from));
    expect(errors).toEqual([]);
    expect(text).toContain("Leave 4.");
    expect(text).toContain("Last 5.");
  });
});

const SCENE_TUNNEL = [
  "scene start",
  "  -> outer.b(1)",
  "end",
  "scene outer",
  "  branch b(a)",
  "    B {a}.",
  "    ->->",
  "  end",
  "end",
  "scene s",
  "  Before.",
  "  ->->",
  "end",
];

describe("a tunnel's return with nothing to return to, in a route from a scene's top", () => {
  test("ends the run as done does, as the route's last entry", () => {
    const { game } = routeTo(SCENE_TUNNEL, 12);
    expect(game.plannedRoute.from).toBe("s");
    expect(game.previewRouteOf(game.plannedRoute).tunnelEnds).toBe(true);
    const { errors, text } = run(game, () => game.jumpToFlow("s"));
    expect(text).toContain("Before.");
    expect(errors).toEqual([]);
    expect(game.story.canContinue).toBe(false);
  });

  test("ends the run when a jump starts it inside the scene", () => {
    const { game } = routeTo(SCENE_TUNNEL, 7);
    expect(game.plannedRoute.from).toBe("outer.b");
    const before = programLocator(game.program).addressAt(URI, 10)!;
    const { errors } = run(game, () => game.jumpTo(before, true));
    expect(errors).toEqual([]);
  });

  test("is an error in a run from the story's start", () => {
    const { game } = routeTo(["scene start", "  Top.", "  ->->", "end"], 2);
    expect(game.plannedRoute.from).toBe(START_FLOW_NAME);
    expect(game.previewRouteOf(game.plannedRoute).tunnelEnds).toBeUndefined();
    const { errors } = run(game, () => game.jumpToFlow(START_FLOW_NAME));
    expect(errors.join(" ")).toContain("->->");
  });

  test("is an error after a route from a branch's top, when the game loads a save made in the scene", () => {
    const saved = routeTo(SCENE_TUNNEL, 12).game;
    saved.jumpTo(programLocator(saved.program).addressAt(URI, 10)!, true);
    saved.simulation = "none";
    const save = saved.save();
    expect(JSON.parse(save).simulatedFrom).toBeUndefined();
    const { game } = routeTo(SCENE_TUNNEL, 7);
    expect(game.plannedRoute.from).toBe("outer.b");
    const { errors } = run(game, () => game.load(save));
    expect(errors.join(" ")).toContain("->->");
  });
});