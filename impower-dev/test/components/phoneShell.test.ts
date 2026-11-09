import { h, render } from "preact";
import { act } from "preact/test-utils";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const calls = vi.hoisted(() => ({
  finished: [] as string[],
  commands: [] as [string, string][],
  routes: [] as string[],
}));

vi.mock("../../src/modules/spark-editor/components/preview/Preview", () => ({
  default: () => h("div", { "data-player": "" }),
}));
vi.mock("../../src/modules/spark-editor/components/logic/Logic", () => ({
  default: () =>
    h(
      "div",
      { "data-route": "logic" },
      h("input", { "aria-label": "Other field" }),
    ),
}));
vi.mock("../../src/modules/spark-editor/components/assets/Assets", () => ({
  default: () => h("div", { "data-route": "assets" }),
}));
vi.mock("../../src/modules/spark-editor/components/share/Share", () => ({
  default: () => h("div", { "data-route": "share" }),
}));
vi.mock("../../src/modules/spark-editor/components/settings", () => ({
  SettingsPage: () => h("section", { "data-settings-page": "" }),
}));
vi.mock(
  "../../src/modules/spark-editor/components/asset-inspector/AssetInspectorPane",
  () => ({ default: () => null }),
);
vi.mock(
  "../../src/modules/spark-editor/components/file-dropzone/FileDropzone",
  () => ({ default: () => null }),
);
const env = vi.hoisted(() => ({
  store:
    undefined as unknown as typeof import("../../src/modules/spark-editor/workspace/WorkspaceStore").default,
  stateForRoute:
    undefined as unknown as typeof import("../../src/modules/spark-editor/workspace/routes").stateForRoute,
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => {
  const store = {
    get current() {
      return env.store.current;
    },
    set current(value) {
      env.store.current = value;
    },
  };
  const stateForRoute: typeof env.stateForRoute = (...args) =>
    env.stateForRoute(...args);
  return {
    Workspace: {
      sync: { google: { getCurrentAccount: async () => null } },
      window: {
        setAccount: () => {},
        loadProject: async () => {},
        navigateTo: (route: string) => {
          calls.routes.push(route);
          store.current = stateForRoute(store.current, route as never);
        },
        closeSettings: () => {},
        setStripHeight: () => {},
        setAppMenuOpen: (appMenuOpen: boolean) => {
          store.current = {
            ...store.current,
            screen: { ...store.current.screen, appMenuOpen },
          };
        },
        startEditing: () => {
          env.store.scriptMode.value = "editing";
        },
        finishEditing: () => {
          env.store.scriptMode.value = "reading";
        },
        renameScript: async () => ({ status: "renamed" }),
        startEditingProjectName: () => {},
        finishEditingProjectName: async (name: string) => {
          calls.finished.push(name);
          store.current = {
            ...store.current,
            project: { ...store.current.project, name },
          };
        },
        executeEditorCommand: (filename: string, command: string) => {
          calls.commands.push([filename, command]);
        },
        expandPreviewPane: () => {
          store.current = {
            ...store.current,
            preview: { ...store.current.preview, revealed: true },
          };
        },
        collapsePreviewPane: () => {
          store.current = {
            ...store.current,
            preview: { ...store.current.preview, revealed: false },
          };
        },
      },
    },
  };
});

let width = 360;

beforeAll(() => {
  window.matchMedia = (query: string) => {
    const minWidth = /\(min-width: (\d+)px\)/.exec(query);
    return {
      get matches() {
        return minWidth ? width >= Number(minWidth[1]) : false;
      },
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { stateForRoute } =
  await import("../../src/modules/spark-editor/workspace/routes");
env.store = workspace;
env.stateForRoute = stateForRoute;
const { default: MainWindow } =
  await import("../../src/modules/spark-editor/components/main-window/MainWindow");

let host: HTMLDivElement | undefined;

beforeEach(() => {
  calls.finished.length = 0;
  calls.commands.length = 0;
  calls.routes.length = 0;
  workspace.editorHistory.value = {};
  workspace.scriptMode.value = "reading";
  workspace.current = stateForRoute(
    {
      ...workspace.current,
      project: { ...workspace.current.project, id: "local", name: "My story" },
      sync: { status: "cached" },
      screen: {},
      preview: { ...workspace.current.preview, revealed: false },
      panes: {
        ...workspace.current.panes,
        logic: {
          ...workspace.current.panes.logic,
          view: "list",
          panel: "main",
          panels: {
            ...workspace.current.panes.logic.panels,
            scripts: { activeEditor: undefined },
          },
        },
      },
    },
    "write",
  );
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
});

const settle = (ms = 20) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const mount = async () => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(MainWindow, null), host!));
  await settle();
};

const titleBar = () =>
  host!.querySelector<HTMLElement>("[data-phone-title-bar]")!;
const navigation = () =>
  host!.querySelector<HTMLElement>("[data-bottom-navigation]")!;
const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const nameField = () =>
  host!.querySelector<HTMLInputElement>('input[aria-label="Project name"]')!;

const go = async (route: string) => {
  await act(async () => {
    workspace.current = stateForRoute(workspace.current, route as never);
  });
  await settle();
};

const press = (target: Element) => {
  const event = new MouseEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  target.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("the phone shell", () => {
  it("frames the routes with a title bar and a bottom navigation instead of the rail", async () => {
    await mount();
    expect(document.documentElement.dataset["layout"]).toBe("phone");
    expect(host!.querySelector('aside[aria-label="Sidebar"]')).toBeNull();
    expect(titleBar().querySelector('svg, [class*="spark"]')).not.toBeNull();
    expect(nameField()).not.toBeNull();
    const tabs = Array.from(navigation().querySelectorAll('[role="tab"]'));
    expect(tabs).toHaveLength(3);
    ["Story", "Assets", "Share"].forEach((name, i) =>
      expect(tabs[i]!.textContent).toContain(name),
    );
    expect(navigation().className).toContain(
      "pb-[env(safe-area-inset-bottom)]",
    );
    expect(navigation().hidden).toBe(false);
  });

  it("renders Story, Assets and Share above the navigation and marks the current route", async () => {
    await mount();
    expect(host!.querySelector('[data-route="logic"]')).not.toBeNull();
    for (const [route, pane] of [
      ["collection", "assets"],
      ["share", "share"],
      ["write", "logic"],
    ] as const) {
      await go(route);
      expect(host!.querySelector(`[data-route="${pane}"]`)).not.toBeNull();
      expect(
        navigation()
          .querySelector('[data-state="active"]')!
          .textContent!.trim()
          .toLowerCase(),
      ).toContain(pane === "logic" ? "story" : pane);
    }
  });

  it("leaves the preview for the route the navigation or the app menu opens", async () => {
    await mount();
    await act(async () => button("Show the preview")!.click());
    await settle();
    expect(workspace.current.preview.revealed).toBe(true);
    const assets = Array.from(
      navigation().querySelectorAll<HTMLElement>('[role="tab"]'),
    ).find((tab) => tab.textContent?.includes("Assets"))!;
    await act(async () => {
      assets.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    });
    await settle();
    expect(calls.routes).toEqual(["collection"]);
    expect(workspace.current.preview.revealed).toBe(false);

    await go("write");
    await act(async () => button("Show the preview")!.click());
    await settle();
    expect(workspace.current.preview.revealed).toBe(true);
    await go("project");
    expect(host!.querySelector("[data-settings-page]")).not.toBeNull();
    expect(workspace.current.preview.revealed).toBe(false);
  });

  it("keeps the Story controls for a script another script's link opened in the editor view", async () => {
    await mount();
    await act(async () => {
      const logic = workspace.current.panes.logic;
      workspace.current = {
        ...workspace.current,
        panes: {
          ...workspace.current.panes,
          logic: {
            ...logic,
            view: "logic-editor",
            panel: "scripts",
            panels: {
              ...logic.panels,
              scripts: {
                ...logic.panels.scripts,
                activeEditor: { filename: "scripts/intro.sd" },
              },
            },
          },
        },
      };
    });
    await settle();
    expect(button("Search")).not.toBeNull();
    expect(button("Show the preview")).not.toBeNull();
    await act(async () => button("Search")!.click());
    await settle();
    expect(calls.commands).toEqual([["scripts/intro.sd", "search"]]);
  });

  it("follows the edit history and commands of whichever script the Story route shows", async () => {
    await mount();
    await act(async () => {
      workspace.scriptMode.value = "editing";
    });
    await act(async () => {
      workspace.editorHistory.value = {
        "main.sd": { canUndo: false, canRedo: false },
        "scripts/intro.sd": { canUndo: true, canRedo: false },
      };
    });
    expect(button("Undo edit")!.disabled).toBe(true);
    await act(async () => {
      const logic = workspace.current.panes.logic;
      workspace.current = {
        ...workspace.current,
        panes: {
          ...workspace.current.panes,
          logic: {
            ...logic,
            panel: "scripts",
            panels: {
              ...logic.panels,
              scripts: {
                ...logic.panels.scripts,
                activeEditor: { open: true, filename: "scripts/intro.sd" },
              },
            },
          },
        },
      };
    });
    await settle();
    expect(button("Undo edit")!.disabled).toBe(false);
    await act(async () => button("Undo edit")!.click());
    await settle();
    expect(calls.commands).toEqual([["scripts/intro.sd", "undo"]]);
  });

  it("shows Search and the edit history only on the Story route, disabled until the script can undo or redo", async () => {
    await mount();
    await act(async () => {
      workspace.scriptMode.value = "editing";
    });
    expect(button("Search")).not.toBeNull();
    expect(button("Undo edit")!.disabled).toBe(true);
    expect(button("Redo edit")!.disabled).toBe(true);
    await act(async () => {
      workspace.editorHistory.value = {
        "main.sd": { canUndo: true, canRedo: false },
      };
    });
    expect(button("Undo edit")!.disabled).toBe(false);
    expect(button("Redo edit")!.disabled).toBe(true);
    await act(async () => button("Undo edit")!.click());
    await act(async () => button("Search")!.click());
    await settle();
    expect(calls.commands).toEqual([
      ["main.sd", "undo"],
      ["main.sd", "search"],
    ]);
    await go("collection");
    expect(button("Search")).toBeNull();
    expect(button("Undo edit")).toBeNull();
    expect(button("App menu")).not.toBeNull();
  });

  it("opens Settings in place of the route with no tab current, returns to Story from its tab, and gives the preview a Back control", async () => {
    await mount();
    await go("project");
    expect(host!.querySelector("[data-settings-page]")).not.toBeNull();
    expect(host!.querySelector('[data-route="logic"]')).toBeNull();
    expect(navigation().hidden).toBe(false);
    expect(navigation().querySelector('[data-state="active"]')).toBeNull();
    const story = navigation().querySelector('[role="tab"]')!;
    await act(async () => {
      story.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    });
    await settle();
    expect(calls.routes).toEqual(["write"]);
    expect(host!.querySelector("[data-settings-page]")).toBeNull();

    await act(async () => button("Show the preview")!.click());
    await settle();
    expect(workspace.current.preview.revealed).toBe(true);
    const previewBack = host!
      .querySelector("[data-player]")!
      .parentElement!.querySelector<HTMLAnchorElement>('a[href="#write"]')!;
    await act(async () => previewBack.click());
    await settle();
    expect(workspace.current.preview.revealed).toBe(false);
  });
});

describe("the phone's reading and editing modes", () => {
  const edit = () =>
    act(async () => {
      workspace.scriptMode.value = "editing";
    });

  it("reads by default: no history, the project's name and the navigation show", async () => {
    await mount();
    expect(workspace.scriptMode.value).toBe("reading");
    expect(button("Undo edit")).toBeNull();
    expect(button("Done editing")).toBeNull();
    expect(nameField()).not.toBeNull();
    expect(navigation().hidden).toBe(false);
  });

  it("folds the script header into the title bar with Done and hides the navigation while editing", async () => {
    await mount();
    await edit();
    expect(button("Done editing")).not.toBeNull();
    expect(button("Undo edit")).not.toBeNull();
    expect(titleBar().querySelector("[data-script-header-folded]")).not.toBeNull();
    expect(navigation().hidden).toBe(true);
    expect(
      host!.querySelector("[data-phone-shell]")!.hasAttribute("data-editing"),
    ).toBe(true);
  });

  it("returns to reading from Done and restores the bar and the navigation", async () => {
    await mount();
    await edit();
    await act(async () => button("Done editing")!.click());
    await settle();
    expect(workspace.scriptMode.value).toBe("reading");
    expect(button("Done editing")).toBeNull();
    expect(navigation().hidden).toBe(false);
    expect(
      host!.querySelector("[data-phone-shell]")!.hasAttribute("data-editing"),
    ).toBe(false);
  });

  it("ends editing when the route leaves the story", async () => {
    await mount();
    await edit();
    await go("collection");
    await settle();
    expect(workspace.scriptMode.value).toBe("reading");
  });

  it("ends editing when a menu takes the focus, but not when a keyboard panel does", async () => {
    await mount();
    await edit();
    const panel = document.body.appendChild(document.createElement("section"));
    panel.setAttribute("role", "dialog");
    panel.setAttribute("data-keyboard-panel", "");
    const inside = panel.appendChild(document.createElement("button"));
    await act(async () => inside.focus());
    await settle();
    expect(workspace.scriptMode.value).toBe("editing");
    panel.remove();

    const menu = document.body.appendChild(document.createElement("div"));
    menu.setAttribute("role", "menu");
    const item = menu.appendChild(document.createElement("button"));
    await act(async () => item.focus());
    await settle();
    expect(workspace.scriptMode.value).toBe("reading");
    menu.remove();
  });

  it("keeps editing while the script's own action sheet has focus", async () => {
    await mount();
    await edit();
    const sheet = document.body.appendChild(document.createElement("div"));
    sheet.setAttribute("role", "dialog");
    const menu = sheet.appendChild(document.createElement("div"));
    menu.setAttribute("role", "menu");
    menu.setAttribute("data-action-sheet", "");
    const item = menu.appendChild(document.createElement("button"));
    await act(async () => item.focus());
    await settle();
    expect(workspace.scriptMode.value).toBe("editing");
    sheet.tabIndex = -1;
    await act(async () => sheet.focus());
    await settle();
    expect(workspace.scriptMode.value).toBe("editing");
    sheet.remove();
  });

  it("returns the caret to the script when a name field is left while editing", async () => {
    await mount();
    await act(async () => {
      const logic = workspace.current.panes.logic;
      workspace.current = {
        ...workspace.current,
        panes: {
          ...workspace.current.panes,
          logic: {
            ...logic,
            panel: "scripts",
            panels: {
              ...logic.panels,
              scripts: {
                ...logic.panels.scripts,
                activeEditor: { open: true, filename: "scripts/intro.sd" },
              },
            },
          },
        },
      };
    });
    await settle();
    await edit();
    const field = host!.querySelector<HTMLInputElement>(
      'input[aria-label="Script name"]',
    )!;
    await act(async () => field.focus());
    await settle();
    expect(button("Keep the name")).not.toBeNull();
    await act(async () => field.blur());
    await settle();
    expect(calls.commands).toContainEqual(["scripts/intro.sd", "focus"]);
    expect(workspace.scriptMode.value).toBe("editing");
  });

  it("hides the navigation while a panel stands in the keyboard's place", async () => {
    await mount();
    let remove: () => void = () => {};
    await act(async () => {
      remove = workspace.addKeyboardPanel({ heading: true });
    });
    expect(navigation().hidden).toBe(true);
    await act(async () => remove());
    expect(navigation().hidden).toBe(false);
  });
});

describe("naming the project on a phone", () => {
  it("hides the navigation and the bar's controls behind Done, and Done commits in one step", async () => {
    await mount();
    await act(async () => nameField().focus());
    await settle();
    expect(navigation().hidden).toBe(true);
    expect(
      host!.querySelector("[data-phone-shell]")!.getAttribute("data-naming"),
    ).toBe("project");
    expect(button("Search")).toBeNull();
    expect(button("App menu")).toBeNull();
    const done = button("Keep the name")!;
    expect(done.textContent).toContain("Done");

    await act(async () => {
      nameField().value = "Night shift";
      nameField().dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(press(done)).toBe(true);
    expect(document.activeElement).toBe(nameField());
    await act(async () => done.click());
    await settle();
    expect(calls.finished).toEqual(["Night shift"]);
    expect(document.activeElement).not.toBe(nameField());
    expect(navigation().hidden).toBe(false);
    expect(button("Search")).not.toBeNull();
  });

  it("keeps the field focused through a press on the bar's background, but lets another field, a link or the navigation take it", async () => {
    await mount();
    await act(async () => nameField().focus());
    await settle();
    expect(press(titleBar())).toBe(true);
    expect(press(host!.querySelector('[data-route="logic"]')!)).toBe(true);
    expect(
      press(host!.querySelector('input[aria-label="Other field"]')!),
    ).toBe(false);
    const link = document.body.appendChild(document.createElement("a"));
    link.href = "#share";
    expect(press(link)).toBe(false);
  });

  it("leaves presses alone when no field has focus", async () => {
    await mount();
    expect(press(titleBar())).toBe(false);
    expect(press(button("Search")!)).toBe(false);
  });

  it("lets a bottom navigation tab take the focus from a field", async () => {
    await mount();
    const other = host!.querySelector<HTMLInputElement>(
      'input[aria-label="Other field"]',
    )!;
    await act(async () => other.focus());
    await settle();
    expect(navigation().hidden).toBe(false);
    expect(press(navigation().querySelector('[role="tab"]')!)).toBe(false);
    expect(press(titleBar())).toBe(true);
  });
});

describe("the app menu on a phone", () => {
  it("opens as a sheet from the title bar and hides the navigation while it is open", async () => {
    await mount();
    await act(async () => button("App menu")!.click());
    await settle(250);
    const sheet = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(sheet.className).toContain("rounded-t-card");
    expect(sheet.textContent).toContain("Settings");
    expect(sheet.textContent).not.toContain("No account needed");
    expect(button("Close app menu")).not.toBeNull();
    expect(navigation().hidden).toBe(true);

    const settings = Array.from(
      sheet.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((item) => item.textContent?.includes("Settings"))!;
    await act(async () => settings.click());
    await settle(250);
    expect(calls.routes).toEqual(["project"]);
    expect(host!.querySelector("[data-settings-page]")).not.toBeNull();
    expect(navigation().hidden).toBe(false);
  });
});
