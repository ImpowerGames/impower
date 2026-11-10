import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  importFiles: vi.fn(async (_projectId: string, items: { rel: string }[]) => items.map((item) => item.rel)),
  recordMove: vi.fn(),
  recordReferenceRename: vi.fn(),
  recordTrashDeletion: vi.fn(async () => undefined),
  recordCreate: vi.fn(),
}));
vi.mock("../../src/modules/spark-editor/utils/importDroppedFiles", () => ({ importFiles: mocks.importFiles }));
vi.mock("../../src/modules/spark-editor/utils/fileUndo", () => ({
  recordMove: mocks.recordMove,
  recordReferenceRename: mocks.recordReferenceRename,
  recordTrashDeletion: mocks.recordTrashDeletion,
  recordCreate: mocks.recordCreate,
}));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: WorkspaceAssets } = await import("../../src/modules/spark-editor/workspace/WorkspaceAssets");
const { setAssetFiles } = await import("../../src/modules/spark-editor/utils/assetTypes");
const { NAME_MESSAGES } = await import("../../src/modules/spark-editor/utils/fileListModel");
const { PROJECT_SETTINGS_SCHEMA } = await import("../../src/modules/spark-editor/workspace/settings/settingsSchema");

const PROJECT = "p";
const uri = (path: string) => `file:///${PROJECT}/${path}`;
const relative = (u: string) => u.slice(`file:///${PROJECT}/`.length);

function fakeWorkspace(paths: Record<string, string>, folders: string[] = []) {
  const files = new Map(Object.entries(paths));
  const dirs = new Set(folders);
  const fs = {
    getFiles: vi.fn(async () =>
      Object.fromEntries(
        [...files.entries()].map(([p, text]) => [
          uri(p),
          { uri: uri(p), size: text.length, modified: 1000, src: p.endsWith(".url") ? text : `/src/${p}` },
        ]),
      ),
    ),
    getFolders: vi.fn(async () => [...dirs].sort()),
    getFileUri: (_: string, path: string) => uri(path),
    getFilename: (u: string) => u.split("/").pop()!,
    getRelativePath: (_: string, u: string) => relative(u),
    createFiles: vi.fn(async ({ files: created }: { files: { uri: string; data: ArrayBuffer }[] }) => {
      for (const f of created) files.set(relative(f.uri), new TextDecoder().decode(f.data));
      return [];
    }),
    createFolder: vi.fn(async (_: string, path: string) => {
      dirs.add(path);
      return [path];
    }),
    moveFile: vi.fn(async (_: string, from: string, to: string) => {
      files.set(to, files.get(from)!);
      files.delete(from);
      return [];
    }),
    moveFolder: vi.fn(async () => []),
    renameFileWithReferences: vi.fn(async (_: string, from: string, to: string) => {
      files.set(to, files.get(from)!);
      files.delete(from);
      return { referencesUpdated: 1, scriptsAffected: 1 };
    }),
    deleteFiles: vi.fn(async ({ files: gone }: { files: { uri: string }[] }) => {
      for (const f of gone) files.delete(relative(f.uri));
      return [];
    }),
    deleteFolder: vi.fn(async () => ({ files: [], folders: [] })),
  };
  const ls = { getFileReferences: vi.fn(async (): Promise<unknown[]> => []) };
  const window = {
    recordScriptChange: vi.fn(async () => undefined),
    recordAssetChange: vi.fn(async () => undefined),
  };
  const settings = { autoRenameFiles: true };
  const assets = new WorkspaceAssets({ fs, ls, window, autoRenameFiles: () => settings.autoRenameFiles } as never);
  return { assets, fs, ls, window, files, settings };
}

const dropped = (name: string) => ({ name, getBuffer: async () => new ArrayBuffer(1) });

beforeEach(() => {
  vi.clearAllMocks();
  workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: PROJECT } };
  workspace.assetListing.value = null;
  setAssetFiles({
    imageFiles: PROJECT_SETTINGS_SCHEMA.imageFiles.default,
    audioFiles: PROJECT_SETTINGS_SCHEMA.audioFiles.default,
    videoFiles: PROJECT_SETTINGS_SCHEMA.videoFiles.default,
    fontFiles: PROJECT_SETTINGS_SCHEMA.fontFiles.default,
  });
});

