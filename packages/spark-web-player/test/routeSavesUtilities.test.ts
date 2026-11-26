import "./resizeObserverStub";
import { compile } from "@tailwindcss/node";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { h, render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { PreviewRoute } from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import { RouteButton, RouteList } from "../src/route/RouteViews";
import type { RouteViewState } from "../src/route/routeView";
import type { StartingValuesViewState } from "../src/route/startingValuesView";
import {
  LoadSave,
  SaveNote,
  SavesButton,
  SavesMenu,
  type SavesEvents,
} from "../src/saves/SavesViews";
import type { SaveRow, SaveValuesState } from "../src/saves/savesView";

const ENTRY = resolve(__dirname, "../src/impower-ui.css");
const URI = "file:///project/main.sd";

const at = (line: number) => ({
  uri: URI,
  range: {
    start: { line: line - 1, character: 0 },
    end: { line: line - 1, character: 0 },
  },
});

const route = (): PreviewRoute => ({
  start: { scene: "interrogation", location: at(4) },
  target: at(21),
  decisions: [
    {
      kind: "pinned",
      location: at(9),
      text: "Tell the truth.",
      meeting: 1,
      notFollowed: true,
      options: [
        { location: at(9), text: "Tell the truth.", offer: 1 },
        { location: at(11), text: "Lie.", offer: 2 },
      ],
    },
    { kind: "auto", location: at(13), text: "Wait.", meeting: 1 },
    { kind: "forced", location: at(15), text: "trust > 3", verdict: true },
    { kind: "clipped", location: at(17), text: "for i", passes: 3 },
  ],
  unresolvedPins: [{ uri: URI, line: 30, offer: 1 }],
});

const values = (): StartingValuesViewState => ({
  listing: {
    start: "interrogation",
    items: [
      { key: "trust", group: "stores", name: "trust", first: "0", line: 1 },
      { key: "name", group: "stores", name: "name", first: '"Bunny"' },
    ],
  },
  values: { trust: "3", gone: "1" },
  drafts: { name: "oops(" },
  unsaved: {},
  search: "",
  loaded: { count: 1, name: "Before the trial" },
});

const routeState = (extra: Partial<RouteViewState> = {}): RouteViewState => ({
  route: route(),
  open: true,
  toggles: { pinned: true, auto: false, forced: true, clipped: true },
  tab: "route",
  values: values(),
  pins: [{ uri: URI, line: 8, offer: 1 }],
  pinNote: "The pin was not saved.",
  lastRun: 2,
  ...extra,
});

const save = (id: string, kind: SaveRow["kind"], gone = false): SaveRow => ({
  id,
  kind,
  name: kind === "lastRun" ? "Entering interrogation" : "Before the trial",
  scene: "interrogation",
  line: 4,
  time: 0,
  gone,
});

const SAVES = [save("s1", "lastRun"), save("s2", "saved", true)];

const saveValues = (): SaveValuesState => ({
  save: SAVES[1]!,
  values: { values: { trust: "5", name: '"x"' }, frames: [] },
  listing: values().listing,
  search: "",
  drafts: { name: "oops(" },
  unsaved: {},
});

const savesEvents = (): SavesEvents =>
  new Proxy({} as SavesEvents, { get: () => vi.fn() });

const valueEvents = () => ({
  onSet: vi.fn(),
  onClear: vi.fn(),
  onDraft: vi.fn(),
  onResetAll: vi.fn(),
  onSearch: vi.fn(),
  onUndoLoad: vi.fn(),
  load: { saves: SAVES, open: true, onOpen: vi.fn(), onPick: vi.fn() },
});

const listProps = (state: RouteViewState) => ({
  state,
  nameOf: () => "main",
  onClose: vi.fn(),
  onToggle: vi.fn(),
  onShowLine: vi.fn(),
  onTab: vi.fn(),
  values: valueEvents(),
  onChangePins: vi.fn(),
  onPinLastRun: vi.fn(),
});

const VIEWS: Record<string, () => ComponentChild> = {
  "route button": () =>
    h(RouteButton, { state: routeState(), nameOf: () => "main", onOpen: vi.fn(), onClose: vi.fn() }),
  "failed route button": () =>
    h(RouteButton, {
      state: routeState({ route: undefined, failure: { message: "No route.", target: at(21) } }),
      nameOf: () => "main",
      onOpen: vi.fn(),
      onClose: vi.fn(),
    }),
  "route tab": () => h(RouteList, listProps(routeState())),
  "failed route tab": () =>
    h(RouteList, listProps(routeState({ route: undefined, failure: { message: "No route.", target: at(21) } }))),
  "Starting values tab": () => h(RouteList, listProps(routeState({ tab: "values" }))),
  "Saves button": () => h(SavesButton, { state: { open: true, playing: true, saves: SAVES }, events: savesEvents() }),
  "Saves menu": () =>
    h(SavesMenu, { state: { open: true, playing: false, saves: SAVES, renaming: "s1" }, events: savesEvents() }),
  "empty Saves menu": () => h(SavesMenu, { state: { open: true, playing: true, saves: [] }, events: savesEvents() }),
  "save's values": () =>
    h(SavesMenu, { state: { open: true, playing: true, saves: SAVES, values: saveValues() }, events: savesEvents() }),
  "save note": () => h(SaveNote, { note: { name: "start, line 4" }, events: savesEvents() }),
  "failed save note": () => h(SaveNote, { note: { name: "x", failed: "No room." }, events: savesEvents() }),
  "Load a save menu": () => h(LoadSave, { saves: SAVES, open: true, onOpen: vi.fn(), onPick: vi.fn() }),
};

const HOOK = /^(route|sv|saves?|save)(-|$)|^(failed|taken|unset)$|^group(\/|$)/;

let host: HTMLElement | undefined;

afterEach(() => {
  if (host) {
    act(() => render(null, host!));
  }
  host = undefined;
  document.body.replaceChildren();
});

const classesOf = (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  act(() => render(node, host!));
  const classes = new Set<string>();
  for (const element of host.querySelectorAll("[class]")) {
    for (const name of element.getAttribute("class")!.split(/\s+/)) {
      if (name) classes.add(name);
    }
  }
  act(() => render(null, host!));
  host.remove();
  host = undefined;
  return classes;
};

const generator = async () => {
  const compiler = await compile(readFileSync(ENTRY, "utf8"), {
    base: dirname(ENTRY),
    onDependency: () => {},
  });
  let last = compiler.build([]).length;
  return (name: string) => {
    const css = compiler.build([name]);
    const grew = css.length > last;
    last = css.length;
    return { grew, css };
  };
};

describe("the player's route list and Saves views", () => {
  test("have no stylesheets of their own", () => {
    for (const sheet of ["../route/route-list.css", "../saves/saves.css", "../route/routeListStylesheet.ts"]) {
      expect(existsSync(resolve(__dirname, "../src", sheet.replace(/^\.\.\//, ""))), sheet).toBe(false);
    }
  });

  test("draw every look with utilities the player's stylesheet generates", async () => {
    const generate = await generator();
    const missing: string[] = [];
    const seen = new Set<string>();
    for (const [view, node] of Object.entries(VIEWS)) {
      const classes = classesOf(node());
      expect(classes.size, view).toBeGreaterThan(0);
      for (const name of classes) {
        if (HOOK.test(name) || seen.has(name)) continue;
        seen.add(name);
        if (!generate(name).grew) missing.push(`${view}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  }, 60_000);

  test("use no class a game's built-in styles also name, where they draw inside the game", () => {
    const builtins = readFileSync(
      resolve(__dirname, "../../sparkdown/src/compiler/builtins/builtins.sd"),
      "utf8",
    );
    const styles = new Set([...builtins.matchAll(/^style ([\w-]+)/gm)].map((match) => match[1]!));
    expect(styles.has("grid")).toBe(true);
    const clashes: string[] = [];
    for (const view of ["Saves menu", "empty Saves menu", "save's values", "save note", "failed save note"]) {
      for (const name of classesOf(VIEWS[view]!())) {
        if (styles.has(name)) clashes.push(`${view}: ${name}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  test("hold the pressed colour on a pressed or expanded toolbar button under a hovering pointer", async () => {
    const generate = await generator();
    const hover = [...classesOf(VIEWS["Saves button"]!())].find((name) => name.includes(":hover:"));
    expect(hover).toBeDefined();
    const { css } = generate(hover!);
    expect(css).toMatch(/@media \(pointer: fine\)/);
    expect(css).toMatch(/:not\(\*?:active\)/);
    expect(css).toMatch(/:not\(\*?\[aria-expanded="true"\]\)/);
    const button = [...classesOf(VIEWS["route button"]!())];
    expect(button).toContain(hover);
    expect(button).toContain("aria-expanded:bg-(--swp-toolbar-button-active-color)");
    expect(button).toContain("active:bg-(--swp-toolbar-button-active-color)");
  }, 60_000);
});
