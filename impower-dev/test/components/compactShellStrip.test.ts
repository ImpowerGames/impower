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
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    sync: { google: { getCurrentAccount: async () => null } },
    window: {
      setAccount: () => {},
      loadProject: async () => {},
      navigateTo: () => {},
      closeSettings: () => {},
      setAppMenuOpen: () => {},
      setRailWidth: () => {},
      setRailCompactWidth: () => {},
      setStripHeight: () => {},
    },
  },
}));

let width = 1440;
const listeners = new Set<() => void>();

beforeAll(() => {
  window.matchMedia = (query: string) => {
    const minWidth = /\(min-width: (\d+)px\)/.exec(query);
    return {
      get matches() {
        return minWidth ? width >= Number(minWidth[1]) : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
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

const resize = async (next: number) => {
  width = next;
  await act(async () => {
    listeners.forEach((listener) => listener());
  });
  await settle();
};

const mount = async (at: number) => {
  await resize(at);
  workspace.current = { ...workspace.current, pane: "logic", shell: {} };
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(MainWindow, null), host!));
  await settle();
};

const railWidth = () =>
  host!
    .querySelector<HTMLElement>("[data-sidebar]")!
    .style.getPropertyValue("--sidebar-width");

describe("the compact layout", () => {
  it("keeps the same player element when the window crosses 1100px and back", async () => {
    players.mounted = 0;
    players.unmounted = 0;
    await mount(1440);
    const player = host!.querySelector("[data-player]");
    expect(player).not.toBeNull();

    for (const next of [1100, 900, 1101, 1440]) {
      await resize(next);
      expect(host!.querySelector("[data-player]")).toBe(player);
      expect(player!.isConnected).toBe(true);
    }
    expect(players.mounted).toBe(1);
    expect(players.unmounted).toBe(0);
  });

  it("keeps the top bar and rail from 701 to 1100 and drops the bottom tabs", async () => {
    await mount(900);
    expect(document.documentElement.dataset["layout"]).toBe("compact");
    expect(host!.querySelector("header")).not.toBeNull();
    expect(host!.querySelector('aside[aria-label="Sidebar"]')).not.toBeNull();
    expect(host!.querySelector('[class*="h-[60px]"]')).toBeNull();
  });

  it("defaults the rail to the icon rail up to 1000px and to 190px from 1001px", async () => {
    await mount(1000);
    expect(railWidth()).toBe("76px");
    await resize(1001);
    expect(railWidth()).toBe("190px");
    await resize(1100);
    expect(railWidth()).toBe("190px");
    await resize(1101);
    expect(railWidth()).toBe("232px");
  });

  it("follows the project's own rail choice over the default", async () => {
    await mount(1050);
    await act(async () => {
      workspace.current = {
        ...workspace.current,
        shell: { railCompactWidth: 76 },
      };
    });
    await settle();
    expect(railWidth()).toBe("76px");
    await resize(900);
    await act(async () => {
      workspace.current = {
        ...workspace.current,
        shell: { railCompactWidth: 190 },
      };
    });
    await settle();
    expect(railWidth()).toBe("190px");
  });
});
