import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const intents = vi.hoisted(() => ({
  showProblems: vi.fn(),
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
      showProblems: intents.showProblems,
      revealDocument: intents.revealDocument,
    },
  },
}));

let phone = false;
const mediaListeners = new Set<() => void>();
const HEIGHT = 808;

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return query.includes("min-width") ? !phone : false;
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
  intents.showProblems.mockClear();
  intents.revealDocument.mockClear();
});

afterEach(async () => {
  await unmount();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  phone = false;
  await act(async () => mediaListeners.forEach((listener) => listener()));
});

describe("the bar under the game", () => {
  it("counts the project's errors and warnings as problems and its infos as notes", async () => {
    await mount();
    expect(toggle().textContent).toBe("No problems");
    expect(toggle().hasAttribute("data-problems")).toBe(false);
    await setState((s) => ({
      ...s,
      debug: {
        ...s.debug,
        diagnosticsSummary: {
          "file:///local/main.sd": { errors: 1, warnings: 0, infos: 2 },
          "file:///local/chapter.sd": { errors: 0, warnings: 1, infos: 0 },
        },
      },
    }));
    expect(toggle().textContent).toBe("2 problems · 2 notes");
    expect(toggle().hasAttribute("data-problems")).toBe(true);
    await setState((s) => ({
      ...s,
      debug: {
        ...s.debug,
        diagnosticsSummary: {
          "file:///local/main.sd": { errors: 0, warnings: 1, infos: 3 },
        },
      },
    }));
    expect(toggle().textContent).toBe("1 problem · 3 notes");
  });

  it("opens the editor's problems for the open script from the toggle", async () => {
    await mount();
    await act(async () => toggle().click());
    await settle();
    expect(intents.showProblems.mock.calls).toEqual([["file:///local/main.sd"]]);
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
    expect(link.getAttribute("href")).toBe("#project?section=screenplay");
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
