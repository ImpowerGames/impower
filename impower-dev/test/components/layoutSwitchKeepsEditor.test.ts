import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/spark-editor/components/preview/Preview", () => ({
  default: () => h("div", { "data-player": "" }),
}));
vi.mock("../../src/modules/spark-editor/components/logic/Logic", () => ({
  default: () =>
    h(
      "div",
      { "data-route": "logic" },
      h("div", {
        "data-script": "",
        contentEditable: "true",
        tabIndex: 0,
      }),
    ),
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
      window: shellWindow(() => store, {}),
    },
  };
});

let width = 430;
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

const script = () => host!.querySelector<HTMLElement>("[data-script]");

describe("switching between the phone and compact layouts", () => {
  it("keeps the focused script mounted and focused when a phone rotates to landscape and back", async () => {
    await mount(430);
    const editor = script();
    expect(editor).not.toBeNull();
    await act(async () => {
      workspace.scriptMode.value = "editing";
      editor!.focus();
    });
    expect(document.activeElement).toBe(editor);

    for (const next of [932, 430, 932, 430]) {
      await resize(next);
      expect(script()).toBe(editor);
      expect(editor!.isConnected).toBe(true);
      expect(document.activeElement).toBe(editor);
      expect(workspace.scriptMode.value).toBe("editing");
    }
    expect(
      host!.querySelector("[data-phone-shell]")!.hasAttribute("data-editing"),
    ).toBe(true);
  });
});
