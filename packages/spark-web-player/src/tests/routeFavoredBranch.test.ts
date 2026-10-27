// A branch the preview forced on the way to one line does not carry over to
// the next line of the same scene, whether the search for that line resumes
// inside the earlier route or starts from the top (#637).
//
// Previewing a line inside a branch the program skips forces that branch, and
// the worker remembers the verdict (`searchRouteTo`'s `simulationOptions`). A
// later preview of a line after the branch shows the program's own timeline:
// a fresh search forces nothing the line does not need, and a search resumed
// from a checkpoint of the earlier route resumes no later than its forced
// verdict, so the value the preview shows does not depend on whether a
// checkpoint was reusable.
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

const TEXT = [
  "store flag = false",
  "store total = 0",
  "",
  "-> start",
  "",
  "scene start",
  "  Opening beat.",
  "  if flag then",
  "    total = 7",
  "    Inside branch.",
  "    Another inside beat.",
  "  else",
  "    Natural branch.",
  "  end",
  "  Shared beat {total}.",
  "end",
  "",
].join("\n");

describe("a forced branch", () => {
  test("does not carry over to a later line, resumed or searched afresh", () => {
    const { compiler, program } = compile(TEXT);
    const kept = gameOf(program);
    const config: any = {};
    const inside = target(kept, TEXT, "Another inside beat.");
    searchRouteTo(kept, inside, new RouteSearchLog(), { config });
    expect(kept.simulation).toBe("success");
    expect(kept.story.variablesState["total"]).toBe(7);
    const remembered = structuredClone(config);
    expect(
      remembered.simulationOptions[kept.routeStartOf(inside)].favoredConditions,
    ).toEqual([true]);

    const updated = compiler.compile({ textDocument: { uri: URI } }).program;
    kept.updateProgram(updated);
    const shared = target(kept, TEXT, "Shared beat");
    expect(
      kept.routeResumption(kept.routeStartOf(shared), shared).resumeFrom,
    ).toBeDefined();
    searchRouteTo(kept, shared, new RouteSearchLog(), { config });
    expect(kept.simulation).toBe("success");

    const fresh = gameOf(updated);
    const freshShared = target(fresh, TEXT, "Shared beat");
    searchRouteTo(fresh, freshShared, new RouteSearchLog(), {
      config: remembered,
    });
    expect(fresh.simulation).toBe("success");

    expect({
      resumed: kept.story.variablesState["total"],
      fresh: fresh.story.variablesState["total"],
    }).toEqual({ resumed: 0, fresh: 0 });
  }, 120_000);
});
