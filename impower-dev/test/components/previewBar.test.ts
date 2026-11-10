import { Fragment, h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_SECTION_IDS } from "../../src/modules/spark-editor/components/settings/sections";
import { routeOfHash, sectionOfHash } from "../../src/modules/spark-editor/workspace/routes";

const intents = vi.hoisted(() => ({
  revealDocument: vi.fn(),
}));

vi.mock("../../src/modules/spark-editor/components/preview-game/PreviewGame", () => ({
  default: () => h("div", { "data-stage": "game" }),
}));
vi.mock(
  "../../src/modules/spark-editor/components/preview-screenplay/PreviewScreenplay",
  () => ({ default: () => h("div", { "data-stage": "screenplay" }) }),
);
vi.mock(
  "../../src/modules/spark-editor/components/preview-top-bar/PreviewTopBar",
  () => ({ default: () => h("div", { "data-top-bar": "" }) }),
);
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    window: {
      getActiveEditorForPane: () => ({ uri: "file:///local/main.sd" }),
      revealDocument: intents.revealDocument,
      setStripHeight: () => {},
    },
  },
}));

let phone = false;
let compact = false;
const mediaListeners = new Set<() => void>();
const HEIGHT = 808;

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        if (!query.includes("min-width") || phone) {
          return false;
        }
        return !(compact && query.includes("1101px"));
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) =>
        mediaListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) =>
        mediaListeners.delete(listener),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
});

const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { default: workspaceSettings } = await import(
  "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings"
);
const { PROJECT_SETTINGS_STORAGE_KEY_PREFIX, WorkspaceSettings } = await import(
  "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings"
);
const { default: Preview } = await import(
  "../../src/modules/spark-editor/components/preview/Preview"
);
const { default: problems } = await import(
  "../../src/modules/spark-editor/workspace/problems/ProblemsStore"
);
const { ROUTE_LIST_STYLESHEET_ID } = await import(
  "@impower/spark-web-player/src/route/RouteViews"
);
const { RouteSheet } = await import(
  "../../src/modules/spark-editor/components/preview-route"
);
const { default: route } = await import(
  "../../src/modules/spark-editor/workspace/route/RouteStore"
);

const lineAt = (line: number) => ({
  uri: "file:///local/main.sd",
  range: {
    start: { line: line - 1, character: 0 },
    end: { line: line - 1, character: 0 },
  },
});

const forcedRoute = {
  open: false,
  tab: "route" as const,
  toggles: { pinned: true, auto: true, forced: true, clipped: true },
  pins: [],
  route: {
    start: { scene: "interrogation", location: lineAt(4) },
    target: lineAt(21),
    decisions: [
      { kind: "forced" as const, location: lineAt(15), text: "trust > 3", verdict: true },
    ],
  },
};

const diagnostic = (severity: number) => ({
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  severity: severity as 1 | 2 | 3,
  message: "x",
});

const initial = structuredClone(workspace.current);
let host: HTMLDivElement | undefined;

const reloaded = () => {
  const fresh = new WorkspaceSettings(workspace.signals.projectId);
  const values = fresh.projectSettings.value;
  fresh.dispose();
  return values;
};

const stored = () =>
  JSON.parse(
    localStorage.getItem(
      PROJECT_SETTINGS_STORAGE_KEY_PREFIX + workspace.current.project.id,
    ) ?? "{}",
  );

const setState = (
  change: (state: typeof workspace.current) => typeof workspace.current,
) =>
  act(() => {
    workspace.current = change(structuredClone(workspace.current));
  });

const mount = async () => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(HEIGHT);
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(Preview, {}), host!));
};

const unmount = async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
};

const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const bar = () => {
  const element = document.querySelector<HTMLElement>(
    '[aria-label="Problems and display"]',
  );
  expect(element, "the bar under the game").not.toBeNull();
  return element!;
};
const toggle = () => bar().querySelector<HTMLButtonElement>("button")!;
const ratio = () =>
  bar().querySelector<HTMLButtonElement>('[aria-label="Game aspect ratio"]')!;
const divider = () =>
  document.querySelector<HTMLElement>(
    '[role="separator"][aria-label="Resize game and panel"]',
  );
const separator = () => {
  const element = divider();
  expect(element, "the divider above the bar").not.toBeNull();
  return element!;
};

const key = (target: Element, name: string) =>
  act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
    );
  });

