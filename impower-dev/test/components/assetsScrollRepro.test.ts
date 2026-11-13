import { h, options, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@impower/impower-ui/layout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@impower/impower-ui/layout")>()),
  useLayout: () => "desktop" as const,
}));

const assets = vi.hoisted(() => ({
  watch: vi.fn(() => () => {}),
  upload: vi.fn(async (): Promise<string[]> => []),
  addLink: vi.fn(async () => ""),
  createFolder: vi.fn(async () => ""),
  rename: vi.fn(async () => ""),
  remove: vi.fn(async () => undefined),
  measureImages: vi.fn(async (_paths: string[]) => undefined),
  requestDuration: vi.fn((_path: string) => () => {}),
  watchFacts: vi.fn((_paths: string[]) => () => {}),
  watchPicture: vi.fn((_path: string, _variant: unknown, _size: number, _listener: (src: string | null) => void) => () => {}),
}));
const window = vi.hoisted(() => ({
  setListState: vi.fn(),
  navigateTo: vi.fn(),
  openTrash: vi.fn(),
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { assets, window },
}));

(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: Assets } = await import("../../src/modules/spark-editor/components/assets");
const { setAssetFiles } = await import("../../src/modules/spark-editor/utils/assetTypes");
const { PROJECT_SETTINGS_SCHEMA } = await import(
  "../../src/modules/spark-editor/workspace/settings/settingsSchema"
);

const PROJECT = "p";
const VIEWPORT = 580;

let host: HTMLDivElement | undefined;

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.getAttribute("aria-label") === null && this.firstElementChild?.getAttribute("role") === "list"
        ? VIEWPORT
        : 0;
    },
  });
  window.setListState.mockImplementation((lists) => {
    workspace.current = { ...workspace.current, lists: { ...workspace.current.lists, ...lists } };
  });
  setAssetFiles({
    imageFiles: PROJECT_SETTINGS_SCHEMA.imageFiles.default,
    audioFiles: PROJECT_SETTINGS_SCHEMA.audioFiles.default,
    videoFiles: PROJECT_SETTINGS_SCHEMA.videoFiles.default,
    fontFiles: PROJECT_SETTINGS_SCHEMA.fontFiles.default,
  });
  const files: Record<string, { modified: number; size: number; src: string }> = {};
  for (let i = 1; i <= 40; i += 1) {
    const path = `Assets/Audio/track_${String(i).padStart(3, "0")}.wav`;
    files[path] = { modified: Date.now(), size: 204, src: `/p/${i}` };
  }
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: PROJECT },
    lists: { assetsType: "audio" },
  };
  workspace.assetListing.value = { projectId: PROJECT, files, folders: [] };
});

afterEach(async () => {
  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("the Assets list scroll position", () => {
  it("keeps the position after a scroll when the list re-renders in the scroll event's dispatch", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(h(Assets, {}), host!));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const scroller = host.querySelector('[role="list"]')!.parentElement as HTMLDivElement;
    expect(scroller.querySelectorAll("[data-asset-path]").length).toBeGreaterThan(0);
    const previous = options.debounceRendering;
    options.debounceRendering = (callback) => callback();
    try {
      const positions: number[] = [];
      for (const top of [300, 600, 900]) {
        scroller.scrollTop = top;
        scroller.dispatchEvent(new Event("scroll"));
        positions.push(scroller.scrollTop);
      }
      expect(positions).toEqual([300, 600, 900]);
    } finally {
      options.debounceRendering = previous;
    }
  });
});
