import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, test } from "vitest";
import { RouteSearchLog } from "../main/workers/RouteSearchLog";
import { searchRouteTo } from "../main/workers/searchRouteTo";

const URI = "inmemory:///main.sd";

function compile(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  expect(program.chunks, JSON.stringify(program.diagnostics)).toBeTruthy();
  return { compiler, program };
}

function gameOf(program: unknown) {
  return new Game({
    program,
    now: () => 0,
    setTimeout: ((fn: Function) => {
      fn();
      return 0;
    }) as never,
  } as never);
}

function target(game: Game, text: string, label: string) {
  const line = text.split("\n").findIndex((l) => l.includes(label));
  expect(line).toBeGreaterThanOrEqual(0);
  game.setStartFrom({ file: URI, line });
  return game.startAddress!;
}

function resumedAndFresh(text: string, first: string, second: string) {
  const { compiler, program } = compile(text);
  const kept = gameOf(program);
  searchRouteTo(kept, target(kept, text, first), new RouteSearchLog(), {});
  expect(kept.simulation).toBe("success");

  const updated = compiler.compile({ textDocument: { uri: URI } }).program;
  kept.updateProgram(updated);
  const resumedTo = target(kept, text, second);
  expect(
    kept.routeResumption(kept.routeStartOf(resumedTo), resumedTo).resumeFrom,
  ).toBeDefined();
  searchRouteTo(kept, resumedTo, new RouteSearchLog(), {});
  expect(kept.simulation).toBe("success");

  const fresh = gameOf(updated);
  searchRouteTo(fresh, target(fresh, text, second), new RouteSearchLog(), {});
  expect(fresh.simulation).toBe("success");
  return {
    resumed: kept.story.variablesState["total"] as number,
    fresh: fresh.story.variablesState["total"] as number,
  };
}

describe("a search resumed inside an earlier route", () => {
  test("shows a loop of menus as a search from the top does", () => {
    const text = [
      "store total = 0",
      "",
      "scene start",
      "  for i = 1, 600 do",
      "    choose",
      "    + [Continue]",
      "      & total += 1",
      "    end",
      "    Middle beat.",
      "    Another middle beat.",
      "    After choice {total}.",
      "  end",
      "  Target total {total}.",
      "end",
      "",
    ].join("\n");
    expect(resumedAndFresh(text, "After choice", "Target total")).toEqual({
      resumed: 600,
      fresh: 600,
    });
  }, 120_000);

  const longLoop = (passes: number) =>
    [
      "store total = 0",
      "",
      "scene start",
      "  Opening beat.",
      "  Second beat.",
      `  for i = 1, ${passes} do`,
      "    total += 1",
      "  end",
      "  Target total {total}.",
      "end",
      "",
    ].join("\n");

  test("runs every pass of a long loop with no beat in it within the budget, as a search from the top does", () => {
    expect(resumedAndFresh(longLoop(4000), "Second beat", "Target total")).toEqual({
      resumed: 4000,
      fresh: 4000,
    });
  }, 120_000);

  test("shows origin/main's value past the budget, as a search from the top does", () => {
    expect(resumedAndFresh(longLoop(25000), "Second beat", "Target total")).toEqual({
      resumed: 0,
      fresh: 0,
    });
  }, 120_000);

  test("is charged the work of a long call before it, as a search from the top is", () => {
    const text = [
      "store total = 0",
      "store work = 0",
      "",
      "scene start",
      "  & table.foreachi(table.create(150000, 1), function(k, v) work += v end)",
      "  Opening beat.",
      "  Second beat.",
      "  Third beat.",
      "  for i = 1, 50 do",
      "    total += 1",
      "  end",
      "  Target total {total}.",
      "end",
      "",
    ].join("\n");
    expect(resumedAndFresh(text, "Third beat", "Target total")).toEqual({
      resumed: 50,
      fresh: 50,
    });
  }, 120_000);
});