beforeEach(() => {
  localStorage.clear();
  workspace.current = structuredClone(initial);
  workspaceSettings.setProjectSetting("previewAspectRatio", "auto");
  workspaceSettings.setProjectSetting("previewPanelHeight", 44);
  workspaceSettings.setPreference("previewMode", "game");
  intents.revealDocument.mockClear();
  problems.diagnostics.value = {};
  problems.panelShows.value = "problems";
  route.view.value = null;
  route.sheetOpen.value = false;
});

afterEach(async () => {
  await unmount();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  phone = false;
  compact = false;
  await act(async () => mediaListeners.forEach((listener) => listener()));
});

describe("the bar under the game", () => {
  it("counts the project's errors and warnings as problems and its infos as notes", async () => {
    await mount();
    expect(toggle().textContent).toBe("No problems");
    expect(toggle().hasAttribute("data-problems")).toBe(false);
    await act(() => {
      problems.record({ uri: "file:///local/main.sd", diagnostics: [diagnostic(1), diagnostic(3), diagnostic(3)] });
      problems.record({ uri: "file:///local/chapter.sd", diagnostics: [diagnostic(2)] });
    });
    expect(toggle().textContent).toBe("2 problems · 2 notes");
    expect(toggle().hasAttribute("data-problems")).toBe(true);
    await act(() => {
      problems.record({ uri: "file:///local/main.sd", diagnostics: [diagnostic(2), diagnostic(3), diagnostic(3), diagnostic(3)] });
      problems.record({ uri: "file:///local/chapter.sd", diagnostics: [] });
    });
    expect(toggle().textContent).toBe("1 problem · 3 notes");
    expect(document.querySelector('[role="status"]')!.textContent).toBe("1 problem · 3 notes");
  });

  it("opens the Problems panel under the game from the toggle and collapses it again", async () => {
    await mount();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("problems-panel")).toBeNull();
    await act(async () => toggle().click());
    await settle();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(toggle().getAttribute("title")).toBe("Collapse the panel");
    expect(stored().previewPanelHeight).toBe(260);
    expect(document.getElementById("problems-panel")).not.toBeNull();
    await act(async () => toggle().click());
    await settle();
    expect(stored().previewPanelHeight).toBe(44);
    expect(document.getElementById("problems-panel")).toBeNull();
  });

  it("shows the caret's line while stopped and the executing line while playing", async () => {
    await setState((s) => {
      s.panes.logic.panels.main!.activeEditor = {
        open: true,
        filename: "main.sd",
        selectedRange: {
          start: { line: 6, character: 0 },
          end: { line: 6, character: 0 },
        },
      };
      return s;
    });
    await mount();
    const readout = () => bar().querySelectorAll("button")[1]!;
    expect(readout().textContent).toBe("main : 7");
    await setState((s) => {
      s.preview.modes.game = {
        running: true,
        position: { uri: "file:///local/chapter.sd", line: 11 },
      };
      return s;
    });
    expect(readout().textContent).toBe("chapter : 12");
    await act(async () => readout().click());
    await settle();
    expect(intents.revealDocument.mock.calls[0]).toEqual([
      "file:///local/chapter.sd",
      { start: { line: 11, character: 0 }, end: { line: 11, character: 0 } },
    ]);
  });

  it("opens the route list from the readout in the Problems panel's place, one panel at a time", async () => {
    await mount();
    await act(() => {
      route.view.value = forcedRoute;
    });
    const readout = () =>
      bar().querySelector<HTMLButtonElement>('button[aria-controls="route-panel"]')!;
    expect(readout().textContent).toBe("interrogation(4 → 21)");
    expect(readout().getAttribute("aria-expanded")).toBe("false");
    await act(async () => readout().click());
    await settle();
    expect(stored().previewPanelHeight).toBe(260);
    expect(readout().getAttribute("aria-expanded")).toBe("true");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("route-panel")).not.toBeNull();
    expect(document.getElementById("problems-panel")).toBeNull();
    expect(document.querySelector("#route-panel .route-entry")!.textContent).toContain(
      "Condition trust > 3 forced true",
    );
    await act(async () => toggle().click());
    await settle();
    expect(document.getElementById("problems-panel")).not.toBeNull();
    expect(document.getElementById("route-panel")).toBeNull();
    expect(stored().previewPanelHeight).toBe(260);
    await act(async () => readout().click());
    await settle();
    expect(document.getElementById("route-panel")).not.toBeNull();
    await act(async () => readout().click());
    await settle();
    expect(stored().previewPanelHeight).toBe(44);
    expect(document.getElementById("route-panel")).toBeNull();
  });

  it("closes the route list when the route goes away, as it does while playing", async () => {
    await mount();
    await act(() => {
      route.view.value = forcedRoute;
    });
    await act(async () => route.toggle());
    await settle();
    expect(document.getElementById("route-panel")).not.toBeNull();
    await act(async () =>
      route.receive({
        jsonrpc: "2.0",
        method: "preview/didChangeRouteView",
        params: { view: null },
      }),
    );
    await settle();
    expect(document.getElementById("route-panel")).toBeNull();
    expect(stored().previewPanelHeight).toBe(44);
  });

  it("mounts the player's own route list, which closes the panel on Escape and brings its own stylesheets", async () => {
    await mount();
    await act(() => {
      route.view.value = forcedRoute;
    });
    await act(async () => route.toggle());
    await settle();
    expect(document.querySelector("#route-panel swp-route-view > section.route-list")).not.toBeNull();
    expect(document.getElementById(ROUTE_LIST_STYLESHEET_ID)?.tagName).toBe("STYLE");
    await key(document.body, "Escape");
    await settle();
    expect(document.getElementById("route-panel")).toBeNull();
    expect(stored().previewPanelHeight).toBe(44);
  });

  it("keeps the Starting values tab in the route list and sends its tab and value changes to the player", async () => {
    const sent: unknown[] = [];
    const listen = (event: Event) => sent.push((event as CustomEvent).detail);
    window.addEventListener("jsonrpc", listen);
    try {
      await mount();
      await act(() => {
        route.view.value = {
          ...forcedRoute,
          values: {
            start: "interrogation",
            values: { trust: "2" },
            drafts: {},
            unsaved: {},
            search: "",
          },
        };
      });
      await act(async () => route.toggle());
      await settle();
      const tab = document.querySelector<HTMLButtonElement>(
        '#route-panel .route-tab[data-tab="values"]',
      );
      expect(tab?.textContent).toContain("Starting values");
      await act(async () => tab!.click());
      await settle();
      expect(sent).toContainEqual(
        expect.objectContaining({
          method: "preview/routeViewAction",
          params: { action: { kind: "tab", tab: "values" } },
        }),
      );
      await act(() => {
        route.view.value = { ...route.view.value!, tab: "values" };
      });
      const reset = document.querySelector<HTMLButtonElement>("#route-panel .sv-reset");
      expect(reset?.disabled).toBe(false);
      await act(async () => reset!.click());
      await settle();
      expect(sent).toContainEqual(
        expect.objectContaining({
          method: "preview/routeViewAction",
          params: { action: { kind: "values", event: { kind: "resetAll" } } },
        }),
      );
    } finally {
      window.removeEventListener("jsonrpc", listen);
    }
  });

  it("shows a forced route on the compact strip's readout, whose press opens the list in the strip", async () => {
    compact = true;
    await act(async () => mediaListeners.forEach((listener) => listener()));
    await mount();
    await act(() => {
      route.view.value = forcedRoute;
    });
    const readout = bar().querySelector<HTMLButtonElement>(
      'button[aria-controls="route-panel"]',
    )!;
    expect(readout.querySelector('[data-icon="detour"]')).not.toBeNull();
    await act(async () => readout.click());
    await settle();
    expect(document.getElementById("route-panel")).not.toBeNull();
    expect(document.querySelector("#route-panel .route-entry")!.textContent).toContain(
      "Condition trust > 3 forced true",
    );
  });

  it("shows a forced route on the phone's preview readout, whose press opens the list as a sheet", async () => {
    phone = true;
    await act(async () => mediaListeners.forEach((listener) => listener()));
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(HEIGHT);
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(h(Fragment, {}, h(Preview, {}), h(RouteSheet, {})), host!),
    );
    await act(() => {
      route.view.value = forcedRoute;
    });
    const readout = bar().querySelector<HTMLButtonElement>(
      'button[aria-controls="route-panel"]',
    )!;
    expect(readout.querySelector('[data-icon="detour"]')).not.toBeNull();
    await act(async () => readout.click());
    await settle(300);
    const sheet = document.querySelector('[role="dialog"]');
    expect(sheet?.querySelector("swp-route-view .route-entry")?.textContent).toContain(
      "Condition trust > 3 forced true",
    );
    expect(document.getElementById("route-panel")).toBeNull();
  });

  it("names the ratio and the size the player reports", async () => {
    await mount();
    expect(ratio().textContent).toBe("Auto");
    await setState((s) => {
      s.preview.modes.game = {
        size: { width: 391.5, height: 696, aspectRatio: "9:16" },
      };
      return s;
    });
    expect(ratio().textContent).toBe("Auto · 392×696");
  });

  it("chooses a ratio from a menuitemradio menu and keeps it for the project", async () => {
    await mount();
    ratio().focus();
    await key(ratio(), "ArrowDown");
    await settle(50);
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    );
    expect(rows.map((row) => [row.textContent, row.getAttribute("aria-checked")])).toEqual([
      ["Autofill pane", "true"],
      ["16:9Landscape", "false"],
      ["4:3Landscape", "false"],
      ["1:1Square", "false"],
      ["3:4Portrait", "false"],
      ["9:16Portrait", "false"],
    ]);
    const portrait = rows[5]!;
    portrait.focus();
    await act(async () => portrait.click());
    await settle(250);
    expect(workspaceSettings.projectSettings.value.previewAspectRatio).toBe("9:16");
    expect(stored().previewAspectRatio).toBe("9:16");
    expect(reloaded().previewAspectRatio).toBe("9:16");
    expect(ratio().textContent).toBe("9:16");
  });

  it("links to the screenplay settings with the paper size in Screenplay mode", async () => {
    workspaceSettings.setPreference("previewMode", "screenplay");
    await mount();
    const link = bar().querySelector<HTMLAnchorElement>("a")!;
    expect(link.getAttribute("aria-label")).toBe("Screenplay settings");
    expect(link.textContent).toBe("US Letter");
    expect(routeOfHash(link.getAttribute("href")!)).toBe("project");
    expect(sectionOfHash(link.getAttribute("href")!)).toBe("screenplay-settings");
    expect(SETTINGS_SECTION_IDS).toContain(sectionOfHash(link.getAttribute("href")!));
    expect(bar().querySelector('[aria-label="Game aspect ratio"]')).toBeNull();
  });

  it("leaves fullscreen before the paper-size link opens the settings", async () => {
    workspaceSettings.setPreference("previewMode", "screenplay");
    await mount();
    const exitFullscreen = vi.fn(async () => {});
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });
    document.exitFullscreen = exitFullscreen;
    try {
      const link = bar().querySelector<HTMLAnchorElement>("a")!;
      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      await act(async () => {
        link.dispatchEvent(click);
      });
      expect(exitFullscreen).toHaveBeenCalledTimes(1);
      expect(click.defaultPrevented).toBe(false);
    } finally {
      delete (document as { fullscreenElement?: Element }).fullscreenElement;
    }
  });
});