describe("the Assets page's file intents", () => {
  it("lists the files under the assets folder, with a link's address and without scripts or dot files", async () => {
    const { assets } = fakeWorkspace({
      "main.sd": "x",
      "Scripts/intro.sd": "x",
      "assets/music/theme.wav": "wav",
      "assets/urls/horn.url": "https://example.com/horn.mp3",
      "assets/notes/.folder": "",
      "assets/chapter.sd": "x",
    });
    const listing = (await assets.load())!;
    expect(Object.keys(listing.files).sort()).toEqual(["assets/music/theme.wav", "assets/urls/horn.url"]);
    expect(listing.files["assets/urls/horn.url"]!.address).toBe("https://example.com/horn.mp3");
    expect(listing.files["assets/music/theme.wav"]!.src).toBe("/src/assets/music/theme.wav");
    expect(workspace.assetListing.value).toBe(listing);
  });

  it("lists files under every spelling of the assets folder", async () => {
    const { assets } = fakeWorkspace({ "Assets/Images/bunny.png": "png", "assets/Audio/theme.wav": "wav" }, [
      "Assets",
      "Assets/Images",
      "assets",
      "assets/Audio",
    ]);
    const listing = (await assets.load())!;
    expect(Object.keys(listing.files).sort()).toEqual(["Assets/Images/bunny.png", "assets/Audio/theme.wav"]);
  });

  it("keeps a rename reference-aware when the reference lookup fails", async () => {
    const { assets, fs, ls } = fakeWorkspace({ "Assets/Audio/theme.wav": "wav" });
    await assets.load();
    ls.getFileReferences.mockRejectedValueOnce(new Error("language server busy"));
    expect(await assets.rename("Assets/Audio/theme.wav", "sea")).toBe("Assets/Audio/sea.wav");
    expect(fs.renameFileWithReferences).toHaveBeenCalledWith(PROJECT, "Assets/Audio/theme.wav", "Assets/Audio/sea.wav");
    expect(fs.moveFile).not.toHaveBeenCalled();
  });

  it("creates Assets/Fonts when the first font is added to a new project", async () => {
    const { assets } = fakeWorkspace({ "main.sd": "x" });
    await assets.load();
    const landed = await assets.upload([dropped("Mono Regular.ttf")], "Assets/Fonts");
    expect(mocks.importFiles).toHaveBeenCalledWith(PROJECT, [
      expect.objectContaining({ rel: "Assets/Fonts/Mono_Regular.ttf" }),
    ]);
    expect(landed).toEqual(["Assets/Fonts/Mono_Regular.ttf"]);
  });

  it("lands each upload in the folder in view when it is under the file's type folder, else in that type folder", async () => {
    const { assets } = fakeWorkspace({ "assets/Audio/Music/theme.wav": "wav", "assets/music/old.wav": "wav" });
    await assets.load();
    await assets.upload([dropped("rain.ogg"), dropped("bunny.png"), dropped("table.csv")], "assets/Audio/Music");
    expect(mocks.importFiles.mock.calls[0]![1].map((item: { rel: string }) => item.rel)).toEqual([
      "assets/Audio/Music/rain.ogg",
      "assets/Images/bunny.png",
      "assets/Other/table.csv",
    ]);
    await assets.upload([dropped("wind.wav")], "assets/music");
    expect(mocks.importFiles.mock.calls[1]![1][0].rel).toBe("assets/Audio/wind.wav");
  });

  it("adds a link under the type its address names, with a name no other file has", async () => {
    const { assets, fs, files } = fakeWorkspace({ "Assets/Audio/horn.wav": "wav", "Assets/Images/horn.url": "https://cdn.example.com/horn.png" });
    await assets.load();
    const path = await assets.addLink("https://cdn.example.com/horn.mp3", "horn", "Assets/Images");
    expect(path).toBe("Assets/Audio/horn01.url");
    expect(files.get(path)).toBe("https://cdn.example.com/horn.mp3");
    expect(mocks.recordCreate).toHaveBeenCalledWith(PROJECT, [uri(path)], "horn01.url");
    expect(fs.createFiles).toHaveBeenCalledTimes(1);
    expect(await assets.addLink("https://example.com/about", "about", "")).toBe("Assets/Other/about.url");
  });

  it("renames a file in place, keeping its extension, and moves its references when scripts use it", async () => {
    const { assets, fs, ls, settings } = fakeWorkspace({ "Assets/Audio/theme.wav": "wav", "Assets/Audio/rain.wav": "wav" });
    await assets.load();
    expect(await assets.rename("Assets/Audio/theme.wav", "harbor")).toBe("Assets/Audio/harbor.wav");
    expect(fs.moveFile).toHaveBeenCalledWith(PROJECT, "Assets/Audio/theme.wav", "Assets/Audio/harbor.wav");
    expect(mocks.recordMove).toHaveBeenCalledWith(PROJECT, "Assets/Audio/theme.wav", "Assets/Audio/harbor.wav", false);
    ls.getFileReferences.mockResolvedValueOnce([{ uri: uri("main.sd") }]);
    expect(await assets.rename("Assets/Audio/harbor.wav", "sea")).toBe("Assets/Audio/sea.wav");
    expect(fs.renameFileWithReferences).toHaveBeenCalledWith(PROJECT, "Assets/Audio/harbor.wav", "Assets/Audio/sea.wav");
    expect(mocks.recordReferenceRename).toHaveBeenCalledTimes(1);
    settings.autoRenameFiles = false;
    ls.getFileReferences.mockResolvedValueOnce([{ uri: uri("main.sd") }]);
    await assets.rename("Assets/Audio/sea.wav", "bay");
    expect(fs.renameFileWithReferences).toHaveBeenCalledTimes(1);
    await expect(assets.rename("Assets/Audio/bay.wav", "rain")).rejects.toThrow(NAME_MESSAGES.taken);
  });

  it("sends deleted files and folders to the recycle bin", async () => {
    const { assets, fs } = fakeWorkspace({ "Assets/Audio/theme.wav": "wav", "Assets/Audio/Music/a.wav": "wav" });
    await assets.load();
    await assets.remove(["Assets/Audio/theme.wav", "Assets/Audio/Music"]);
    expect(fs.deleteFiles).toHaveBeenCalledWith({ files: [{ uri: uri("Assets/Audio/theme.wav") }], mode: "trash" });
    expect(fs.deleteFolder).toHaveBeenCalledWith(PROJECT, "Assets/Audio/Music", "trash");
    expect(mocks.recordTrashDeletion).toHaveBeenCalledWith(PROJECT, [uri("Assets/Audio/theme.wav")], "2 items", expect.any(Number), []);
  });

  it("creates a folder in the folder in view", async () => {
    const { assets, fs } = fakeWorkspace({ "Assets/Audio/theme.wav": "wav" });
    await assets.load();
    expect(await assets.createFolder("Assets/Audio", "Ambience")).toBe("Assets/Audio/Ambience");
    expect(fs.createFolder).toHaveBeenCalledWith(PROJECT, "Assets/Audio/Ambience");
  });
});

