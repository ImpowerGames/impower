import { afterEach, describe, expect, test } from "vitest";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { SetRouteTogglesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetRouteTogglesMessage";
import { SetStartingValuesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetStartingValuesMessage";
import type { PreviewRoute } from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import type {
  StartingValueListing,
  StartingValues,
} from "@impower/sparkdown/src/program/startingValueLiterals";
import { GamePlayerController } from "../GamePlayerController";

const URI = "file://proj/main.sd";

const at = (line: number, uri = URI) => ({
  uri,
  range: {
    start: { line: line - 1, character: 0 },
    end: { line: line - 1, character: 0 },
  },
});

const exampleRoute = (): PreviewRoute => ({
  start: { scene: "interrogation", location: at(5) },
  target: at(20),
  decisions: [
    { kind: "auto", location: at(13), text: "Tell the truth.", meeting: 1 },
    { kind: "forced", location: at(18), text: "trust > 3", verdict: true },
  ],
  valuesStart: "interrogation",
});

const listing: StartingValueListing = {
  start: "interrogation",
  items: [
    { key: "param:hour", group: "parameters", name: "hour", first: "nil" },
    { key: "store:trust", group: "stores", name: "trust", first: "0", type: "number" },
    { key: "store:suspect", group: "stores", name: "suspect", first: '"Ana"', type: "string" },
    {
      key: "store:player",
      group: "stores",
      name: "player",
      first: '{ hp = 10 }',
      type: "table",
      fields: [
        { key: "store:player.hp", group: "stores", name: ".hp", first: "10", type: "number" },
      ],
    },
    { key: "visits:interrogation", group: "visits", name: "interrogation", first: "0", type: "number" },
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

const controllers: GamePlayerController[] = [];

function player() {
  const host = document.createElement("div");
  const viewport = document.createElement("div");
  const leftItems = document.createElement("div");
  const locationItems = document.createElement("div");
  const routeButton = document.createElement("div");
  const routeList = document.createElement("div");
  leftItems.append(routeButton, locationItems);
  viewport.append(leftItems, routeList);
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
  } as any);
  (controller as any)._workerGame = {};
  (controller as any)._options = {
    workspace: "file://proj",
    startFrom: { file: URI, line: 19 },
  };
  const asked: [string, any][] = [];
  (controller as any).askWorkerGame = async (type: any, params: any) => {
    asked.push([type.method, params]);
    return type.method === "game/startingValueListing"
      ? { listing: { ...listing, start: params.start } }
      : {};
  };
  const previewed: any[] = [];
  (controller as any).updatePreview = async (...args: any[]) => {
    previewed.push(args);
    return true;
  };
  (controller as any)._program = { uri: URI, scripts: {} };
  controllers.push(controller);
  const report = (extra: Record<string, unknown> = {}) =>
    (controller as any).updateExecutionLabels({
      conditions: [],
      choices: [],
      state: "previewing",
      simulation: "success",
      route: exampleRoute(),
      ...extra,
    });
  const hostSends = async (values: StartingValues) =>
    (controller as any).handleSetStartingValues(
      SetStartingValuesMessage.type.request({ values }),
    );
  const hostAnswers = (method: string, ok = true) => {
    const request = sent.filter((m) => m.method === method).at(-1);
    window.dispatchEvent(
      new CustomEvent(MessageProtocol.event, {
        detail: ok
          ? { jsonrpc: "2.0", id: request.id, method, result: {} }
          : {
              jsonrpc: "2.0",
              id: request.id,
              method,
              error: { code: -1, message: "not kept" },
            },
      }),
    );
  };
  const open = () => {
    routeButton.querySelector<HTMLButtonElement>(".route-button")!.click();
  };
  const tabs = () =>
    [...routeList.querySelectorAll<HTMLButtonElement>(".route-tab")];
  const valuesTab = () => tabs().find((t) => t.dataset["tab"] === "values");
  const rows = () => [...routeList.querySelectorAll<HTMLElement>(".sv-row")];
  const row = (key: string) =>
    routeList.querySelector<HTMLElement>(`.sv-row[data-key="${key}"]`)!;
  const input = (key: string) =>
    row(key).querySelector<HTMLInputElement>(".sv-input")!;
  const type = (key: string, text: string) => {
    const field = input(key);
    field.value = text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    input(key).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  };
  const badge = (key: string) =>
    row(key).querySelector<HTMLElement>(".sv-badge");
  const changes = () =>
    sent.filter((m) => m.method === "preview/changeStartingValues");
  return {
    controller,
    routeList,
    sent,
    asked,
    previewed,
    report,
    hostSends,
    hostAnswers,
    open,
    tabs,
    valuesTab,
    rows,
    row,
    input,
    type,
    badge,
    changes,
  };
}

async function onValuesTab(values: StartingValues = {}) {
  const p = player();
  await p.hostSends(values);
  p.report();
  p.open();
  await Promise.resolve();
  await Promise.resolve();
  p.valuesTab()!.click();
  return p;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  for (const controller of controllers.splice(0)) {
    (controller as any)._routeState.open = false;
    window.removeEventListener(
      "keydown",
      (controller as any).handleRouteKeyDown,
      true,
    );
  }
  document.body.replaceChildren();
});

describe("the route panel's tabs", () => {
  test("a host that sends no starting values gets no Starting values tab", () => {
    const p = player();
    p.report();
    p.open();
    expect(p.tabs().map((t) => t.textContent)).toEqual(["Route to line 20"]);
  });

  test("the Starting values tab counts the values set and names the route's scene's values", async () => {
    const p = await onValuesTab({
      interrogation: { "store:trust": "2" },
      other: { "store:trust": "5" },
    });
    expect(p.tabs().map((t) => t.textContent)).toEqual([
      "Route to line 20",
      "Starting values1",
    ]);
    expect(p.valuesTab()!.getAttribute("aria-selected")).toBe("true");
    expect(p.asked).toContainEqual([
      "game/startingValueListing",
      { start: "interrogation" },
    ]);
    expect(
      [...p.routeList.querySelectorAll(".sv-group-head")].map(
        (h) => h.textContent,
      ),
    ).toEqual([
      "Parameters",
      "Stores",
      "Visitsbefore the scene starts",
      "Randomization",
    ]);
    expect(p.input("store:trust").value).toBe("2");
    expect(p.row("store:trust").hasAttribute("data-set")).toBe(true);
    expect(p.input("store:suspect").placeholder).toBe('"Ana"');
    expect(p.input("store:suspect").value).toBe("");
    expect(
      p.row(`place:0:12:${URI}`).querySelector(".sv-name")!.textContent,
    ).toBe("Tell the truth.· 13");
    expect(p.routeList.querySelector(".sv-status")!.textContent).toBe(
      "1 of 8 values set",
    );
  });

  test("the tab the author chose goes to the host, and the panel opens on the one the host sends", async () => {
    const p = await onValuesTab();
    const told = p.sent.filter(
      (m) => m.method === "preview/didChangeRouteToggles",
    );
    expect(told.at(-1).params.tab).toBe("values");
    p.tabs()[0]!.click();
    expect(p.routeList.querySelector(".sv-tab")).toBeNull();
    await (p.controller as any).handleSetRouteToggles(
      SetRouteTogglesMessage.type.request({ toggles: {}, tab: "values" }),
    );
    expect(p.routeList.querySelector(".sv-tab")).not.toBeNull();
  });

  test("the Route tab lists the decisions and the target line, with no start row", async () => {
    const p = await onValuesTab();
    p.tabs()[0]!.click();
    expect(
      [...p.routeList.querySelectorAll(".route-entry")].map(
        (e) => e.querySelector(".route-text")!.textContent,
      ),
    ).toEqual([
      "Choice Tell the truth.",
      "Condition trust > 3 forced true",
      "Target line",
    ]);
  });
});

describe("the Starting values tab", () => {
  test("an unset parameter reads nil in the warning colour, and the tab warns", async () => {
    const p = await onValuesTab();
    expect(p.input("param:hour").placeholder).toBe("nil");
    expect(p.input("param:hour").classList).toContain("unset");
    expect(p.badge("param:hour")!.dataset["status"]).toBe("warning");
    expect(
      p.badge("param:hour")!.querySelector(".sv-popup")!.textContent,
    ).toBe("Unset, so it reads nil");
    expect(
      p.valuesTab()!.querySelector(".sv-tab-icon")!.getAttribute("data-icon"),
    ).toBe("warning");
  });

  test("a value set goes to the host, and is set once the host sends it back", async () => {
    const p = await onValuesTab();
    p.type("param:hour", '"nine"');
    expect(p.changes().at(-1).params).toEqual({
      start: "interrogation",
      changes: { "param:hour": '"nine"' },
    });
    p.hostAnswers("preview/changeStartingValues");
    await settle();
    await p.hostSends({ interrogation: { "param:hour": '"nine"' } });
    expect(p.input("param:hour").value).toBe('"nine"');
    expect(p.row("param:hour").hasAttribute("data-set")).toBe(true);
    expect(p.badge("param:hour")).toBeNull();
    const clear = p.row("param:hour").querySelector<HTMLElement>(".sv-clear")!;
    expect(clear.style.visibility).toBe("");
    expect(p.valuesTab()!.textContent).toBe("Starting values1");
    expect(
      p.valuesTab()!.querySelector(".sv-tab-icon")!.getAttribute("data-icon"),
    ).toBe("sliders");
    expect(p.asked).toContainEqual([
      "game/setStartingValues",
      { values: { interrogation: { "param:hour": '"nine"' } } },
    ]);
    expect(p.previewed.at(-1).slice(1, 3)).toEqual([URI, 19]);
  });

  test("a value of another type warns and still goes to the host", async () => {
    const p = await onValuesTab({ interrogation: { "param:hour": "1" } });
    p.type("store:trust", '"high"');
    expect(p.changes().at(-1).params.changes).toEqual({
      "store:trust": '"high"',
    });
    expect(p.badge("store:trust")!.dataset["status"]).toBe("warning");
    expect(p.badge("store:trust")!.textContent).toBe(
      "trust starts as a number. This still applies.",
    );
  });

  test("a value that does not parse shows its error, is not sent, and the tab shows the error icon", async () => {
    const p = await onValuesTab();
    p.type("store:player", "{ found =");
    expect(p.changes()).toHaveLength(0);
    expect(p.input("store:player").value).toBe("{ found =");
    expect(p.badge("store:player")!.dataset["status"]).toBe("error");
    expect(p.badge("store:player")!.textContent).toBe(
      "Not a value yet: expected } to close the table. It isn't kept until it is one.",
    );
    expect(
      p.valuesTab()!.querySelector(".sv-tab-icon")!.getAttribute("data-icon"),
    ).toBe("error");
  });

  test("a change the host does not keep is put back, with its error badge", async () => {
    const p = await onValuesTab();
    p.type("store:trust", "2");
    expect(p.input("store:trust").value).toBe("2");
    p.hostAnswers("preview/changeStartingValues", false);
    await settle();
    expect(p.input("store:trust").value).toBe("");
    expect(p.badge("store:trust")!.dataset["status"]).toBe("error");
    expect(p.badge("store:trust")!.textContent).toBe(
      "Your change was not saved, so this is back to 0.",
    );
  });

  test("a change the host did not keep, answered after a later change to the field was kept, leaves the later one", async () => {
    const p = await onValuesTab();
    p.type("store:trust", "2");
    p.type("store:trust", "3");
    const [first, second] = p.changes();
    const answer = (request: any, ok: boolean) =>
      window.dispatchEvent(
        new CustomEvent(MessageProtocol.event, {
          detail: ok
            ? { jsonrpc: "2.0", id: request.id, method: request.method, result: {} }
            : {
                jsonrpc: "2.0",
                id: request.id,
                method: request.method,
                error: { code: -1, message: "not kept" },
              },
        }),
      );
    answer(second, true);
    await settle();
    await p.hostSends({ interrogation: { "store:trust": "3" } });
    answer(first, false);
    await settle();
    expect(p.input("store:trust").value).toBe("3");
    expect(p.badge("store:trust")).toBeNull();
    expect(p.row("store:trust").hasAttribute("data-set")).toBe(true);
    expect(p.valuesTab()!.textContent).toBe("Starting values1");
  });

  test.each([["×"], ["Reset all"]])(
    "%s on a field holding text not kept puts back its first value",
    async (action) => {
      const p = await onValuesTab({ interrogation: { "store:trust": "2" } });
      p.type("store:trust", "{ unclosed");
      expect(p.badge("store:trust")!.dataset["status"]).toBe("error");
      (action === "×"
        ? p.row("store:trust").querySelector<HTMLElement>(".sv-clear")!
        : p.routeList.querySelector<HTMLElement>(".sv-reset")!
      ).click();
      p.hostAnswers("preview/changeStartingValues");
      await settle();
      await p.hostSends({});
      expect(p.input("store:trust").value).toBe("");
      expect(p.input("store:trust").placeholder).toBe("0");
      expect(p.badge("store:trust")).toBeNull();
    },
  );

  test("a value whose name left the script is listed apart with its warning, and × clears it", async () => {
    const p = await onValuesTab({
      interrogation: { "store:cells": "2", "visits:truth.ending": "1" },
    });
    const head = [...p.routeList.querySelectorAll(".sv-group-head")].at(-1)!;
    expect(head.textContent).toBe("No longer in the script");
    expect(p.row("store:cells").hasAttribute("data-unresolved")).toBe(true);
    expect(p.badge("visits:truth.ending")!.textContent).toBe(
      "No scene, branch or label is named truth.ending now, so this isn't used. × removes it.",
    );
    p.row("store:cells").querySelector<HTMLButtonElement>(".sv-clear")!.click();
    expect(p.changes().at(-1).params.changes).toEqual({ "store:cells": null });
  });

  test("every row has the same parts in every state, so no row moves", async () => {
    const p = await onValuesTab({
      interrogation: { "store:trust": "2", "store:gone": "1" },
    });
    p.type("store:suspect", "{ x =");
    p.type("store:player.hp", '"low"');
    const shapes = new Set(
      p.rows().map((r) => {
        const field = r.querySelector(".sv-field")!;
        return [
          ...[...r.children].map((c) => c.classList[0]),
          ...[...field.children].map((c) => c.classList[0]),
        ].join(" ");
      }),
    );
    expect([...shapes]).toEqual(["sv-name sv-field sv-clear sv-input sv-slot"]);
    expect(p.row("store:trust").hasAttribute("data-set")).toBe(true);
    expect(p.badge("param:hour")!.dataset["status"]).toBe("warning");
    expect(p.badge("store:suspect")!.dataset["status"]).toBe("error");
    expect(p.badge("store:player.hp")!.dataset["status"]).toBe("warning");
    expect(p.badge("store:gone")!.dataset["status"]).toBe("warning");
    expect(p.routeList.querySelector(".sv-status")!.textContent).toBe(
      "2 of 8 values set",
    );
  });

  test("Reset all clears every value of the scene, and the search narrows the rows", async () => {
    const p = await onValuesTab({
      interrogation: { "store:trust": "2", seed: "7" },
    });
    p.routeList.querySelector<HTMLButtonElement>(".sv-reset")!.click();
    expect(p.changes().at(-1).params).toEqual({
      start: "interrogation",
      changes: { "store:trust": null, seed: null },
    });
    const search = p.routeList.querySelector<HTMLInputElement>(".sv-search")!;
    search.value = "tru";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(p.rows().map((r) => r.dataset["key"])).toEqual([
      "store:trust",
      `place:0:12:${URI}`,
    ]);
  });
});

describe("the Starting values tab's fields", () => {
  test("a visit count or seed the field refuses is not sent, and what is kept stays", async () => {
    const p = await onValuesTab({
      interrogation: { [`place:0:12:${URI}`]: "1", seed: "7" },
    });
    p.type(`place:0:12:${URI}`, "-1");
    p.type("seed", "1.5");
    expect(p.changes()).toHaveLength(0);
    expect(p.badge(`place:0:12:${URI}`)!.dataset["status"]).toBe("error");
    expect(p.badge("seed")!.dataset["status"]).toBe("error");
    expect(p.routeList.querySelector(".sv-status")!.textContent).toBe(
      "2 of 8 values set",
    );
    p.input("seed").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(p.input("seed").value).toBe("7");
  });

  test("text a field holds in one scene does not show in another scene's field", async () => {
    const p = await onValuesTab({
      interrogation: {},
      other: { "param:hour": '"ten"' },
    });
    p.type("param:hour", '"unfinished');
    expect(p.input("param:hour").value).toBe('"unfinished');
    p.report({ route: { ...exampleRoute(), valuesStart: "other" } });
    await settle();
    expect(p.input("param:hour").value).toBe('"ten"');
    expect(p.badge("param:hour")).toBeNull();
  });

  test("Escape in a field that holds text not kept puts the field back, and the next Escape closes the panel", async () => {
    const p = await onValuesTab({ interrogation: { "store:trust": "2" } });
    const field = p.input("store:trust");
    field.value = "{ found =";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    p.input("store:trust").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(p.routeList.hidden).toBe(false);
    expect(p.input("store:trust").value).toBe("2");
    p.input("store:trust").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(p.routeList.hidden).toBe(true);
  });
});
