import { h, render } from "preact";
import { useEffect } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const scripts = vi.hoisted(() => ({ mounted: 0, unmounted: 0 }));

vi.mock("../../src/modules/spark-editor/components/preview/Preview", () => ({
  default: () => h("div", { "data-player": "" }),
}));
vi.mock("../../src/modules/spark-editor/components/logic/Logic", () => ({
  default: function Logic() {
    useEffect(() => {
      scripts.mounted += 1;
      return () => {
        scripts.unmounted += 1;
      };
    }, []);
    return h("div", { "data-route": "logic" });
  },
}));
vi.mock("../../src/modules/spark-editor/components/assets/Assets", () => ({
  default: () => h("div", { "data-route": "assets" }),
}));
vi.mock("../../src/modules/spark-editor/components/share/SharePage", () => ({
  default: () => h("div", { "data-route": "share" }),
}));
vi.mock(
  "../../src/modules/spark-editor/components/file-dropzone/FileDropzone",
  () => ({ default: () => null }),
);
vi.mock("../../src/modules/spark-editor/workspace/Workspace", async () => {
  const { default: store } =
    await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
  const { shellWindow } = await import("../shellWindow");
  return {
    Workspace: {
      sync: { google: { getCurrentAccount: async () => null } },
      window: shellWindow(() => store),
    },
  };
});

const FULL_HEIGHT = 393;
const LANDSCAPE_WIDTH = 887;

let width = LANDSCAPE_WIDTH;
let visibleHeight = FULL_HEIGHT;
const mediaListeners = new Set<() => void>();
const viewportListeners = new Map<string, Set<() => void>>();

beforeAll(() => {
  window.matchMedia = (query: string) => {
    const minWidth = /\(min-width: (\d+)px\)/.exec(query);
    return {
      get matches() {
        if (minWidth) {
          return width >= Number(minWidth[1]);
        }
        return query.includes("pointer: coarse");
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, listener: () => void) =>
        mediaListeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        mediaListeners.delete(listener),
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
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    get: () => width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    get: () => FULL_HEIGHT,
  });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: {
      get height() {
        return visibleHeight;
      },
      offsetTop: 0,
      scale: 1,
      addEventListener: (type: string, listener: () => void) => {
        if (!viewportListeners.has(type)) {
          viewportListeners.set(type, new Set());
        }
        viewportListeners.get(type)!.add(listener);
      },
      removeEventListener: (type: string, listener: () => void) =>
        viewportListeners.get(type)?.delete(listener),
    },
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
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
  visibleHeight = FULL_HEIGHT;
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

const showKeyboard = async (visible: number) => {
  visibleHeight = visible;
  await act(async () => {
    viewportListeners.get("resize")?.forEach((listener) => listener());
  });
  await settle();
};

const mount = async () => {
  await act(async () => {
    mediaListeners.forEach((listener) => listener());
  });
  workspace.current = { ...workspace.current, pane: "logic", shell: {} };
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(MainWindow, null), host!));
  await settle();
};

const shown = (element: Element | null) => {
  for (let at = element; at; at = at.parentElement) {
    if (
      (at as HTMLElement).hidden ||
      at.classList.contains("hidden") ||
      (at as HTMLElement).style.display === "none"
    ) {
      return false;
    }
  }
  return !!element;
};

const room = () => ({
  scriptOnly: host!.querySelector("[data-script-only]") !== null,
  topBar: shown(host!.querySelector("header")),
  strip: shown(host!.querySelector('[data-panel="end"]')),
  resizer: shown(host!.querySelector('[aria-label="Resize preview"]')),
  script: shown(host!.querySelector('[data-route="logic"]')),
});

describe("the compact layout with the on-screen keyboard open on a short page", () => {
  it("gives the script the page while the keyboard leaves less than the strip's reserve, without remounting it", async () => {
    scripts.mounted = 0;
    scripts.unmounted = 0;
    await mount();
    expect(document.documentElement.dataset["layout"]).toBe("compact");
    const script = host!.querySelector('[data-route="logic"]');
    expect(room()).toEqual({
      scriptOnly: false,
      topBar: true,
      strip: true,
      resizer: true,
      script: true,
    });

    await showKeyboard(85);
    expect(room()).toEqual({
      scriptOnly: true,
      topBar: false,
      strip: false,
      resizer: false,
      script: true,
    });

    await showKeyboard(FULL_HEIGHT);
    expect(room()).toEqual({
      scriptOnly: false,
      topBar: true,
      strip: true,
      resizer: true,
      script: true,
    });
    expect(host!.querySelector('[data-route="logic"]')).toBe(script);
    expect(scripts.mounted).toBe(1);
    expect(scripts.unmounted).toBe(0);
  });

  it("keeps the top bar and strip when the page above the keyboard holds the strip's reserve", async () => {
    await mount();
    await showKeyboard(240);
    expect(room()).toEqual({
      scriptOnly: false,
      topBar: true,
      strip: true,
      resizer: true,
      script: true,
    });
  });
});
