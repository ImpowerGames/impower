// #1658 — the route to a line depends only on the script, the line and the
// pins: the line after a menu shows the option a game that never previewed
// anything takes there, whether or not a line inside another option was
// previewed first.
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { describe, expect, test } from "vitest";
import { RouteSearchLog } from "../main/workers/RouteSearchLog";
import { searchRouteTo } from "../main/workers/searchRouteTo";

const URI = "inmemory:///main.sd";

const SOURCE = `store trust = 0

scene interrogation
  INSPECTOR:
    Where were you at nine?
  choose
    * [Tell the truth.]
      trust += 2
      HERO:
        Truth told.
    * [Show the photograph.]
      trust += 5
      HERO:
        Photo shown.
    * [Lie.]
      trust -= 1
      HERO:
        Lie told.
      HERO:
        Lie repeated.
      HERO:
        Lie insisted on.
      HERO:
        Lie again.
  end
  HERO:
    Trust is {trust}.
  choose
    * [Leave.]
      HERO:
        Left.
    * [Stay.]
      HERO:
        Stayed.
  end
  HERO:
    The end.
end
`;

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));

const GAME_OPTIONS = {
  now: () => 0,
  setTimeout: ((fn: Function) => {
    fn();
    return 0;
  }) as never,
};

/** One compiler and one game, driven as the player's worker drives them:
 *  each compile routes to its line in the program it produced, recording in
 *  the one log a real program's searches share. */
class Session {
  readonly compiler = new SparkdownCompiler();
  readonly log = new RouteSearchLog();
  game?: Game;
  text = SOURCE;
  version = 1;
  /** How many of the planned route's steps the last compile's search was
   *  offered to resume after. */
  resumedAfter?: number;

  constructor(readonly pins: { uri: string; line: number; offer: number }[] = []) {
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
      this.game.setRoutePins(this.pins);
    } else {
      this.game.updateProgram(program);
    }
    this.game.setStartFrom(program.startFrom!);
    const to = this.game.startAddress!;
    this.resumedAfter = this.game.routeResumption(
      this.game.routeStartOf(to),
      to,
    ).resumeFrom?.steps.length;
    searchRouteTo(this.game, to, this.log, {});
  }

  /** Replace `find` with `replace` in the script, as typing does. */
  edit(find: string, replace: string) {
    const before = this.text.slice(0, this.text.indexOf(find)).split("\n");
    const line = before.length - 1;
    const character = before.at(-1)!.length;
    this.compiler.updateDocument({
      textDocument: { uri: URI, version: ++this.version },
      contentChanges: [
        {
          range: {
            start: { line, character },
            end: { line, character: character + find.length },
          },
          text: replace,
        },
      ],
    } as never);
    this.text = this.text.replace(find, replace);
  }

  preview(line: number) {
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

describe("a line's route does not depend on the lines previewed before it", () => {
  test("the line after a menu takes the option it takes when previewed first", () => {
    const fresh = new Session().preview(lineOf("Trust is"));
    expect(fresh).toEqual({
      simulation: "success",
      trust: 2,
      choices: [["auto", "Tell the truth."]],
    });
    const session = new Session();
    expect(session.preview(lineOf("Lie again.")).choices).toEqual([
      ["auto", "Lie."],
    ]);
    expect(session.preview(lineOf("Trust is"))).toEqual(fresh);
  }, 120_000);

  test("a later menu takes the option it takes when previewed first", () => {
    const fresh = new Session().preview(lineOf("The end."));
    expect(fresh.choices).toEqual([
      ["auto", "Tell the truth."],
      ["auto", "Leave."],
    ]);
    const session = new Session();
    session.preview(lineOf("Stayed."));
    session.preview(lineOf("Lie again."));
    expect(session.preview(lineOf("The end."))).toEqual(fresh);
  }, 120_000);

  test("previewing the same lines again after others gives the same routes", () => {
    const session = new Session();
    const first = session.preview(lineOf("Trust is"));
    session.preview(lineOf("Photo shown."));
    session.preview(lineOf("Stayed."));
    expect(session.preview(lineOf("Trust is"))).toEqual(first);
  }, 120_000);

  test("an edit inside the previewed line resumes its route past the menu, as a fresh game routes it", () => {
    const session = new Session();
    session.preview(lineOf("Lie again."));
    session.edit("Lie again.", "Lie once more.");
    const edited = session.preview(lineOf("Lie again."));
    // The search kept the route's choice of "Lie." and resumed after it: a
    // step records the index of the last decision taken before it.
    const steps = session.game!.plannedRoute!.steps;
    const afterChoice = steps.findIndex((step) => step.decision >= 0);
    expect(afterChoice).toBeGreaterThan(0);
    expect(session.resumedAfter).toBeGreaterThan(afterChoice);
    const fresh = new Session();
    fresh.edit("Lie again.", "Lie once more.");
    expect(edited).toEqual(fresh.preview(lineOf("Lie again.")));
    expect(edited.choices).toEqual([["auto", "Lie."]]);
  }, 120_000);

  test("an edit to another line routes the previewed line afresh", () => {
    const session = new Session();
    session.preview(lineOf("Lie again."));
    session.edit("Trust is", "Trust now is");
    const edited = session.preview(lineOf("Trust is"));
    const fresh = new Session();
    fresh.edit("Trust is", "Trust now is");
    expect(edited).toEqual(fresh.preview(lineOf("Trust is")));
    expect(edited.choices).toEqual([["auto", "Tell the truth."]]);
  }, 120_000);

  test("a pinned option still holds after a line inside another option", () => {
    const pins = [{ uri: URI, line: lineOf("[Show the photograph.]"), offer: 1 }];
    const fresh = new Session(pins).preview(lineOf("Trust is"));
    expect(fresh).toEqual({
      simulation: "success",
      trust: 5,
      choices: [["pinned", "Show the photograph."]],
    });
    const session = new Session(pins);
    session.preview(lineOf("Lie again."));
    expect(session.preview(lineOf("Trust is"))).toEqual(fresh);
  }, 120_000);
});
