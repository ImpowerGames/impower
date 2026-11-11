import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode-jsonrpc/browser", () => ({
  BrowserMessageReader: class {},
  BrowserMessageWriter: class {},
  createMessageConnection: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  recordReplace: vi.fn(),
  downloadFile: vi.fn(),
}));
vi.mock("../../src/modules/spark-editor/utils/fileUndo", () => ({
  recordMove: vi.fn(),
  recordReferenceRename: vi.fn(),
  recordCreate: vi.fn(),
  recordReplace: mocks.recordReplace,
  REPLACED_MESSAGE: "Replaced. Every line that shows it now uses the new file.",
}));
vi.mock("../../src/modules/spark-editor/utils/downloadFile", () => ({ downloadFile: mocks.downloadFile }));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: WorkspaceAssets } = await import("../../src/modules/spark-editor/workspace/WorkspaceAssets");
const { default: WorkspaceLanguageServer } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceLanguageServer"
);
const { setAssetFiles } = await import("../../src/modules/spark-editor/utils/assetTypes");
const { PROJECT_SETTINGS_SCHEMA } = await import("../../src/modules/spark-editor/workspace/settings/settingsSchema");
const { snackbar } = await import("../../src/modules/spark-editor/utils/snackbar");

const PROJECT = "project";
const uri = (path: string) => `file:///${PROJECT}/${path}`;
const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const text = (data: ArrayBuffer) => new TextDecoder().decode(data);
const warning = { severity: 2, message: "Malformed condition face..bad" };
const range = (line: number, start: number, end: number) => ({
  start: { line, character: start },
  end: { line, character: end },
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeWorkspace(stored: Record<string, string>) {
  const files = new Map(Object.entries(stored));
  const published = new Set<(params: { uri: string }) => void>();
  const fs = {
    getFiles: vi.fn(async () =>
      Object.fromEntries(
        [...files.entries()].map(([p, body]) => [uri(p), { uri: uri(p), size: body.length, modified: 1, src: `/src/${p}` }]),
      ),
    ),
    getFolders: vi.fn(async () => []),
    getFileUri: (_: string, path: string) => uri(path),
    getFilename: (u: string) => u.split("/").pop()!,
    getRelativePath: (_: string, u: string) => u.slice(`file:///${PROJECT}/`.length),
    readFile: vi.fn(async ({ file }: { file: { uri: string } }) => bytes(files.get(file.uri.slice(`file:///${PROJECT}/`.length)) ?? "")),
    getFileText: vi.fn(async (u: string) => files.get(u.slice(`file:///${PROJECT}/`.length)) ?? ""),
    createFiles: vi.fn(async ({ files: written }: { files: { uri: string; data: ArrayBuffer }[] }) => {
      for (const file of written) files.set(file.uri.slice(`file:///${PROJECT}/`.length), text(file.data));
      return [];
    }),
    writeTextDocument: vi.fn(async ({ textDocument }: { textDocument: { uri: string; text: string } }) => {
      files.set(textDocument.uri.slice(`file:///${PROJECT}/`.length), textDocument.text);
    }),
  };
  const ls = {
    getFileReferences: vi.fn(async (): Promise<{ uri: string; range: ReturnType<typeof range> }[]> => []),
    getFileDiagnostics: vi.fn(async (): Promise<unknown[]> => []),
    getProgram: vi.fn(async (): Promise<unknown> => ({ context: {} })),
    onPublishedDiagnostics: (listener: (params: { uri: string }) => void) => {
      published.add(listener);
      return () => published.delete(listener);
    },
  };
  const window = {
    recordScriptChange: vi.fn(async () => undefined),
    recordAssetChange: vi.fn(async () => undefined),
  };
  const assets = new WorkspaceAssets({ fs, ls, window, autoRenameFiles: () => true } as never);
  const publish = async (u: string) => {
    for (const listener of published) listener({ uri: u });
    await settle();
  };
  return { assets, fs, ls, window, files, publish, published };
}

const compiled = async () => {
  sendProtocolMessage(CompiledProgramMessage.type.notification({ program: {} } as never));
  await settle();
};

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

describe("the inspector's uses and problems", () => {
  it("asks for each file's references, groups them by script with each line's text, and drops repeats", async () => {
    const { assets, ls } = fakeWorkspace({
      "main.sd": "scene start\n  [[show backdrop harbor]]\nend\n",
      "scripts/market.sd": "  [[show backdrop harbor]]\n",
    });
    ls.getFileReferences.mockImplementation(async () => [
      { uri: uri("scripts/market.sd"), range: range(0, 19, 25) },
      { uri: uri("main.sd"), range: range(1, 19, 25) },
    ]);
    const groups = await assets.uses(["Assets/Images/harbor.png", "Assets/Images/harbor@night.png"]);
    expect(ls.getFileReferences.mock.calls).toEqual([
      [uri("Assets/Images/harbor.png")],
      [uri("Assets/Images/harbor@night.png")],
    ]);
    expect(groups.map((group) => [group.uri, group.uses.map((use) => use.lineText)])).toEqual([
      [uri("main.sd"), ["  [[show backdrop harbor]]"]],
      [uri("scripts/market.sd"), ["  [[show backdrop harbor]]"]],
    ]);
  });

  it("reports a uses lookup that failed as unknown, not as unused, and still reports problems", async () => {
    const { assets, ls } = fakeWorkspace({});
    ls.getFileReferences.mockRejectedValue(new Error("The language server is not running"));
    ls.getFileDiagnostics.mockResolvedValue([warning]);
    const seen: { uses: unknown; problems: unknown }[] = [];
    assets.watchFacts(["Assets/Images/harbor.png"], (facts) => seen.push(facts));
    await settle();
    expect(seen.at(-1)).toEqual({ uses: null, problems: [warning] });
    await expect(assets.uses(["Assets/Images/harbor.png"])).rejects.toThrow("The language server is not running");
  });

  it("reports a problems lookup that failed as unknown, not as no problems", async () => {
    const { assets, ls } = fakeWorkspace({});
    ls.getFileDiagnostics.mockRejectedValue(new Error("The language server is not running"));
    const seen: { uses: unknown; problems: unknown }[] = [];
    assets.watchFacts(["Assets/Images/harbor.png"], (facts) => seen.push(facts));
    await settle();
    expect(seen.at(-1)).toEqual({ uses: [], problems: null });
  });

  it("asks the language server for just the selected file's diagnostics after it starts", async () => {
    const client = Object.create(WorkspaceLanguageServer.prototype) as InstanceType<typeof WorkspaceLanguageServer>;
    const sendRequest = vi.fn().mockResolvedValue([warning]);
    const initialization = vi.fn().mockResolvedValue(undefined);
    Object.assign(client, { _connection: { sendRequest }, initialization });
    expect(await client.getFileDiagnostics(uri("assets/unused.svg"))).toEqual([warning]);
    expect(initialization).toHaveBeenCalledOnce();
    expect(sendRequest).toHaveBeenCalledWith("sparkdown/fileDiagnostics", { uri: uri("assets/unused.svg") });
  });

  it("reports a problem, and refreshes it away when the program compiles again", async () => {
    const { assets, ls } = fakeWorkspace({});
    ls.getFileDiagnostics.mockResolvedValue([warning]);
    const seen: unknown[] = [];
    const dispose = assets.watchFacts(["assets/unused.svg"], (facts) => seen.push(facts.problems));
    await settle();
    expect(seen.at(-1)).toEqual([warning]);
    expect(ls.getFileDiagnostics).toHaveBeenCalledWith(uri("assets/unused.svg"));
    ls.getFileDiagnostics.mockResolvedValue([]);
    await compiled();
    expect(seen.at(-1)).toEqual([]);
    dispose();
    ls.getFileDiagnostics.mockResolvedValue([warning]);
    await compiled();
    expect(seen.at(-1)).toEqual([]);
  });

  it("refreshes when the language server publishes for the watched file after the compile, as a finished bake does", async () => {
    const { assets, ls, publish } = fakeWorkspace({});
    const seen: unknown[] = [];
    assets.watchFacts(["assets/unused.svg"], (facts) => seen.push(facts.problems));
    await settle();
    expect(seen.at(-1)).toEqual([]);
    ls.getFileDiagnostics.mockResolvedValue([warning]);
    await publish(uri("assets/other.svg"));
    expect(seen.at(-1)).toEqual([]);
    await publish(uri("assets/unused.svg"));
    expect(seen.at(-1)).toEqual([warning]);
  });

  it("discards an older refresh that answers after a newer one", async () => {
    const { assets, ls } = fakeWorkspace({});
    let finish!: (value: unknown[]) => void;
    ls.getFileDiagnostics
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      .mockResolvedValue([]);
    const seen: unknown[] = [];
    assets.watchFacts(["assets/unused.svg"], (facts) => seen.push(facts.problems));
    await compiled();
    expect(seen).toEqual([[]]);
    finish([warning]);
    await settle();
    expect(seen).toEqual([[]]);
  });

  it("stops listening once disposed, so a late answer for a file no longer shown is dropped", async () => {
    const { assets, ls, published } = fakeWorkspace({});
    let finish!: (value: unknown[]) => void;
    ls.getFileDiagnostics.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const seen: unknown[] = [];
    const dispose = assets.watchFacts(["assets/unused.svg"], (facts) => seen.push(facts));
    dispose();
    finish([warning]);
    await settle();
    expect(seen).toEqual([]);
    expect(published.size).toBe(0);
  });
});

describe("Replace", () => {
  const picked = (name: string, body: string) => ({ name, getBuffer: async () => bytes(body) });

  it("writes the chosen file under the old name, records its undo and says every line now uses it", async () => {
    const { assets, fs, files, window } = fakeWorkspace({ "Assets/Images/harbor.png": "old" });
    await assets.load();
    expect(await assets.replace("Assets/Images/harbor.png", picked("night.jpg", "new"))).toBe("Assets/Images/harbor.png");
    expect(files.get("Assets/Images/harbor.png")).toBe("new");
    expect(fs.createFiles).toHaveBeenCalledOnce();
    expect(window.recordAssetChange).toHaveBeenCalled();
    const recorded = mocks.recordReplace.mock.calls[0]![0];
    expect([recorded.label, recorded.message]).toEqual([
      "harbor.png",
      "Replaced. Every line that shows it now uses the new file.",
    ]);
    await recorded.undo();
    expect(files.get("Assets/Images/harbor.png")).toBe("old");
    expect(workspace.assetListing.value!.files["Assets/Images/harbor.png"]!.size).toBe(3);
    await recorded.redo();
    expect(files.get("Assets/Images/harbor.png")).toBe("new");
    expect(workspace.assetListing.value!.files["Assets/Images/harbor.png"]!.size).toBe(3);
  });

  it("reads back and reloads after a failed Undo or Redo of a replace, and says what happened", async () => {
    const { assets, fs, files } = fakeWorkspace({ "Assets/Images/harbor.png": "old" });
    await assets.load();
    await assets.replace("Assets/Images/harbor.png", picked("night.png", "new file"));
    const { undo, redo } = mocks.recordReplace.mock.calls[0]![0];
    const cutOff = () =>
      fs.createFiles.mockImplementationOnce(async () => {
        files.set("Assets/Images/harbor.png", "partial");
        throw new Error("The write was cut off");
      });
    cutOff();
    await undo();
    expect(workspace.assetListing.value!.files["Assets/Images/harbor.png"]!.size).toBe(7);
    expect(snackbar.value?.message).toBe(
      "Couldn't undo the replace of harbor.png: The write was cut off. What it holds now could not be confirmed, so open it to check.",
    );
    files.set("Assets/Images/harbor.png", "old");
    fs.createFiles.mockRejectedValueOnce(new Error("The storage is full"));
    await redo();
    expect(snackbar.value?.message).toBe(
      "Couldn't redo the replace of harbor.png: The storage is full. Its contents are unchanged.",
    );
  });

  it("refuses a file of another type with the reason and writes nothing", async () => {
    const { assets, fs, files } = fakeWorkspace({ "Assets/Images/harbor.png": "old" });
    await assets.load();
    await expect(assets.replace("Assets/Images/harbor.png", picked("ring.wav", "wav"))).rejects.toThrow(
      "ring.wav is a sound, and harbor.png is an image. Choose an image to replace it.",
    );
    expect(fs.createFiles).not.toHaveBeenCalled();
    expect(files.get("Assets/Images/harbor.png")).toBe("old");
    expect(mocks.recordReplace).not.toHaveBeenCalled();
  });

  it("says the old file is still there only after reading it back unchanged", async () => {
    const { assets, fs } = fakeWorkspace({ "Assets/Images/harbor.png": "old" });
    await assets.load();
    fs.createFiles.mockRejectedValueOnce(new Error("The storage is full"));
    await expect(assets.replace("Assets/Images/harbor.png", picked("night.png", "new"))).rejects.toThrow(
      "Couldn't replace harbor.png: The storage is full. The old file is still there.",
    );
    expect(fs.readFile).toHaveBeenCalledTimes(2);
    expect(mocks.recordReplace).not.toHaveBeenCalled();
  });

  it("does not claim the old file is back when it cannot be read after a failed write", async () => {
    const { assets, fs } = fakeWorkspace({ "Assets/Images/harbor.png": "old" });
    await assets.load();
    fs.createFiles.mockRejectedValueOnce(new Error("The write was cut off"));
    fs.readFile.mockResolvedValueOnce(bytes("old")).mockRejectedValueOnce(new Error("gone"));
    await expect(assets.replace("Assets/Images/harbor.png", picked("night.png", "new"))).rejects.toThrow(
      "Couldn't replace harbor.png: The write was cut off. What it holds now could not be confirmed, so open it to check.",
    );
  });

  it("reloads the listing after a failed write, so the inspector shows what the file holds now", async () => {
    const { assets, fs, files } = fakeWorkspace({ "Assets/Images/harbor.png": "old" });
    await assets.load();
    expect(workspace.assetListing.value!.files["Assets/Images/harbor.png"]!.size).toBe(3);
    fs.createFiles.mockImplementationOnce(async () => {
      files.set("Assets/Images/harbor.png", "part");
      throw new Error("The write was cut off");
    });
    await expect(assets.replace("Assets/Images/harbor.png", picked("night.png", "new"))).rejects.toThrow(
      "What it holds now could not be confirmed",
    );
    expect(workspace.assetListing.value!.files["Assets/Images/harbor.png"]!.size).toBe(4);
  });

  it("reports a replace that landed although the write reported an error", async () => {
    const { assets, fs, files } = fakeWorkspace({ "Assets/Images/harbor.png": "old" });
    await assets.load();
    fs.createFiles.mockImplementationOnce(async ({ files: written }) => {
      files.set("Assets/Images/harbor.png", text(written[0]!.data));
      throw new Error("The change list could not be sent");
    });
    expect(await assets.replace("Assets/Images/harbor.png", picked("night.png", "new"))).toBe("Assets/Images/harbor.png");
    expect(mocks.recordReplace.mock.calls[0]![0].message).toBe(
      "Replaced, though saving harbor.png reported a problem: The change list could not be sent",
    );
  });
});

describe("A link's address", () => {
  it("writes a new address into the link file, trimmed, and refuses an empty one or a file that is not a link", async () => {
    const { assets, fs, files, window } = fakeWorkspace({
      "Assets/Images/sky.url": "https://example.com/old.png",
      "Assets/Images/harbor.png": "png",
    });
    await assets.setAddress("Assets/Images/sky.url", "  https://example.com/new.png ");
    expect(fs.writeTextDocument).toHaveBeenCalledWith({
      textDocument: { uri: uri("Assets/Images/sky.url"), version: 0, text: "https://example.com/new.png" },
    });
    expect(files.get("Assets/Images/sky.url")).toBe("https://example.com/new.png");
    expect(window.recordAssetChange).toHaveBeenCalled();
    await expect(assets.setAddress("Assets/Images/sky.url", "   ")).rejects.toThrow("Enter the address the link points to.");
    await expect(assets.setAddress("Assets/Images/harbor.png", "https://example.com/x.png")).rejects.toThrow(
      "harbor.png is not a link.",
    );
    expect(fs.writeTextDocument).toHaveBeenCalledTimes(1);
  });
});

describe("Download and the text frame", () => {
  it("downloads the file's own bytes under its own name and reads a text file's contents", async () => {
    const { assets } = fakeWorkspace({ "Assets/Text/notes.txt": "The lamps come on." });
    await assets.download("Assets/Text/notes.txt");
    const [name, type, data] = mocks.downloadFile.mock.calls[0]!;
    expect([name, type, text(data)]).toEqual(["notes.txt", "application/octet-stream", "The lamps come on."]);
    expect(await assets.readText("Assets/Text/notes.txt")).toBe("The lamps come on.");
  });
});

describe("the Variants tester's picture", () => {
  const pictured = (src: string) => ({ image: { kai: { $type: "image", $name: "kai", src } } });

  it("draws the combination from the compiled program and redraws it when the program changes", async () => {
    const { assets, ls } = fakeWorkspace({});
    ls.getProgram.mockImplementation(async () => ({ context: pictured("/one.png") }));
    const seen: (string | null)[] = [];
    const stop = assets.watchPicture({ image: "kai", attributes: [] }, (src) => seen.push(src));
    await settle();
    sendProtocolMessage(CompiledProgramMessage.type.notification({ program: { context: pictured("/two.png") } } as never));
    await settle();
    stop();
    sendProtocolMessage(CompiledProgramMessage.type.notification({ program: { context: pictured("/three.png") } } as never));
    await settle();
    expect(seen).toEqual(["/one.png", "/two.png"]);
  });

  it("draws nothing before the language server has a program", async () => {
    const { assets, ls } = fakeWorkspace({});
    ls.getProgram.mockImplementation(async () => {
      throw new Error("Language server not initialized.");
    });
    const seen: (string | null)[] = [];
    const stop = assets.watchPicture({ image: "kai", attributes: [] }, (src) => seen.push(src));
    await settle();
    stop();
    expect(seen).toEqual([null]);
  });
});
