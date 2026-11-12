import { strToU8, zipSync } from "fflate";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  importFiles: vi.fn(async (_projectId: string, items: { rel: string }[]) => items.map((item) => item.rel)),
  upload: vi.fn(
    async (files: readonly { name: string; getBuffer: () => Promise<ArrayBuffer> }[], _folder: string) =>
      files.map((file) => `Assets/x/${file.name}`),
  ),
  load: vi.fn(async () => null),
  navigateTo: vi.fn(),
  requestProjectReplace: vi.fn(async (_file: File) => undefined),
}));

vi.mock("../../src/modules/spark-editor/utils/importDroppedFiles", () => ({
  importFiles: mocks.importFiles,
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    assets: { upload: mocks.upload, load: mocks.load },
    window: { navigateTo: mocks.navigateTo, requestProjectReplace: mocks.requestProjectReplace },
  },
}));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { SCRIPT_FILES_GLOB, setScriptFiles } = await import("../../src/modules/spark-editor/utils/scriptFiles");
const { uploadNote } = await import("../../src/modules/spark-editor/workspace/uploadSession");
const { setAssetFiles } = await import("../../src/modules/spark-editor/utils/assetTypes");
const { PROJECT_SETTINGS_SCHEMA } = await import("../../src/modules/spark-editor/workspace/settings/settingsSchema");
const { default: FileDropzone } = await import(
  "../../src/modules/spark-editor/components/file-dropzone/FileDropzone"
);

const host = document.createElement("div");

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const desktopFile = (name: string) =>
  Object.assign(new File(["xy"], name), { arrayBuffer: async () => new TextEncoder().encode("xy").buffer });

const zipOf = (entries: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(entries).map(([path, text]) => [path, strToU8(text)])));

const corrupted = (bytes: Uint8Array, entry: string) => {
  const name = strToU8(entry);
  const start = bytes.findIndex((_, at) => name.every((byte, i) => bytes[at + i] === byte)) + name.length;
  bytes.fill(0xff, start, start + 8);
  return bytes;
};

const asDropped = (list: File[], type: string) => ({
  types: ["Files"],
  files: list,
  items: list.map((file) => ({ kind: "file", type, getAsFile: () => file })),
  dropEffect: "",
});

const zipDrop = (name: string, bytes: Uint8Array, read = async () => bytes.slice().buffer) =>
  asDropped([Object.assign(new File([bytes as BlobPart], name), { arrayBuffer: read })], "application/x-zip-compressed");

const files = (names: string[], type = "") => asDropped(names.map(desktopFile), type);

const fire = async (type: "dragover" | "drop", dataTransfer: ReturnType<typeof files>, target: EventTarget = document.body) => {
  await act(async () => {
    target.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { dataTransfer }));
  });
  await settle();
};

const dropThen = async (dataTransfer: ReturnType<typeof files>, then: () => void) => {
  await act(async () => {
    document.body.dispatchEvent(Object.assign(new Event("drop", { bubbles: true, cancelable: true }), { dataTransfer }));
    then();
  });
  await settle();
};

const overlay = () => {
  const zone = document.querySelector<HTMLElement>('[data-drop-zone="window"]');
  return zone ? [zone.querySelector("strong")!.textContent, zone.querySelector("strong + span")!.textContent] : null;
};

beforeEach(async () => {
  vi.clearAllMocks();
  workspace.uploads.value = [];
  workspace.assetsReveal.value = null;
  setAssetFiles({
    imageFiles: PROJECT_SETTINGS_SCHEMA.imageFiles.default,
    audioFiles: PROJECT_SETTINGS_SCHEMA.audioFiles.default,
    videoFiles: PROJECT_SETTINGS_SCHEMA.videoFiles.default,
    fontFiles: PROJECT_SETTINGS_SCHEMA.fontFiles.default,
  });
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: "p" },
    pane: "logic",
    screen: { ...workspace.current.screen, settingsOpen: false },
    lists: {},
  };
  workspace.assetListing.value = { projectId: "p", files: {}, folders: ["Assets", "scripts"] };
  document.body.append(host);
  await act(async () => {
    render(h(FileDropzone, {}), host);
  });
});

