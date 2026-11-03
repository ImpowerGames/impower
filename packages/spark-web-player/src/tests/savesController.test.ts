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
          const listed = game.saveListing(params.save, params.start, params.keep);
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

const rowKey = (controller: SavesController, name: string): string =>
  controller.viewState().values!.listing!.items.find((item) => item.name === name)!.key;

const rowLine = (controller: SavesController, key: string): number | undefined =>
  controller.viewState().values!.listing!.items.find((item) => item.key === key)?.line;

const rowName = (controller: SavesController, key: string): string | undefined =>
  controller.viewState().values!.listing!.items.find((item) => item.key === key)?.name;

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

    const withoutDone = lines.filter((line) => !line.includes("Done."));
    recompile(compiler, game, withoutDone.join("\n"));
    expect(game.saveRefusal(save.data)).toBe("The saved line is gone.");
    const controller = await controllerFor(game, save);
    await controller.editValues(save.id);
    await controller.setValue(rowKey(controller, "Stay."), "1");
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
    const leave = rowKey(controller, "Leave.");
    expect(leave.startsWith("form:")).toBe(true);
    expect(rowLine(controller, leave)).toBe(4);

    recompile(compiler, game, ["", "", ...lines].join("\n"));
    await controller.programChanged();
    expect(rowKey(controller, "Leave.")).toBe(leave);
    expect(rowLine(controller, leave)).toBe(6);
    expect(listedValue(controller, "Leave.")).toBe("1");
  });

  test("write an edit made on the values listed before lines moved to the option it was made on", async () => {
    const { game, compiler } = playing(lines);
    chooseLeave(game);
    const record = preview(game.saveHere());
    const controller = await controllerFor(game, record);
    await controller.editValues(record.id);
    const listedLeave = rowKey(controller, "Leave.");

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
    const leave = rowKey(controller, "Leave.");
    controller.events.onValueDraft(leave, "3");

    recompile(compiler, game, ["", "", ...lines].join("\n"));
    await controller.programChanged();
    expect(controller.viewState().values!.drafts).toEqual({ [leave]: "3" });
    expect(rowName(controller, leave)).toBe("Leave.");
    expect(rowLine(controller, leave)).toBe(6);
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
    const leave = rowKey(controller, "Leave.");
    controller.events.onValueDraft(leave, "3");
    hold = undefined;
    release();
    await refreshing;
    expect(controller.viewState().values!.drafts).toEqual({ [leave]: "3" });
    expect(rowName(controller, leave)).toBe("Leave.");
    await controller.setValue(leave, "3");
    expect(listedValue(controller, "Leave.")).toBe("3");
    expect(listedValue(controller, "Stay.")).toBeUndefined();
  });

  test("keep a typed count and a not-saved mark on their options when a refresh fails and the next one succeeds", async () => {
    const { game, compiler } = playing(lines);
    chooseLeave(game);
    const record = preview(game.saveHere());
    let failListing = false;
    let refuseWrite = false;
    const controller = await controllerFor(game, record, {
      listings: () => {
        if (failListing) {
          failListing = false;
          return Promise.reject(new Error("no listing"));
        }
        return Promise.resolve();
      },
      refuses: (method) => method === "preview/writeSave" && refuseWrite,
    });
    await controller.editValues(record.id);
    const leave = rowKey(controller, "Leave.");
    const stay = rowKey(controller, "Stay.");
    controller.events.onValueDraft(leave, "3");
    refuseWrite = true;
    await controller.setValue(stay, "2");
    refuseWrite = false;
    expect(controller.viewState().values!.unsaved).toHaveProperty(stay);

    recompile(compiler, game, [lines[0]!, "  Hello.", ...lines.slice(1)].join("\n"));
    failListing = true;
    await controller.programChanged();
    await controller.programChanged();
    const view = controller.viewState().values!;
    expect(view.drafts).toEqual({ [leave]: "3" });
    expect(rowName(controller, leave)).toBe("Leave.");
    expect(rowLine(controller, leave)).toBe(5);
    expect(Object.keys(view.unsaved)).toEqual([stay]);
    expect(rowName(controller, stay)).toBe("Stay.");
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
    const listedLeave = rowKey(controller, "Leave.");

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
    recompile(compiler, game, source.filter((line) => !line.includes("Saved.")).join("\n"));
    let played: string | undefined;
    const controller = await controllerFor(game, record, {
      played: (data) => {
        played = data;
      },
    });
    expect(controller.rows()[0]!.gone).toBe(true);
    await controller.editValues(record.id);
    await controller.setValue(rowKey(controller, "Leave."), "3");
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
    await controller.setValue(rowKey(controller, "Leave."), "3");
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
    const stay = game
      .saveListing({ data: durable.data }, "start")
      .listing.items.find((item: any) => item.name === "Stay.")!.key;
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

describe("two saves through a sequence of edits, drafts, program changes and refused writes", () => {
  type Name = "trust" | "Stay." | "Leave.";
  const NAMES: Name[] = ["trust", "Stay.", "Leave."];

  const script = (pad: number, saved: boolean) => [
    "store trust = 0",
    "scene start",
    ...Array.from({ length: pad }, (_, i) => `  Said ${i}.`),
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
    listing.items.find((item) => item.name === name)!.key;

  const nameIn = (listing: StartingValueListing, key: string) =>
    listing.items.find((item) => item.key === key)?.name;

  const named = (values: StartingValueSet, listing: StartingValueListing) =>
    Object.fromEntries(NAMES.map((name) => [name, values[keyIn(listing, name)] ?? "0"]));

  test("keeps every listed value, draft, mark, Load a save's set, durable save and Play on its own option and save", async () => {
    const { game, compiler } = playing(script(0, true), 4);
    chooseLeave(game);
    advanceTo(game, "Saved.");
    const first: PreviewSave = { ...preview(game.saveHere()), id: "save-a", name: "Save A" };
    const second: PreviewSave = { ...preview(game.saveHere()), id: "save-b", name: "Save B" };
    const ids = [first.id, second.id];
    const store = new Map([
      [first.id, first],
      [second.id, second],
    ]);
    let refuseNext = false;
    let played: string | undefined;
    let holding = false;
    let reached = 0;
    const held: (() => void)[] = [];
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
      listings: () =>
        holding
          ? new Promise<void>((resolve) => {
              reached += 1;
              held.push(resolve);
            })
          : Promise.resolve(),
    });
    await controller.load();

    const expected: Record<string, Record<Name, string>> = {
      [first.id]: { trust: "0", "Stay.": "0", "Leave.": "1" },
      [second.id]: { trust: "0", "Stay.": "0", "Leave.": "1" },
    };
    let drafts: Record<string, { name: Name; value: string }> = {};
    let marks: Record<string, Name> = {};
    let pad = 0;
    let saved = true;
    let seed = 1668;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return Math.floor(seed / 65536) % n;
    };
    const covered = new Set<string>();
    const settle = async () => {
      for (let i = 0; i < 5; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    };
    const swap = (keep?: boolean) => {
      pad = (pad + 1 + next(3)) % 4;
      const was = saved;
      saved = keep ?? next(3) !== 0;
      covered.add(was === saved ? "lines moved" : saved ? "saved line restored" : "saved line deleted");
      recompile(compiler, game, script(pad, saved).join("\n"));
    };
    const opened = () => controller.viewState().values?.save.id;
    const openPanel = async (id: string) => {
      if (opened() !== id) {
        if (opened() !== undefined) {
          covered.add("switch saves");
        }
        await controller.editValues(id);
        drafts = {};
        marks = {};
      }
    };
    const listedKey = (name: Name) => keyIn(controller.viewState().values!.listing!, name);
    const committed = async (id: string, key: string, name: Name, value: string, refused: boolean) => {
      refuseNext = refused;
      await controller.setValue(key, value);
      if (refused) {
        marks[key] = name;
      } else {
        delete marks[key];
        expected[id]![name] = value;
      }
    };

    const check = async (step: string) => {
      await controller.programChanged();
      const listing = game.startingValueListing("start");
      for (const id of ids) {
        const set = await controller.startingValuesOf(id, "start");
        expect(named(set!, listing), `${step}: ${id} Load a save`).toEqual(expected[id]);
        const current = controller.record(id)!;
        expect(store.get(id), `${step}: ${id} stored`).toEqual(current);
        const durable = game.saveListing(sourceOf(current), "start");
        expect(named(durable.values.values, durable.listing), `${step}: ${id} durable`).toEqual(
          expected[id],
        );
        if (!current.edits && game.saveRefusal(current.data) === null) {
          expect(named(game.saveValuesOf(current.data).values, listing), `${step}: ${id} written`).toEqual(
            expected[id],
          );
        }
      }
      expect(
        controller.rows().map((row) => row.gone),
        `${step}: placeability`,
      ).toEqual([!saved, !saved]);
      if (opened() === undefined) {
        expect(drafts, `${step}: no drafts while closed`).toEqual({});
        return;
      }
      const view = controller.viewState().values!;
      const listed = view.listing!;
      expect(named(view.values.values, listed), `${step}: ${view.save.id} listed`).toEqual(
        expected[view.save.id],
      );
      expect(Object.keys(view.drafts).sort(), `${step}: drafts`).toEqual(Object.keys(drafts).sort());
      for (const [key, draft] of Object.entries(drafts)) {
        expect(nameIn(listed, key), `${step}: draft ${draft.name} ${draft.value}`).toBe(draft.name);
        expect(view.drafts[key], `${step}: draft ${draft.name}`).toBe(draft.value);
      }
      expect(Object.keys(view.unsaved).sort(), `${step}: marks`).toEqual(Object.keys(marks).sort());
      for (const [key, name] of Object.entries(marks)) {
        expect(nameIn(listed, key), `${step}: mark ${name}`).toBe(name);
      }
    };

    const step = async (i: number, op: number, id: string, name: Name, value: string, keep?: boolean) => {
      switch (op) {
        case 0:
        case 1: {
          await openPanel(id);
          await committed(id, listedKey(name), name, value, false);
          covered.add(saved ? "edit" : name === "trust" ? "edit while gone" : "count edit while gone");
          await check(`${i} edit ${id} ${name} ${value}`);
          break;
        }
        case 2: {
          await openPanel(id);
          const stale = listedKey(name);
          swap(keep);
          await committed(id, stale, name, value, false);
          covered.add(name === "trust" ? "store edit before a change" : "count edit before a change");
          await check(`${i} edit ${id} ${name} ${value} on the listing before a change`);
          break;
        }
        case 3: {
          swap(keep);
          await controller.programChanged();
          await check(`${i} change to ${pad} blank lines, saved line ${saved}`);
          break;
        }
        case 4: {
          await openPanel(id);
          await committed(id, listedKey(name), name, value, true);
          covered.add("refused write");
          await check(`${i} refused edit ${id} ${name} ${value}`);
          break;
        }
        case 5: {
          await controller.rename(id, `Saved ${i}`);
          covered.add("rename");
          expect(controller.record(id)!.name).toBe(`Saved ${i}`);
          await check(`${i} rename ${id}`);
          break;
        }
        case 6: {
          played = undefined;
          covered.add(saved ? "play" : "play while gone");
          controller.events.onPlay(id);
          if (saved) {
            drafts = {};
            marks = {};
          }
          await controller.startingValuesOf(id, "start");
          if (saved) {
            expect(played, `${i} play ${id}`).toBeDefined();
            expect(
              named(game.saveValuesOf(played!).values, game.startingValueListing("start")),
              `${i} play ${id}`,
            ).toEqual(expected[id]);
          } else {
            expect(played, `${i} play ${id} while the line is gone`).toBeUndefined();
          }
          await check(`${i} play ${id}`);
          break;
        }
        case 7: {
          await openPanel(id);
          const key = listedKey(name);
          controller.events.onValueDraft(key, value);
          drafts[key] = { name, value };
          covered.add("draft");
          await check(`${i} draft ${id} ${name} ${value}`);
          break;
        }
        case 8: {
          await openPanel(id);
          for (let k = 0; k < 5; k += 1) {
            holding = true;
            const before = reached;
            swap(keep);
            const refreshing = controller.programChanged();
            for (let w = 0; w < 50 && reached === before; w += 1) {
              await settle();
            }
            expect(reached, `${i} listing request ${k} held`).toBe(before + 1);
            const typed = NAMES[(next(NAMES.length) + k) % NAMES.length]!;
            const key = listedKey(typed);
            controller.events.onValueDraft(key, `${k}`);
            drafts[key] = { name: typed, value: `${k}` };
            holding = false;
            for (const resolve of held.splice(0)) {
              resolve();
            }
            await refreshing;
          }
          covered.add("drafts during refreshes");
          await check(`${i} drafts ${id} during five held refreshes`);
          break;
        }
        default: {
          await openPanel(id);
          const [key, draft] = Object.entries(drafts)[0] ?? [];
          if (key === undefined || draft === undefined) {
            await check(`${i} nothing to commit`);
            break;
          }
          controller.events.onValueDraft(key, null);
          delete drafts[key];
          await committed(id, key, draft.name, draft.value, false);
          covered.add("commit a draft");
          await check(`${i} commit ${id} ${draft.name} ${draft.value}`);
        }
      }
    };

    await check("start");
    for (let i = 0; i < 70; i += 1) {
      const id = ids[next(2)]!;
      const name = NAMES[next(NAMES.length)]!;
      const value = String(next(6));
      await step(i, next(10), id, name, value);
    }
    await step(70, 7, first.id, "Leave.", "4");
    await step(71, 8, first.id, "Stay.", "0", false);
    await step(72, 9, first.id, "trust", "0");
    await step(73, 8, first.id, "trust", "0", true);
    await step(74, 9, first.id, "trust", "0");
    await step(75, 4, second.id, "Leave.", "2");
    await step(76, 7, second.id, "Stay.", "3");
    await step(77, 3, first.id, "trust", "0", false);
    await step(78, 9, second.id, "trust", "0");
    await step(79, 2, second.id, "trust", "5", true);
    await step(80, 3, first.id, "trust", "0", false);
    await step(81, 0, first.id, "trust", "2");
    await step(82, 0, second.id, "Leave.", "3");
    await step(83, 3, first.id, "trust", "0", true);
    await step(84, 6, first.id, "trust", "0");
    await step(85, 6, second.id, "trust", "0");

    expect([...covered].sort()).toEqual([
      "commit a draft",
      "count edit before a change",
      "count edit while gone",
      "draft",
      "drafts during refreshes",
      "edit",
      "edit while gone",
      "lines moved",
      "play",
      "play while gone",
      "refused write",
      "rename",
      "saved line deleted",
      "saved line restored",
      "store edit before a change",
      "switch saves",
    ]);

    for (const id of ids) {
      await controller.delete(id);
      expect(controller.record(id)).toBeUndefined();
      expect(store.has(id)).toBe(false);
    }
    expect(controller.viewState().values).toBeUndefined();
    controller.dispose();
  }, 300000);
});
