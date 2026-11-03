import { describe, expect, test } from "vitest";
import type { Game } from "../../game/core/classes/Game";
import { compileSrc, newGame, URI } from "../harness/startingValuesGame";

const CHOOSE_FIRST = `scene start
  choose
    * [Stay.]
      Stayed.
    * [Leave.]
      Left.
  end
  Saved.
  -> start
end
`;

const DIALOGUE_FIRST = `scene start
  Hello.
  choose
    * [Stay.]
      Stayed.
    * [Leave.]
      Left.
  end
  Saved.
  -> start
end
`;

const EXTENDED_CAPTION = `define HERO as character with
  name = "HERO"
end

scene start
  choose
    HERO: Pick .. >
    .. one.
    * [Stay.]
      Stayed.
    * [Leave.]
      Left.
  end
  After.
end
`;

type Resume ="live" | "json" | "stored" | "restored";

function playFrom(src: string, line: number, resume: Resume): Game {
  const { program } = compileSrc(src);
  const routed = newGame(program);
  routed.setStartFrom({ file: URI, line });
  routed.simulate();
  expect(routed.simulation).toBe("success");
  if (resume === "live") {
    routed.start();
    return routed;
  }
  if (resume === "restored") {
    expect(routed.restoreCheckpoint(routed.checkpoints.length - 1)).toBe(true);
    routed.start();
    return routed;
  }
  const checkpoint = routed.newestCheckpoint();
  expect(checkpoint == null).toBe(false);
  if (resume === "stored") {
    expect(routed.loadCheckpoint(checkpoint!)).toBe(true);
    routed.start();
    return routed;
  }
  const game = newGame(program);
  game.setStartFrom({ file: URI, line });
  expect(game.load(routed.checkpointJson(checkpoint)!)).toBe(true);
  game.start();
  return game;
}

function shownChoices(game: Game): string[] {
  return game.story.currentChoices.map((choice) => choice.text);
}

function shownText(game: Game, target: string): string {
  const shown = (game as any)._shownBeatOnScreen;
  return (shown?.text?.[target] ?? []).map((e: any) => e.text ?? "").join("");
}

function pressLeave(game: Game): string {
  expect(shownChoices(game)).toEqual(["Stay.", "Leave."]);
  expect(() => game.chosePathToContinue(1)).not.toThrow();
  return (game.story.currentText ?? "").trim();
}

describe("a Play whose first beat is a menu takes the pressed option", () => {
  for (const resume of ["live", "json", "stored", "restored"] as const) {
    test(`from the scene line, resumed ${resume}`, () => {
      expect(pressLeave(playFrom(CHOOSE_FIRST, 0, resume))).toBe("Left.");
    });

    test(`from the choose line, resumed ${resume}`, () => {
      expect(pressLeave(playFrom(CHOOSE_FIRST, 1, resume))).toBe("Left.");
    });

    test(`from a choose line after dialogue, resumed ${resume}`, () => {
      expect(pressLeave(playFrom(DIALOGUE_FIRST, 2, resume))).toBe("Left.");
    });

    test(`from a menu's extended caption, resumed ${resume}`, () => {
      const game = playFrom(EXTENDED_CAPTION, 7, resume);
      expect(shownText(game, "character_name")).toBe("HERO");
      expect(shownText(game, "dialogue")).toBe("Pick one.");
      expect(pressLeave(game)).toBe("Left.");
    });
  }

  test("a Play from dialogue before the menu still shows the dialogue first", () => {
    const game = playFrom(DIALOGUE_FIRST, 1, "json");
    expect((game.story.currentText ?? "").trim()).toBe("Hello.");
    expect(shownChoices(game)).toEqual([]);
  });
});
