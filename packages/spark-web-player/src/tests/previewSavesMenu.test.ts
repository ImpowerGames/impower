import { afterEach, describe, expect, test } from "vitest";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import type { PreviewSave } from "@impower/spark-editor-protocol/src/protocols/preview/ListSavesMessage";
import { SetStartingValuesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetStartingValuesMessage";
import type { PreviewRoute } from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import type {
  StartingValueListing,
  StartingValues,
} from "@impower/sparkdown/src/program/startingValueLiterals";
import { GamePlayerController } from "../GamePlayerController";

const URI = "file://proj/main.sd";

const at = (line: number) => ({
  uri: URI,
  range: {
    start: { line: line - 1, character: 0 },
    end: { line: line - 1, character: 0 },
  },
});

const route = (): PreviewRoute => ({
  start: { scene: "interrogation", location: at(5) },
  target: at(11),
  decisions: [],
  valuesStart: "interrogation",
});

const listing: StartingValueListing = {
  start: "interrogation",
  items: [
    { key: "param:hour", group: "parameters", name: "hour", first: "nil" },
    { key: "store:trust", group: "stores", name: "trust", first: "0", type: "number" },
    { key: "store:suspect", group: "stores", name: "suspect", first: '"Ana"', type: "string" },
    { key: "visits:interrogation", group: "visits", name: "interrogation", first: "0", type: "number" },
    { key: "visits:start", group: "visits", name: "start", first: "0", type: "number" },
    { key: "seed", group: "randomization", name: "seed", first: "0", type: "number" },
  ],
};

const save = (
  id: string,
  kind: PreviewSave["kind"],
  name: string,
  values: Record<string, string>,
  line = 10,
): PreviewSave => ({
  id,
  kind,
  name,
  scene: "interrogation",
  uri: URI,
  line,
  time: Date.UTC(2026, 10, 2, 9, 30),
  data: `{"save":"${id}"}`,
  values: {
    values,
    frames: [
      { flow: "interrogation", scene: "interrogation", uri: URI, line, params: { hour: '"nine"' } },
    ],
  },
});

const entering = () =>
  save("last-1", "lastRun", "Entering interrogation", {
    "store:trust": "0",
    "store:suspect": '"Ana"',
    "visits:interrogation": "1",
    "visits:start": "1",
    seed: "0",
    "local:0:hour": '"nine"',
  });

const saved = () =>
  save("saved-1", "saved", "interrogation, line 11", {
    "store:trust": "2",
    "store:suspect": '"Ana"',
    "visits:interrogation": "1",
    "visits:start": "1",
    seed: "0",
    "local:0:hour": '"nine"',
  });

const controllers: GamePlayerController[] = [];

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function player(options: { refusals?: Record<string, string> } = {}) {
  const host = document.createElement("div");
  const viewport = document.createElement("div");
  const leftItems = document.createElement("div");
  const locationItems = document.createElement("div");
  const routeButton = document.createElement("div");
  const routeList = document.createElement("div");
  const savesButton = document.createElement("div");
  const savesMenu = document.createElement("div");
  const saveNote = document.createElement("div");
  leftItems.append(routeButton, locationItems);
  viewport.append(leftItems, routeList, savesButton, savesMenu, saveNote);
  host.append(viewport);
  document.body.append(host);
  const sent: any[] = [];
  host.addEventListener(MessageProtocol.event, (e) => {
    sent.push((e as CustomEvent).detail);
  });
  const controller = new GamePlayerController(host, {
    viewport,
    leftItems,
    locationItems,
    launchLabel: document.createElement("span"),
    connectionLabel: document.createElement("span"),
    executedLabel: document.createElement("span"),
    executionInfo: document.createElement("div"),
    routeButton,
    routeList,
    savesButton,
    savesMenu,
    saveNote,
  } as any);
  (controller as any)._workerGame = {};
  (controller as any)._options = {
    workspace: "file://proj",
    startFrom: { file: URI, line: 10 },
  };
  const asked: [string, any][] = [];
  (controller as any).askWorkerGame = async (type: any, params: any) => {
    asked.push([type.method, params]);
    if (type.method === "game/startingValueListing") {
      return { listing: { ...listing, start: params.start } };
    }
    if (type.method === "player/saveRefusals") {
      return { refusals: options.refusals ?? {} };
    }
    if (type.method === "player/editSave") {
      return {
        data: `${params.data}+edited`,
        values: {
          values: { ...saved().values.values, ...params.changes },
          frames: saved().values.frames,
        },
      };
    }
    return {};
  };
  (controller as any).updatePreview = async () => true;
  (controller as any)._program = { uri: URI, scripts: {} };
  controllers.push(controller);
  const request = (method: string) => sent.filter((m) => m.method === method).at(-1);
  const hostAnswers = (method: string, result: unknown = {}, ok = true) => {
    const message = request(method);
    window.dispatchEvent(
      new CustomEvent(MessageProtocol.event, {
        detail: ok
          ? { jsonrpc: "2.0", id: message.id, method, result }
          : { jsonrpc: "2.0", id: message.id, method, error: { code: -1, message: "not kept" } },
      }),
    );
  };
  const withSaves = async (saves: PreviewSave[]) => {
    const loading = (controller as any)._saves.load();
    await Promise.resolve();
    hostAnswers("preview/listSaves", { saves });
    await loading;
    await settle();
  };
  const openMenu = () =>
    savesButton.querySelector<HTMLButtonElement>(".saves-button")!.click();
  const menu = () => savesMenu.querySelector<HTMLElement>(".saves-menu");
  const shape = () =>
    [...(menu()?.querySelectorAll<HTMLElement>(".saves-here, .saves-group-head, .saves-row, .saves-none") ?? [])].map(
      (element) =>
        element.classList.contains("saves-row")
          ? `row:${element.querySelector(".saves-row-name")?.textContent}`
          : element.textContent,
    );
  const saveHere = () => menu()!.querySelector<HTMLButtonElement>(".saves-here")!;
  const rowOf = (id: string) =>
    menu()!.querySelector<HTMLElement>(`.saves-row[data-id="${id}"]`)!;
  const play = (playing: boolean) => {
    (controller as any)._workerPlay = playing
      ? { state: "running", run: 1, stepped: 0 }
      : undefined;
    (controller as any).renderSaves();
  };
  return {
    controller,
    sent,
    asked,
    routeButton,
    routeList,
    savesMenu,
    request,
    hostAnswers,
    withSaves,
    openMenu,
    menu,
    shape,
    saveHere,
    rowOf,
    play,
  };
}

afterEach(() => {
  for (const controller of controllers.splice(0)) {
    (controller as any)._routeState.open = false;
    (controller as any)._saves.dispose();
    window.removeEventListener("keydown", (controller as any).handleRouteKeyDown, true);
  }
  document.body.replaceChildren();
});

describe("the Saves menu", () => {
  test("keeps its shape when Play starts and stops while it is open", async () => {
    const p = player();
    await p.withSaves([entering(), saved()]);
    p.openMenu();
    const previewing = p.shape();
    expect(previewing).toEqual([
      "Save here",
      "Last run",
      "row:Entering interrogation",
      "Saved",
      "row:interrogation, line 11",
    ]);
    expect(p.saveHere().disabled).toBe(true);

    p.play(true);
    expect(p.shape()).toEqual(previewing);
    expect(p.saveHere().disabled).toBe(false);

    p.play(false);
    expect(p.shape()).toEqual(previewing);
    expect(p.saveHere().disabled).toBe(true);
  });

  test("reads No saves yet with Save here first when there are none", async () => {
    const p = player();
    await p.withSaves([]);
    p.openMenu();
    expect(p.shape()).toEqual(["Save here", "No saves yet"]);
  });

  test("offers Play from here and a menu of Edit values, Rename and Delete on each row", async () => {
    const p = player();
    await p.withSaves([saved()]);
    p.openMenu();
    const row = p.rowOf("saved-1");
    expect(row.querySelector(".saves-play")!.textContent).toBe("Play from here");
    row.querySelector<HTMLButtonElement>(".saves-more")!.click();
    expect(
      [...p.rowOf("saved-1").querySelectorAll('[role="menuitem"]')].map((item) => item.textContent),
    ).toEqual(["Edit values", "Rename", "Delete"]);
  });

  test("shows Its line is gone with Play from here off for a save the program cannot place", async () => {
    const p = player({ refusals: { "saved-1": "The saved line is gone." } });
    await p.withSaves([saved()]);
    p.openMenu();
    const row = p.rowOf("saved-1");
    expect(row.querySelector(".saves-row-detail")!.textContent).toBe("Its line is gone");
    expect(row.querySelector<HTMLButtonElement>(".saves-play")!.disabled).toBe(true);
  });

  test("renames a save through the host", async () => {
    const p = player();
    await p.withSaves([saved()]);
    p.openMenu();
    p.rowOf("saved-1").querySelector<HTMLButtonElement>(".saves-more")!.click();
    [...p.rowOf("saved-1").querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((item) => item.textContent === "Rename")!
      .click();
    const field = p.rowOf("saved-1").querySelector<HTMLInputElement>(".saves-rename")!;
    field.value = "Before the lie";
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(p.request("preview/renameSave").params).toEqual({
      id: "saved-1",
      name: "Before the lie",
    });
    p.hostAnswers("preview/renameSave");
    await settle();
    expect(p.rowOf("saved-1").querySelector(".saves-row-name")!.textContent).toBe(
      "Before the lie",
    );
  });
});

describe("a save's values", () => {
  test("lists the save's stores, visits, seed and locals with the count that differ", async () => {
    const p = player();
    await p.withSaves([saved()]);
    p.openMenu();
    p.rowOf("saved-1").querySelector<HTMLButtonElement>(".saves-more")!.click();
    [...p.rowOf("saved-1").querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((item) => item.textContent === "Edit values")!
      .click();
    await settle();
    const panel = p.menu()!.querySelector<HTMLElement>(".saves-values")!;
    expect(panel.querySelector(".saves-values-title")!.textContent).toBe(
      "interrogation, line 11",
    );
    expect(
      [...panel.querySelectorAll(".sv-group-head")].map((head) => head.textContent),
    ).toEqual(["Stores", "Visits", "Randomization", "Locals at line 11"]);
    const value = (key: string) =>
      panel.querySelector<HTMLInputElement>(`.sv-row[data-key="${key}"] .sv-input`)!;
    expect(value("store:trust").value).toBe("2");
    expect(value("local:0:hour").value).toBe('"nine"');
    expect(panel.querySelector(".sv-status")!.textContent).toBe(
      "3 of 5 values differ from their first values",
    );
    expect(
      [...panel.querySelectorAll(".sv-row[data-set]")].map((row) => row.getAttribute("data-key")),
    ).toEqual(["store:trust", "visits:interrogation", "visits:start"]);
  });

  test("writes an edited value into the save and back to the host", async () => {
    const p = player();
    await p.withSaves([saved()]);
    p.openMenu();
    p.rowOf("saved-1").querySelector<HTMLButtonElement>(".saves-more")!.click();
    [...p.rowOf("saved-1").querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((item) => item.textContent === "Edit values")!
      .click();
    await settle();
    const field = p.menu()!.querySelector<HTMLInputElement>('.sv-row[data-key="store:trust"] .sv-input')!;
    field.value = "5";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    p.menu()!
      .querySelector<HTMLInputElement>('.sv-row[data-key="store:trust"] .sv-input')!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle();
    expect(p.asked).toContainEqual([
      "player/editSave",
      { data: '{"save":"saved-1"}', changes: { "store:trust": "5" } },
    ]);
    const written = p.request("preview/writeSave").params.save as PreviewSave;
    expect(written.data).toBe('{"save":"saved-1"}+edited');
    expect(written.values.values["store:trust"]).toBe("5");
    expect(written.line).toBe(10);
    p.hostAnswers("preview/writeSave");
    await settle();
    expect(
      p.menu()!.querySelector<HTMLInputElement>('.sv-row[data-key="store:trust"] .sv-input')!.value,
    ).toBe("5");
  });
});

describe("Load a save", () => {
  const onValuesTab = async (saves: PreviewSave[], values: StartingValues = {}) => {
    const p = player();
    await (p.controller as any).handleSetStartingValues(
      SetStartingValuesMessage.type.request({ values }),
    );
    await p.withSaves(saves);
    (p.controller as any).updateExecutionLabels({
      conditions: [],
      choices: [],
      state: "previewing",
      simulation: "success",
      route: route(),
    });
    p.routeButton.querySelector<HTMLButtonElement>(".route-button")!.click();
    await settle();
    [...p.routeList.querySelectorAll<HTMLButtonElement>(".route-tab")]
      .find((tab) => tab.dataset["tab"] === "values")!
      .click();
    await settle();
    return p;
  };
  const loadButton = (p: ReturnType<typeof player>) =>
    p.routeList.querySelector<HTMLButtonElement>(".sv-load-button")!;
  const status = (p: ReturnType<typeof player>) =>
    p.routeList.querySelector(".sv-status")!.textContent;
  const changes = (p: ReturnType<typeof player>) =>
    p.sent.filter((m) => m.method === "preview/changeStartingValues").map((m) => m.params);

  test("is disabled with No saves yet when there are none", async () => {
    const p = await onValuesTab([]);
    expect(loadButton(p).disabled).toBe(true);
    expect(loadButton(p).parentElement!.getAttribute("title")).toBe("No saves yet");
  });

  test("replaces the scene's values with the save's, and Undo restores the values before", async () => {
    const p = await onValuesTab([entering(), saved()], {
      interrogation: { "store:suspect": '"Bo"' },
    });
    loadButton(p).click();
    const picks = [...p.routeList.querySelectorAll<HTMLButtonElement>(".sv-load-row")];
    expect(picks.map((pick) => pick.querySelector(".saves-row-name")!.textContent)).toEqual([
      "Entering interrogation",
      "interrogation, line 11",
    ]);
    picks[0]!.click();
    await settle();
    expect(changes(p).at(-1)).toEqual({
      start: "interrogation",
      changes: {
        "store:suspect": null,
        "param:hour": '"nine"',
        "visits:start": "1",
      },
    });
    p.hostAnswers("preview/changeStartingValues");
    await settle();
    expect(status(p)).toBe("Loaded 2 values from Entering interrogationUndo");
    const field = (key: string) =>
      p.routeList.querySelector<HTMLInputElement>(`.sv-row[data-key="${key}"] .sv-input`)!.value;
    expect(field("param:hour")).toBe('"nine"');
    expect(field("store:suspect")).toBe("");

    p.routeList.querySelector<HTMLButtonElement>(".sv-undo")!.click();
    await settle();
    expect(changes(p).at(-1)).toEqual({
      start: "interrogation",
      changes: {
        "param:hour": null,
        "visits:start": null,
        "store:suspect": '"Bo"',
      },
    });
    p.hostAnswers("preview/changeStartingValues");
    await settle();
    expect(field("store:suspect")).toBe('"Bo"');
    expect(field("param:hour")).toBe("");
    expect(status(p)).toBe("1 of 6 values set");
  });

  test("still sets the values of a save whose line is gone", async () => {
    const p = player({ refusals: { "saved-1": "The saved line is gone." } });
    await (p.controller as any).handleSetStartingValues(
      SetStartingValuesMessage.type.request({ values: {} }),
    );
    await p.withSaves([saved()]);
    (p.controller as any).updateExecutionLabels({
      conditions: [],
      choices: [],
      state: "previewing",
      simulation: "success",
      route: route(),
    });
    p.routeButton.querySelector<HTMLButtonElement>(".route-button")!.click();
    await settle();
    [...p.routeList.querySelectorAll<HTMLButtonElement>(".route-tab")]
      .find((tab) => tab.dataset["tab"] === "values")!
      .click();
    await settle();
    loadButton(p).click();
    const pick = p.routeList.querySelector<HTMLButtonElement>(".sv-load-row")!;
    expect(pick.querySelector(".saves-row-detail")!.textContent).toBe("Its line is gone");
    pick.click();
    await settle();
    expect(changes(p).at(-1)!.changes).toEqual({
      "param:hour": '"nine"',
      "store:trust": "2",
      "visits:start": "1",
    });
  });
});
