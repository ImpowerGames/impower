import { ApplyEditorEditMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorEditMessage";
import { onProtocolRequest } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  importFiles: vi.fn(async (_projectId: string, items: { rel: string }[]) => items.map((item) => item.rel)),
  upload: vi.fn(async (files: readonly { name: string }[], folder: string) => files.map((file) => `${folder}/${file.name}`)),
  load: vi.fn(async () => null),
  setListState: vi.fn(),
  navigateTo: vi.fn(),
}));

vi.mock("../../src/modules/spark-editor/utils/importDroppedFiles", () => ({ importFiles: mocks.importFiles }));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    assets: { upload: mocks.upload, load: mocks.load },
    window: { setListState: mocks.setListState, navigateTo: mocks.navigateTo },
    fs: {},
  },
}));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { applyFix } = await import("../../src/modules/spark-editor/workspace/problems/applyFix");
const { fixChoiceOf } = await import("../../src/modules/spark-editor/workspace/problems/problemEntries");
const { runEditorCommand } = await import("../../src/modules/spark-editor/workspace/problems/runEditorCommand");
const { addAssetFiles, addNamedAssetFile, namedAs } = await import("../../src/modules/spark-editor/workspace/addAssetFiles");
const { reasonSentence } = await import("../../src/modules/spark-editor/workspace/uploadSession");
const { snackbar } = await import("../../src/modules/spark-editor/utils/snackbar");

const ADD_BOOM = { command: "sparkdown.addAsset", arguments: [{ name: "boom", type: "audio" }] };

const file = (name: string, size = 10) => ({ name, size, getBuffer: async () => new ArrayBuffer(size) });

let disposers: (() => void)[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  workspace.uploads.value = [];
  workspace.assetsAdd.value = null;
  workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: "p" } };
  workspace.assetListing.value = { projectId: "p", files: {}, folders: ["Assets", "Assets/Images/Backdrops"] };
});

afterEach(() => {
  disposers.forEach((dispose) => dispose());
  disposers = [];
  snackbar.value = null;
});

describe("choosing a command fix", () => {
  it("runs the handler with the command's arguments and applies no edit", async () => {
    const edits = vi.fn();
    disposers.push(onProtocolRequest(ApplyEditorEditMessage.type, edits));
    const deps = {
      openForFix: vi.fn(async () => null),
      openScript: vi.fn(async () => false),
      refreshDiagnostics: vi.fn(async () => {}),
      recordScriptChange: vi.fn(async () => {}),
      runCommand: vi.fn(async () => true),
    };
    const problem = {
      uri: "file:///p/main.sd",
      version: 1,
      range: { start: { line: 1, character: 15 }, end: { line: 1, character: 19 } },
    } as Parameters<typeof fixChoiceOf>[0];
    const choice = fixChoiceOf(problem, { name: "Add boom to assets", command: ADD_BOOM });
    expect(choice).toEqual({ name: "Add boom to assets", command: ADD_BOOM });
    expect(await applyFix(deps, choice)).toBe(true);
    expect(deps.runCommand).toHaveBeenCalledWith(ADD_BOOM);
    expect(edits).not.toHaveBeenCalled();
    expect(deps.openForFix).not.toHaveBeenCalled();
    expect(deps.recordScriptChange).not.toHaveBeenCalled();
    expect(snackbar.value).toBeNull();
  });
});

describe("the web editor's sparkdown.addAsset", () => {
  it("opens the Assets page on the asset's type with the name ready for its upload", async () => {
    expect(await runEditorCommand(ADD_BOOM)).toBe(true);
    expect(mocks.setListState).toHaveBeenCalledWith({ assetsType: "audio" });
    expect(mocks.navigateTo).toHaveBeenCalledWith("assets");
    expect(workspace.assetsAdd.value).toEqual({ name: "boom", type: "audio" });
  });

  it.each([
    { command: "sparkdown.other", arguments: [{ name: "boom", type: "audio" }] },
    { command: "sparkdown.addAsset", arguments: [{ name: "warm", type: "filtered_image" }] },
    { command: "sparkdown.addAsset" },
  ])("does nothing for %j", async (command) => {
    expect(await runEditorCommand(command)).toBe(false);
    expect(mocks.navigateTo).not.toHaveBeenCalled();
    expect(workspace.assetsAdd.value).toBeNull();
  });
});

describe("an upload whose name some computers cannot hold", () => {
  const notAdded = () =>
    workspace.uploads.value.flatMap((row) => (row.state === "failed" ? [[row.name, reasonSentence(row.reason, row.name)]] : []));

  it("is not added and says why, while names with # % ! spaces and accents are added unchanged", async () => {
    await addAssetFiles(
      [file("q?mark.png"), file("a:b.wav"), file('say "hi".png'), file("back\\slash.png"), file("hash#mark.png"), file("per%41cent.png"), file("door knock! café.wav")],
      "",
    );
    expect(mocks.upload).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "hash#mark.png" }), expect.objectContaining({ name: "per%41cent.png" }), expect.objectContaining({ name: "door knock! café.wav" })],
      "",
    );
    const because = "Not added: some computers cannot hold this name. Use a name without slashes or special file characters.";
    expect(notAdded()).toEqual([
      ["q?mark.png", because],
      ["a:b.wav", because],
      ['say "hi".png', because],
      ["back\\slash.png", because],
    ]);
  });

  it("refuses a dropped file inside a folder whose name some computers cannot hold", async () => {
    await addAssetFiles([file("odd?folder/hero.png"), file("fine folder/villain.png")], "");
    expect(mocks.upload).toHaveBeenCalledWith([expect.objectContaining({ name: "fine folder/villain.png" })], "");
    expect(notAdded().map(([name]) => name)).toEqual(["hero.png"]);
  });

  it("adds nothing when every name is refused", async () => {
    expect(await addAssetFiles([file("CON.png"), file("trailing.")], "")).toEqual([]);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(notAdded().map(([name]) => name)).toEqual(["CON.png", "trailing."]);
  });
});

describe("the named upload", () => {
  it("adds the chosen file under the reference's name, keeping its extension, in its type's folder", async () => {
    const landed = await addNamedAssetFile(file("Explosion 2.WAV"), { name: "boom", type: "audio" });
    expect(mocks.upload).toHaveBeenCalledWith([expect.objectContaining({ name: "boom.WAV", size: 10 })], "Assets/Audio");
    expect(landed).toEqual(["Assets/Audio/boom.WAV"]);
  });

  it("passes a name the script wrote with a hyphen to the upload unchanged", async () => {
    await addNamedAssetFile(file("Door Bell.wav"), { name: "door-bell", type: "audio" });
    expect(mocks.upload).toHaveBeenCalledWith([expect.objectContaining({ name: "door-bell.wav" })], "Assets/Audio");
  });

  it("uses the project's own spelling of the type's folder", async () => {
    workspace.assetListing.value = { projectId: "p", files: {}, folders: ["assets", "assets/images"] };
    await addNamedAssetFile(file("a.png"), { name: "alice", type: "image" });
    expect(mocks.upload).toHaveBeenCalledWith([expect.objectContaining({ name: "alice.png" })], "assets/images");
  });

  it.each([
    ["boom.ogg", "boom", "boom.ogg"],
    ["folder/take.mp3", "boom", "boom.mp3"],
    ["noext", "boom", "boom"],
    [".hidden", "boom", "boom"],
    ["take.o-g g!", "door-bell", "door-bell.o-g g!"],
  ])("names %s as %s: %s", (from, name, expected) => {
    expect(namedAs(file(from), name).name).toBe(expected);
  });
});
