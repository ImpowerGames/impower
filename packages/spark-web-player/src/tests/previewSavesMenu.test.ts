import { afterEach, describe, expect, test } from "vitest";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import type { PreviewSave } from "@impower/spark-editor-protocol/src/protocols/preview/ListSavesMessage";
import { SetStartingValuesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetStartingValuesMessage";
import type { PreviewRoute } from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import type { SaveSource } from "@impower/spark-engine/src/game/core/types/GameSave";
import {
  readLocalKey,
  saveStartingValues,
  withSavedLocal,
  withSavedValue,
  type SaveValues,
} from "@impower/sparkdown/src/program/saveValueSet";
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
    {
      key: `place:0:12:${URI}`,
      group: "visits",
      name: "Tell the truth.",
      uri: URI,
      line: 12,
      first: "0",
      type: "number",
    },
    { key: "seed", group: "randomization", name: "seed", first: "0", type: "number" },
  ],
};

const FIXTURES = new Map<string, SaveValues>();

const save = (
  id: string,
  kind: PreviewSave["kind"],
  name: string,
  values: Record<string, string>,
  line = 10,
): PreviewSave => {
  const saved: SaveValues = {
    values,
    frames: [
      {
        flow: "interrogation",
        scene: "interrogation",
        uri: URI,
        line,
        scopes: [{}, { hour: '"nine"' }],
        scopeFlows: ["interrogation"],
      },
    ],
  };
  FIXTURES.set(id, saved);
  return {
    id,
    kind,
    name,
    scene: "interrogation",
    uri: URI,
    line,
    time: Date.UTC(2026, 10, 2, 9, 30),
    data: `{"save":"${id}"}`,
    ...(kind === "lastRun" ? { entry: saved } : {}),
  };
};

const edited = (saved: SaveValues, key: string, value: string): SaveValues => {
  const local = readLocalKey(key);
  return {
    values: withSavedValue(saved.values, key, value),
    frames: saved.frames.map((frame, i) =>
      local && i === local.frame ? withSavedLocal(frame, local.name, value) : frame,
    ),
  };
};

const idOf = (data: string): string => JSON.parse(data.split("+")[0]!).save;

const durableOf = (data: string): SaveValues => {
  const [, ...written] = data.split("+");
  let saved = FIXTURES.get(idOf(data))!;
  for (const change of written) {
    for (const [key, value] of Object.entries(JSON.parse(change) as Record<string, string>)) {
      saved = edited(saved, key, value);
    }
  }
  return saved;
};

const valuesOf = (source: SaveSource): SaveValues => {
  if (source.entry) {
    return source.entry;
  }
  let saved = durableOf(source.data);
  for (const [key, value] of source.edits ?? []) {
    saved = edited(saved, key, value);
  }
  return saved;
};

const written = (data: string, edits: readonly [string, string][]) =>
  data + edits.map(([key, value]) => `+${JSON.stringify({ [key]: value })}`).join("");

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

