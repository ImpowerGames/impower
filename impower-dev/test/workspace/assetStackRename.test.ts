import { beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => ({ fs: null as unknown, window: null as unknown }));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    get fs() {
      return shared.fs;
    },
    get window() {
      return shared.window;
    },
  },
}));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: WorkspaceAssets } = await import("../../src/modules/spark-editor/workspace/WorkspaceAssets");
const { setAssetFiles } = await import("../../src/modules/spark-editor/utils/assetTypes");
const { NAME_MESSAGES } = await import("../../src/modules/spark-editor/utils/fileListModel");
const { undo, redo, clearUndoHistory, nextUndoLabel } = await import(
  "../../src/modules/spark-editor/utils/undoManager"
);
const { PROJECT_SETTINGS_SCHEMA } = await import("../../src/modules/spark-editor/workspace/settings/settingsSchema");

const PROJECT = "p";
const uri = (path: string) => `file:///${PROJECT}/${path}`;
const relative = (u: string) => u.slice(`file:///${PROJECT}/`.length);

const STACK = [
  "Assets/Images/imani.png",
  "Assets/Images/imani@night.png",
  "Assets/Images/imani~face.happy.png",
  "Assets/Images/imani@night~face.sad.png",
];

function fakeWorkspace(paths: string[], referenced: string[] = []) {
  const files = new Map(paths.map((path) => [path, "png"]));
  const move = (from: string, to: string) => {
    if (!files.has(from)) throw new Error(`No file ${from}`);
    if (files.has(to)) throw new Error(`Cannot rename ${from} to ${to}: ${to} already exists`);
    files.set(to, files.get(from)!);
    files.delete(from);
  };
  const fs = {
    getFiles: vi.fn(async () =>
      Object.fromEntries(
        [...files.keys()].map((p) => [uri(p), { uri: uri(p), size: 3, modified: 1000, src: `/src/${p}` }]),
      ),
    ),
    getFolders: vi.fn(async () => ["Assets", "Assets/Images"]),
    getFileUri: (_: string, path: string) => uri(path),
    getRelativePath: (_: string, u: string) => relative(u),
    moveFile: vi.fn(async (_: string, from: string, to: string) => move(from, to)),
    renameFileWithReferences: vi.fn(async (_: string, from: string, to: string) => {
      move(from, to);
      return { referencesUpdated: 1, scriptsAffected: 1 };
    }),
  };
  const ls = {
    getFileReferences: vi.fn(async (u: string) => (referenced.includes(relative(u)) ? [{ uri: uri("main.sd") }] : [])),
  };
  const window = {
    recordScriptChange: vi.fn(async () => undefined),
    recordAssetChange: vi.fn(async () => undefined),
  };
  shared.fs = fs;
  shared.window = window;
  const assets = new WorkspaceAssets({ fs, ls, window, autoRenameFiles: () => true } as never);
  return { assets, fs, ls, window, files };
}

const names = (files: Map<string, string>) => [...files.keys()].sort();

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  clearUndoHistory();
  workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: PROJECT } };
  workspace.assetListing.value = null;
  setAssetFiles({
    imageFiles: PROJECT_SETTINGS_SCHEMA.imageFiles.default,
    audioFiles: PROJECT_SETTINGS_SCHEMA.audioFiles.default,
    videoFiles: PROJECT_SETTINGS_SCHEMA.videoFiles.default,
    fontFiles: PROJECT_SETTINGS_SCHEMA.fontFiles.default,
  });
});

