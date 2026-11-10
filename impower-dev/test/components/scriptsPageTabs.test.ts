import type { Layout } from "@impower/impower-ui/layout";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentSymbol } from "vscode-languageserver-protocol";

const layout = vi.hoisted(() => ({
  value: "phone" as "phone" | "compact" | "desktop",
}));
vi.mock("@impower/impower-ui/layout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@impower/impower-ui/layout")>()),
  useLayout: () => layout.value,
}));

const calls = vi.hoisted(() => [] as string[]);
const scripts = vi.hoisted(() => ({ watch: vi.fn(() => () => {}) }));
const window = vi.hoisted(() => ({
  setListState: vi.fn(),
  navigateTo: vi.fn(),
  openScript: vi.fn(),
  openTrash: vi.fn(),
  finishEditing: vi.fn(() => calls.push("finishEditing")),
  openOutlineLocation: vi.fn(async () => {
    calls.push("openOutlineLocation");
  }),
  setOutlineSceneCollapsed: vi.fn(),
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { scripts, window },
}));

(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: ScriptsPage } = await import("../../src/modules/spark-editor/components/scripts-page");
const { ProblemsDialog } = await import("../../src/modules/spark-editor/components/problems");
const { default: problems } = await import("../../src/modules/spark-editor/workspace/problems/ProblemsStore");

const URI = "file://p/main.sd";
const PANES = workspace.current.panes;

const at = (line: number) => ({
  start: { line, character: 0 },
  end: { line, character: 5 },
});

const scene = (name: string, line: number, children: DocumentSymbol[] = []): DocumentSymbol => ({
  name,
  kind: 5,
  range: { start: { line, character: 0 }, end: { line: line + 3, character: 3 } },
  selectionRange: at(line),
  children,
});

const SYMBOLS: DocumentSymbol[] = [
  scene("harbor", 0, [
    { name: "Where now", kind: 10, range: at(1), selectionRange: at(1) },
    { name: "storm", kind: 11, range: at(2), selectionRange: at(2) },
  ]),
  scene("dock", 4),
];

let host: HTMLDivElement | undefined;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const mount = async () => {
  host ??= document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(ScriptsPage, {}), host!));
  await settle();
};

const unmount = async () => {
  if (host) {
    await act(async () => render(null, host!));
    await settle();
  }
};

const tabs = () => [...host!.querySelectorAll<HTMLElement>('[role="tablist"] [role="tab"]')];
const tabNamed = (name: string) => tabs().find((tab) => tab.textContent!.startsWith(name))!;
const rowButtons = () =>
  [...host!.querySelectorAll<HTMLButtonElement>('[role="listitem"] button[aria-label]')].filter(
    (b) => !b.hasAttribute("aria-expanded") && !b.hasAttribute("data-list-row-badge"),
  );
const rowLabels = () => rowButtons().map((b) => b.getAttribute("aria-label"));
const row = (name: string) => rowButtons().find((b) => b.getAttribute("aria-label")!.startsWith(name))!;
const badgeOf = (button: HTMLElement) =>
  button.parentElement!.querySelector<HTMLButtonElement>("[data-list-row-badge]");
const disclosures = () =>
  [...host!.querySelectorAll<HTMLButtonElement>('[role="listitem"] button[aria-expanded]')].map((b) =>
    b.getAttribute("aria-label"),
  );

const setCaret = (line: number) => {
  const state = workspace.current;
  const logic = state.panes.logic;
  workspace.current = {
    ...state,
    panes: {
      ...state.panes,
      logic: {
        ...logic,
        panel: "main",
        panels: {
          ...logic.panels,
          main: {
            ...logic.panels.main,
            activeEditor: {
              open: true,
              filename: "main.sd",
              selectedRange: { start: { line, character: 1 }, end: { line, character: 1 } },
            },
          },
        },
      },
    },
  };
};

const setCollapsed = (scenes: string[]) => {
  workspace.current = { ...workspace.current, outline: { collapsed: { [URI]: scenes } } };
};
const search = (label: string) => host!.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
};

beforeEach(() => {
  layout.value = "phone";
  workspace.layout.value = layout.value as Layout;
  calls.length = 0;
  vi.clearAllMocks();
  window.setListState.mockImplementation((lists) => {
    workspace.current = { ...workspace.current, lists: { ...workspace.current.lists, ...lists } };
  });
  workspace.current = { ...workspace.current, lists: {}, outline: {}, panes: PANES };
  workspace.outline.value = { uri: URI, symbols: SYMBOLS, diagnostics: [], firstContentLine: 0 };
});

afterEach(async () => {
  await unmount();
  host?.remove();
  host = undefined;
});

