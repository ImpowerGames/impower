import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "../../game/core/classes/Game";
import { requireChunks } from "../harness/compileProgram";

const URI = "inmemory:///main.sd";

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
  return requireChunks(result.program, "menu checkpoint fixture");
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

type Resume = "live" | "json" | "stored" | "restored";

function playFrom(src: string, line: number, resume: Resume): Game {
  const program = compileSrc(src);
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
  }

  test("a Play from dialogue before the menu still shows the dialogue first", () => {
    const game = playFrom(DIALOGUE_FIRST, 1, "json");
    expect((game.story.currentText ?? "").trim()).toBe("Hello.");
    expect(shownChoices(game)).toEqual([]);
  });
});