afterEach(async () => {
  await act(async () => {
    render(null, host);
  });
  host.remove();
});

describe("files dropped anywhere in the app", () => {
  it("shows the full-window note while files are over any route, and hides it on the drop", async () => {
    await fire("dragover", files(["hero.png", "rain.wav"]));
    expect(overlay()).toEqual(["Drop to add to Assets", "Each file goes to the folder of its type."]);
    await fire("drop", files([]));
    expect(overlay()).toBeNull();
  });

  it("promises no replace for a single zip being dragged, since its kind is unknown until it is read", async () => {
    await fire("dragover", files(["backup.zip"], "application/x-zip-compressed"));
    expect(overlay()).toEqual([
      "Drop to open this zip",
      "Backups ask before replacing. Other zips are unpacked.",
    ]);
  });

  it("opens Assets and adds a PNG and a WAV dropped on the Story route, each to its type's folder", async () => {
    workspace.current = { ...workspace.current, lists: { assetsType: "image", assetsFolders: { image: "Assets/Images/Portraits/Cast" } } };
    mocks.navigateTo.mockImplementationOnce(() => {
      workspace.current = { ...workspace.current, pane: "assets" };
    });
    mocks.upload.mockImplementationOnce(async () => {
      workspace.assetListing.value = {
        projectId: "p",
        files: { "Assets/Images/hero.png": { modified: 1, size: 2 }, "Assets/Audio/rain.wav": { modified: 1, size: 2 } },
        folders: ["Assets"],
      };
      return ["Assets/Images/hero.png", "Assets/Audio/rain.wav"];
    });
    await fire("drop", files(["hero.png", "rain.wav"]));
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    expect(mocks.navigateTo).toHaveBeenCalledWith("collection");
    const [dropped, folder] = mocks.upload.mock.calls[0]!;
    expect(dropped.map((file) => file.name)).toEqual(["hero.png", "rain.wav"]);
    expect(folder).toBe("");
    await vi.waitFor(() => expect(workspace.assetsReveal.value).toEqual(["Assets/Images/hero.png", "Assets/Audio/rain.wav"]));
  });

  it("adds to the folder in view when the drop lands outside the page while Assets is open", async () => {
    workspace.current = {
      ...workspace.current,
      pane: "assets",
      lists: { assetsType: "audio", assetsFolders: { audio: "Assets/Audio/Music" } },
    };
    await fire("drop", files(["rain.wav"]));
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledWith([expect.objectContaining({ name: "rain.wav" })], "Assets/Audio/Music"));
    expect(mocks.navigateTo).not.toHaveBeenCalled();
  });

  it("keeps the drop's destination when the route changes while the drop is being delivered", async () => {
    workspace.current = { ...workspace.current, lists: { assetsType: "image", assetsFolders: { image: "Assets/Images/Cast" } } };
    await dropThen(files(["hero.png"]), () => {
      workspace.current = { ...workspace.current, pane: "assets" };
    });
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledWith([expect.objectContaining({ name: "hero.png" })], ""));
    expect(mocks.navigateTo).toHaveBeenCalledWith("collection");
    mocks.upload.mockClear();
    mocks.navigateTo.mockClear();
    await dropThen(files(["ada.png"]), () => {
      workspace.current = { ...workspace.current, pane: "logic" };
    });
    await vi.waitFor(() =>
      expect(mocks.upload).toHaveBeenCalledWith([expect.objectContaining({ name: "ada.png" })], "Assets/Images/Cast"),
    );
    expect(mocks.navigateTo).not.toHaveBeenCalled();
  });

  it("hands dropped scripts and assets to the one Assets upload, so one batch places them all", async () => {
    setScriptFiles("*.{sd,luau,story}");
    try {
      await fire("drop", files(["util.luau", "intro.sd", "chapter.story", "hero.png"]));
      await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
      expect(mocks.upload.mock.calls[0]![0].map((file) => file.name)).toEqual([
        "util.luau",
        "intro.sd",
        "chapter.story",
        "hero.png",
      ]);
      expect(mocks.importFiles).not.toHaveBeenCalled();
    } finally {
      setScriptFiles(SCRIPT_FILES_GLOB);
    }
  });

  it("leaves a drop on the Assets page to the page", async () => {
    const page = document.body.appendChild(document.createElement("div"));
    page.setAttribute("data-file-drop-target", "");
    try {
      await fire("dragover", files(["hero.png"]), page);
      expect(overlay()).toBeNull();
      await fire("drop", files(["hero.png"]), page);
      expect(mocks.upload).not.toHaveBeenCalled();
    } finally {
      page.remove();
    }
  });

  it("leaves a drop to the Assets page even when the page's own handling removes the row it landed on", async () => {
    const page = document.body.appendChild(document.createElement("div"));
    page.setAttribute("data-file-drop-target", "");
    const row = page.appendChild(document.createElement("li"));
    page.addEventListener("drop", () => row.remove());
    try {
      await fire("drop", files(["hero.png"]), row);
      expect(mocks.upload).not.toHaveBeenCalled();
      expect(mocks.navigateTo).not.toHaveBeenCalled();
    } finally {
      page.remove();
    }
  });
});

