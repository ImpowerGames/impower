import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  importFiles: vi.fn(async (_projectId: string, items: { rel: string }[]) => items.map((item) => item.rel)),
  recordMove: vi.fn(),
  recordTrashDeletion: vi.fn(async () => undefined),
  recordCreate: vi.fn(),
}));
vi.mock("../../src/modules/spark-editor/utils/importDroppedFiles", () => ({ importFiles: mocks.importFiles }));
vi.mock("../../src/modules/spark-editor/utils/fileUndo", async (original) => ({
  renameFile: (await original<typeof import("../../src/modules/spark-editor/utils/fileUndo")>()).renameFile,
  recordMove: mocks.recordMove,
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

  it("places an unpacked zip's files in one batch, each keeping its zip folder under the folder its type lands in", async () => {
    const { assets } = fakeWorkspace({ "Assets/Images/Portraits/imani.png": "png", "scripts/main.sd": "x" }, ["scripts"]);
    await assets.load();
    mocks.importFiles.mockClear();
    await assets.upload(
      [
        dropped("Cast/Main Cast/hero.png"),
        dropped("sfx/rain.wav"),
        dropped("story/intro.sd"),
        dropped("../escape/./bo.png"),
        dropped("win\\style\\door knock.wav"),
        dropped("Old\\Cast/ada.png"),
        dropped("inner.zip"),
      ],
      "Assets/Images/Portraits",
    );
    expect(mocks.importFiles).toHaveBeenCalledTimes(1);
    expect(mocks.importFiles.mock.calls[0]![1].map((item: { rel: string }) => item.rel)).toEqual([
      "Assets/Images/Portraits/Cast/Main Cast/hero.png",
      "Assets/Audio/sfx/rain.wav",
      "scripts/story/intro.sd",
      "Assets/Images/Portraits/escape/bo.png",
      "Assets/Audio/win_style_door_knock.wav",
      "Assets/Images/Portraits/Old_Cast/ada.png",
      "Assets/Other/inner.zip",
    ]);
  });

  it("keeps the @ and ~ of an uploaded or dropped alternate or layer file, and cleans other characters", async () => {
    const { assets } = fakeWorkspace({ "Assets/Images/imani.png": "png" });
    await assets.load();
    mocks.importFiles.mockClear();
    await assets.upload([dropped("imani~face.happy.png"), dropped("imani@night.png"), dropped("door knock.wav")], "");
    expect(mocks.importFiles.mock.calls[0]![1].map((item: { rel: string }) => item.rel)).toEqual([
      "Assets/Images/imani~face.happy.png",
      "Assets/Images/imani@night.png",
      "Assets/Audio/door_knock.wav",
    ]);
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
    const { assets, fs, window, settings } = fakeWorkspace({ "Assets/Audio/theme.wav": "wav", "Assets/Audio/rain.wav": "wav" });
    await assets.load();
    expect(await assets.rename("Assets/Audio/theme.wav", "harbor")).toBe("Assets/Audio/harbor.wav");
    expect(fs.renameFileWithReferences).toHaveBeenCalledWith(PROJECT, "Assets/Audio/theme.wav", "Assets/Audio/harbor.wav");
    expect(window.recordScriptChange).toHaveBeenCalledTimes(1);
    expect(mocks.recordMove).toHaveBeenCalledWith(PROJECT, "Assets/Audio/theme.wav", "Assets/Audio/harbor.wav", false);
    settings.autoRenameFiles = false;
    await assets.rename("Assets/Audio/harbor.wav", "bay");
    expect(fs.moveFile).toHaveBeenCalledWith(PROJECT, "Assets/Audio/harbor.wav", "Assets/Audio/bay.wav");
    expect(fs.renameFileWithReferences).toHaveBeenCalledTimes(1);
    expect(mocks.recordMove).toHaveBeenCalledTimes(2);
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

describe("measuring pictures for a folder's tile shape", () => {
  it("reads each picture's header once through a ranged request, skipping links and recording failures", async () => {
    const { assets } = fakeWorkspace({
      "Assets/Images/Cast/a.png": "png",
      "Assets/Images/Cast/b.png": "png",
      "Assets/Images/Cast/web.url": "https://example.com/c.png",
    });
    await assets.load();
    workspace.assetSizes.value = {};
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png.set([0x49, 0x48, 0x44, 0x52], 12);
    new DataView(png.buffer).setUint32(16, 300);
    new DataView(png.buffer).setUint32(20, 400);
    const fetch = vi.fn(async (src: string) =>
      src.endsWith("a.png") ? new Response(png, { status: 206 }) : new Response("", { status: 404 }),
    );
    vi.stubGlobal("fetch", fetch);
    try {
      const paths = ["Assets/Images/Cast/a.png", "Assets/Images/Cast/b.png", "Assets/Images/Cast/web.url"];
      await assets.measureImages(paths);
      await assets.measureImages(paths);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith("/src/Assets/Images/Cast/a.png", { headers: { Range: "bytes=0-65535" } });
    expect(workspace.assetSizes.value).toEqual({
      "/src/Assets/Images/Cast/a.png": { width: 300, height: 400 },
      "/src/Assets/Images/Cast/b.png": null,
    });
  });
});
