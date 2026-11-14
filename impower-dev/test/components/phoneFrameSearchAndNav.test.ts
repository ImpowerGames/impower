import type { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

vi.mock(
  "../../src/modules/spark-editor/components/desktop-shell/workspaceWindow",
  () => ({
    withWindow: async (act: (win: unknown) => unknown) => {
      await act({
        navigateTo: async (route: string) => {
          await Promise.resolve();
          calls.push(`navigate:${route}`);
        },
      });
    },
  }),
);

vi.mock(
  "../../src/modules/spark-editor/components/find-references-rename",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    openFind: () => calls.push("find"),
  }),
);

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const { default: PhoneTitleBar } =
  await import("../../src/modules/spark-editor/components/desktop-shell/PhoneTitleBar");
const { default: BottomNavigation } =
  await import("../../src/modules/spark-editor/components/desktop-shell/BottomNavigation");
const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { stateForRoute } =
  await import("../../src/modules/spark-editor/workspace/routes");

let host: HTMLDivElement | undefined;

const mount = async (component: Parameters<typeof h>[0]) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(component, null), host!));
  return host;
};

const showRoute = (route: Parameters<typeof stateForRoute>[1]) => {
  workspace.state.value = stateForRoute(
    workspace.state.value as WorkspaceCache,
    route,
  );
};

const tapSearch = async (bar: HTMLElement) => {
  const search = bar.querySelector<HTMLButtonElement>(
    'button[aria-label="Search"]',
  );
  expect(search).not.toBeNull();
  await act(async () => {
    search!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return search!;
};

describe("the phone frame", () => {
  afterEach(async () => {
    calls.length = 0;
    if (host) {
      await act(async () => render(null, host!));
      host = undefined;
    }
    document.body.innerHTML = "";
  });

  it.each(["scripts", "collection", "share", "project"] as const)(
    "on the %s page, Search goes to the Story first and opens find there",
    async (route) => {
      showRoute(route);
      const search = await tapSearch(await mount(PhoneTitleBar));
      expect(calls).toEqual(["navigate:write", "find"]);
      expect(search.classList).toContain("text-muted");
    },
  );

  it("on the Story, Search opens find where the author is", async () => {
    showRoute("write");
    await tapSearch(await mount(PhoneTitleBar));
    expect(calls).toEqual(["find"]);
  });

  it("draws the App menu button in ink", async () => {
    showRoute("collection");
    const menu = (await mount(PhoneTitleBar)).querySelector(
      'button[aria-label="App menu"]',
    )!;
    expect(menu.classList).toContain("text-ink");
    expect(menu.classList).not.toContain("text-muted");
  });

  it("draws the bottom navigation on the page background", async () => {
    showRoute("collection");
    const nav = (await mount(BottomNavigation)).querySelector(
      "[data-bottom-navigation]",
    )!;
    expect(nav.classList).toContain("bg-bg");
    expect(nav.classList).not.toContain("bg-panel");
  });
});