describe("renaming a stacked picture", () => {
  const STACK = ["Assets/Images/imani.png", "Assets/Images/imani@night.png", "Assets/Images/imani~face.happy.png"];

  it("renames every member's base name and keeps its alternate and layer suffixes", async () => {
    const { assets, files } = fakeWorkspace(Object.fromEntries(STACK.map((path) => [path, "png"])));
    await assets.load();
    expect(await assets.renameStack(STACK, "imani", "ada")).toEqual([
      "Assets/Images/ada.png",
      "Assets/Images/ada@night.png",
      "Assets/Images/ada~face.happy.png",
    ]);
    expect([...files.keys()].sort()).toEqual([
      "Assets/Images/ada.png",
      "Assets/Images/ada@night.png",
      "Assets/Images/ada~face.happy.png",
    ]);
  });

  it("moves nothing when any member's new name is taken", async () => {
    const { assets, fs, files } = fakeWorkspace({
      ...Object.fromEntries(STACK.map((path) => [path, "png"])),
      "Assets/Images/kai@night.png": "png",
    });
    await assets.load();
    await expect(assets.renameStack(STACK, "imani", "kai")).rejects.toThrow(NAME_MESSAGES.taken);
    expect(fs.moveFile).not.toHaveBeenCalled();
    expect(fs.renameFileWithReferences).not.toHaveBeenCalled();
    expect([...files.keys()].sort()).toEqual([...STACK, "Assets/Images/kai@night.png"].sort());
  });
});
