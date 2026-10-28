// #1657 — a search resumed along the route on screen keeps every decision
// before the point it resumes from, so it resumes no later than the route's
// first decision that left a pin: a line the pin reaches, previewed after a
// line inside another option, takes the pinned option again, as a game that
// never ran answers.
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { describe, expect, test } from "vitest";
import { RouteSearchLog } from "../main/workers/RouteSearchLog";
import { searchRouteTo } from "../main/workers/searchRouteTo";

const URI = "inmemory:///main.sd";

const SOURCE = `store trust = 0

scene interrogation
  choose
    * [Tell the truth.]
      trust += 2
      HERO:
        Truth told.
    * [Show the photograph.]
      trust += 5
      HERO:
        Photo shown.
      HERO:
        Photo again.
  end
  HERO:
    Trust is {trust}.
end
`;

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));

const PINS = [{ uri: URI, line: lineOf("[Tell the truth.]"), offer: 1 }];

const GAME_OPTIONS = {
  now: () => 0,
  setTimeout: ((fn: Function) => {
    fn();
    return 0;
  }) as never,
};

/** One compiler and one game holding the pins, driven as the player's worker
 *  drives them: each compile routes to its line in the program it produced. */
class Session {
  readonly compiler = new SparkdownCompiler();
  readonly config = {};
  game?: Game;

  constructor() {
    this.compiler.configure({
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
      files: [
        {
          uri: URI,
          type: "script",
          name: "main",
          ext: "sd",
          text: SOURCE,
          version: 1,
          languageId: "sparkdown",
        },
      ],
    } as never);
    this.compiler.addEventListener("compiler/didCompile", (params) =>
      this.route(params.program),
    );
  }

  protected route(program: SparkProgram) {
    if (!this.game) {
      this.game = new Game({ program, ...GAME_OPTIONS } as never);
      this.game.setRoutePins(PINS);
    } else {
      this.game.updateProgram(program);
    }
    this.game.setStartFrom(program.startFrom!);
    const to = this.game.startAddress!;
    searchRouteTo(this.game, to, new RouteSearchLog(), {
      config: this.config as never,
      remember: false,
    });
  }

  compile(line: number) {
    this.compiler.compile({
      textDocument: { uri: URI },
      startFrom: { file: URI, line },
    });
    const game = this.game!;
    return {
      simulation: game.simulation,
      trust: game.story.variablesState["trust"],
      choices: game
        .previewRouteOf(game.plannedRoute!)
        .decisions.map((d) => [d.kind, d.text]),
    };
  }
}

describe("a resumed search and the pins", () => {
  test("resumes no later than a choice that left a pin", () => {
    const session = new Session();
    expect(session.compile(lineOf("Photo again."))).toEqual({
      simulation: "success",
      trust: 5,
      choices: [["auto", "Show the photograph."]],
    });
    const after = session.compile(lineOf("Trust is"));
    const fresh = new Session().compile(lineOf("Trust is"));
    expect(fresh).toEqual({
      simulation: "success",
      trust: 2,
      choices: [["pinned", "Tell the truth."]],
    });
    expect(after).toEqual(fresh);
  }, 120_000);
});
