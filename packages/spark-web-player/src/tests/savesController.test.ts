import { describe, expect, test } from "vitest";
import type { PreviewSave } from "@impower/spark-editor-protocol/src/protocols/preview/ListSavesMessage";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import type { GameSave, SaveSource } from "@impower/spark-engine/src/game/core/types/GameSave";
import {
  compileSrc,
  recompile,
  URI,
} from "@impower/spark-engine/src/tests/harness/startingValuesGame";
import type {
  StartingValueListing,
  StartingValueSet,
} from "@impower/sparkdown/src/program/startingValueLiterals";
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

const sourceOf = (record: PreviewSave): SaveSource => ({
  data: record.data,
  ...(record.entry ? { entry: record.entry } : {}),
  ...(record.edits ? { edits: record.edits } : {}),
});

interface TestHost {
  edits?: Promise<void>;
  listings?: () => Promise<void>;
  played?: (data: string) => void;
  refuses?: (method: string) => boolean;
}

const savesFor = (game: any, store: Map<string, PreviewSave>, host: TestHost = {}) =>
  new SavesController({
    async requestHost(type: any, params: any): Promise<any> {
      if (host.refuses?.(type.method)) {
        throw new Error("not kept");
      }
      switch (type.method) {
        case "preview/listSaves":
          return { saves: [...store.values()] };
        case "preview/writeSave":
          store.set(params.save.id, params.save);
          return {};
        case "preview/renameSave": {
          const save = store.get(params.id);
          if (save) {
            store.set(params.id, { ...save, name: params.name });
          }
          return {};
        }
        case "preview/deleteSaves":
          for (const id of params.ids) {
            store.delete(id);
          }
          return {};
        default:
          return {};
      }
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
        case "player/saveListing": {
          const listed = game.saveListing(params.save, params.start, params.carry);
          await host.listings?.();
          return { listed };
        }
        case "player/saveStartingValues":
          return { values: game.saveStartingValuesOf(params.save, params.start) };
        case "player/editSave":
          await host.edits;
          return { save: game.editSave(params.save, params.key, params.value) };
        case "player/playableSave":
          return { save: game.playableSave(params.save) };
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
    changed() {},
  });

const controllerFor = async (game: any, record: PreviewSave, host: TestHost = {}) => {
  const controller = savesFor(game, new Map([[record.id, record]]), host);
  await controller.load();
  return controller;
};

const keyOf = (game: any, name: string): string =>
  game.startingValueListing("start").items.find((item: any) => item.name === name)!.key;

const listedValue = (controller: SavesController, name: string): string | undefined => {
  const view = controller.viewState().values!;
  const key = view.listing!.items.find((item) => item.name === name)!.key;
  return view.values.values[key];
};

describe("a save's option counts", () => {
  test("are not loaded onto another option after the counted option is deleted", async () => {
    const { game, compiler } = playing(lines);
    chooseLeave(game);
    const save = preview(game.saveHere());
    const leave = `place:0:4:${URI}`;
    expect(game.saveValuesOf(save.data).values[leave]).toBe("1");

    recompile(
      compiler,
      game,
      ["", "", ...lines.filter((line) => !/Leave|Left/.test(line))].join("\n"),
    );
    expect(keyOf(game, "Stay.")).toBe(leave);
    const controller = await controllerFor(game, save);
    expect(await controller.startingValuesOf(save.id, "start")).not.toHaveProperty(leave);
  });

  test("follow their option's line when the count was edited into a save whose line is gone", async () => {
    const { game, compiler } = playing(lines);
    chooseLeave(game);
    advanceTo(game, "Done.");
    const save = preview(game.saveHere());
    const stay = `place:0:2:${URI}`;

    const withoutDone = lines.filter((line) => !line.includes("Done."));
    recompile(compiler, game, withoutDone.join("\n"));
    expect(game.saveRefusal(save.data)).toBe("The saved line is gone.");
    const controller = await controllerFor(game, save);
    await controller.editValues(save.id);
    await controller.setValue(stay, "1");
    expect(listedValue(controller, "Stay.")).toBe("1");
    expect(controller.record(save.id)!.data).toBe(save.data);
    expect(controller.record(save.id)!.edits?.map(([key]) => key.slice(0, 5))).toEqual(["form:"]);

    recompile(compiler, game, ["", "", ...withoutDone].join("\n"));
    expect(await controller.startingValuesOf(save.id, "start")).toMatchObject({
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
    expect(listedValue(controller, "Leave.")).toBe("1");
  });

  test("write an edit made on the values listed before lines moved to the option it was made on", async () => {
    const { game, compiler } = playing(lines);
    chooseLeave(game);
    const record = preview(game.saveHere());
    const controller = await controllerFor(game, record);
    await controller.editValues(record.id);
    const listedLeave = `place:0:4:${URI}`;
    expect(
      controller.viewState().values!.listing!.items.find((item) => item.key === listedLeave)!.name,
    ).toBe("Leave.");

    recompile(compiler, game, ["", "", ...lines].join("\n"));
    await controller.setValue(listedLeave, "3");
    const durable = game.saveValuesOf(controller.record(record.id)!.data).values;
    expect(durable[keyOf(game, "Leave.")]).toBe("3");
    expect(durable[keyOf(game, "Stay.")]).toBeUndefined();
    expect(listedValue(controller, "Leave.")).toBe("3");
    expect(listedValue(controller, "Stay.")).toBeUndefined();
  });

  test("keep a count typed before lines moved on the option it was typed on", async () => {
    const { game, compiler } = playing(lines);
    chooseLeave(game);
    const record = preview(game.saveHere());
    const controller = await controllerFor(game, record);
    await controller.editValues(record.id);
    controller.events.onValueDraft(`place:0:4:${URI}`, "3");

    recompile(compiler, game, ["", "", ...lines].join("\n"));
    await controller.programChanged();
    const leave = keyOf(game, "Leave.");
    expect(leave).toBe(`place:0:6:${URI}`);
    expect(controller.viewState().values!.drafts).toEqual({ [leave]: "3" });
    await controller.setValue(leave, "3");
    expect(listedValue(controller, "Leave.")).toBe("3");
    expect(listedValue(controller, "Stay.")).toBeUndefined();
  });

  test("keep a count typed while the values are being listed again on the option it was typed on", async () => {
    const { game, compiler } = playing(lines);
    chooseLeave(game);
    const record = preview(game.saveHere());
    let hold: Promise<void> | undefined;
    let release!: () => void;
    const controller = await controllerFor(game, record, { listings: () => hold ?? Promise.resolve() });
    await controller.editValues(record.id);

    recompile(compiler, game, ["", "", ...lines].join("\n"));
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const refreshing = controller.programChanged();
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    controller.events.onValueDraft(`place:0:4:${URI}`, "3");
    hold = undefined;
    release();
    await refreshing;
    const leave = keyOf(game, "Leave.");
    expect(controller.viewState().values!.drafts).toEqual({ [leave]: "3" });
    await controller.setValue(leave, "3");
    expect(listedValue(controller, "Leave.")).toBe("3");
    expect(listedValue(controller, "Stay.")).toBeUndefined();
  });

  test("keep a failed edit's mark on the save it was made on", async () => {
    const { game } = playing(["store trust = 0", "scene start", "  Saved.", "  Next.", "end"], 3);
    const a = { ...preview(game.saveHere()), id: "save-a", name: "Save A" };
    const b = { ...preview(game.saveHere()), id: "save-b", name: "Save B" };
    let release!: () => void;
    const edits = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controller = savesFor(game, new Map([[a.id, a], [b.id, b]]), {
      edits,
      refuses: (method) => method === "preview/writeSave",
    });
    await controller.load();
    await controller.editValues(a.id);
    const editing = controller.setValue("store:trust", "5");
    void controller.editValues(b.id);
    release();
    await editing;
    await controller.startingValuesOf(b.id, "start");
    expect(controller.viewState().values!.save.id).toBe(b.id);
    expect(controller.viewState().values!.unsaved).toEqual({});
  });

  test("list the saved locals of a save none of whose beats places, and keep their edits", async () => {
    const source = [
      "store trust = 0",
      "scene start",
      '  -> interrogation("nine")',
      "end",
      "scene interrogation(hour)",
      "  Saved {hour}.",
      "  Next.",
      "end",
    ];
    const { game, compiler } = playing(source, 3);
    advanceTo(game, "Saved nine.");
    const record = preview(game.saveHere());
    recompile(compiler, game, [...source.slice(0, 5), "  Replacement.", "end"].join("\n"));
    expect(game.saveRefusal(record.data)).toMatch(/cannot be placed/);
    const controller = await controllerFor(game, record);
    await controller.editValues(record.id);
    expect(controller.viewState().values!.values.values["local:0:hour"]).toBe('"nine"');

    await controller.setValue("local:0:hour", '"ten"');
    expect(controller.viewState().values!.values.values["local:0:hour"]).toBe('"ten"');
    expect(await controller.startingValuesOf(record.id, "interrogation")).toMatchObject({
      "param:hour": '"ten"',
    });
  });

  test("refuse an edit to an option that is no longer in the script", async () => {
    const { game, compiler } = playing(lines);
    chooseLeave(game);
    const record = preview(game.saveHere());
    const controller = await controllerFor(game, record);
    await controller.editValues(record.id);
    const listedLeave = `place:0:4:${URI}`;

    recompile(
      compiler,
      game,
      ["", "", ...lines.filter((line) => !/Leave|Left/.test(line))].join("\n"),
    );
    await controller.setValue(listedLeave, "3");
    expect(controller.record(record.id)!.data).toBe(record.data);
    expect(controller.viewState().values!.unsaved).toHaveProperty(listedLeave);
    expect(await controller.startingValuesOf(record.id, "start")).not.toHaveProperty(
      keyOf(game, "Stay."),
    );
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
    await controller.startingValuesOf(record.id, "start");
    expect(played).toBeDefined();
    expect(game.saveValuesOf(played!).values["store:trust"]).toBe("5");
  });

  test("plays the edits made while its line was gone once the line is back, and only those", async () => {
    const source = [
      "store trust = 0",
      'store suspect = "Ana"',
      "scene start",
      "  Saved.",
      "  Next.",
      "end",
    ];
    const { game, compiler } = playing(source, 4);
    const record: PreviewSave = {
      ...preview(game.saveHere()),
      kind: "lastRun",
      entry: { values: { "store:trust": "0", "store:suspect": '"Bo"' }, frames: [] },
    };
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
    expect(listedValue(controller, "trust")).toBe("5");
    expect(listedValue(controller, "suspect")).toBe('"Bo"');

    recompile(compiler, game, source.join("\n"));
    await controller.programChanged();
    expect(controller.rows()[0]!.gone).toBe(false);
    controller.events.onPlay(record.id);
    await controller.startingValuesOf(record.id, "start");
    expect(played).toBeDefined();
    const values = game.saveValuesOf(played!).values;
    expect(values["store:trust"]).toBe("5");
    expect(values["store:suspect"]).toBe('"Ana"');
    expect(controller.record(record.id)!.edits).toBeUndefined();
  });

  test("plays a count edited while its line was gone on the option it counts after lines move", async () => {
    const source = [...lines.slice(0, 7), "  Saved.", ...lines.slice(7)];
    const { game, compiler } = playing(source);
    chooseLeave(game);
    advanceTo(game, "Saved.");
    const record = preview(game.saveHere());
    const leave = `place:0:4:${URI}`;
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
    await controller.startingValuesOf(record.id, "start");
    expect(played).toBeDefined();
    const values = game.saveValuesOf(played!).values;
    expect(values[keyOf(game, "Leave.")]).toBe("3");
    expect(values[keyOf(game, "Stay.")]).toBeUndefined();
  });

  test("does not play a save after an edit queued before it could not be written, and says so", async () => {
    const { game } = playing(["store trust = 0", "scene start", "  Saved.", "  Next.", "end"], 3);
    const record = preview(game.saveHere());
    let release!: () => void;
    const edits = new Promise<void>((resolve) => {
      release = resolve;
    });
    let played: string | undefined;
    let refuse = true;
    const controller = await controllerFor(game, record, {
      edits,
      played: (data) => {
        played = data;
      },
      refuses: (method) => method === "preview/writeSave" && refuse,
    });
    await controller.editValues(record.id);
    const editing = controller.setValue("store:trust", "5");
    controller.events.onPlay(record.id);
    release();
    await editing;
    await controller.startingValuesOf(record.id, "start");
    expect(played).toBeUndefined();
    expect(controller.note()).toMatchObject({ failed: "not kept", play: true });

    refuse = false;
    controller.events.onPlay(record.id);
    await controller.startingValuesOf(record.id, "start");
    expect(played).toBeDefined();
    expect(game.saveValuesOf(played!).values["store:trust"]).toBe("0");
    controller.dispose();
  });

  test("plays a save while another save's edit fails, with no note for it", async () => {
    const { game } = playing(["store trust = 0", "scene start", "  Saved.", "  Next.", "end"], 3);
    const a = { ...preview(game.saveHere()), id: "save-a", name: "Save A" };
    const b = { ...preview(game.saveHere()), id: "save-b", name: "Save B" };
    let release!: () => void;
    const edits = new Promise<void>((resolve) => {
      release = resolve;
    });
    let played: string | undefined;
    const controller = savesFor(game, new Map([[a.id, a], [b.id, b]]), {
      edits,
      played: (data) => {
        played = data;
      },
      refuses: (method) => method === "preview/writeSave",
    });
    await controller.load();
    await controller.editValues(a.id);
    const editing = controller.setValue("store:trust", "5");
    controller.events.onBack();
    controller.events.onPlay(b.id);
    release();
    await editing;
    await controller.startingValuesOf(b.id, "start");
    expect(played).toBe(b.data);
    expect(controller.note()).toBeNull();
    controller.dispose();
  });

  test("does not play pending edits it could not write, and plays them on their options once written", async () => {
    const source = [...lines.slice(0, 7), "  Saved.", ...lines.slice(7)];
    const { game, compiler } = playing(source);
    chooseLeave(game);
    advanceTo(game, "Saved.");
    const record = preview(game.saveHere());
    const leave = `place:0:4:${URI}`;
    recompile(compiler, game, source.filter((line) => !line.includes("Saved.")).join("\n"));
    let played: string | undefined;
    let refusals = 0;
    const controller = await controllerFor(game, record, {
      played: (data) => {
        played = data;
      },
      refuses: (method) => {
        if (method !== "preview/writeSave" || refusals === 0) {
          return false;
        }
        refusals -= 1;
        return true;
      },
    });
    await controller.editValues(record.id);
    await controller.setValue(leave, "3");
    controller.events.onBack();

    recompile(compiler, game, ["", "", ...source].join("\n"));
    await controller.programChanged();
    refusals = 1;
    controller.events.onPlay(record.id);
    await controller.startingValuesOf(record.id, "start");
    expect(played).toBeUndefined();
    expect(controller.note()).toMatchObject({ failed: "not kept", play: true });
    expect(controller.record(record.id)!.edits).toHaveLength(1);

    controller.events.onPlay(record.id);
    await controller.startingValuesOf(record.id, "start");
    expect(played).toBeDefined();
    const values = game.saveValuesOf(played!).values;
    expect(values[keyOf(game, "Leave.")]).toBe("3");
    expect(values[keyOf(game, "Stay.")]).toBeUndefined();
    controller.dispose();
  });
});

describe("Last run", () => {
  test("loads the counts a save was entered with on the lines their options are on now", async () => {
    const { game, compiler } = playing(lines);
    chooseLeave(game);
    const durable: GameSave = game.saveHere();
    const stay = game.saveListing({ data: durable.data }, "start").forms[`place:0:2:${URI}`];
    const record: PreviewSave = {
      ...preview(durable),
      kind: "lastRun",
      entry: { values: { [stay]: "2" }, frames: [] },
    };

    recompile(compiler, game, ["", "", ...lines].join("\n"));
    const controller = await controllerFor(game, record);
    expect(await controller.startingValuesOf(record.id, "start")).toEqual({
      [keyOf(game, "Stay.")]: "2",
    });
    await controller.editValues(record.id);
    expect(listedValue(controller, "Stay.")).toBe("2");
    expect(listedValue(controller, "Leave.")).toBeUndefined();
  });

  test("deletes an earlier run's saves with the next Delete after the host refused it", async () => {
    const { game } = playing(["scene start", "  Saved.", "  Next.", "end"], 2);
    const save: GameSave = game.saveHere();
    const earlier: PreviewSave = {
      ...save,
      id: "earlier-run",
      kind: "lastRun",
      name: "Entering start",
      time: 1,
      run: "earlier",
    };
    const own = preview(save);
    const store = new Map([
      [earlier.id, earlier],
      [own.id, own],
    ]);
    let deletes = true;
    const controller = savesFor(game, store, {
      refuses: (method) => method === "preview/deleteSaves" && deletes,
    });
    await controller.load();
    await controller.playStarted();
    expect(store.has("earlier-run")).toBe(true);

    deletes = false;
    await controller.delete(own.id);
    expect([...store.keys()]).toEqual([]);
    const reloaded = savesFor(game, store);
    await reloaded.load();
    expect(reloaded.rows()).toEqual([]);
  });

  test("deletes an earlier run's saves on the next program change after the host refused it", async () => {
    const { game } = playing(["scene start", "  Saved.", "  Next.", "end"], 2);
    const save: GameSave = game.saveHere();
    const earlier: PreviewSave = {
      ...save,
      id: "earlier-run",
      kind: "lastRun",
      name: "Entering start",
      time: 1,
      run: "earlier",
    };
    const store = new Map([[earlier.id, earlier]]);
    let deletes = true;
    const controller = savesFor(game, store, {
      refuses: (method) => method === "preview/deleteSaves" && deletes,
    });
    await controller.load();
    await controller.playStarted();
    expect(controller.rows()).toEqual([]);
    expect(store.has("earlier-run")).toBe(true);

    deletes = false;
    await controller.programChanged();
    await controller.startingValuesOf("earlier-run", "start");
    expect(store.has("earlier-run")).toBe(false);
    const reloaded = savesFor(game, store);
    await reloaded.load();
    expect(reloaded.rows()).toEqual([]);
  });

  test("keeps only the latest run's saves when an earlier run's could not be deleted", async () => {
    const { game } = playing(["scene start", "  Saved.", "  Next.", "end"], 2);
    const save: GameSave = game.saveHere();
    const earlier: PreviewSave = {
      ...save,
      id: "earlier-run",
      kind: "lastRun",
      name: "Entering start",
      time: 1,
      run: "earlier",
    };
    const store = new Map([[earlier.id, earlier]]);
    let deletes = true;
    const host: TestHost = { refuses: (method) => method === "preview/deleteSaves" && deletes };
    const controller = savesFor(game, store, host);
    await controller.load();
    await controller.playStarted();
    await controller.sceneEntered(save);
    expect(controller.rows().map((row) => row.id)).not.toContain("earlier-run");
    expect(store.size).toBe(2);

    deletes = false;
    const reloaded = savesFor(game, store, host);
    await reloaded.load();
    const latest = reloaded.rows().filter((row) => row.kind === "lastRun");
    expect(latest).toHaveLength(1);
    expect(latest[0]!.id).not.toBe("earlier-run");
    await reloaded.startingValuesOf(latest[0]!.id, "start");
    expect([...store.keys()]).toEqual([latest[0]!.id]);
  });
});

describe("a save through a sequence of edits, program changes and refused writes", () => {
  type Name = "trust" | "Stay." | "Leave.";
  const NAMES: Name[] = ["trust", "Stay.", "Leave."];

  const script = (pad: number, saved: boolean) => [
    ...Array.from({ length: pad }, () => ""),
    "store trust = 0",
    "scene start",
    "  choose",
    "    * [Stay.]",
    "      Stayed.",
    "    * [Leave.]",
    "      Left.",
    "  end",
    ...(saved ? ["  Saved."] : []),
    "  Next.",
    "end",
  ];

  const keyIn = (listing: StartingValueListing, name: Name) =>
    name === "trust"
      ? "store:trust"
      : listing.items.find((item) => item.name === name)!.key;

  const named = (values: StartingValueSet, listing: StartingValueListing) =>
    Object.fromEntries(NAMES.map((name) => [name, values[keyIn(listing, name)] ?? "0"]));

  test("keeps the listed values, Load a save's set, the durable save and Play from here in agreement", async () => {
    const { game, compiler } = playing(script(0, true), 4);
    chooseLeave(game);
    advanceTo(game, "Saved.");
    const record = preview(game.saveHere());
    const store = new Map([[record.id, record]]);
    let refuseNext = false;
    let played: string | undefined;
    const controller = savesFor(game, store, {
      played: (data) => {
        played = data;
      },
      refuses: (method) => {
        if (method === "preview/writeSave" && refuseNext) {
          refuseNext = false;
          return true;
        }
        return false;
      },
    });
    await controller.load();

    const expected: Record<Name, string> = { trust: "0", "Stay.": "0", "Leave.": "1" };
    let pad = 0;
    let saved = true;
    let seed = 1668;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return Math.floor(seed / 65536) % n;
    };
    const covered = new Set<string>();
    const pendingCount = () =>
      (controller.record(record.id)!.edits ?? []).some(([key]) => key.startsWith("form:"));
    const swap = (keep?: boolean) => {
      pad = (pad + 1 + next(3)) % 4;
      const was = saved;
      saved = keep ?? next(3) !== 0;
      covered.add(was === saved ? "lines moved" : saved ? "saved line restored" : "saved line deleted");
      recompile(compiler, game, script(pad, saved).join("\n"));
    };
    const listedKey = (name: Name) => keyIn(controller.viewState().values!.listing!, name);

    const check = async (step: string) => {
      const listing = game.startingValueListing("start");
      await controller.editValues(record.id);
      const view = controller.viewState().values!;
      expect(named(view.values.values, view.listing!), `${step}: listed`).toEqual(expected);
      const set = await controller.startingValuesOf(record.id, "start");
      expect(named(set!, listing), `${step}: Load a save`).toEqual(expected);
      const current = controller.record(record.id)!;
      expect(store.get(record.id), `${step}: stored`).toEqual(current);
      const durable = game.saveListing(sourceOf(current), "start");
      expect(named(durable.values.values, durable.listing), `${step}: durable`).toEqual(expected);
      if (!current.edits && game.saveRefusal(current.data) === null) {
        expect(named(game.saveValuesOf(current.data).values, listing), `${step}: written`).toEqual(expected);
      }
      expect(controller.rows()[0]!.gone, `${step}: placeability`).toBe(!saved);
    };

    const step = async (i: number, op: number, name: Name, value: string, keep?: boolean) => {
      switch (op) {
        case 0:
        case 1: {
          await controller.editValues(record.id);
          await controller.setValue(listedKey(name), value);
          expected[name] = value;
          covered.add(saved ? "edit" : name === "trust" ? "edit while gone" : "count edit while gone");
          await check(`${i} edit ${name} ${value}`);
          break;
        }
        case 2: {
          await controller.editValues(record.id);
          const stale = listedKey(name);
          swap(keep);
          await controller.setValue(stale, value);
          expected[name] = value;
          covered.add(name === "trust" ? "store edit before a change" : "count edit before a change");
          await controller.programChanged();
          await check(`${i} edit ${name} ${value} on the listing before a change`);
          break;
        }
        case 3: {
          swap(keep);
          await controller.programChanged();
          await check(`${i} change to ${pad} blank lines, saved line ${saved}`);
          break;
        }
        case 4: {
          await controller.editValues(record.id);
          refuseNext = true;
          await controller.setValue(listedKey(name), value);
          expect(controller.viewState().values!.unsaved, `${i} refused`).toHaveProperty(
            listedKey(name),
          );
          covered.add("refused write");
          await check(`${i} refused edit ${name} ${value}`);
          break;
        }
        case 5: {
          await controller.rename(record.id, `Saved ${i}`);
          covered.add("rename");
          expect(controller.record(record.id)!.name).toBe(`Saved ${i}`);
          await check(`${i} rename`);
          break;
        }
        default: {
          played = undefined;
          covered.add(!saved ? "play while gone" : pendingCount() ? "play with pending count edits" : "play");
          controller.events.onPlay(record.id);
          await controller.startingValuesOf(record.id, "start");
          if (saved) {
            expect(played, `${i} play`).toBeDefined();
            expect(
              named(game.saveValuesOf(played!).values, game.startingValueListing("start")),
              `${i} play`,
            ).toEqual(expected);
          } else {
            expect(played, `${i} play while the line is gone`).toBeUndefined();
          }
          await check(`${i} play`);
        }
      }
    };

    await check("start");
    for (let i = 0; i < 60; i += 1) {
      const name = NAMES[next(NAMES.length)]!;
      const value = String(next(6));
      await step(i, next(7), name, value);
    }
    await step(60, 2, "trust", "4", saved);
    await step(61, 3, "trust", "0", false);
    await step(62, 0, "Stay.", "2");
    await step(63, 2, "Leave.", "5", false);
    await step(64, 3, "trust", "0", true);
    await step(65, 6, "trust", "0");

    expect([...covered].sort()).toEqual([
      "count edit before a change",
      "count edit while gone",
      "edit",
      "edit while gone",
      "lines moved",
      "play",
      "play while gone",
      "play with pending count edits",
      "refused write",
      "rename",
      "saved line deleted",
      "saved line restored",
      "store edit before a change",
    ]);

    await controller.delete(record.id);
    expect(controller.record(record.id)).toBeUndefined();
    expect(store.has(record.id)).toBe(false);
    expect(controller.viewState().values).toBeUndefined();
    controller.dispose();
  }, 180000);
});
