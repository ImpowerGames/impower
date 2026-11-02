import { describe, expect, it } from "vitest";
import { saveStartingValues } from "@impower/sparkdown/src/program/saveValueSet";
import { Game } from "../../game/core/classes/Game";
import { GameSavedSceneEntryMessage } from "../../game/core/classes/messages/GameSavedSceneEntryMessage";
import type { GameSave } from "../../game/core/types/GameSave";
import {
  compileSrc,
  example,
  recompile,
  URI,
} from "../harness/startingValuesGame";

const playGame = (program: unknown, compiler?: any) => {
  const game: any = new Game({
    program: program as any,
    saveHistory: 1,
    savesSceneEntries: true,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);
  if (compiler) {
    game.scriptLineText = (uri: string, at: number) =>
      compiler.documents.get(uri)?.getLineText(at);
  }
  return game;
};

const playFromLine = (
  program: unknown,
  compiler: any,
  line: number,
  onSceneSave?: (save: GameSave) => void,
) => {
  const game = playGame(program, compiler);
  game.connection.connectOutput((message: any) => {
    if (message.method === GameSavedSceneEntryMessage.method) {
      onSceneSave?.(message.params.save);
    }
  });
  game.setStartingValues({});
  game.setStartFrom({ file: URI, line: line - 1 });
  game.simulate();
  expect(game.simulation).toBe("success");
  game.start();
  return game;
};

const START_LINE = example.indexOf('  -> interrogation("nine")') + 1;

const shownText = (game: any): string =>
  Object.values(game._shownBeatOnScreen?.text ?? {})
    .flat()
    .map((event: any) => event.text ?? "")
    .join("");

const advanceTo = (game: any, text: string) => {
  for (let i = 0; i < 20 && !shownText(game).includes(text); i++) {
    if (game.story.currentChoices.length > 0) {
      game.chosePathToContinue(0);
    } else {
      game.clickedToContinue();
    }
  }
  expect(shownText(game)).toContain(text);
};

const choose = (game: any, text: string) => {
  const index = game.story.currentChoices.findIndex((c: any) =>
    c.text.includes(text),
  );
  expect(index).toBeGreaterThanOrEqual(0);
  game.chosePathToContinue(index);
};

const resumed = (program: unknown, data: string) => {
  const game = playGame(program);
  expect(game.loadToResume(data)).toBe(true);
  game.start();
  return game;
};

describe("saves made while playing", () => {
  it("plays on from the saved beat with its state", () => {
    const { program, compiler } = compileSrc(example.join("\n"));
    const game = playFromLine(program, compiler, START_LINE);
    advanceTo(game, "Where were you at nine?");
    const save: GameSave = game.saveHere();
    expect(save.scene).toBe("interrogation");
    expect(save.line).toBe(10);

    const other = resumed(program, save.data);
    expect(shownText(other)).toContain("Where were you at nine?");
    expect(other.sceneTracker.current).toBe("interrogation");
    expect(other.story.currentChoices).toHaveLength(0);

    game.clickedToContinue();
    other.clickedToContinue();
    expect(other.story.currentChoices.map((c: any) => c.text)).toEqual(
      game.story.currentChoices.map((c: any) => c.text),
    );
  });

  it("writes one Last run save for each scene a Play enters", () => {
    const lines = [
      "store trust = 0",
      "",
      "scene start",
      "  Opening.",
      '  -> interrogation("nine")',
      "end",
      "",
      ...example.slice(4, 22),
    ];
    const { program, compiler } = compileSrc(lines.join("\n"));
    const saves: GameSave[] = [];
    const game = playFromLine(program, compiler, 4, (save) => saves.push(save));
    advanceTo(game, "Where were you at nine?");
    game.clickedToContinue();
    choose(game, "Tell the truth.");
    expect(saves.map((save) => save.scene)).toEqual(["start", "interrogation"]);
    expect(saves.map((save) => save.line)).toEqual([3, 13]);

    const next: GameSave[] = [];
    playFromLine(program, compiler, 4, (save) => next.push(save));
    expect(next.map((save) => save.scene)).toEqual(["start"]);
  });

  it("names the scene's parameters in a Last run save loaded into its starting values", () => {
    const { program, compiler } = compileSrc(example.join("\n"));
    const saves: GameSave[] = [];
    const game = playFromLine(program, compiler, START_LINE, (save) =>
      saves.push(save),
    );
    const entering = saves.find((save) => save.scene === "interrogation")!;
    expect(entering).toBeDefined();
    const listing = game.startingValueListing("interrogation");
    expect(saveStartingValues(entering.values, listing)).toEqual({
      "param:hour": '"nine"',
      "visits:start": "1",
    });
  });

  it("keeps the values a scene was entered with in its Last run save", () => {
    const lines = [
      "store trust = 0",
      "",
      "scene start",
      "  Opening.",
      '  -> interrogation("nine")',
      "end",
      "",
      "scene interrogation(hour)",
      "  trust += 1",
      "  INSPECTOR:",
      "    At {hour}, trust is {trust}.",
      "  choose",
      "    * [Again.]",
      "      -> hallway",
      "    * [Stop.]",
      "      INSPECTOR:",
      "        Done.",
      "  end",
      "end",
      "",
      "scene hallway",
      '  -> interrogation("ten")',
      "end",
    ];
    const { program, compiler } = compileSrc(lines.join("\n"));
    const saves: GameSave[] = [];
    const game = playFromLine(program, compiler, 4, (save) => saves.push(save));
    advanceTo(game, "At nine, trust is 1.");
    game.clickedToContinue();
    choose(game, "Again.");
    advanceTo(game, "At ten, trust is 2.");
    const entries = saves.filter((save) => save.scene === "interrogation");
    expect(entries).toHaveLength(2);
    const listing = game.startingValueListing("interrogation");
    expect(saveStartingValues(entries[0]!.values, listing)).toEqual({
      "param:hour": '"nine"',
      "visits:start": "1",
    });
    expect(saveStartingValues(entries[1]!.values, listing)).toEqual({
      "param:hour": '"ten"',
      "store:trust": "1",
      "visits:start": "1",
      "visits:interrogation": "1",
      "visits:hallway": "1",
      [listing.items.find((item: { name: string }) => item.name === "Again.")!.key]: "1",
    });
  });

  it("finds the lines a save's counted options are on now", () => {
    const lines = [
      "scene start",
      "  choose",
      "    * [Stay.]",
      "      Stayed.",
      "    * [Leave.]",
      "      Left.",
      "  end",
      "  Done.",
      "end",
    ];
    const { program, compiler } = compileSrc(lines.join("\n"));
    const game = playFromLine(program, compiler, 2);
    choose(game, "Leave.");
    advanceTo(game, "Left.");
    const save: GameSave = game.saveHere();
    const before = Object.entries(save.values.values).filter(
      ([key, value]) => key.startsWith("place:") && value === "1",
    );
    expect(before.map(([key]) => key)).toEqual([`place:0:4:${URI}`]);

    recompile(compiler, game, ["", "", ...lines].join("\n"));
    expect(game.countKeysOf(save.values.places)).toEqual({
      [`place:0:2:${URI}`]: `place:0:4:${URI}`,
      [`place:0:4:${URI}`]: `place:0:6:${URI}`,
    });

    recompile(
      compiler,
      game,
      ["", "", ...lines.filter((line) => !line.includes("Stay"))].join("\n"),
    );
    expect(game.countKeysOf(save.values.places)).toEqual({
      [`place:0:4:${URI}`]: `place:0:4:${URI}`,
    });
  });

  it("keeps the position when a save's values are edited", () => {
    const { program, compiler } = compileSrc(example.join("\n"));
    const game = playFromLine(program, compiler, START_LINE);
    advanceTo(game, "Where were you at nine?");
    const save: GameSave = game.saveHere();
    expect(save.values.values["store:trust"]).toBe("0");

    const edited = game.editSave(save.data, { "store:trust": "5" });
    expect(edited.values.values["store:trust"]).toBe("5");
    expect(game.saveValuesOf(edited.data).values["store:trust"]).toBe("5");
    expect(JSON.parse(edited.data).modules).toEqual(JSON.parse(save.data).modules);

    const other = resumed(program, edited.data);
    expect(shownText(other)).toContain("Where were you at nine?");
    other.clickedToContinue();
    choose(other, "Lie.");
    expect(shownText(other)).toContain("I believe you.");

    const unedited = resumed(program, save.data);
    unedited.clickedToContinue();
    choose(unedited, "Lie.");
    expect(shownText(unedited)).not.toContain("I believe you.");
  });

  it("reports a save as unplaceable once its line is deleted", () => {
    const { program, compiler } = compileSrc(example.join("\n"));
    const game = playFromLine(program, compiler, START_LINE);
    advanceTo(game, "Where were you at nine?");
    const save: GameSave = game.saveHere();
    expect(game.saveRefusal(save.data)).toBeNull();

    const edited = example.map((line, i) =>
      i === 10 ? "    Where were you at {hour}, then?" : line,
    );
    recompile(compiler, game, edited.join("\n"));
    expect(game.saveRefusal(save.data)).toBeNull();

    const without = example.filter((_, i) => i !== 9 && i !== 10);
    recompile(compiler, game, without.join("\n"));
    expect(game.saveRefusal(save.data)).toBe("The saved line is gone.");
  });
});