describe("a single zip dropped anywhere", () => {
  it.each([
    ["at its top", { "My Story/main.sd": "x", "My Story/Assets/a.png": "png" }],
    ["two folders deep beside loose files", { "Backups/My Story/main.sd": "x", "Backups/My Story/Assets/a.png": "png", "loose.png": "png" }],
  ])("asks to replace the project when the zip holds a project %s", async (_case, entries) => {
    const bytes = zipOf(entries);
    await fire("drop", zipDrop("backup.zip", bytes));
    await vi.waitFor(() => expect(mocks.requestProjectReplace).toHaveBeenCalledTimes(1));
    const file = mocks.requestProjectReplace.mock.calls[0]![0];
    expect(file.name).toBe("backup.zip");
    expect(file.size).toBe(bytes.byteLength);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.importFiles).not.toHaveBeenCalled();
    expect(mocks.navigateTo).not.toHaveBeenCalled();
    expect(workspace.uploads.value).toEqual([]);
  });

  it("stays on the route for a backup zip even when another upload's progress changes meanwhile", async () => {
    const bytes = zipOf({ "Story/main.sd": "x" });
    await fire(
      "drop",
      zipDrop("backup.zip", bytes, async () => {
        workspace.uploads.value = [{ id: 999, name: "slow.wav", state: "working" }];
        return bytes.slice().buffer;
      }),
    );
    await vi.waitFor(() => expect(mocks.requestProjectReplace).toHaveBeenCalledTimes(1));
    expect(mocks.navigateTo).not.toHaveBeenCalled();
  });

  it("unpacks a zip with no main script dropped on the Story route, each file keeping its folder from the zip", async () => {
    workspace.current = { ...workspace.current, lists: { assetsType: "image", assetsFolders: { image: "Assets/Images/Cast" } } };
    mocks.navigateTo.mockImplementationOnce(() => {
      workspace.current = { ...workspace.current, pane: "assets" };
    });
    const inner = zipOf({ "a.png": "a" });
    const bytes = zipSync({
      "Cast/": new Uint8Array(0),
      "Cast/hero.png": strToU8("hero"),
      "Cast/Extras/ada.png": strToU8("ada"),
      "Cast/.DS_Store": strToU8("mac"),
      "Cast/Thumbs.db": strToU8("win"),
      "__MACOSX/Cast/._hero.png": strToU8("fork"),
      "sfx/rain.wav": strToU8("rain"),
      "story/intro.sd": strToU8("intro"),
      "inner.zip": inner,
    });
    await fire("drop", zipDrop("art.zip", bytes));
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    expect(mocks.navigateTo).toHaveBeenCalledWith("collection");
    expect(mocks.requestProjectReplace).not.toHaveBeenCalled();
    const [unpacked, folder] = mocks.upload.mock.calls[0]!;
    expect(folder).toBe("");
    expect(unpacked.map((file) => file.name)).toEqual([
      "Cast/hero.png",
      "Cast/Extras/ada.png",
      "sfx/rain.wav",
      "story/intro.sd",
      "inner.zip",
    ]);
    expect(new TextDecoder().decode(await unpacked[1]!.getBuffer())).toBe("ada");
    expect(new Uint8Array(await unpacked[4]!.getBuffer())).toEqual(inner);
    await vi.waitFor(() => expect(workspace.assetsReveal.value).toHaveLength(5));
  });

  it("opens Assets before walking a folder dropped on another route, then adds the files inside it with their folders", async () => {
    const navigated: number[] = [];
    const leaf = (name: string) => ({ name, isFile: true, isDirectory: false, file: (ok: (file: File) => void) => ok(desktopFile(name)) });
    const reader = (pages: object[][]) => () => {
      let page = 0;
      return {
        readEntries: (ok: (entries: object[]) => void) => {
          navigated.push(mocks.navigateTo.mock.calls.length);
          ok(pages[page++] ?? []);
        },
      };
    };
    const strings = { name: "Strings", isFile: false, isDirectory: true, createReader: reader([[leaf("violin.ogg")]]) };
    const music = { name: "Music", isFile: false, isDirectory: true, createReader: reader([[leaf("theme.mp3"), leaf("Thumbs.db"), strings]]) };
    const drop = files(["Music"]);
    Object.assign(drop.items[0]!, { webkitGetAsEntry: () => music });
    await fire("drop", drop);
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    expect(navigated[0]).toBe(1);
    expect(mocks.upload.mock.calls[0]![0].map((file) => file.name)).toEqual(["Music/theme.mp3", "Music/Strings/violin.ogg"]);
  });

  it("lists a dropped zip that cannot be read as not added, and opens Assets to say so", async () => {
    const dataTransfer = files(["art.zip"]);
    dataTransfer.files[0]!.arrayBuffer = async () => {
      throw new DOMException("The file could not be read.", "NotReadableError");
    };
    await fire("drop", dataTransfer);
    await vi.waitFor(() => expect(workspace.uploads.value).toHaveLength(1));
    expect(uploadNote(workspace.uploads.value[0]!, () => "")).toBe("Not added: the file could not be read, so choose it again.");
    expect(mocks.requestProjectReplace).not.toHaveBeenCalled();
    expect(mocks.navigateTo).toHaveBeenCalledWith("collection");
  });

  it.each([
    [
      "holds two projects",
      zipOf({ "one/main.sd": "x", "two/main.sd": "x" }),
      "Nothing was changed because “art.zip” holds more than one project, in “one” and “two”, so zip one of them on its own.",
    ],
    [
      "cannot be opened",
      strToU8("not a zip"),
      "Nothing was changed because “art.zip” is not a .zip the editor can open.",
    ],
    [
      "holds a project whose files cannot be inflated, though its directory reads",
      corrupted(zipOf({ "My Story/main.sd": "# Story\n".repeat(40), "My Story/Assets/a.png": "png" }), "My Story/main.sd"),
      "Nothing was changed because “art.zip” is not a .zip the editor can open.",
    ],
    [
      "holds no file but operating-system droppings",
      zipSync({ "Cast/": new Uint8Array(0), ".DS_Store": strToU8("mac"), "__MACOSX/._a.png": strToU8("fork") }),
      "Nothing was changed because “art.zip” has no main.sd, which every project backup needs.",
    ],
  ])("changes nothing and lists the zip as not added when it %s", async (_case, bytes, sentence) => {
    await fire("drop", zipDrop("art.zip", bytes));
    await vi.waitFor(() => expect(workspace.uploads.value).toHaveLength(1));
    const [row] = workspace.uploads.value;
    expect(row!.state).toBe("failed");
    expect(uploadNote(row!, () => "")).toBe(sentence);
    expect(mocks.requestProjectReplace).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.importFiles).not.toHaveBeenCalled();
    expect(mocks.navigateTo).toHaveBeenCalledWith("collection");
  });
});
