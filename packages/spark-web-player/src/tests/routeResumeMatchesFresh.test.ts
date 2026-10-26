// A search resumed inside an earlier route shows a line after a loop with the
// same value as a search from the top (#637).
//
// A route follows a bounded amount of work without a beat, counted from the
// first condition after its last beat, and a loop that outlasts it is left at
// the pass where that ran out. A search resumed part way along an earlier
// route starts with what the search from the top had recorded at the step it
// resumes on, Luau callbacks included, so it runs out on the same pass, and
// the value the preview shows does not depend on whether a checkpoint was
// reusable.
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

  test("leaves a loop longer than a route follows without a beat on the pass a search from the top does", () => {
    // The work a route follows without a beat is counted in steps and
    // recorded with each step, so both searches cut the loop on the same
    // pass.
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

  test("is charged the work of a long call before it, as a search from the top is", () => {
    // The call's instructions are not steps of the route, but they are work
    // the search from the top spent before the step this one resumes on.
    const text = [
      "store total = 0",
      "store work = 0",
      "-> start",
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
