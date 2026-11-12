import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  importFiles: vi.fn(async (_projectId: string, items: { rel: string }[]) => items.map((item) => item.rel)),
  upload: vi.fn(async (files: readonly { name: string }[], _folder: string) => files.map((file) => `Assets/x/${file.name}`)),
  load: vi.fn(async () => null),
  navigateTo: vi.fn(),
  setListState: vi.fn(),
  requestProjectReplace: vi.fn(async (_file: File) => undefined),
  unzipFiles: vi.fn(async (_params: { data: ArrayBuffer }): Promise<{ filename: string }[]> => []),
}));

vi.mock("../../src/modules/spark-editor/utils/importDroppedFiles", () => ({
  importFiles: mocks.importFiles,
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    assets: { upload: mocks.upload, load: mocks.load },
    window: { navigateTo: mocks.navigateTo, setListState: mocks.setListState, requestProjectReplace: mocks.requestProjectReplace },
    fs: { unzipFiles: mocks.unzipFiles },
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

const files = (names: string[], type = "") => ({
  types: ["Files"],
  files: names.map(desktopFile),
  items: names.map(() => ({ kind: "file", type })),
  dropEffect: "",
});

const fire = async (type: "dragover" | "drop", dataTransfer: ReturnType<typeof files>, target: EventTarget = document.body) => {
  await act(async () => {
    target.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { dataTransfer }));
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

  it("names the replace for a single zip being dragged", async () => {
    await fire("dragover", files(["backup.zip"], "application/x-zip-compressed"));
    expect(overlay()).toEqual(["Drop to replace this project", "A backup replaces every script and asset, after asking."]);
  });

  it("opens Assets and adds a PNG and a WAV dropped on the Story route, each to its type's folder", async () => {
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
    await vi.waitFor(() =>
      expect(mocks.setListState).toHaveBeenCalledWith({ assetsType: "audio", assetsFolders: { audio: "Assets/Audio" } }),
    );
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

  it("files dropped scripts in the project's own Scripts folder and the rest through the Assets upload", async () => {
    setScriptFiles("*.{sd,luau,story}");
    try {
      await fire("drop", files(["util.luau", "intro.sd", "chapter.story", "hero.png"]));
      await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
      expect(mocks.importFiles.mock.calls[0]![1].map((item) => item.rel)).toEqual([
        "scripts/util.luau",
        "scripts/intro.sd",
        "scripts/chapter.story",
      ]);
      expect(mocks.upload.mock.calls[0]![0].map((file) => file.name)).toEqual(["hero.png"]);
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
});

describe("a single zip dropped anywhere", () => {
  it("asks to replace the project when the zip is a backup with a main script", async () => {
    mocks.unzipFiles.mockResolvedValueOnce([{ filename: "My Story/main.sd" }, { filename: "My Story/Assets/a.png" }]);
    await fire("drop", files(["backup.zip"]));
    await vi.waitFor(() => expect(mocks.requestProjectReplace).toHaveBeenCalledTimes(1));
    const file = mocks.requestProjectReplace.mock.calls[0]![0];
    expect(file.name).toBe("backup.zip");
    expect(file.size).toBe(2);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.importFiles).not.toHaveBeenCalled();
    expect(mocks.navigateTo).not.toHaveBeenCalled();
    expect(workspace.uploads.value).toEqual([]);
  });

  it.each([
    [
      "has no main script",
      async () => [{ filename: "pictures/a.png" }],
      "Nothing was changed because “art.zip” has no main.sd, which every project backup needs.",
    ],
    [
      "holds two projects",
      async () => [{ filename: "one/main.sd" }, { filename: "two/main.sd" }],
      "Nothing was changed because “art.zip” holds more than one project, in “one” and “two”, so zip one of them on its own.",
    ],
    [
      "cannot be opened",
      async () => {
        throw new Error("bad zip");
      },
      "Nothing was changed because “art.zip” is not a .zip the editor can open.",
    ],
  ])("changes nothing and lists the zip as not added when it %s", async (_case, unzip, sentence) => {
    mocks.unzipFiles.mockImplementationOnce(unzip);
    await fire("drop", files(["art.zip"]));
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
