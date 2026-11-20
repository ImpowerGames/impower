import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({ current: "compact" as string }));
const search = vi.hoisted(() => ({ close: vi.fn(), dismiss: vi.fn() }));
const win = vi.hoisted(() => ({ navigateTo: vi.fn(), finishEditing: vi.fn() }));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { search, window: win },
}));

vi.mock("@impower/impower-ui/layout", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLayout: () => layout.current,
  useRailDefault: () => "icons",
}));

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { default: WorkspaceShell } = await import(
  "../../src/modules/spark-editor/components/desktop-shell/WorkspaceShell"
);
const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { stateForRoute } = await import(
  "../../src/modules/spark-editor/workspace/routes"
);
const { INITIAL_SEARCH, INITIAL_SEARCH_POSITION } = await import(
  "../../src/modules/spark-editor/workspace/searchState"
);
const { searchWidensRail, RAIL_COMPACT_WIDTH, RAIL_WIDTH } = await import(
  "../../src/modules/spark-editor/workspace/railWidths"
);

const FIND = { ...INITIAL_SEARCH, open: true, view: "find" as const, term: "chapter" };

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

let host: HTMLElement;

const showAssets = () => {
  workspace.current = stateForRoute({ ...workspace.current, screen: {} }, "assets");
};

const showStory = (railCompactWidth?: number) => {
  const story = stateForRoute(
    {
      ...workspace.current,
      screen: {},
      panes: {
        ...workspace.current.panes,
        logic: {
          ...workspace.current.panes.logic,
          view: "list",
          panel: "main",
          panels: {
            ...workspace.current.panes.logic.panels,
            main: {
              ...workspace.current.panes.logic.panels?.main,
              activeEditor: { open: true, filename: "main.sd" },
            },
          },
        },
      },
    },
    "story",
  );
  workspace.current = { ...story, shell: { ...story.shell, railCompactWidth } };
};

const mount = async (snapshot = FIND) => {
  workspace.search.value = snapshot;
  await act(async () =>
    render(h(WorkspaceShell, { phone: false }, h("div", {})), host),
  );
  await flush();
};

const sidebar = () => host.querySelector<HTMLElement>('aside[aria-label="Sidebar"]')!;
const findBar = () => host.querySelector<HTMLElement>("[data-find-bar]");
const railSearch = () => sidebar().querySelector<HTMLElement>("section[data-view]");

beforeEach(() => {
  vi.clearAllMocks();
  layout.current = "compact";
  host = document.body.appendChild(document.createElement("div"));
  workspace.search.value = INITIAL_SEARCH;
  workspace.searchPosition.value = INITIAL_SEARCH_POSITION;
});

afterEach(async () => {
  await act(async () => render(null, host));
  host.remove();
  workspace.search.value = INITIAL_SEARCH;
  document.body.innerHTML = "";
});

describe("search at tablet width", () => {
  it("docks the find bar at the bottom, full width, while the rail stays as icons", async () => {
    showStory();
    await mount();
    expect(host.firstElementChild!.querySelector("[data-sidebar]")!.getAttribute("data-sidebar")).toBe("collapsed");
    expect(railSearch()).toBeNull();
    const bar = findBar();
    expect(bar).not.toBeNull();
    expect(sidebar().contains(bar)).toBe(false);
    expect(bar!.closest(".col-span-2")).not.toBeNull();
  });

  it("goes to the Story route when Find opens off it, and closes Find when the author leaves Story", async () => {
    showAssets();
    await mount(INITIAL_SEARCH);
    await act(async () => {
      workspace.search.value = FIND;
    });
    await flush();
    expect(win.navigateTo).toHaveBeenCalledWith("story");
    expect(search.close).not.toHaveBeenCalled();

    showStory();
    await flush();
    expect(findBar()).not.toBeNull();
    await act(async () => {
      showAssets();
    });
    await flush();
    expect(search.close).toHaveBeenCalledTimes(1);
    expect(win.navigateTo).toHaveBeenCalledTimes(1);
  });

  it("closes a Find that was open in the rail when the rail narrows to its icons off Story", async () => {
    showAssets();
    workspace.current = { ...workspace.current, shell: { ...workspace.current.shell, railCompactWidth: RAIL_COMPACT_WIDTH.full } };
    await mount();
    expect(railSearch()).not.toBeNull();
    await act(async () => {
      workspace.current = { ...workspace.current, shell: { ...workspace.current.shell, railCompactWidth: RAIL_COMPACT_WIDTH.collapsed } };
    });
    await flush();
    expect(search.close).toHaveBeenCalledTimes(1);
    expect(win.navigateTo).not.toHaveBeenCalled();
  });

  it("keeps search in the rail when the author widened it", async () => {
    showStory(RAIL_COMPACT_WIDTH.full);
    await mount();
    expect(railSearch()).not.toBeNull();
    expect(findBar()).toBeNull();
  });

  it("never widens the rail to open search, except a desktop icon rail", () => {
    expect(searchWidensRail({ railCompactWidth: RAIL_COMPACT_WIDTH.collapsed }, "compact")).toBe(false);
    expect(searchWidensRail(undefined, "compact")).toBe(false);
    expect(searchWidensRail({ railWidth: RAIL_WIDTH.collapsed }, "phone")).toBe(false);
    expect(searchWidensRail({ railWidth: 300 }, "desktop")).toBe(false);
    expect(searchWidensRail({ railWidth: RAIL_WIDTH.collapsed }, "desktop")).toBe(true);
  });
});

describe("search at desktop width", () => {
  it("stays in the rail", async () => {
    layout.current = "desktop";
    showStory();
    await mount();
    expect(railSearch()).not.toBeNull();
    expect(findBar()).toBeNull();
  });
});
