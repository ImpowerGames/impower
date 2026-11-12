import { beforeEach, describe, expect, it, vi } from "vitest";

type Resolved = { survivors: { uri: string; payload: unknown }[]; trashedOldUris: string[]; since: number };

const mocks = vi.hoisted(() => ({
  disk: new Map<string, ArrayBuffer>(),
  createFiles: vi.fn(async (_params: { files: { uri: string; data: ArrayBuffer }[] }) => undefined as unknown),
  deleteFiles: vi.fn(async (_params: { files: { uri: string }[] }) => undefined as unknown),
  readFile: vi.fn(async (_params: { file: { uri: string } }) => new ArrayBuffer(0)),
  recordScriptChange: vi.fn(async () => undefined),
  recordAssetChange: vi.fn(async () => undefined),
  recordResolvedUpload: vi.fn(async (..._args: unknown[]) => undefined),
  resolve: null as null | ((items: { rel: string; payload: unknown }[]) => Resolved),
}));

vi.mock("../../src/modules/spark-editor/utils/uploadConflicts", () => ({
  resolveUploadConflicts: async (
    projectId: string,
    items: { rel: string; payload: unknown }[],
    write: (resolved: Resolved) => Promise<void>,
  ) =>
    write(
      mocks.resolve?.(items) ?? {
        survivors: items.map((it) => ({ uri: `file://${projectId}/${it.rel}`, payload: it.payload })),
        trashedOldUris: [],
        since: 0,
      },
    ),
}));

vi.mock("../../src/modules/spark-editor/utils/importProgress", () => ({
  runImport: async (_count: number, work: (advance: () => void) => Promise<void>) => work(() => {}),
}));

vi.mock("../../src/modules/spark-editor/utils/fileUndo", () => ({
  recordResolvedUpload: mocks.recordResolvedUpload,
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: {
      createFiles: mocks.createFiles,
      deleteFiles: mocks.deleteFiles,
      readFile: mocks.readFile,
      getRelativePath: (projectId: string, uri: string) => uri.slice(`file://${projectId}/`.length),
    },
    window: {
      recordScriptChange: mocks.recordScriptChange,
      recordAssetChange: mocks.recordAssetChange,
    },
  },
}));

const { importFiles } = await import("../../src/modules/spark-editor/utils/importDroppedFiles");
const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");

const bytesOf = (rel: string) => {
  const buffer = new ArrayBuffer(rel.length);
  new Uint8Array(buffer).set(Array.from(rel, (char) => char.charCodeAt(0)));
  return buffer;
};

const dropped = (rel: string) => ({ rel, getBuffer: async () => bytesOf(rel) });

const save = (files: { uri: string; data: ArrayBuffer }[]) => {
  for (const file of files) mocks.disk.set(file.uri, file.data);
};

const rows = () =>
  workspace.uploads.value.map((row) =>
    row.state === "added" ? `${row.name}: added ${row.path}` : row.state === "failed" ? `${row.name}: ${row.reason.kind}` : `${row.name}: ${row.state}`,
  );

const writtenUris = () => mocks.createFiles.mock.calls.flatMap(([params]) => params.files.map((file) => file.uri));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve = null;
  mocks.disk.clear();
  mocks.createFiles.mockImplementation(async ({ files }) => save(files));
  mocks.deleteFiles.mockImplementation(async ({ files }) => {
    for (const file of files) mocks.disk.delete(file.uri);
  });
  mocks.readFile.mockImplementation(async ({ file }) => {
    const data = mocks.disk.get(file.uri);
    if (!data) throw new Error("NotFoundError");
    return data;
  });
  workspace.uploads.value = [];
});

describe("importFiles change recording", () => {
  it("records a script change for a dropped .luau", async () => {
    await importFiles("p", [dropped("scripts/util.luau")]);
    expect(mocks.createFiles).toHaveBeenCalledWith({
      files: [{ uri: "file://p/scripts/util.luau", data: expect.any(ArrayBuffer) }],
    });
    expect(mocks.recordScriptChange).toHaveBeenCalledTimes(1);
  });

  it("records one asset change and no script change for a batch of assets", async () => {
    await importFiles("p", [dropped("Assets/Images/hero.png"), dropped("Assets/Text/notes.txt")]);
    expect(mocks.recordScriptChange).not.toHaveBeenCalled();
    expect(mocks.recordAssetChange).toHaveBeenCalledTimes(1);
  });
});

