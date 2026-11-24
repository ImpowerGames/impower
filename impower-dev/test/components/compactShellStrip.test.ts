import { h, render } from "preact";
import { useEffect } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Route } from "../../src/modules/spark-editor/workspace/routes";

const players = vi.hoisted(() => ({ mounted: 0, unmounted: 0 }));
const collapses = vi.hoisted(() => [] as string[]);

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
vi.mock("../../src/modules/spark-editor/components/share/SharePage", () => ({
  default: () => h("div", { "data-route": "share" }),
}));
vi.mock("../../src/modules/spark-editor/components/settings/SettingsPage", () => ({
  default: () => h("div", { "data-route": "settings" }),
}));
vi.mock(
  "../../src/modules/spark-editor/components/file-dropzone/FileDropzone",
  () => ({ default: () => null }),
);
vi.mock("../../src/modules/spark-editor/workspace/Workspace", async () => {
  const { default: store } =
    await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
  const setShell = (patch: Record<string, number | undefined>) => {
    store.current = {
      ...store.current,
      shell: { ...store.current.shell, ...patch },
    };
  };
  const { shellWindow } = await import("../shellWindow");
  return {
    Workspace: {
      sync: { google: { getCurrentAccount: async () => null } },
      window: shellWindow(() => store, {
        setRailWidth: (railWidth: number | undefined) =>
          setShell({ railWidth }),
        setRailCompactWidth: (railCompactWidth: number | undefined) =>
          setShell({ railCompactWidth }),
        collapsePreviewPane: () => {
          collapses.push("collapse");
        },
      }),
    },
  };
});

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
const { stateForRoute } =
  await import("../../src/modules/spark-editor/workspace/routes");
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
  workspace.current = {
    ...stateForRoute(workspace.current, "story"),
    shell: {},
    preview: { ...workspace.current.preview, revealed: false },
  };
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
    expect(host!.querySelector('aside[aria-label="Preview"] [data-player]')).toBe(player);

    for (const next of [1100, 900, 1101, 1440, 1024, 1366]) {
      await resize(next);
      expect(host!.querySelector("[data-player]")).toBe(player);
      expect(player!.isConnected).toBe(true);
      expect(!!player!.closest("[data-preview-strip-picture]")).toBe(true);
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

  it("reads each layout's own saved rail width when the window crosses 1100px", async () => {
    await resize(1440);
    workspace.current = {
      ...workspace.current,
      shell: { railWidth: 300, railCompactWidth: 76 },
    };
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(h(MainWindow, null), host!));
    await settle();
    expect(railWidth()).toBe("300px");
    await resize(900);
    expect(railWidth()).toBe("76px");
    await resize(1440);
    expect(railWidth()).toBe("300px");
    await act(async () => render(null, host!));
    await resize(900);
    await act(async () => render(h(MainWindow, null), host!));
    await settle();
    expect(railWidth()).toBe("76px");
    await resize(1440);
    expect(railWidth()).toBe("300px");
  });

  it("takes the new default after a reset when the window then changes width", async () => {
    await mount(900);
    const handle = host!.querySelector<HTMLElement>(
      '[role="separator"][aria-label="Resize sidebar"]',
    )!;
    await act(async () => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await settle();
    expect(railWidth()).toBe("76px");
    await resize(1024);
    expect(railWidth()).toBe("190px");
    await resize(1440);
    expect(railWidth()).toBe("232px");
    await act(async () => {
      handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    await settle();
    await resize(900);
    expect(railWidth()).toBe("76px");
  });

  it("lets the project choose the 190px rail in a 768px window", async () => {
    const clientWidth = vi
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockImplementation(() => width);
    try {
      await mount(768);
      expect(railWidth()).toBe("76px");
      await act(async () => {
        workspace.current = {
          ...workspace.current,
          shell: { railCompactWidth: 190 },
        };
      });
      await settle();
      expect(railWidth()).toBe("190px");
      await resize(701);
      expect(railWidth()).toBe("190px");
    } finally {
      clientWidth.mockRestore();
    }
  });

  it.each([768, 1024])("draws the prototype's 104px strip above the page at %ipx, with no divider, collapse or saved height", async (at) => {
    await mount(at);
    await act(async () => {
      workspace.current = { ...workspace.current, shell: { stripHeight: 320 } as never };
    });
    await settle();
    const end = host!.querySelector<HTMLElement>('[data-panel="end"]')!;
    expect(end.style.display).not.toBe("none");
    expect(end.style.flexBasis).toBe("var(--preview-strip-tablet-height)");
    expect(end.parentElement!.className).toContain("flex-col-reverse");
    const strip = end.querySelector<HTMLElement>("[data-preview-strip]")!;
    expect(strip.hasAttribute("data-docked")).toBe(false);
    expect(strip.className).toContain("h-[var(--preview-strip-tablet-height)]");
    expect(strip.querySelector("[data-preview-strip-picture]")!.className).toContain("h-[83px]");
    expect(strip.querySelector('button[aria-label="Play from this line"]')).not.toBeNull();
    expect(host!.querySelector("[data-phone-strip]")).toBeNull();
    expect(host!.querySelector('[role="separator"][aria-label^="Resize"]:not(.hidden)')?.getAttribute("aria-label")).toBe("Resize sidebar");
    expect(host!.querySelector("[data-split]")).toBeNull();
    expect(host!.querySelector('aside[aria-label="Preview"] [data-preview-strip]')).toBe(strip);
  });

  const goTo = async (route: Route) => {
    await act(async () => {
      workspace.current = stateForRoute(workspace.current, route);
    });
    await settle();
  };

  it.each([768, 1024])("gives Scripts, Assets, Settings and Share the whole workspace at %ipx and shows the strip again on Story, with the one player", async (at) => {
    players.mounted = 0;
    players.unmounted = 0;
    await mount(at);
    const end = () => host!.querySelector<HTMLElement>('[data-panel="end"]')!;
    const player = host!.querySelector("[data-player]");
    expect(end().style.display).not.toBe("none");

    for (const [route, page] of [
      ["scripts", "logic"],
      ["assets", "assets"],
      ["settings", "settings"],
      ["share", "share"],
    ] as const) {
      await goTo(route);
      expect(end().style.display).toBe("none");
      expect(host!.querySelector(`[data-panel="start"] [data-route="${page}"]`)).not.toBeNull();
      await goTo("story");
      expect(end().style.display).not.toBe("none");
      expect(end().style.flexBasis).toBe("var(--preview-strip-tablet-height)");
    }

    expect(host!.querySelector("[data-player]")).toBe(player);
    expect(players.mounted).toBe(1);
    expect(players.unmounted).toBe(0);
  });

  it.each(["scripts", "assets", "settings", "share"] as const)("closes the full view when %s takes the strip off the page at 768", async (route) => {
    await mount(768);
    collapses.length = 0;
    await act(async () => {
      workspace.current = {
        ...workspace.current,
        preview: { ...workspace.current.preview, revealed: true },
      };
    });
    await settle();
    expect(collapses).toEqual([]);
    await goTo(route);
    expect(collapses).toEqual(["collapse"]);
  });

  it("keeps the phone's shorter strip in the title area at 430", async () => {
    await mount(430);
    const strip = host!.querySelector<HTMLElement>("[data-phone-strip] [data-preview-strip]")!;
    expect(strip.className).toContain("h-[var(--preview-strip-height)]");
    expect(strip.querySelector("[data-preview-strip-picture]")!.className).toContain("h-[72px]");
    expect(host!.querySelectorAll("[data-preview-strip]")).toHaveLength(1);
  });

  it("keeps the docked preview and its divider beside Share on the desktop layout, with no strip chrome", async () => {
    await mount(1440);
    await act(async () => {
      workspace.current = { ...workspace.current, pane: "share" };
    });
    await settle();
    expect(host!.querySelector<HTMLElement>('[data-panel="end"]')!.style.display).not.toBe("none");
    const strip = host!.querySelector<HTMLElement>('aside[aria-label="Preview"] [data-preview-strip]')!;
    expect(strip.hasAttribute("data-docked")).toBe(true);
    expect(strip.querySelector("[data-preview-strip-copy]")).toBeNull();
    expect(strip.querySelector('button[aria-label="Play from this line"]')).toBeNull();
    expect(strip.querySelector("[data-player]")).not.toBeNull();
    expect(
      host!.querySelector('[role="separator"][aria-label="Resize page and preview panes"]')!.className,
    ).not.toContain("hidden");
  });

  it.each([768, 1024])("keeps editing at %ipx while a menu or popover takes the focus", async (at) => {
    await mount(at);
    await act(async () => {
      workspace.scriptMode.value = "editing";
    });
    await settle();
    const shell = host!.querySelector<HTMLElement>("[data-editing]")!;
    expect(shell).not.toBeNull();
    expect(host!.querySelector("[data-phone-shell]")).toBeNull();
    for (const role of ["menu", "dialog"]) {
      const surface = document.body.appendChild(document.createElement("div"));
      surface.setAttribute("role", role);
      const item = surface.appendChild(document.createElement("button"));
      await act(async () => item.focus());
      await settle();
      expect(workspace.scriptMode.value).toBe("editing");
      surface.remove();
    }
    await act(async () => {
      workspace.scriptMode.value = "reading";
    });
    await settle();
    expect(shell.hasAttribute("data-editing")).toBe(false);
  });
});