describe("the divider above the bar", () => {
  it("starts collapsed to the bar and grows the panel with Up", async () => {
    await mount();
    const handle = separator();
    expect(handle.getAttribute("aria-valuenow")).toBe("44");
    await key(handle, "ArrowUp");
    expect(handle.getAttribute("aria-valuenow")).toBe("144");
    expect(stored().previewPanelHeight).toBe(144);
    await key(handle, "ArrowUp");
    expect(stored().previewPanelHeight).toBe(160);
    await key(handle, "ArrowDown");
    expect(stored().previewPanelHeight).toBe(144);
  });

  it("keeps the height across a reload of the project's layout", async () => {
    await mount();
    await key(separator(), "ArrowUp");
    await key(separator(), "ArrowUp");
    expect(reloaded().previewPanelHeight).toBe(160);
    await unmount();
    await mount();
    expect(separator().getAttribute("aria-valuenow")).toBe("160");
  });

  it("resets to the bar on double-click and on Enter", async () => {
    workspaceSettings.setProjectSetting("previewPanelHeight", 300);
    await mount();
    expect(separator().getAttribute("aria-valuenow")).toBe("300");
    await act(async () => {
      separator().dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(stored().previewPanelHeight).toBe(44);
    expect(separator().getAttribute("aria-valuenow")).toBe("44");
    workspaceSettings.setProjectSetting("previewPanelHeight", 300);
    await settle();
    await key(separator(), "Enter");
    expect(stored().previewPanelHeight).toBe(44);
  });

  it("shows the same row without the divider on phones", async () => {
    phone = true;
    await act(async () => mediaListeners.forEach((listener) => listener()));
    await mount();
    expect(divider()).toBeNull();
    expect(toggle().textContent).toBe("No problems");
  });
});
