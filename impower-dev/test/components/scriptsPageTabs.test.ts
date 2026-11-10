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

const URI = "file://p/main.sd";

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
  scene("harbor", 0, [{ name: "Where now", kind: 10, range: at(1), selectionRange: at(1) }]),
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
const rowLabels = () =>
  [...host!.querySelectorAll<HTMLButtonElement>('[role="listitem"] button[aria-label]')].map((b) =>
    b.getAttribute("aria-label"),
  );
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
  calls.length = 0;
  vi.clearAllMocks();
  window.setListState.mockImplementation((lists) => {
    workspace.current = { ...workspace.current, lists: { ...workspace.current.lists, ...lists } };
  });
  workspace.current = { ...workspace.current, lists: {} };
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
    expect(rowLabels()).toEqual(["Scene: harbor", "Choose: Where now", "Scene: dock"]);
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

describe("the Scripts page off the phone", () => {
  it("has no tabs and shows All scripts", async () => {
    layout.value = "compact";
    workspace.current = { ...workspace.current, lists: { scriptsTab: "outline" } };
    await mount();
    expect(host!.querySelector('[role="tablist"]')).toBeNull();
    expect(search("Search scripts")).not.toBeNull();
    expect(search("Search this script")).toBeNull();
  });
});
