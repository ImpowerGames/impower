import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Screen = { width: number; touch: boolean };

let screen: Screen;
let lists: { query: string; list: MediaQueryList; fire: () => void }[];
let host: HTMLDivElement | undefined;

const matches = (query: string): boolean => {
  if (query === "(hover: none) and (pointer: coarse)") {
    return screen.touch;
  }
  const minWidth = /^\(min-width: (\d+)px\)$/.exec(query);
  if (minWidth) {
    return screen.width >= Number(minWidth[1]);
  }
  return false;
};

const stubMatchMedia = () => {
  lists = [];
  vi.stubGlobal("matchMedia", (query: string) => {
    const listeners = new Set<() => void>();
    const list = {
      media: query,
      get matches() {
        return matches(query);
      },
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
    } as unknown as MediaQueryList;
    lists.push({ query, list, fire: () => listeners.forEach((l) => l()) });
    return list;
  });
};

const resize = async (next: Partial<Screen>) => {
  screen = { ...screen, ...next };
  await act(async () => {
    lists.forEach((entry) => entry.fire());
  });
};

const loadLayout = async () => {
  vi.resetModules();
  return import("@impower/impower-ui/layout");
};

const mountProbe = async () => {
  const { useLayout, useCoarsePointer } = await loadLayout();
  const Probe = () =>
    h("output", {
      "data-layout-value": useLayout(),
      "data-coarse-value": String(useCoarsePointer()),
    });
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => {
    render(h(Probe, null), host!);
  });
  const output = host.querySelector("output")!;
  return {
    layout: () => output.getAttribute("data-layout-value"),
    coarse: () => output.getAttribute("data-coarse-value"),
  };
};

beforeEach(() => {
  screen = { width: 1440, touch: false };
  stubMatchMedia();
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  delete document.documentElement.dataset["layout"];
  delete document.documentElement.dataset["pointer"];
  vi.unstubAllGlobals();
});

describe("useLayout", () => {
  it.each([
    [1440, "desktop"],
    [1101, "desktop"],
    [1100, "compact"],
    [768, "compact"],
    [701, "compact"],
    [700, "phone"],
    [360, "phone"],
  ])("reads %ipx as the %s layout", async (width, expected) => {
    screen.width = width;
    const probe = await mountProbe();
    expect(probe.layout()).toBe(expected);
    expect(document.documentElement.dataset["layout"]).toBe(expected);
  });

  it("follows the window across the breakpoint and keeps data-layout in sync", async () => {
    const probe = await mountProbe();
    expect(probe.layout()).toBe("desktop");

    await resize({ width: 600 });
    expect(probe.layout()).toBe("phone");
    expect(document.documentElement.dataset["layout"]).toBe("phone");

    await resize({ width: 900 });
    expect(probe.layout()).toBe("compact");
    expect(document.documentElement.dataset["layout"]).toBe("compact");

    await resize({ width: 1200 });
    expect(probe.layout()).toBe("desktop");
    expect(document.documentElement.dataset["layout"]).toBe("desktop");
  });

  it("decides the tier in one place for components and plain code", async () => {
    const { layoutState } = await loadLayout();
    screen.width = 700;
    expect(layoutState.current()).toBe("phone");
    const seen: string[] = [];
    const unsubscribe = layoutState.subscribe((layout) => seen.push(layout));
    await resize({ width: 1000 });
    await resize({ width: 1200 });
    unsubscribe();
    await resize({ width: 500 });
    expect(seen).toEqual(["compact", "desktop"]);
  });
});

describe("useCoarsePointer", () => {
  it("is independent of width: a narrow window with a mouse is fine", async () => {
    screen = { width: 360, touch: false };
    const probe = await mountProbe();
    expect(probe.layout()).toBe("phone");
    expect(probe.coarse()).toBe("false");
    expect(document.documentElement.dataset["pointer"]).toBe("fine");
  });

  it("is independent of width: a wide touch screen is coarse", async () => {
    screen = { width: 1440, touch: true };
    const probe = await mountProbe();
    expect(probe.layout()).toBe("desktop");
    expect(probe.coarse()).toBe("true");
    expect(document.documentElement.dataset["pointer"]).toBe("coarse");
  });

  it("follows a pointer change and keeps data-pointer in sync", async () => {
    const probe = await mountProbe();
    expect(probe.coarse()).toBe("false");
    await resize({ touch: true });
    expect(probe.coarse()).toBe("true");
    expect(document.documentElement.dataset["pointer"]).toBe("coarse");
  });

  it("ignores the user agent and touch points", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile",
      maxTouchPoints: 10,
    });
    const probe = await mountProbe();
    expect(probe.coarse()).toBe("false");
  });
});