function player(
  options: {
    refusals?: Record<string, string>;
  } = {},
) {
  const refusals: Record<string, string> = { ...(options.refusals ?? {}) };
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
      return { refusals: { ...refusals } };
    }
    if (type.method === "player/saveListing") {
      return {
        listed: {
          listing: { ...listing, start: params.start },
          values: valuesOf(params.save),
        },
      };
    }
    if (type.method === "player/saveStartingValues") {
      return {
        values: saveStartingValues(valuesOf(params.save), { ...listing, start: params.start }),
      };
    }
    if (type.method === "player/editSave") {
      await settle();
      const source = params.save as SaveSource;
      const entry = source.entry && edited(source.entry, params.key, params.value);
      const edits: [string, string][] = [
        ...(source.edits ?? []).filter(([key]) => key !== params.key),
        [params.key, params.value],
      ];
      return {
        save: refusals[idOf(source.data)]
          ? { data: source.data, ...(entry ? { entry } : {}), edits }
          : { data: written(source.data, edits), ...(entry ? { entry } : {}) },
      };
    }
    if (type.method === "player/playableSave") {
      const source = params.save as SaveSource;
      const refusal = refusals[idOf(source.data)];
      if (refusal) {
        throw new Error(refusal);
      }
      return {
        save: {
          data: written(source.data, source.edits ?? []),
          ...(source.entry ? { entry: source.entry } : {}),
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
    refusals,
    sent,
    asked,
    routeButton,
    routeList,
    savesButton,
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

  test("opens on a press without the toolbar taking the pointer", async () => {
    const p = player();
    await p.withSaves([saved()]);
    const toolbar = document.createElement("div");
    const button = p.savesButton.querySelector<HTMLButtonElement>(".saves-button")!;
    p.savesButton.replaceWith(toolbar);
    toolbar.append(p.savesButton);
    const resize = (p.controller as any).handlePointerDownToolbar;
    toolbar.addEventListener("pointerdown", resize);
    button.dispatchEvent(new (window.PointerEvent ?? MouseEvent)("pointerdown", { bubbles: true, button: 0 }));
    toolbar.removeEventListener("pointerdown", resize);
    expect((p.controller as any)._isResizing).toBe(false);
    button.click();
    expect(p.menu()).not.toBeNull();
  });

  test("keeps keys pressed in its controls from reaching the game", async () => {
    const p = player();
    await p.withSaves([saved()]);
    p.play(true);
    const heard: string[] = [];
    const hear = (e: KeyboardEvent) => heard.push(e.key);
    window.addEventListener("keydown", hear);
    try {
      const button = p.savesButton.querySelector<HTMLButtonElement>(".saves-button")!;
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      p.openMenu();
      p.saveHere().dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      p.rowOf("saved-1")
        .querySelector(".saves-play")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    } finally {
      window.removeEventListener("keydown", hear);
    }
    expect(heard).toEqual([]);
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
    await settle();
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
      "3 of 6 values differ from their first values",
    );
    expect(
      [...panel.querySelectorAll(".sv-row[data-set]")].map((row) => row.getAttribute("data-key")),
    ).toEqual(["store:trust", "visits:interrogation", "visits:start"]);
  });

  test("lists them from the program, not the route panel's earlier listing", async () => {
    const p = player();
    await p.withSaves([saved()]);
    (p.controller as any)._listing = {
      key: "earlier:interrogation",
      listing: { start: "interrogation", items: [listing.items[1]] },
    };
    const saves = (p.controller as any)._saves;
    await saves.editValues("saved-1");
    expect(saves.viewState().values.listing.items.map((item: any) => item.key)).toEqual(
      listing.items.map((item) => item.key),
    );
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
    await settle();
    expect(p.asked).toContainEqual([
      "player/editSave",
      { save: { data: '{"save":"saved-1"}' }, key: "store:trust", value: "5" },
    ]);
    const writing = p.request("preview/writeSave").params.save as PreviewSave;
    expect(writing.data).toBe('{"save":"saved-1"}+{"store:trust":"5"}');
    expect(writing.line).toBe(10);
    p.hostAnswers("preview/writeSave");
    await settle();
    await settle();
    expect(
      p.menu()!.querySelector<HTMLInputElement>('.sv-row[data-key="store:trust"] .sv-input')!.value,
    ).toBe("5");
  });
});

