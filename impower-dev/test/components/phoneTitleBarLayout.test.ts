import type { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
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
const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { stateForRoute } =
  await import("../../src/modules/spark-editor/workspace/routes");

let host: HTMLDivElement | undefined;

const mountOn = async (route: Parameters<typeof stateForRoute>[1]) => {
  workspace.state.value = stateForRoute(
    workspace.state.value as WorkspaceCache,
    route,
  );
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(PhoneTitleBar, { scrolled: false }), host!));
  return host.querySelector<HTMLElement>("[data-phone-title-bar]")!;
};

const clusterOf = (bar: HTMLElement) =>
  bar.querySelector('button[aria-label="Search"]')!.parentElement!;

describe("the phone title bar's layout", () => {
  afterEach(async () => {
    if (host) {
      await act(async () => render(null, host!));
      host = undefined;
    }
    document.body.innerHTML = "";
  });

  it("puts the logo in a 44px box", async () => {
    const bar = await mountOn("collection");
    const logo = bar.querySelector('[aria-label="Spark Engine"]')!;
    expect(logo.parentElement!.classList).toContain("size-11");
  });

  it.each(["scripts", "collection", "share", "project"] as const)(
    "on the %s page, insets the bar 10px and spaces its children and icons 7px",
    async (route) => {
      const bar = await mountOn(route);
      expect(bar.classList).toContain("px-2.5");
      expect(bar.classList).toContain("gap-[7px]");
      expect(clusterOf(bar).classList).toContain("gap-[7px]");
    },
  );

  it("on the Story, insets the bar 8px and 4px with no gap, as the bar that carries the edit history", async () => {
    const bar = await mountOn("write");
    expect(bar.classList).toContain("pl-2");
    expect(bar.classList).toContain("pr-1");
    expect(bar.classList).not.toContain("gap-[7px]");
    expect(clusterOf(bar).classList).not.toContain("gap-[7px]");
  });
});
