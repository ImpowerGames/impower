import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@impower/impower-ui/layout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@impower/impower-ui/layout")>()),
  useLayout: () => "desktop",
}));

const fake = vi.hoisted(() => ({
  watch: vi.fn(() => () => {}),
  watchFacts: vi.fn(() => () => {}),
  watchPicture: vi.fn(() => () => {}),
  measureImages: vi.fn(async (_paths: string[]) => undefined),
  setListState: vi.fn(),
  getFiles: vi.fn(),
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    assets: fake,
    autoRenameFiles: () => false,
    fs: {
      getFiles: fake.getFiles,
      getFolders: async () => ["Assets/Images/Cast"],
      getRelativePath: (_project: string, path: string) => path,
    },
    window: {
      setListState: fake.setListState,
      recordScriptChange: async () => undefined,
      recordAssetChange: async () => undefined,
    },
  },
}));

(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: Assets } = await import("../../src/modules/spark-editor/components/assets");
const { setAssetFiles } = await import("../../src/modules/spark-editor/utils/assetTypes");
const { PROJECT_SETTINGS_SCHEMA } = await import("../../src/modules/spark-editor/workspace/settings/settingsSchema");
const { recordMoves } = await import("../../src/modules/spark-editor/utils/fileUndo");
const { undo, clearUndoHistory } = await import("../../src/modules/spark-editor/utils/undoManager");

const FIRST = "Assets/Images/ava.png";
const MOVED = "Assets/Images/Cast/ava.png";
let host: HTMLDivElement | undefined;
const inspector = () => document.querySelector<HTMLElement>('section[aria-label="Asset details"]');
const frameSrc = () => inspector()?.querySelector("[data-zoom-frame] img")?.getAttribute("src");
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const remove = async (path: string) => {
  await act(async () => {
    const listing = workspace.assetListing.peek()!;
    const files = { ...listing.files };
    delete files[path];
    workspace.assetListing.value = { ...listing, files };
  });
  await settle();
};

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  clearUndoHistory();
  workspace.movesReplayed.value = null;
  workspace.assetSizes.value = {};
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: "p" },
    lists: { assetsFolders: { image: "Assets/Images/Cast" } },
  };
  setAssetFiles({
    imageFiles: PROJECT_SETTINGS_SCHEMA.imageFiles.default,
    audioFiles: PROJECT_SETTINGS_SCHEMA.audioFiles.default,
    videoFiles: PROJECT_SETTINGS_SCHEMA.videoFiles.default,
    fontFiles: PROJECT_SETTINGS_SCHEMA.fontFiles.default,
  });
  workspace.assetListing.value = {
    projectId: "p",
    files: {
      [FIRST]: { src: "/another-ava", modified: 0, size: 99 },
      [MOVED]: { src: "/inspected-ava", modified: 0, size: 100 },
    },
    folders: ["Assets/Images/Cast"],
  };
  fake.getFiles.mockImplementation(async () => workspace.assetListing.peek()!.files);
  fake.setListState.mockImplementation((lists) => {
    workspace.current = { ...workspace.current, lists: { ...workspace.current.lists, ...lists } };
  });
  fake.measureImages.mockImplementation(async (paths: string[]) => {
    const files = workspace.assetListing.peek()!.files;
    workspace.assetSizes.value = {
      ...workspace.assetSizes.peek(),
      ...Object.fromEntries(paths.map((path) => [files[path]!.src!, null])),
    };
  });
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(Assets, {}), host!));
  await settle();
  await act(async () => host!.querySelector<HTMLButtonElement>('button[aria-label^="Open image ava"]')!.click());
  await settle();
});

afterEach(async () => {
  await act(async () => render(null, host!));
  host!.remove();
  host = undefined;
  clearUndoHistory();
  workspace.movesReplayed.value = null;
  vi.restoreAllMocks();
});

describe("an Undo of a move that the workspace refuses", () => {
  it("leaves the inspector on its asset, which closes it when that asset is deleted", async () => {
    expect(frameSrc()).toBe("/inspected-ava");
    recordMoves("p", [{ from: FIRST, to: MOVED }], "ava", "Move");
    let undone: boolean | undefined;
    await act(async () => {
      undone = await undo();
    });
    await settle();
    expect(undone).toBe(false);
    expect(frameSrc()).toBe("/inspected-ava");
    await remove(MOVED);
    expect(inspector()).toBeNull();
  });

  it("closes the inspector when its asset is deleted with no Undo before it", async () => {
    await remove(MOVED);
    expect(inspector()).toBeNull();
  });
});