describe("edits to a save", () => {
  const answerWrites = async (
    p: ReturnType<typeof player>,
    count: number,
    ok: (message: any) => boolean = () => true,
  ) => {
    const answered = new Set<unknown>();
    for (let i = 0; i < 50 && answered.size < count; i++) {
      await settle();
      for (const message of p.sent.filter(
        (m) =>
          /^preview\/(writeSave|renameSave|deleteSaves)$/.test(m.method) &&
          !answered.has(m.id),
      )) {
        answered.add(message.id);
        window.dispatchEvent(
          new CustomEvent(MessageProtocol.event, {
            detail: ok(message)
              ? { jsonrpc: "2.0", id: message.id, method: message.method, result: {} }
              : {
                  jsonrpc: "2.0",
                  id: message.id,
                  method: message.method,
                  error: { code: -1, message: "not kept" },
                },
          }),
        );
      }
    }
    return answered.size;
  };

  const hostRequests = (p: ReturnType<typeof player>) =>
    p.sent
      .filter((m) => /^preview\/(writeSave|renameSave|deleteSaves)$/.test(m.method))
      .map((m) => m.method.slice("preview/".length));

  test("leaves a save deleted when an edit to it was pending", async () => {
    const p = player();
    await p.withSaves([saved()]);
    const saves = (p.controller as any)._saves;
    await saves.editValues("saved-1");
    const editing = saves.setValue("store:trust", "5");
    const deleting = saves.delete("saved-1");
    expect(await answerWrites(p, 2)).toBe(2);
    await Promise.all([editing, deleting]);
    expect(saves.record("saved-1")).toBeUndefined();
    expect(hostRequests(p)).toEqual(["writeSave", "deleteSaves"]);
  });

  test("keeps a rename made while an edit was pending", async () => {
    const p = player();
    await p.withSaves([saved()]);
    const saves = (p.controller as any)._saves;
    await saves.editValues("saved-1");
    const editing = saves.setValue("store:trust", "5");
    const renaming = saves.rename("saved-1", "Before the lie");
    expect(await answerWrites(p, 2)).toBe(2);
    await Promise.all([editing, renaming]);
    const record = saves.record("saved-1") as PreviewSave;
    expect(record.name).toBe("Before the lie");
    expect(record.data).toBe('{"save":"saved-1"}+{"store:trust":"5"}');
    expect(hostRequests(p)).toEqual(["writeSave", "renameSave"]);
  });

  test("clears the last run when the next Play starts while an edit to it was pending", async () => {
    const p = player();
    await p.withSaves([entering(), saved()]);
    const saves = (p.controller as any)._saves;
    await saves.editValues("last-1");
    const editing = saves.setValue("store:trust", "5");
    const starting = saves.playStarted();
    expect(await answerWrites(p, 2)).toBe(2);
    await Promise.all([editing, starting]);
    expect(saves.saves.map((save: PreviewSave) => save.id)).toEqual(["saved-1"]);
    expect(hostRequests(p)).toEqual(["writeSave", "deleteSaves"]);
  });

  test("accepts a new value after a change the host did not keep", async () => {
    const p = player();
    await p.withSaves([saved()]);
    const saves = (p.controller as any)._saves;
    p.openMenu();
    await saves.editValues("saved-1");
    await settle();
    const commit = (text: string) => {
      const field = p.menu()!.querySelector<HTMLInputElement>(
        '.sv-row[data-key="store:trust"] .sv-input',
      )!;
      field.value = text;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      p.menu()!
        .querySelector<HTMLInputElement>('.sv-row[data-key="store:trust"] .sv-input')!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    };
    commit("5");
    expect(await answerWrites(p, 1, () => false)).toBe(1);
    await settle();
    expect(
      p.menu()!.querySelector('.sv-row[data-key="store:trust"] .sv-badge')!.getAttribute(
        "data-status",
      ),
    ).toBe("error");
    commit("6");
    expect(await answerWrites(p, 2)).toBe(2);
    await settle();
    expect((saves.record("saved-1") as PreviewSave).data).toBe(
      '{"save":"saved-1"}+{"store:trust":"6"}',
    );
  });

  test("applies an edit made before an earlier one is answered after it", async () => {
    const p = player();
    await p.withSaves([saved()]);
    const saves = (p.controller as any)._saves;
    await saves.editValues("saved-1");
    const first = saves.setValue("store:trust", "5");
    const second = saves.setValue("store:suspect", '"Bo"');
    expect(await answerWrites(p, 2)).toBe(2);
    await Promise.all([first, second]);
    const record = saves.record("saved-1") as PreviewSave;
    expect(record.data).toBe(
      `{"save":"saved-1"}+{"store:trust":"5"}+${JSON.stringify({ "store:suspect": '"Bo"' })}`,
    );
    const edits = p.asked.filter(([method]) => method === "player/editSave");
    expect(edits[1]![1].save.data).toBe(edits[0]![1].save.data + '+{"store:trust":"5"}');
  });

  test("closes on Play from here after Escape leaves a value just set", async () => {
    const p = player();
    await p.withSaves([saved()]);
    const saves = (p.controller as any)._saves;
    const played: string[] = [];
    (p.controller as any).playFromSave = async (data: string) => {
      played.push(data);
    };
    p.openMenu();
    await saves.editValues("saved-1");
    await settle();
    const field = () =>
      p.menu()!.querySelector<HTMLInputElement>('.sv-row[data-key="store:trust"] .sv-input')!;
    field().focus();
    field().value = "5";
    field().dispatchEvent(new Event("input", { bubbles: true }));
    field().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const escape = (p.controller as any).handleSavesKeyDown;
    const { removeChild } = Node.prototype;
    const { remove } = Element.prototype;
    const blurIn = (node: Node) => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && node.contains(active)) {
        active.blur();
      }
    };
    Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
      blurIn(child);
      return removeChild.call(this, child) as T;
    };
    Element.prototype.remove = function (this: Element) {
      blurIn(this);
      remove.call(this);
    };
    window.addEventListener("keydown", escape, true);
    try {
      field().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    } finally {
      window.removeEventListener("keydown", escape, true);
      Node.prototype.removeChild = removeChild;
      Element.prototype.remove = remove;
    }
    expect(p.menu()!.querySelector(".saves-values")).toBeNull();
    p.rowOf("saved-1").querySelector<HTMLButtonElement>(".saves-play")!.click();
    expect(p.menu()).toBeNull();
    expect(await answerWrites(p, 1)).toBe(1);
    await settle();
    expect(played).toEqual([`{"save":"saved-1"}+{"store:trust":"5"}`]);
  });

  test("does not play a save whose edits could not be written into it, and says so", async () => {
    const p = player({ refusals: { "saved-1": "The saved line is gone." } });
    await p.withSaves([saved()]);
    const saves = (p.controller as any)._saves;
    await saves.editValues("saved-1");
    const editing = saves.setValue("store:trust", "5");
    expect(await answerWrites(p, 1)).toBe(1);
    await editing;
    expect((saves.record("saved-1") as PreviewSave).edits).toEqual([["store:trust", "5"]]);
    delete p.refusals["saved-1"];
    saves._refusals = {};
    const played: string[] = [];
    (p.controller as any).playFromSave = async (data: string) => {
      played.push(data);
    };
    saves.events.onBack();
    saves.events.onPlay("saved-1");
    for (let i = 0; i < 10 && p.sent.filter((m) => m.method === "preview/writeSave").length < 2; i++) {
      await settle();
    }
    p.hostAnswers("preview/writeSave", {}, false);
    await settle();
    await settle();
    expect(played).toEqual([]);
    expect(document.querySelector(".save-note")?.textContent).toBe("Not played: not kept");
    expect((saves.record("saved-1") as PreviewSave).edits).toEqual([["store:trust", "5"]]);
  });

  test("keeps a table store and its fields in step", () => {
    const values = { "store:bag": "{ coins = 1 }", "store:bag.coins": "1" };
    expect(withSavedValue(values, "store:bag", "{ coins = 5 }")).toEqual({
      "store:bag": "{ coins = 5 }",
      "store:bag.coins": "5",
    });
    expect(withSavedValue(values, "store:bag.coins", "3")).toEqual({
      "store:bag": "{ coins = 3 }",
      "store:bag.coins": "3",
    });
    expect(withSavedValue(values, "store:bag", "{ }")).toEqual({
      "store:bag": "{ }",
      "store:bag.coins": "nil",
    });
  });

  test("leaves a save whose line is gone unplayable after an edit", async () => {
    const p = player({ refusals: { "saved-1": "The saved line is gone." } });
    await p.withSaves([saved()]);
    const saves = (p.controller as any)._saves;
    await saves.editValues("saved-1");
    const editing = saves.setValue("store:trust", "4");
    expect(await answerWrites(p, 1)).toBe(1);
    await editing;
    expect(saves.rows().find((row: any) => row.id === "saved-1").gone).toBe(true);
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
    expect(status(p)).toBe("1 of 7 values set");
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

  test("loads a parameter edited in a save whose line is gone", async () => {
    const p = player({ refusals: { "saved-1": "The saved line is gone." } });
    await (p.controller as any).handleSetStartingValues(
      SetStartingValuesMessage.type.request({ values: {} }),
    );
    await p.withSaves([saved()]);
    await (p.controller as any)._saves.editValues("saved-1");
    await settle();
    const editing = (p.controller as any)._saves.setValue("local:0:hour", '"ten"');
    await settle();
    await settle();
    const writing = p.request("preview/writeSave").params.save as PreviewSave;
    expect(writing.data).toBe('{"save":"saved-1"}');
    expect(writing.edits).toEqual([["local:0:hour", '"ten"']]);
    p.hostAnswers("preview/writeSave");
    await editing;
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
    p.routeList.querySelector<HTMLButtonElement>(".sv-load-row")!.click();
    await settle();
    expect(changes(p).at(-1)!.changes).toMatchObject({ "param:hour": '"ten"' });
  });
});
