import { describe, expect, it } from "vitest";
import { Game } from "../../game/core/classes/Game";
import type { GameSave } from "../../game/core/types/GameSave";
import { compileSrc } from "../harness/startingValuesGame";

const SOURCE = `define HERO as character with
  name = "HERO"
end

define VILLAIN as character with
  name = "VILLAIN"
end

layout main {
  textbox {
    character_info {
      character_name {
        text
      }
    }
    dialogue {
      text
    }
  }
}

-> start

scene start
  HERO: A -> later
end

scene later
  VILLAIN: B ..
  .. C > D ..
  .. E > F
  VILLAIN: G ..
  .. H
end
`;

const playGame = (program: unknown) =>
  new Game({
    program: program as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any) as any;

const shown = (game: any): string => {
  const beat = game._shownBeatOnScreen;
  const text = (targets: [string, unknown][]) =>
    targets
      .flatMap(([, events]) => events as any[])
      .map((event: any) => event.text ?? "")
      .join("");
  const entries = Object.entries(beat?.text ?? {});
  return `${text(entries.filter(([t]) => !t.startsWith("character_")))}|${text(
    entries.filter(([t]) => t === "character_name"),
  )}`;
};

const advanceTo = (game: any, text: string) => {
  for (let i = 0; i < 10 && !shown(game).startsWith(`${text}|`); i++) {
    game.clickedToContinue();
  }
  expect(shown(game)).toBe(`${text}|HERO`);
};

const playOn = (game: any, beats: number) => {
  const seen: string[] = [];
  for (let i = 0; i < beats; i++) {
    game.clickedToContinue();
    seen.push(shown(game));
  }
  return seen;
};

describe("routing an inherited beat reads survives a resume", () => {
  for (const [at, rest] of [
    ["A B C", 2],
    ["D E", 1],
  ] as const) {
    it(`a save taken at ${at} plays on with the cue of an uninterrupted run`, () => {
      const { program } = compileSrc(SOURCE);
      const game = playGame(program);
      game.start();
      advanceTo(game, at);
      const save: GameSave = game.saveHere();
      expect(save).not.toBeNull();
      const uninterrupted = playOn(game, rest);
      expect(uninterrupted.every((beat) => beat.endsWith("|HERO"))).toBe(true);

      const other = playGame(program);
      expect(other.loadToResume(JSON.parse(JSON.stringify(save.data)))).toBe(
        true,
      );
      other.start();
      expect(shown(other)).toBe(`${at}|HERO`);
      expect(playOn(other, rest)).toEqual(uninterrupted);
    });
  }

  it("a checkpoint taken while playing restores the cue of an uninterrupted run", () => {
    const { program } = compileSrc(SOURCE);
    const game = playGame(program);
    game.start();
    advanceTo(game, "A B C");
    game.checkpoint();
    const index = game._checkpoints.length - 1;
    const uninterrupted = playOn(game, 2);
    expect(playOn(game, 1)).toEqual(["G H|VILLAIN"]);
    expect(game.restoreCheckpoint(index)).toBe(true);
    game.start();
    expect(playOn(game, 2)).toEqual(uninterrupted);
  });

  it("a checkpoint loaded from JSON into a fresh game restores the cue of an uninterrupted run", () => {
    const { program } = compileSrc(SOURCE);
    const game = playGame(program);
    game.start();
    advanceTo(game, "A B C");
    game.checkpoint();
    const json = game.checkpointJson(
      game._checkpoints.checkpointAt(game._checkpoints.length - 1),
    );
    expect(json).not.toBeNull();
    const uninterrupted = playOn(game, 2);
    expect(uninterrupted.every((beat) => beat.endsWith("|HERO"))).toBe(true);

    const other = playGame(program);
    expect(other.load(json)).toBe(true);
    other.start();
    expect(playOn(other, 2)).toEqual(uninterrupted);
  });
});
