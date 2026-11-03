import { describe, expect, test } from "vitest";
import type { PreviewSave } from "@impower/spark-editor-protocol/src/protocols/preview/ListSavesMessage";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import type { GameSave } from "@impower/spark-engine/src/game/core/types/GameSave";
import {
  compileSrc,
  recompile,
  URI,
} from "@impower/spark-engine/src/tests/harness/startingValuesGame";
import { saveStartingValues } from "@impower/sparkdown/src/program/saveValueSet";
import { SavesController } from "../saves/SavesController";

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

const playing = (source: string[], line = 2) => {
  const { compiler, program } = compileSrc(source.join("\n"));
  const game: any = new Game({
    program,
    saveHistory: 1,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...args: any[]) => {
      fn(...args);
      return 0;
    }) as any,
  } as any);
  game.scriptLineText = (uri: string, at: number) =>
    compiler.documents.get(uri)?.getLineText(at);
  game.setStartingValues({});
  game.setStartFrom({ file: URI, line: line - 1 });
  game.simulate();
  expect(game.simulation).toBe("success");
  game.start();
  return { game, compiler };
};

const shown = (game: any): string =>
  Object.values(game._shownBeatOnScreen?.text ?? {})
    .flat()
    .map((event: any) => event.text ?? "")
    .join("");

const advanceTo = (game: any, text: string) => {
  for (let i = 0; i < 20 && !shown(game).includes(text); i++) {
    game.clickedToContinue();
  }
  expect(shown(game)).toContain(text);
};

const chooseLeave = (game: any) => {
  const index = game.story.currentChoices.findIndex((c: any) => c.text.includes("Leave."));
  expect(index).toBeGreaterThanOrEqual(0);
  game.chosePathToContinue(index);
  advanceTo(game, "Left.");
};

const preview = (save: GameSave): PreviewSave => ({
  ...save,
  id: "saved-1",
  kind: "saved",
  name: "Saved",
  time: 1,
});

const controllerFor = async (
  game: any,
  record: PreviewSave,
  host: { edits?: Promise<void>; played?: (data: string) => void } = {},
) => {
  const controller = new SavesController({
    async requestHost(type: any): Promise<any> {
      return type.method === "preview/listSaves" ? { saves: [record] } : {};
    },
    async askWorker(type: any, params: any): Promise<any> {
      switch (type.method) {
        case "player/saveRefusals":
          return {
            refusals: Object.fromEntries(
              params.saves.flatMap((s: any) => {
                const refusal = game.saveRefusal(s.data);
                return refusal ? [[s.id, refusal]] : [];
              }),
            ),
          };
        case "player/countKeys":
          return { keys: game.countKeysOf(params.places) };
        case "player/countForms": {
          const places = game.countForms(params.keys);
          return places !== undefined ? { places } : {};
        }
        case "player/editSave":
          await host.edits;
          return game.editSave(params.data, params.changes);
        default:
          return undefined;
      }
    },
    playing: () => true,
    canPlace: () => true,
    run: () => 1,
    async playFromSave(data: string) {
      host.played?.(data);
    },
    async listing(start: string) {
      return game.startingValueListing(start);
    },
    changed() {},
  });
  await controller.load();
  return controller;
};

const keyOf = (game: any, name: string): string =>
  game.startingValueListing("start").items.find((item: any) => item.name === name)!.key;

describe("a save's option counts", () => {
  test("are not loaded onto another option after the counted option is deleted", async () => {
    const { game, compiler } = playing(lines);
    chooseLeave(game);
    const save = preview(game.saveHere());
    const leave = `place:0:4:${URI}`;
    expect(save.values.values[leave]).toBe("1");

    recompile(
      compiler,
      game,
      ["", "", ...lines.filter((line) => !/Leave|Left/.test(line))].join("\n"),
    );
    expect(keyOf(game, "Stay.")).toBe(leave);
    const controller = await controllerFor(game, save);
    const current = await controller.current(save.id);
    expect(current!.values.values[leave]).toBeUndefined();
    expect(saveStartingValues(current!.values, game.startingValueListing("start"))).not.toHaveProperty(leave);
  });

  test("follow their option's line when the count was edited into a save whose line is gone", async () => {
    const { game, compiler } = playing(lines);
    chooseLeave(game);
    advanceTo(game, "Done.");
    const save = preview(game.saveHere());
    const stay = `place:0:2:${URI}`;
    expect(save.values.values[stay]).toBeUndefined();

    const withoutDone = lines.filter((line) => !line.includes("Done."));
    recompile(compiler, game, withoutDone.join("\n"));
    expect(game.saveRefusal(save.data)).toBe("The saved line is gone.");
    const controller = await controllerFor(game, save);
    await controller.editValues(save.id);
    await controller.setValue(stay, "1");
    expect(controller.record(save.id)!.values.values[stay]).toBe("1");

    recompile(compiler, game, ["", "", ...withoutDone].join("\n"));
    const listing = game.startingValueListing("start");
    const current = await controller.current(save.id);
    expect(saveStartingValues(current!.values, listing)).toMatchObject({
      [keyOf(game, "Stay.")]: "1",
      [keyOf(game, "Leave.")]: "1",
    });
  });
});

