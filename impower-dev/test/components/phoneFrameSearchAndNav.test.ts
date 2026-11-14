import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

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

let host: HTMLDivElement | undefined;

const mount = async (component: Parameters<typeof h>[0]) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(component, null), host!));
  return host;
};

const showPane = (pane: "logic" | "assets" | "share") => {
  workspace.state.value = { ...workspace.state.value, pane };
};

describe("the phone frame", () => {
  afterEach(async () => {
    if (host) {
      await act(async () => render(null, host!));
      host = undefined;
    }
    document.body.innerHTML = "";
  });

  it.each(["assets", "share"] as const)(
    "shows Search in the title bar on the %s page, beside the menu in ink",
    async (pane) => {
      showPane(pane);
      const bar = await mount(PhoneTitleBar);
      const search = bar.querySelector<HTMLButtonElement>(
        'button[aria-label="Search"]',
      );
      expect(search).not.toBeNull();
      expect(search!.classList).toContain("text-muted");
      const menu = bar.querySelector('button[aria-label="App menu"]')!;
      expect(menu.classList).toContain("text-ink");
      expect(menu.classList).not.toContain("text-muted");
    },
  );

  it("draws the bottom navigation on the page background", async () => {
    showPane("assets");
    const nav = (await mount(BottomNavigation)).querySelector(
      "[data-bottom-navigation]",
    )!;
    expect(nav.classList).toContain("bg-bg");
    expect(nav.classList).not.toContain("bg-panel");
  });
});
