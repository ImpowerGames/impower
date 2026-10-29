import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "../../game/core/classes/Game";
import { requireChunks } from "../harness/compileProgram";

const URI = "inmemory:///main.sd";

const SOURCE = `store trust = 0

scene interrogation
  INSPECTOR:
    Where were you at nine?
  choose
    * [Lie.]
      trust -= 1
    * [Tell the truth.]
      trust += 2
  end
  if trust > 1 then
    INSPECTOR:
      I believe you.
    HERO:
      Thank you.
  end
end
`;

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));

function compileSrc(src: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: src, version: 1, languageId: "sparkdown" },
    ],
  });
  const result = compiler.compile({ textDocument: { uri: URI } });
  return requireChunks(result.program, "patched route fixture");
}

function newGame(program: unknown) {
  return new Game({
    program: program as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);
}

function planTo(game: Game, program: any, line: number) {
  game.setStartFrom({ file: URI, line });
  const to = game.startAddress!;
  const from = game.routeStartOf(to);
  return Game.planRoute(game.story, program, from, to)!;
}

describe("a route replayed from the previous route's checkpoints", () => {
  test("takes every decision after a checkpoint taken before them and reaches the earlier target", () => {
    const program = compileSrc(SOURCE);
    const game = newGame(program);
    game.patchAndSimulateRoute(planTo(game, program, lineOf("Thank you.")));
    expect(game.simulation).toBe("success");

    game.patchAndSimulateRoute(planTo(game, program, lineOf("I believe you.")));
    expect(game.simulation).toBe("success");
    expect(game.simulationFailure).toBeUndefined();
    expect((game.story.variablesState as any).$("trust")).toBe(2);
  });

  test("takes no loop pass the checkpoint has already taken", () => {
    const LOOP = `store total = 0

scene start
  Opening beat.
  for i = 1, 5 do
    total += i
    Loop beat {total}.
  end
  Middle beat.
  choose
    + [First]
      total += 10
      First result.
    + [Second]
      total += 20
      Second result.
  end
  if total > 50 then
    Forced result.
  end
  Final beat {total}.
end
`;
    const loopLine = (text: string) =>
      LOOP.split("\n").findIndex((l) => l.includes(text));
    const program = compileSrc(LOOP);
    const game = newGame(program);
    game.patchAndSimulateRoute(planTo(game, program, loopLine("Middle beat.")));
    expect((game.story.variablesState as any).$("total")).toBe(15);

    game.patchAndSimulateRoute(planTo(game, program, loopLine("First result.")));
    expect(game.simulation).toBe("success");
    expect((game.story.variablesState as any).$("total")).toBe(25);
  });

  test("keeps the pins the new route was planned with", () => {
    const program = compileSrc(SOURCE);
    const game = newGame(program);
    game.setRoutePins([
      { uri: URI, line: lineOf("[Tell the truth.]"), offer: 1 },
    ]);
    const pinnedTo = (line: number) => {
      game.setStartFrom({ file: URI, line });
      const to = game.startAddress!;
      return Game.planRoute(game.story, program, game.routeStartOf(to), to, {
        pins: game.pinnedOptions,
      })!;
    };
    game.patchAndSimulateRoute(pinnedTo(lineOf("Thank you.")));
    game.patchAndSimulateRoute(pinnedTo(lineOf("I believe you.")));
    expect(game.pinnedOptions.key).not.toBe("");
    expect(game.plannedRoute?.pins).toBe(game.pinnedOptions.key);
    expect(game.simulation).toBe("success");
  });
});
