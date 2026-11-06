import { h, render } from "preact";
import { useEffect } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const players = vi.hoisted(() => ({ mounted: 0, unmounted: 0 }));

vi.mock("../../src/modules/spark-editor/components/preview/Preview", () => ({
  default: function Preview() {
    useEffect(() => {
      players.mounted += 1;
      return () => {
        players.unmounted += 1;
      };
    }, []);
    return h("div", { "data-player": "" });
  },
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
vi.mock(
  "../../src/modules/spark-editor/components/asset-inspector/AssetInspectorPane",
  () => ({ default: () => null }),
);
vi.mock(
  "../../src/modules/spark-editor/components/file-dropzone/FileDropzone",
  () => ({ default: () => null }),
);
vi.mock("../../src/modules/spark-editor/workspace/Workspace", async () => {
  const { default: workspace } =
    await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
  const { stateForRoute } =
    await import("../../src/modules/spark-editor/workspace/routes");
  return {
    Workspace: {
      sync: { google: { getCurrentAccount: async () => null } },
      window: {
        setAccount: () => {},
        loadProject: async () => {},
        navigateTo: (route: Parameters<typeof stateForRoute>[1]) => {
          workspace.current = stateForRoute(workspace.current, route);
        },
        closeSettings: () => {
          workspace.current = stateForRoute(workspace.current, "write");
        },
        setAppMenuOpen: () => {},
        setRailWidth: () => {},
      },
    },
  };
});

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

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: MainWindow } =
  await import("../../src/modules/spark-editor/components/main-window/MainWindow");

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

const railTab = (label: string) =>
  [...host!.querySelectorAll<HTMLElement>('aside [role="tab"]')].find((tab) =>
    tab.textContent?.startsWith(label),
  )!;

const pressTab = async (tab: HTMLElement) => {
  await act(async () => {
    tab.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    tab.click();
  });
  await settle();
};

describe("the desktop shell's docked preview", () => {
  it("keeps one player instance through every route", async () => {
    workspace.current = { ...workspace.current, pane: "logic" };
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(h(MainWindow, null), host!));
    await settle();

    expect(host.querySelector("header")).not.toBeNull();
    expect(host.querySelector('aside[aria-label="Sidebar"]')).not.toBeNull();
    expect(host.querySelector('[class*="h-[60px]"]')).toBeNull();
    const player = host.querySelector("[data-player]");
    expect(player).not.toBeNull();
    expect(players.mounted).toBe(1);

    for (const [label, route] of [
      ["Assets", "assets"],
      ["Share", "share"],
      ["Story", "logic"],
    ] as const) {
      await pressTab(railTab(label));
      expect(host.querySelector(`[data-route="${route}"]`)).not.toBeNull();
      expect(host.querySelector("[data-player]")).toBe(player);
    }

    await act(async () => {
      workspace.current = {
        ...workspace.current,
        screen: { ...workspace.current.screen, settingsOpen: true },
      };
    });
    await settle();
    expect(host.querySelector("#settings-page")).not.toBeNull();
    expect(host.querySelector('aside [data-index-jump="save-settings"]')).not.toBeNull();
    expect(host.querySelector('aside [role="tab"][aria-selected="true"]')).toBeNull();
    expect(host.querySelector("[data-player]")).toBe(player);

    expect(players.mounted).toBe(1);
    expect(players.unmounted).toBe(0);
  });
});
