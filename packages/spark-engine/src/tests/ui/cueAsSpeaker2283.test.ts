import { describe, expect, test } from "vitest";
import { Game } from "../../game/core/classes/Game";
import type { GameSave } from "../../game/core/types/GameSave";
import type { Instructions } from "../../game/core/types/Instructions";
import { compileSrc } from "../harness/startingValuesGame";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const DEFS = `define raffles as character with
  name = "RAFFLES"
  aliases = { "???" }
end

define bunny as character with
  name = "BUNNY"
  aliases = { "???" }
end

define raffles as synth with
  pitch = {
    frequency = 340
  }
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
`;

async function beatsOf(body: string, count = 1): Promise<Instructions[]> {
  const h = createHarness(`${DEFS}\n\nscene start\n${body}end\n`);
  await h.ready;
  h.jumpToFlow("start");
  await flushMicrotasks(10);
  const beats: Instructions[] = [];
  for (let n = 0; n < count; n += 1) {
    const beat = h.nextBeat();
    expect(beat).toBeTruthy();
    beats.push(beat!);
  }
  return beats;
}

const beatText = (beat: Instructions, target: string): string =>
  (beat.text?.[target] ?? []).map((e: any) => e.text ?? "").join("");

const synthNames = (beat: Instructions): string[] =>
  (beat.audio?.["typewriter"] ?? []).map((event) => event.assets![0]!.split("~")[0]!);

describe("a cue that names its speaker with `as` (#2283)", () => {
  test("`??? as raffles:` names raffles while the name box and the speaker show `???`", async () => {
    const [beat] = await beatsOf(`  ??? as raffles:\n    You don't remember me?\n`);
    expect(beat!.speaker).toEqual({ name: "???", parenthetical: "", character: "raffles" });
    expect(beatText(beat!, "character_name")).toBe("???");
    expect(beatText(beat!, "dialogue")).toBe("You don't remember me?");
    expect(beat!.speech?.character).toBe("raffles");
  });

  test("an inline `??? as raffles: Hello` names raffles", async () => {
    const [beat] = await beatsOf(`  ??? as raffles: Hello there, my good friend\n`);
    expect(beat!.speaker).toEqual({ name: "???", parenthetical: "", character: "raffles" });
    expect(beatText(beat!, "character_name")).toBe("???");
    expect(synthNames(beat!)).toEqual(["raffles"]);
  });

  test("`BUNNY as raffles:` names raffles and shows `BUNNY`", async () => {
    const [beat] = await beatsOf(`  BUNNY as raffles:\n    I can do his voice, you know.\n`);
    expect(beat!.speaker).toEqual({ name: "BUNNY", parenthetical: "", character: "raffles" });
    expect(beatText(beat!, "character_name")).toBe("BUNNY");
  });

  test("a parenthetical and a position after the speaker are read as on any cue", async () => {
    const [beat] = await beatsOf(`  ??? as bunny (O.S.) [<]:\n    It can't be.\n`);
    expect(beat!.speaker).toEqual({ name: "???", parenthetical: "(O.S.)", character: "bunny" });
    expect(beatText(beat!, "character_name")).toBe("???");
    expect(beatText(beat!, "character_parenthetical")).toBe("(O.S.)");
  });

  test("a word after `as` that names no character names nobody", async () => {
    const [beat] = await beatsOf(`  ??? as stranger:\n    Hello.\n`);
    expect(beat!.speaker).toEqual({ name: "???", parenthetical: "" });
    expect(beat!.speech).toBeUndefined();
  });

  test("the word after `as` is a define name only, never a `name`", async () => {
    const [beat] = await beatsOf(`  ??? as RAFFLES:\n    Hello.\n`);
    expect(beat!.speaker).toEqual({ name: "???", parenthetical: "" });
  });

  test("a backslash before `as` keeps it part of the shown name", async () => {
    const [beat] = await beatsOf(`  Dressed \\as raffles:\n    Ho ho ho.\n`);
    expect(beat!.speaker?.character).toBeUndefined();
    expect(beatText(beat!, "character_name")).toBe("Dressed as raffles");
  });

  test("a line that continues the box keeps the speaker", async () => {
    const [, second] = await beatsOf(`  ??? as raffles: Bunny--? .. >\n  .. Is that you?\n`, 2);
    expect(second!.speaker).toEqual({ name: "???", parenthetical: "", character: "raffles" });
    expect(beatText(second!, "character_name")).toBe("???");
    expect(beatText(second!, "dialogue")).toBe("Bunny--? Is that you?");
    expect(second!.speech?.character).toBe("raffles");
  });
});

const SAVED = `${DEFS}
-> start

scene start
  ??? as bunny: B ..
  .. C > D ..
  .. E
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

const speakerShown = (game: any) => {
  const beat = game._shownBeatOnScreen;
  const text = (target: string) => (beat?.text?.[target] ?? []).map((event: any) => event.text ?? "").join("");
  return { dialogue: text("dialogue"), name: text("character_name"), speaker: beat?.speaker };
};

describe("the speaker `as` names survives a save and load (#2283)", () => {
  test("a save taken inside a continued box plays on with the speaker", () => {
    const { program } = compileSrc(SAVED);
    const game = playGame(program);
    game.start();
    for (let i = 0; i < 10 && !speakerShown(game).dialogue.startsWith("B C"); i++) game.clickedToContinue();
    expect(speakerShown(game)).toEqual({
      dialogue: "B C",
      name: "???",
      speaker: { name: "???", parenthetical: "", character: "bunny" },
    });
    const save: GameSave = game.saveHere();
    game.clickedToContinue();
    const uninterrupted = speakerShown(game);
    expect(uninterrupted.speaker).toEqual({ name: "???", parenthetical: "", character: "bunny" });

    const other = playGame(program);
    expect(other.loadToResume(JSON.parse(JSON.stringify(save.data)))).toBe(true);
    other.start();
    expect(speakerShown(other).speaker).toEqual({ name: "???", parenthetical: "", character: "bunny" });
    other.clickedToContinue();
    expect(speakerShown(other)).toEqual(uninterrupted);
  });
});