describe("the phone Scripts page", () => {
  it("shows All scripts and In this script as tabs, All scripts first", async () => {
    await mount();
    expect(host!.querySelector('[role="tablist"]')).not.toBeNull();
    expect(tabs().map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(tabNamed("All scripts")).toBeTruthy();
    expect(tabNamed("In this script")).toBeTruthy();
    expect(search("Search scripts")).not.toBeNull();
  });

  it("keeps the chosen tab in the page's state", async () => {
    await mount();
    await act(async () => {
      const tab = tabNamed("In this script");
      tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      tab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    expect(workspace.current.lists?.scriptsTab).toBe("outline");
    await unmount();
    await mount();
    expect(tabNamed("In this script").getAttribute("aria-selected")).toBe("true");
  });

  it("lists the open script's scenes and choices, filtered by label, and keeps the search", async () => {
    workspace.current = { ...workspace.current, lists: { scriptsTab: "outline" } };
    await mount();
    expect(rowLabels()).toEqual(["Scene: harbor", "Choose: Where now", "Branch: storm", "Scene: dock"]);
    await type(search("Search this script"), "Storm");
    expect(rowLabels()).toEqual(["Branch: storm"]);
    await type(search("Search this script"), "DOCK");
    expect(rowLabels()).toEqual(["Scene: dock"]);
    expect(workspace.current.lists?.scriptsQueries?.["outline"]).toBe("DOCK");
    await unmount();
    await mount();
    expect(search("Search this script").value).toBe("DOCK");
    expect(rowLabels()).toEqual(["Scene: dock"]);
  });

  it("keeps each tab's search apart", async () => {
    workspace.current = {
      ...workspace.current,
      lists: { scriptsQueries: { all: "chapter", outline: "dock" } },
    };
    await mount();
    expect(search("Search scripts").value).toBe("chapter");
    workspace.current = { ...workspace.current, lists: { ...workspace.current.lists, scriptsTab: "outline" } };
    await settle();
    expect(search("Search this script").value).toBe("dock");
  });

  it("opens Story at the chosen scene in reading mode", async () => {
    workspace.current = { ...workspace.current, lists: { scriptsTab: "outline" } };
    await mount();
    const dock = host!.querySelector<HTMLButtonElement>('button[aria-label="Scene: dock"]')!;
    await act(async () => dock.click());
    await settle();
    expect(calls).toEqual(["finishEditing", "openOutlineLocation"]);
    expect(window.openOutlineLocation).toHaveBeenCalledWith(URI, at(4));
  });

  it("restores each tab's scroll position", async () => {
    workspace.current = { ...workspace.current, lists: { scriptsTab: "outline" } };
    await mount();
    const list = () => host!.querySelector<HTMLElement>('[role="list"]')!.parentElement!;
    await act(async () => {
      list().scrollTop = 40;
      list().dispatchEvent(new Event("scroll"));
    });
    await unmount();
    expect(workspace.current.lists?.scriptsScrolls?.["outline"]).toBe(40);
    await mount();
    expect(list().scrollTop).toBe(40);
  });
});

describe("the In this script tab's rows", () => {
  const STORM_ERROR = {
    range: { start: { line: 2, character: 1 }, end: { line: 2, character: 4 } },
    severity: 1 as const,
    message: "broken",
  };
  const dialog = () =>
    [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) =>
      d.textContent!.includes("Problems to fix"),
    );

  beforeEach(() => {
    workspace.current = { ...workspace.current, lists: { scriptsTab: "outline" } };
  });

  afterEach(async () => {
    await act(async () => problems.closeDialog());
    await new Promise((resolve) => setTimeout(resolve, 250));
  });

  it("badges a scene with an error and opens its scoped Problems from the badge", async () => {
    workspace.outline.value = { uri: URI, symbols: SYMBOLS, diagnostics: [STORM_ERROR], firstContentLine: 0 };
    const dialogHost = document.body.appendChild(document.createElement("div"));
    await act(async () => render(h(ProblemsDialog, null), dialogHost));
    await mount();
    expect(badgeOf(row("Scene: dock"))).toBeNull();
    const storm = badgeOf(row("Branch: storm"))!;
    expect(storm.getAttribute("aria-label")).toBe("1 error in storm");
    const harbor = badgeOf(row("Scene: harbor"))!;
    expect(harbor.getAttribute("aria-label")).toBe("Scene total: 1 error in harbor");
    expect(harbor.getAttribute("aria-haspopup")).toBe("dialog");
    await act(async () => harbor.click());
    expect(dialog()!.querySelector("p")!.textContent).toBe("harbor · 1 error");
    expect(window.openOutlineLocation).not.toHaveBeenCalled();
    await act(async () => render(null, dialogHost));
    dialogHost.remove();
  });

  it("marks the row holding the caret as current, and its scene as containing it", async () => {
    setCaret(2);
    await mount();
    expect(row("Branch: storm").getAttribute("aria-current")).toBe("location");
    expect(row("Scene: harbor").hasAttribute("aria-current")).toBe(false);
    expect(row("Scene: harbor").parentElement!.className.split(/\s+/)).toContain("text-accent");
  });

  it("collapses a scene through the rail's persisted state while the search is empty", async () => {
    setCaret(2);
    await mount();
    expect(disclosures()).toEqual(["Collapse scene harbor"]);
    await act(async () =>
      host!.querySelector<HTMLButtonElement>('button[aria-label="Collapse scene harbor"]')!.click(),
    );
    await vi.waitFor(() => expect(window.setOutlineSceneCollapsed).toHaveBeenCalledWith(URI, "harbor#0", true));
    setCollapsed(["harbor#0"]);
    await settle();
    expect(rowLabels()).toEqual(["Scene: harbor", "Scene: dock"]);
    expect(disclosures()).toEqual(["Expand scene harbor"]);
    expect(row("Scene: harbor").getAttribute("aria-current")).toBe("location");
  });

  it("hides disclosures and lists every match while searching, ignoring collapsed scenes", async () => {
    setCollapsed(["harbor#0"]);
    await mount();
    await type(search("Search this script"), "o");
    expect(disclosures()).toEqual([]);
    expect(rowLabels()).toEqual(["Scene: harbor", "Choose: Where now", "Branch: storm", "Scene: dock"]);
  });
});

describe("the Scripts page off the phone", () => {
  it("has no tabs and shows All scripts", async () => {
    layout.value = "compact";
    workspace.layout.value = layout.value as Layout;
    workspace.current = { ...workspace.current, lists: { scriptsTab: "outline" } };
    await mount();
    expect(host!.querySelector('[role="tablist"]')).toBeNull();
    expect(search("Search scripts")).not.toBeNull();
    expect(search("Search this script")).toBeNull();
  });
});
