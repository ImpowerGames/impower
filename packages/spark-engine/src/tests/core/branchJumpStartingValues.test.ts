import { describe, expect, test } from "vitest";
import { paramKey } from "@impower/sparkdown/src/program/startingValueLiterals";
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
