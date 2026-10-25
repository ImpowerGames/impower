// A search resumed inside an earlier route shows a line after a loop with the
// same value as a search from the top (#637).
//
// The route search follows the program for a share of its ceilings, and a
// loop that outlasts that share is left at the pass the share ran out on. A
// search resumed part way along an earlier route is charged for the part it
// starts past, so it runs out on the same pass, and the value the preview
// shows does not depend on whether a checkpoint was reusable.
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

/** The value of `total` a preview of the line holding `second` shows, once
 *  resumed from the route to the line holding `first` after a recompile,
 *  and once searched from the top. */
function resumedAndFresh(text: string, first: string, second: string) {
  const { compiler, program } = compile(text);
  const kept = gameOf(program);
  const config: any = {};
  searchRouteTo(kept, target(kept, text, first), new RouteSearchLog(), {
    config,
  });
  expect(kept.simulation).toBe("success");

  const updated = compiler.compile({ textDocument: { uri: URI } }).program;
  kept.updateProgram(updated);
  const resumedTo = target(kept, text, second);
  expect(
    kept.routeResumption(kept.routeStartOf(resumedTo), resumedTo).resumeFrom,
  ).toBeDefined();
  searchRouteTo(kept, resumedTo, new RouteSearchLog(), { config });
  expect(kept.simulation).toBe("success");

  const fresh = gameOf(updated);
  searchRouteTo(fresh, target(fresh, text, second), new RouteSearchLog(), {
    config: {},
  });
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
      "-> start",
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

  test("leaves a loop longer than the share on the pass a search from the top does", () => {
    // The loop's steps run well inside the share's time, so its step
    // allowance is what cuts it, on the same pass in both searches.
    const text = [
      "store total = 0",
      "-> start",
      "scene start",
      "  Opening beat.",
      "  Second beat.",
      "  for i = 1, 40000 do",
      "    total += 1",
      "  end",
      "  Target total {total}.",
      "end",
      "",
    ].join("\n");
    const { resumed, fresh } = resumedAndFresh(
      text,
      "Second beat",
      "Target total",
    );
    expect(fresh).toBeGreaterThan(0);
    expect(fresh).toBeLessThan(40000);
    expect(resumed).toBe(fresh);
  }, 120_000);
});
