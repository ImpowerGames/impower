import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/spark-editor/components/preview/Preview", () => ({
  default: () => h("div", { "data-player": "" }),
}));
vi.mock("../../src/modules/spark-editor/components/logic/Logic", () => ({
  default: () => h("div", { "data-route": "logic" }),
}));
vi.mock("../../src/modules/spark-editor/components/assets/Assets", () => ({
  default: () => h("div", { "data-route": "assets" }),
}));
vi.mock("../../src/modules/spark-editor/components/share/Share", () => ({
  default: () => h("div", { "data-route": "share" }),
}));
vi.mock("../../src/modules/spark-editor/components/header-navigation/HeaderNavigation", () => ({
  default: () => h("header", null),
}));
vi.mock("../../src/modules/spark-editor/components/asset-inspector/AssetInspectorPane", () => ({
  default: () => null,
}));
vi.mock("../../src/modules/spark-editor/components/file-dropzone/FileDropzone", () => ({
  default: () => null,
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", async () => {
  const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
  const { stateForRoute } = await import("../../src/modules/spark-editor/workspace/routes");
  return {
    Workspace: {
      sync: { google: { getCurrentAccount: async () => null } },
      window: {
        setAccount: () => {},
        loadProject: async () => {},
        navigateTo: (route: Parameters<typeof stateForRoute>[1]) => {
          workspace.current = stateForRoute(workspace.current, route);
        },
      },
    },
  };
});

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
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
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.scrollTo ??= (() => {}) as unknown as HTMLElement["scrollTo"];
});

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { stateForRoute } = await import("../../src/modules/spark-editor/workspace/routes");
const { default: MainWindow } = await import("../../src/modules/spark-editor/components/main-window/MainWindow");

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

const bottomTab = (label: string) =>
  [...host!.querySelectorAll<HTMLElement>('[role="tab"]')].find((tab) => tab.textContent?.includes(label))!;

describe("the compact and phone bottom tabs on the Settings page", () => {
  it.each([
    ["logic", "Logic", "logic"],
    ["assets", "Assets", "assets"],
  ] as const)("selects no tab over %s and returns to it when its own tab is pressed", async (pane, label, route) => {
    workspace.current = stateForRoute({ ...workspace.current, pane }, "project");
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(h(MainWindow, null), host!));
    await settle();
    expect(host.querySelector("#settings-page")).not.toBeNull();
    expect(host.querySelector('[role="tab"][aria-selected="true"]')).toBeNull();
    const tab = bottomTab(label);
    await act(async () => {
      tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      tab.click();
    });
    await settle();
    expect(workspace.current.screen.settingsOpen).toBe(false);
    expect(host.querySelector("#settings-page")).toBeNull();
    expect(host.querySelector(`[data-route="${route}"]`)).not.toBeNull();
  });
});
