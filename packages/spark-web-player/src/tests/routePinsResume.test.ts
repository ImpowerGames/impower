// #1657 — a search resumed along the route on screen keeps every decision
// before the point it resumes from, so it resumes no later than the route's
// first pinned meeting: a pin met earlier, or the share of the search a pin
// is bound to, then counts in the resumed search as in a fresh one, and a
// line the pin reaches, previewed after a line inside another option, takes
// the pinned option again, as a game that never ran answers.
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { faithfulBudget } from "@impower/sparkdown/src/compiler/utils/planRoute";
import { afterEach, describe, expect, test } from "vitest";
import { RouteSearchLog } from "../main/workers/RouteSearchLog";
import { searchRouteTo } from "../main/workers/searchRouteTo";

const URI = "inmemory:///main.sd";

const SOURCE = `store trust = 0

scene start
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

// Two pinned menus, two beats between them. Forcing `go` false reaches the
// target forcing one verdict; through both pins it takes two.
const TWO_MENUS = `store trust = 0
store go = true

scene start
  choose
    * [Start.]
      HERO:
        Begun.
      HERO:
        Begun again.
  end
  if go then
    choose
      * [Tell the truth.]
        trust += 2
      * [Lie.]
        trust -= 1
    end
  end
  if trust < 1 then
    if trust < 2 then
      HERO:
        Reached.
    end
  end
end
`;

// A pinned option whose loop outruns the pin's share of a small search.
const LONG_LOOP = `store counter = 0

scene start
  choose
    * [Long.]
      HERO:
        Long begun.
      HERO:
        Long again.
      for i = 1, 200 do
        if i > 0 then
          counter += 1
        end
      end
    * [Short.]
      counter = -1
  end
  HERO:
    Counter is {counter}.
end
`;

const lineIn = (source: string, text: string) =>
  source.split("\n").findIndex((l) => l.includes(text));

const lineOf = (text: string) => lineIn(SOURCE, text);

const TRUTH = { uri: URI, line: lineOf("[Tell the truth.]"), offer: 1 };
const PHOTO = { uri: URI, line: lineOf("[Show the photograph.]"), offer: 1 };

const GAME_OPTIONS = {
  now: () => 0,
  setTimeout: ((fn: Function) => {
    fn();
    return 0;
  }) as never,
};

const budget = { ...faithfulBudget };
afterEach(() => {
  Object.assign(faithfulBudget, budget);
});

/** One compiler and one game holding the pins, driven as the player's worker
 *  drives them: each compile routes to its line in the program it produced. */
class Session {
  readonly compiler = new SparkdownCompiler();
  game?: Game;

  constructor(
    readonly pins: { uri: string; line: number; offer: number }[],
    readonly source = SOURCE,
    readonly store = "trust",
  ) {
    this.compiler.configure({
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
      files: [
        {
          uri: URI,
          type: "script",
          name: "main",
          ext: "sd",
          text: source,
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
      this.game.setRoutePins(this.pins);
    } else {
      this.game.updateProgram(program);
    }
    this.game.setStartFrom(program.startFrom!);
    const to = this.game.startAddress!;
    searchRouteTo(this.game, to, new RouteSearchLog(), {});
  }

  compile(line: number) {
    this.compiler.compile({
      textDocument: { uri: URI },
      startFrom: { file: URI, line },
    });
    const game = this.game!;
    return {
      simulation: game.simulation,
      [this.store]: game.story.variablesState[this.store],
      choices: game
        .previewRouteOf(game.plannedRoute!)
        .decisions.map((d) => [d.kind, d.text]),
    };
  }
}

describe("a resumed search and the pins", () => {
  test("resumes no later than a choice that left a pin", () => {
    const session = new Session([TRUTH]);
    expect(session.compile(lineOf("Photo again."))).toEqual({
      simulation: "success",
      trust: 5,
      choices: [["auto", "Show the photograph."]],
    });
    const after = session.compile(lineOf("Trust is"));
    const fresh = new Session([TRUTH]).compile(lineOf("Trust is"));
    expect(fresh).toEqual({
      simulation: "success",
      trust: 2,
      choices: [["pinned", "Tell the truth."]],
    });
    expect(after).toEqual(fresh);
  }, 120_000);

  test("resumes no later than a choice that left the pin an edit put first on its menu", () => {
    // An edit left pins on both options; the first the menu lists wins.
    const session = new Session([TRUTH, PHOTO]);
    expect(session.compile(lineOf("Photo again.")).choices).toEqual([
      ["pinned", "Show the photograph."],
    ]);
    const after = session.compile(lineOf("Trust is"));
    const fresh = new Session([TRUTH, PHOTO]).compile(lineOf("Trust is"));
    expect(fresh).toEqual({
      simulation: "success",
      trust: 2,
      choices: [["pinned", "Tell the truth."]],
    });
    expect(after).toEqual(fresh);
  }, 120_000);

  test("a pin followed before the point a search resumes from still holds a route that dodges a later pinned menu", () => {
    const pins = [
      { uri: URI, line: lineIn(TWO_MENUS, "[Start.]"), offer: 1 },
      { uri: URI, line: lineIn(TWO_MENUS, "[Tell the truth.]"), offer: 1 },
    ];
    const session = new Session(pins, TWO_MENUS);
    expect(session.compile(lineIn(TWO_MENUS, "Begun again.")).choices).toEqual(
      [["pinned", "Start."]],
    );
    const after = session.compile(lineIn(TWO_MENUS, "Reached."));
    const fresh = new Session(pins, TWO_MENUS).compile(
      lineIn(TWO_MENUS, "Reached."),
    );
    expect(fresh).toEqual({
      simulation: "success",
      trust: 2,
      choices: [
        ["pinned", "Start."],
        ["pinned", "Tell the truth."],
        // Reported without the script's text, as the session reads none.
        ["forced", ""],
        ["forced", ""],
      ],
    });
    expect(after).toEqual(fresh);
  }, 120_000);

  test("a search resumed after a followed pin keeps to the pin's share of the search", () => {
    // The pinned option's 200 passes outrun its share of this search, so a
    // fresh search leaves the pin; one resumed past the menu would not.
    faithfulBudget.steps = 10_000;
    const pins = [{ uri: URI, line: lineIn(LONG_LOOP, "[Long.]"), offer: 1 }];
    const session = new Session(pins, LONG_LOOP, "counter");
    expect(
      session.compile(lineIn(LONG_LOOP, "Long again.")).choices,
    ).toEqual([["pinned", "Long."]]);
    const after = session.compile(lineIn(LONG_LOOP, "Counter is"));
    const fresh = new Session(pins, LONG_LOOP, "counter").compile(
      lineIn(LONG_LOOP, "Counter is"),
    );
    expect(after).toEqual(fresh);
  }, 120_000);
});
