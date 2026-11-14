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

const { default: workspace, IDLE_DEBUG_SESSION } = await import(
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
  "@impower/spark-web-player/src/route/routeListStylesheet"
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

const mount = async ({ fullView = phone } = {}) => {
  workspace.current = {
    ...workspace.current,
    preview: { ...workspace.current.preview, revealed: fullView },
  };
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
  workspace.debugSession.value = IDLE_DEBUG_SESSION;
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

  it("says beside the readout that a stop holds before a line that has not run, until the run moves on", async () => {
    const note = () =>
      [...bar().querySelectorAll("span")].find((span) =>
        span.textContent?.startsWith("Stopped before"),
      );
    const stopAt = (beat: "shown" | "none") =>
      act(() => {
        workspace.debugSession.value = {
          ...workspace.debugSession.peek(),
          stopped: { reason: "breakpoint", threadId: 0, beat },
          stackTrace: {
            stackFrames: [
              { id: 0, name: "start", line: 15, column: 0, source: { path: "file:///local/main.sd" } },
            ],
          },
        };
      });
    await mount();
    expect(note()).toBeUndefined();
    await stopAt("none");
    expect(note()?.textContent).toBe("Stopped before line 16. It has not run yet.");
    expect(note()?.getAttribute("title")).toBe("Stopped before line 16. It has not run yet.");
    await act(() => {
      workspace.debugSession.value = {
        ...workspace.debugSession.peek(),
        stopped: null,
        stackTrace: null,
      };
    });
    expect(note()).toBeUndefined();
    await stopAt("shown");
    expect(note()).toBeUndefined();
  });

  it("reads a stop before a line in the phone's readout itself, with no note and nothing moved", async () => {
    phone = true;
    await act(async () => mediaListeners.forEach((listener) => listener()));
    await mount();
    await setState((s) => {
      s.preview.modes.game = {
        running: true,
        position: { uri: "file:///local/main.sd", line: 11 },
      };
      return s;
    });
    const controls = () => Array.from(bar().querySelectorAll<HTMLElement>("button, a"));
    const readout = () => controls()[1]!;
    const note = () =>
      [...bar().querySelectorAll("span")].find((span) =>
        span.textContent?.startsWith("Stopped before line"),
      );
    const before = controls();
    expect(readout().textContent).toBe("main : 12");
    expect(readout().hasAttribute("data-stopped")).toBe(false);
    expect(readout().querySelector("[data-icon]")).toBeNull();

    await act(() => {
      workspace.debugSession.value = {
        ...workspace.debugSession.peek(),
        stopped: { reason: "breakpoint", threadId: 0, beat: "none" },
        stackTrace: {
          stackFrames: [
            { id: 0, name: "start", line: 15, column: 0, source: { path: "file:///local/main.sd" } },
          ],
        },
      };
    });
    expect(controls()).toHaveLength(before.length);
    expect(controls().every((control, i) => control === before[i])).toBe(true);
    expect(readout().textContent).toBe("Stopped before main : 16");
    expect(readout().hasAttribute("data-stopped")).toBe(true);
    expect(readout().classList).toContain("data-stopped:text-warning");
    const icons = readout().querySelectorAll("[data-icon]");
    expect(icons).toHaveLength(1);
    expect(icons[0]!.getAttribute("data-icon")).toBe("stop-sign");
    expect(readout().getAttribute("aria-label")).toBe(
      "Stopped before main : 16. Stopped before line 16. It has not run yet.",
    );
    expect(readout().title).toBe("Stopped before line 16. It has not run yet.");
    expect(note()).toBeUndefined();

    await act(() => {
      workspace.debugSession.value = {
        ...workspace.debugSession.peek(),
        stopped: null,
        stackTrace: null,
      };
    });
    expect(controls().every((control, i) => control === before[i])).toBe(true);
    expect(controls()).toHaveLength(before.length);
    expect(readout().textContent).toBe("main : 12");
    expect(readout().hasAttribute("data-stopped")).toBe(false);
    expect(readout().hasAttribute("aria-label")).toBe(false);
  });

  it("keeps the sentence beside the readout on the compact layout", async () => {
    compact = true;
    await act(async () => mediaListeners.forEach((listener) => listener()));
    await mount();
    await act(() => {
      workspace.debugSession.value = {
        ...workspace.debugSession.peek(),
        stopped: { reason: "breakpoint", threadId: 0, beat: "none" },
        stackTrace: {
          stackFrames: [
            { id: 0, name: "start", line: 15, column: 0, source: { path: "file:///local/main.sd" } },
          ],
        },
      };
    });
    const note = [...bar().querySelectorAll("span")].find(
      (span) => span.textContent === "Stopped before line 16. It has not run yet.",
    );
    expect(note).toBeDefined();
    expect(bar().querySelector("[data-stopped]")).toBeNull();
  });

  it("leaves the aspect ratio out of the phone's bar in every mode", async () => {
    phone = true;
    await act(async () => mediaListeners.forEach((listener) => listener()));
    await mount();
    const labels = () =>
      Array.from(bar().querySelectorAll<HTMLElement>("button, a")).map(
        (control) => control.getAttribute("aria-label") ?? control.textContent,
      );
    expect(bar().querySelector('[aria-label="Game aspect ratio"]')).toBeNull();
    expect(labels()).toEqual(["No problems", "main : 1", "Close the preview"]);
    await act(async () =>
      workspaceSettings.setPreference("previewMode", "textstream"),
    );
    expect(bar().querySelector('[aria-label="Game aspect ratio"]')).toBeNull();
    expect(labels()).toEqual(["No problems", "main : 1", "Close the preview"]);
  });

  it("shows no bar on a phone while the preview sits in the strip, shows the game there whatever the saved mode, and keeps the fullscreen toggle off phones", async () => {
    phone = true;
    await act(async () => mediaListeners.forEach((listener) => listener()));
    await mount({ fullView: false });
    expect(
      host!.querySelector('[role="group"][aria-label="Problems and display"]'),
    ).toBeNull();
    expect(
      host!.querySelector('[role="group"][aria-label="Playback controls"]'),
    ).toBeNull();
    expect(host!.querySelector("[data-preview-card]")).not.toBeNull();
    await unmount();
    workspaceSettings.setPreference("previewMode", "screenplay");
    await mount({ fullView: false });
    const game = host!.querySelector('[data-stage="game"]')!;
    expect(game.parentElement!.className).not.toContain("hidden");
    expect(host!.querySelector('[data-stage="screenplay"]')).toBeNull();
    await unmount();
    await mount({ fullView: true });
    expect(host!.querySelector('[data-stage="screenplay"]')).not.toBeNull();
    expect(host!.querySelector('[data-stage="game"]')!.parentElement!.className).toContain("hidden");
    await unmount();
    workspaceSettings.setPreference("previewMode", "game");
    phone = false;
    await act(async () => mediaListeners.forEach((listener) => listener()));
    await mount();
    expect(bar().querySelector('[aria-label="Fullscreen preview"]')).not.toBeNull();
    expect(bar().querySelector('[aria-label="Close the preview"]')).toBeNull();
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

  it("keeps the readout's icon slot when the route has no icon, so the name does not move", async () => {
    await mount();
    const readout = () =>
      bar().querySelector<HTMLButtonElement>('button[aria-controls="route-panel"]')!;
    const lead = () => readout().firstElementChild as HTMLElement;
    await act(() => {
      route.view.value = forcedRoute;
    });
    expect(lead().getAttribute("data-icon")).toBe("detour");
    await act(() => {
      route.view.value = {
        ...forcedRoute,
        route: {
          ...forcedRoute.route,
          decisions: [
            { kind: "auto" as const, location: lineAt(8), text: "Tell the truth.", meeting: 1 },
          ],
        },
      } as typeof forcedRoute;
    });
    expect(lead().hasAttribute("data-icon")).toBe(false);
    expect(lead().hasAttribute("data-icon-slot")).toBe(true);
    expect(lead().getAttribute("aria-hidden")).toBe("true");
    expect(lead().nextElementSibling!.textContent).toBe("interrogation");
    await act(() => {
      route.view.value = forcedRoute;
    });
    expect(lead().getAttribute("data-icon")).toBe("detour");
    expect(lead().nextElementSibling!.textContent).toBe("interrogation");
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
    workspace.current = {
      ...workspace.current,
      preview: { ...workspace.current.preview, revealed: true },
    };
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

  it("keeps the aspect-ratio control in place in Interactive Fiction, disabled and reading Auto", async () => {
    workspaceSettings.setProjectSetting("previewAspectRatio", "9:16");
    await mount();
    const controls = () =>
      Array.from(bar().querySelectorAll<HTMLElement>("button, a")).map(
        (control) => control.getAttribute("aria-label") ?? control.textContent,
      );
    const visualNovel = controls();
    expect(ratio().textContent).toBe("9:16");
    expect(ratio().hasAttribute("aria-disabled")).toBe(false);

    await act(async () =>
      workspaceSettings.setPreference("previewMode", "textstream"),
    );
    expect(controls()).toEqual(visualNovel);
    expect(ratio().textContent).toBe("Auto");
    expect(ratio().getAttribute("aria-disabled")).toBe("true");
    expect(ratio().title).toBe("The page fills the pane in Interactive Fiction");
    ratio().focus();
    await key(ratio(), "ArrowDown");
    await act(async () => ratio().click());
    await settle(50);
    expect(document.querySelectorAll('[role="menuitemradio"]')).toHaveLength(0);
    expect(workspaceSettings.projectSettings.value.previewAspectRatio).toBe("9:16");

    await act(async () => workspaceSettings.setPreference("previewMode", "game"));
    expect(controls()).toEqual(visualNovel);
    expect(ratio().textContent).toBe("9:16");
    expect(ratio().hasAttribute("aria-disabled")).toBe(false);
  });

  it("lays every part of the label that a switch changes over an invisible reservation, the rule that keeps the control's width", async () => {
    workspaceSettings.setProjectSetting("previewAspectRatio", "4:3");
    await mount();
    const sized = (width: number, height: number) =>
      setState((s) => {
        s.preview.modes.game = { size: { width, height, aspectRatio: "4:3" } };
        return s;
      });
    await sized(923, 692);
    const cells = () =>
      Array.from(ratio().querySelectorAll<HTMLElement>("[data-reserve]")).map(
        (cell) => {
          expect(cell.classList).toContain("inline-grid");
          expect(cell.classList).toContain("before:content-[attr(data-reserve-alt)]");
          expect(cell.classList).toContain("before:invisible");
          expect(cell.classList).toContain("before:[grid-area:1/1]");
          expect(cell.classList).toContain("after:content-[attr(data-reserve)]");
          expect(cell.classList).toContain("after:invisible");
          expect(cell.classList).toContain("after:[grid-area:1/1]");
          expect(cell.classList).toContain("[&>*]:[grid-area:1/1]");
          expect(cell.children).toHaveLength(1);
          return [cell.textContent, cell.dataset.reserve, cell.dataset.reserveAlt];
        },
      );
    expect(ratio().textContent).toBe("4:3 · 923×692");
    expect(cells()).toEqual([
      ["4:3 · 923×692", "Auto · 0000×0000", "16:9 · 0000×0000"],
    ]);
    await act(async () =>
      workspaceSettings.setPreference("previewMode", "textstream"),
    );
    await sized(1090, 692);
    expect(ratio().textContent).toBe("Auto · 1090×692");
    expect(cells()).toEqual([
      ["Auto · 1090×692", "Auto · 0000×0000", "16:9 · 0000×0000"],
    ]);
  });

  it("keeps the same game stage shown between Visual Novel and Interactive Fiction", async () => {
    await mount();
    const stage = document.querySelector('[data-stage="game"]')!;
    const shown = (element: Element) =>
      !element.parentElement!.classList.contains("hidden");
    expect(shown(stage)).toBe(true);
    await act(async () =>
      workspaceSettings.setPreference("previewMode", "textstream"),
    );
    expect(document.querySelector('[data-stage="game"]')).toBe(stage);
    expect(shown(stage)).toBe(true);
    expect(document.querySelector('[data-stage="screenplay"]')).toBeNull();
    await act(async () => workspaceSettings.setPreference("previewMode", "game"));
    expect(document.querySelector('[data-stage="game"]')).toBe(stage);
    await act(async () =>
      workspaceSettings.setPreference("previewMode", "screenplay"),
    );
    expect(document.querySelector('[data-stage="game"]')).toBe(stage);
    expect(shown(stage)).toBe(false);
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
  it("draws no resting line between the game and the bar, and keeps the divider's accent bar", async () => {
    await mount();
    const handle = separator().classList;
    expect(handle.contains("before:bg-edge")).toBe(false);
    expect(handle.contains("before:bg-transparent")).toBe(true);
    expect(handle.contains("hover:after:opacity-100")).toBe(true);
    expect(handle.contains("focus-visible:after:opacity-100")).toBe(true);
  });

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