describe("importFiles outcomes per file", () => {
  it("writes a large batch a few files at a time and lists each one as added where it landed", async () => {
    const names = Array.from({ length: 20 }, (_, i) => `Assets/Audio/track_${i}.ogg`);
    const returned = await importFiles("p", names.map(dropped));
    expect(mocks.createFiles.mock.calls.map(([params]) => params.files.length)).toEqual([8, 8, 4]);
    expect(returned).toEqual(names);
    expect(rows()).toEqual(names.map((path) => `${path.split("/").pop()}: added ${path}`));
    expect(mocks.recordResolvedUpload).toHaveBeenCalledWith("p", names.map((path) => `file://p/${path}`), [], 0, "20 files");
  });

  it("keeps the files added before storage ran out, lists the rest as not added, and removes what a failed write left", async () => {
    const names = Array.from({ length: 12 }, (_, i) => `Assets/Audio/t${i}.ogg`);
    let room = 10;
    mocks.createFiles.mockImplementation(async ({ files }) => {
      if (files.length > room) {
        room = Math.max(0, room - 1);
        throw new Error("QuotaExceededError: the quota has been exceeded.");
      }
      room -= files.length;
      save(files);
    });
    const returned = await importFiles("p", names.map(dropped));
    expect(returned).toEqual(names.slice(0, 9));
    expect(rows().filter((row) => row.endsWith("storage"))).toEqual(["t9.ogg: storage", "t10.ogg: storage", "t11.ogg: storage"]);
    expect(rows().filter((row) => row.includes(": added "))).toHaveLength(9);
    expect(mocks.deleteFiles.mock.calls.map(([params]) => params.files[0]!.uri)).toEqual(
      names.slice(9).map((path) => `file://p/${path}`),
    );
    expect(mocks.recordResolvedUpload.mock.calls[0]![1]).toEqual(names.slice(0, 9).map((path) => `file://p/${path}`));
  });

  it("lists a file whose name conflict was skipped as not added and writes nothing for it", async () => {
    mocks.resolve = (items) => ({
      survivors: items.slice(1).map((it) => ({ uri: `file://p/${it.rel}`, payload: it.payload })),
      trashedOldUris: [],
      since: 0,
    });
    await importFiles("p", [dropped("Assets/Images/hero.png"), dropped("Assets/Images/ada.png")]);
    expect(rows()).toEqual(["hero.png: skipped", "ada.png: added Assets/Images/ada.png"]);
    expect(writtenUris()).toEqual(["file://p/Assets/Images/ada.png"]);
  });

  it("says the earlier file is in the recycle bin when the copy chosen to replace it cannot be written", async () => {
    mocks.resolve = (items) => ({
      survivors: items.map((it) => ({ uri: `file://p/${it.rel}`, payload: it.payload })),
      trashedOldUris: ["file://p/Assets/Images/hero.png"],
      since: 5,
    });
    mocks.createFiles.mockImplementation(async ({ files }) => {
      if (files.some((file) => file.uri.endsWith("hero.png"))) {
        throw new Error("disk is full: not enough space");
      }
      save(files);
    });
    await importFiles("p", [dropped("Assets/Images/hero.png"), dropped("Assets/Images/ada.png")]);
    expect(rows()).toEqual(["hero.png: replace_failed", "ada.png: added Assets/Images/ada.png"]);
    const { uploadNote } = await import("../../src/modules/spark-editor/workspace/uploadSession");
    expect(uploadNote(workspace.uploads.value[0]!, () => "")).toBe(
      "Not added: this browser ran out of room for it. The file it was replacing is in the recycle bin, and Undo puts it back.",
    );
    expect(mocks.recordResolvedUpload).toHaveBeenCalledWith(
      "p",
      ["file://p/Assets/Images/ada.png"],
      ["file://p/Assets/Images/hero.png"],
      5,
      "ada.png",
    );
  });

  it("keeps a file the failed chunk already saved whole, without writing or deleting it again", async () => {
    let calls = 0;
    mocks.createFiles.mockImplementation(async ({ files }) => {
      calls += 1;
      if (calls === 1) {
        save(files.filter((file) => file.uri.endsWith("one.wav")));
      }
      throw new Error("QuotaExceededError: the quota has been exceeded.");
    });
    const returned = await importFiles("p", [dropped("Assets/Audio/one.wav"), dropped("Assets/Audio/two.wav")]);
    expect(returned).toEqual(["Assets/Audio/one.wav"]);
    expect(rows()).toEqual(["one.wav: added Assets/Audio/one.wav", "two.wav: storage"]);
    expect(new TextDecoder().decode(mocks.disk.get("file://p/Assets/Audio/one.wav"))).toBe("Assets/Audio/one.wav");
    expect(mocks.disk.has("file://p/Assets/Audio/two.wav")).toBe(false);
    expect(writtenUris().filter((uri) => uri.endsWith("one.wav"))).toHaveLength(1);
    expect(mocks.deleteFiles.mock.calls.map(([params]) => params.files[0]!.uri)).toEqual(["file://p/Assets/Audio/two.wav"]);
  });

  it("counts a file whose retry failed after its bytes landed as added", async () => {
    mocks.createFiles.mockImplementation(async ({ files }) => {
      save(files);
      throw new Error("the write could not be confirmed");
    });
    const returned = await importFiles("p", [dropped("Assets/Audio/one.wav")]);
    expect(returned).toEqual(["Assets/Audio/one.wav"]);
    expect(rows()).toEqual(["one.wav: added Assets/Audio/one.wav"]);
    expect(mocks.deleteFiles).not.toHaveBeenCalled();
  });

  it("lists a file that could not be read as not added and still adds the rest", async () => {
    await importFiles("p", [
      { rel: "Assets/Images/gone.png", getBuffer: async () => Promise.reject(new Error("NotReadableError")) },
      dropped("Assets/Images/ada.png"),
    ]);
    expect(rows()).toEqual(["gone.png: unreadable", "ada.png: added Assets/Images/ada.png"]);
  });
});