describe("renaming a stacked picture as one operation", () => {
  it("renames all four members and records one undo step", async () => {
    const { assets, files } = fakeWorkspace(STACK);
    await assets.load();
    expect(await assets.renameStack(STACK, "imani", "ada")).toEqual([
      "Assets/Images/ada.png",
      "Assets/Images/ada@night.png",
      "Assets/Images/ada~face.happy.png",
      "Assets/Images/ada@night~face.sad.png",
    ]);
    expect(names(files)).toEqual([
      "Assets/Images/ada.png",
      "Assets/Images/ada@night.png",
      "Assets/Images/ada@night~face.sad.png",
      "Assets/Images/ada~face.happy.png",
    ]);
    expect(nextUndoLabel.value).toBe("Rename ada");
  });

  it("refuses a taken target with one message and moves nothing", async () => {
    const { assets, fs, files } = fakeWorkspace([...STACK, "Assets/Images/kai@night~face.sad.png"]);
    await assets.load();
    await expect(assets.renameStack(STACK, "imani", "kai")).rejects.toThrow(NAME_MESSAGES.taken);
    expect(fs.moveFile).not.toHaveBeenCalled();
    expect(fs.renameFileWithReferences).not.toHaveBeenCalled();
    expect(names(files)).toEqual([...STACK, "Assets/Images/kai@night~face.sad.png"].sort());
    expect(nextUndoLabel.value).toBeNull();
  });

  it("refuses an invalid or empty name and moves nothing, and trims a space-padded one to one base", async () => {
    const { assets, fs, files } = fakeWorkspace(STACK);
    await assets.load();
    await expect(assets.renameStack(STACK, "imani", "")).rejects.toThrow(NAME_MESSAGES.empty);
    await expect(assets.renameStack(STACK, "imani", "   ")).rejects.toThrow(NAME_MESSAGES.empty);
    await expect(assets.renameStack(STACK, "imani", "a/b")).rejects.toThrow(NAME_MESSAGES.characters);
    await expect(assets.renameStack(STACK, "imani", "ada.")).rejects.toThrow(NAME_MESSAGES.characters);
    expect(fs.moveFile).not.toHaveBeenCalled();
    expect(names(files)).toEqual([...STACK].sort());
    await assets.renameStack(STACK, "imani", "  ada  ");
    expect(names(files).every((path) => !path.includes(" "))).toBe(true);
    expect(names(files)).toContain("Assets/Images/ada@night~face.sad.png");
  });

  it("takes a typed extension off once, and refuses a name carrying a tag or a tilde", async () => {
    const { assets, fs, files } = fakeWorkspace(STACK);
    await assets.load();
    await expect(assets.renameStack(STACK, "imani", "ada@dusk")).rejects.toThrow("can't contain @ or ~");
    await expect(assets.renameStack(STACK, "imani", "ada~face.calm")).rejects.toThrow("can't contain @ or ~");
    expect(fs.moveFile).not.toHaveBeenCalled();
    await assets.renameStack(STACK, "imani", "ada.png");
    expect(names(files)).toEqual([
      "Assets/Images/ada.png",
      "Assets/Images/ada@night.png",
      "Assets/Images/ada@night~face.sad.png",
      "Assets/Images/ada~face.happy.png",
    ]);
  });

  it("puts the first two members back when storage fails on the third, and reports once", async () => {
    const { assets, fs, files } = fakeWorkspace(STACK);
    await assets.load();
    const move = fs.moveFile.getMockImplementation()!;
    let calls = 0;
    fs.moveFile.mockImplementation(async (projectId: string, from: string, to: string) => {
      calls += 1;
      if (calls === 3) throw new Error("Storage quota exceeded");
      return move(projectId, from, to);
    });
    await expect(assets.renameStack(STACK, "imani", "ada")).rejects.toThrow("Couldn't rename imani");
    expect(names(files)).toEqual([...STACK].sort());
    expect(nextUndoLabel.value).toBeNull();
  });

  it("is undone whole by one Undo and applied again by Redo", async () => {
    const { assets, files } = fakeWorkspace(STACK);
    await assets.load();
    await assets.renameStack(STACK, "imani", "ada");
    expect(await undo()).toBe(true);
    expect(names(files)).toEqual([...STACK].sort());
    expect(await redo()).toBe(true);
    expect(names(files)).toEqual([
      "Assets/Images/ada.png",
      "Assets/Images/ada@night.png",
      "Assets/Images/ada@night~face.sad.png",
      "Assets/Images/ada~face.happy.png",
    ]);
  });

  it("moves script references with each referenced member, forward and back", async () => {
    const { assets, fs, window } = fakeWorkspace(STACK, ["Assets/Images/imani.png", "Assets/Images/imani@night.png"]);
    await assets.load();
    await assets.renameStack(STACK, "imani", "ada");
    expect(fs.renameFileWithReferences.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      ["Assets/Images/imani.png", "Assets/Images/ada.png"],
      ["Assets/Images/imani@night.png", "Assets/Images/ada@night.png"],
    ]);
    expect(fs.moveFile).toHaveBeenCalledTimes(2);
    expect(window.recordScriptChange).toHaveBeenCalled();
    fs.renameFileWithReferences.mockClear();
    await undo();
    expect(fs.renameFileWithReferences.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      ["Assets/Images/ada@night.png", "Assets/Images/imani@night.png"],
      ["Assets/Images/ada.png", "Assets/Images/imani.png"],
    ]);
  });
});