describe("a save's values", () => {
  test("follow the program while they are open", async () => {
    const { game, compiler } = playing(lines);
    chooseLeave(game);
    const save = preview(game.saveHere());
    const controller = await controllerFor(game, save);
    await controller.editValues(save.id);
    const listed = () =>
      controller.viewState().values!.listing!.items.find((item) => item.name === "Leave.")!.key;
    expect(listed()).toBe(`place:0:4:${URI}`);

    recompile(compiler, game, ["", "", ...lines].join("\n"));
    await controller.programChanged();
    expect(listed()).toBe(`place:0:6:${URI}`);
    expect(controller.viewState().values!.values.values[listed()]).toBe("1");
  });
});

describe("Play from here", () => {
  test("plays a save with the value edits made to it before", async () => {
    const { game } = playing(["store trust = 0", "scene start", "  Saved.", "  Next.", "end"], 3);
    const record = preview(game.saveHere());
    let release!: () => void;
    const edits = new Promise<void>((resolve) => {
      release = resolve;
    });
    let played: string | undefined;
    const controller = await controllerFor(game, record, {
      edits,
      played: (data) => {
        played = data;
      },
    });
    await controller.editValues(record.id);
    const editing = controller.setValue("store:trust", "5");
    controller.events.onBack();
    controller.events.onPlay(record.id);
    release();
    await editing;
    await controller.current(record.id);
    expect(played).toBeDefined();
    expect(game.saveValuesOf(played!).values["store:trust"]).toBe("5");
  });

  test("plays the edits made while its line was gone once the line is back", async () => {
    const source = [
      "store trust = 0",
      'store suspect = "Ana"',
      "scene start",
      "  Saved.",
      "  Next.",
      "end",
    ];
    const { game, compiler } = playing(source, 4);
    const record = preview(game.saveHere());
    record.values.values["store:suspect"] = '"Bo"';
    recompile(compiler, game, source.filter((line) => !line.includes("Saved.")).join("\n"));
    let played: string | undefined;
    const controller = await controllerFor(game, record, {
      played: (data) => {
        played = data;
      },
    });
    expect(controller.rows()[0]!.gone).toBe(true);
    await controller.editValues(record.id);
    await controller.setValue("store:trust", "5");

    recompile(compiler, game, source.join("\n"));
    await controller.programChanged();
    expect(controller.rows()[0]!.gone).toBe(false);
    controller.events.onPlay(record.id);
    await controller.current(record.id);
    expect(played).toBeDefined();
    const values = game.saveValuesOf(played!).values;
    expect(values["store:trust"]).toBe("5");
    expect(values["store:suspect"]).toBe('"Ana"');
  });

  test("plays a count edited while its line was gone on the option it counts after lines move", async () => {
    const source = [...lines.slice(0, 7), "  Saved.", ...lines.slice(7)];
    const { game, compiler } = playing(source);
    chooseLeave(game);
    advanceTo(game, "Saved.");
    const record = preview(game.saveHere());
    const leave = `place:0:4:${URI}`;
    expect(record.values.values[leave]).toBe("1");
    recompile(compiler, game, source.filter((line) => !line.includes("Saved.")).join("\n"));
    let played: string | undefined;
    const controller = await controllerFor(game, record, {
      played: (data) => {
        played = data;
      },
    });
    expect(controller.rows()[0]!.gone).toBe(true);
    await controller.editValues(record.id);
    await controller.setValue(leave, "3");
    controller.events.onBack();

    recompile(compiler, game, ["", "", ...source].join("\n"));
    await controller.programChanged();
    expect(controller.rows()[0]!.gone).toBe(false);
    controller.events.onPlay(record.id);
    await controller.current(record.id);
    expect(played).toBeDefined();
    const values = game.saveValuesOf(played!).values;
    expect(values[keyOf(game, "Leave.")]).toBe("3");
    expect(values[keyOf(game, "Stay.")]).toBeUndefined();
  });
});
