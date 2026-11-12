import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  SaveRow,
  SavesViewState,
} from "@impower/spark-web-player/src/saves/savesView";

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes("min-width"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { default: workspaceSettings } = await import(
  "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings"
);
const { default: PreviewTopBar } = await import(
  "../../src/modules/spark-editor/components/preview-top-bar/PreviewTopBar"
);
const { default: saves } = await import(
  "../../src/modules/spark-editor/workspace/saves/SavesStore"
);
const { SAVES_STYLESHEET_ID } = await import(
  "@impower/spark-web-player/src/saves/SavesViews"
);

const initial = structuredClone(workspace.current);
let host: HTMLDivElement | undefined;
let sent: unknown[] = [];
const listen = (event: Event) => sent.push((event as CustomEvent).detail);

const row = (id: string, kind: SaveRow["kind"], name: string): SaveRow => ({
  id,
  kind,
  name,
  scene: "interrogation",
  line: 10,
  time: 0,
  gone: false,
});

const SAVES: SaveRow[] = [
  row("l1", "lastRun", "Entering interrogation"),
  row("s1", "saved", "Before the confession"),
];

const view = (change: Partial<SavesViewState> = {}): SavesViewState => ({
  open: true,
  playing: false,
  saves: SAVES,
  ...change,
});

const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const mount = async () => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(PreviewTopBar, {}), host!));
};

const show = (next: SavesViewState | null) =>
  act(() => {
    saves.view.value = next;
  });

const button = () =>
  host!.querySelector<HTMLButtonElement>('button[aria-label="Saves"]');
const gear = () =>
  host!.querySelector<HTMLButtonElement>('button[aria-label="Preview settings"]');
const menu = () => document.querySelector<HTMLElement>("swp-route-view .saves-menu");
const shape = () =>
  Array.from(menu()!.querySelectorAll<HTMLElement>("h3, button")).map((item) => [
    item.tagName,
    item.textContent,
    item instanceof HTMLButtonElement ? item.disabled : null,
  ]);
const sentActions = () =>
  sent
    .filter(
      (message) =>
        (message as { method?: string }).method === "preview/savesViewAction",
    )
    .map((message) => (message as { params: { action: unknown } }).params.action);

const key = (target: Element, name: string) =>
  act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
    );
  });

beforeEach(() => {
  localStorage.clear();
  workspace.current = structuredClone(initial);
  workspaceSettings.setPreference("previewMode", "game");
  saves.view.value = null;
  sent = [];
  window.addEventListener("jsonrpc", listen);
});

afterEach(async () => {
  window.removeEventListener("jsonrpc", listen);
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
});

describe("the top bar's Saves button", () => {
  it("sits beside the settings gear in Visual Novel and Interactive Fiction, and not in Screenplay", async () => {
    await mount();
    await show(view({ open: false }));
    expect(button(), "the Saves button").not.toBeNull();
    expect(button()!.parentElement).toBe(gear()!.parentElement);
    expect(button()!.nextElementSibling).toBe(gear());
    await act(async () =>
      workspaceSettings.setPreference("previewMode", "textstream"),
    );
    expect(button()!.nextElementSibling).toBe(gear());
    await act(async () =>
      workspaceSettings.setPreference("previewMode", "screenplay"),
    );
    expect(button()).toBeNull();
  });

  it("asks the player to open its Saves menu and shows the player's own menu in a popup", async () => {
    await mount();
    await show(view({ open: false }));
    expect(button()!.getAttribute("aria-expanded")).toBe("false");
    await act(async () => button()!.click());
    await settle();
    expect(sentActions()).toContainEqual({ kind: "open", open: true });
    await show(view());
    await settle();
    expect(button()!.getAttribute("aria-expanded")).toBe("true");
    expect(menu(), "the player's Saves menu").not.toBeNull();
    expect(document.getElementById(SAVES_STYLESHEET_ID)?.tagName).toBe("STYLE");
    expect(menu()!.querySelector(".saves-here")!.textContent).toBe("Save here");
    expect(
      Array.from(menu()!.querySelectorAll(".saves-row-name")).map((n) => n.textContent),
    ).toEqual(["Entering interrogation", "Before the confession"]);
  });

  it("keeps the menu's shape when Play starts or stops, Save here disabled while previewing", async () => {
    await mount();
    await show(view());
    await settle();
    const previewing = shape();
    expect(menu()!.querySelector<HTMLButtonElement>(".saves-here")!.disabled).toBe(true);
    await show(view({ playing: true }));
    const playing = shape();
    expect(menu()!.querySelector<HTMLButtonElement>(".saves-here")!.disabled).toBe(false);
    expect(playing.map(([tag, text]) => [tag, text])).toEqual(
      previewing.map(([tag, text]) => [tag, text]),
    );
    await act(async () => menu()!.querySelector<HTMLButtonElement>(".saves-here")!.click());
    expect(sentActions()).toContainEqual({ kind: "saveHere" });
    await act(async () =>
      menu()!.querySelector<HTMLButtonElement>('.saves-row[data-id="s1"] .saves-play')!.click(),
    );
    expect(sentActions()).toContainEqual({ kind: "play", id: "s1" });
  });

  it("closes on Escape from the list and goes back from a save's values instead", async () => {
    await mount();
    await show(view());
    await settle();
    await key(menu()!, "Escape");
    expect(sentActions()).toContainEqual({ kind: "open", open: false });
    sent = [];
    await show(
      view({
        values: {
          save: SAVES[1]!,
          values: { values: { trust: "5" }, frames: [] },
          search: "",
          drafts: {},
          unsaved: {},
        },
      }),
    );
    await settle();
    await key(menu()!, "Escape");
    expect(sentActions()).toEqual([{ kind: "back" }]);
  });
});
