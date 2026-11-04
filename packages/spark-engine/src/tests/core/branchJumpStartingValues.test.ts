import { describe, expect, test } from "vitest";
import { paramKey, visitsKey } from "@impower/sparkdown/src/program/startingValueLiterals";
import { routeTo, shown } from "../harness/startingValuesGame";

const SCRIPT = [
  "scene start",
  "  -> outer(1)",
  "end",
  "",
  "scene outer(a)",
  "  branch b(a)",
  "    Top {a}.",
  "    done",
  "    Below {a}.",
  "  end",
  "end",
];

const SEEDED = [
  "scene start",
  "  -> outer",
  "end",
  "",
  "scene outer",
  "  branch b",
  "    Top.",
  "    done",
  "    Roll {math.random(1, 1000000)}.",
  "  end",
  "end",
];

const VISITED = [
  "scene start",
  "  -> outer",
  "end",
  "",
  "scene outer",
  "  Body.",
  "  done",
  "  branch b",
  "    Top {count.visits(-> outer.b)}.",
  "    done",
  "    Below {count.visits(-> outer.b)}.",
  "  end",
  "end",
];

const ENTERED = [
  "scene start",
  "  -> outer",
  "end",
  "",
  "scene outer",
  "  branch b",
  "    Top {count.visits(-> outer.b)}.",
  "    done",
  "    Below {count.visits(-> outer.b)}.",
  "  end",
  "end",
];

const visited = { "outer.b": { [visitsKey("outer.b")]: "4" } };

const values = {
  outer: { [paramKey("a")]: "1" },
  "outer.b": { [paramKey("a")]: "5" },
};

const continued = (game: any): string => {
  const out: string[] = [];
  game.story.onError = (m: string) => out.push("ERR " + m);
  while (game.story.canContinue) {
    out.push(game.story.Continue() ?? "");
  }
  return out.join("");
};

const jumpedText = (lines: string[], line: number, startingValues: object) => {
  const { game } = routeTo(lines, line, startingValues as never);
  expect(game.simulation).toBe("fail");
  game.jumpTo(game.startAddress, true);
  return continued(game);
};

describe("a branch line its scene never enters", () => {
  test("starts at the branch's own starting values when a route reaches it", () => {
    const { game } = routeTo(SCRIPT, 7, values);
    expect(game.simulation).toBe("success");
    expect(shown(game)).toContain("Top 5.");
  });

  test("starts at the branch's own visit count when a route reaches it", () => {
    const { game } = routeTo(VISITED, 9, visited);
    expect(game.simulation).toBe("success");
    expect(game.plannedRoute.from).toBe("outer.b");
    expect(shown(game)).toContain("Top 5.");
  });

  test("shown by jumping straight to it takes the branch's own visit count", () => {
    expect(jumpedText(VISITED, 11, visited)).toContain("Below 5.");
  });

  test("shown by jumping straight to it takes the branch's own starting values", () => {
    expect(jumpedText(SCRIPT, 9, values)).toContain("Below 5.");
  });

  test("shown by jumping straight to it takes the branch's own seed", () => {
    const seeded = (seed: string) =>
      jumpedText(SEEDED, 9, { "outer.b": { seed } });
    expect(seeded("7")).toMatch(/^Roll \d+\.\n$/);
    expect(seeded("7")).toBe(seeded("7"));
    expect(seeded("7")).not.toBe(seeded("8"));
  });
});

describe("a branch line its scene enters", () => {
  test("starts at the scene's top with the scene's own visit counts", () => {
    const { game } = routeTo(ENTERED, 7, {
      outer: { [visitsKey("outer.b")]: "4" },
    });
    expect(game.simulation).toBe("success");
    expect(game.plannedRoute.from).toBe("outer");
    expect(shown(game)).toContain("Top 5.");
  });

  test("does not take the branch's own visit count when a route reaches it", () => {
    const { game } = routeTo(ENTERED, 7, visited);
    expect(game.simulation).toBe("success");
    expect(game.plannedRoute.from).toBe("outer");
    expect(shown(game)).toContain("Top 1.");
  });

  test("a failed route names the start the jumped display applies", () => {
    const { game } = routeTo(ENTERED, 9, visited);
    expect(game.simulationFailure).toBeDefined();
    expect(game.simulateFlow).toBe("outer.b");
    expect(jumpedText(ENTERED, 9, visited)).toContain("Below 5.");
  });
});
