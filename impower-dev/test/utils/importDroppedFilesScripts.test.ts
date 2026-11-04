import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createFiles: vi.fn(async () => undefined),
  recordScriptChange: vi.fn(async () => undefined),
  recordAssetChange: vi.fn(async () => undefined),
  recordResolvedUpload: vi.fn(async () => undefined),
  existing: [] as string[],
}));

vi.mock("../../src/modules/spark-editor/utils/uploadConflicts", () => ({
  resolveUploadConflicts: async (
    projectId: string,
    items: { rel: string; payload: unknown }[],
    write: (resolved: {
      survivors: { uri: string; payload: unknown }[];
      trashedOldUris: string[];
      since: number;
    }) => Promise<void>,
  ) =>
    write({
      survivors: items.map((it) => ({
        uri: `file://${projectId}/${it.rel}`,
        payload: it.payload,
      })),
      trashedOldUris: [],
      since: 0,
    }),
}));

vi.mock("../../src/modules/spark-editor/utils/importProgress", () => ({
  runImport: async (
    _count: number,
    work: (advance: () => void) => Promise<void>,
  ) => work(() => {}),
}));

vi.mock("../../src/modules/spark-editor/utils/fileUndo", () => ({
  recordResolvedUpload: mocks.recordResolvedUpload,
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: {
      createFiles: mocks.createFiles,
      getFiles: async () =>
        Object.fromEntries(mocks.existing.map((rel) => [`file://p/${rel}`, {}])),
      getRelativePath: (projectId: string, uri: string) =>
        uri.slice(`file://${projectId}/`.length),
    },
    window: {
      recordScriptChange: mocks.recordScriptChange,
      recordAssetChange: mocks.recordAssetChange,
    },
  },
}));

const { importDroppedFiles } = await import(
  "../../src/modules/spark-editor/utils/importDroppedFiles"
);

const dropped = (rel: string) => ({
  rel,
  getBuffer: async () => new ArrayBuffer(1),
});

describe("importDroppedFiles change recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a script change for a dropped .luau", async () => {
    await importDroppedFiles("p", [dropped("scripts/util.luau")]);
    expect(mocks.createFiles).toHaveBeenCalledWith({
      files: [{ uri: "file://p/scripts/util.luau", data: expect.any(ArrayBuffer) }],
    });
    expect(mocks.recordScriptChange).toHaveBeenCalledTimes(1);
  });

  it("records a script change for a dropped .sd", async () => {
    await importDroppedFiles("p", [dropped("scripts/intro.sd")]);
    expect(mocks.recordScriptChange).toHaveBeenCalledTimes(1);
  });

  it("records no script change for dropped assets", async () => {
    await importDroppedFiles("p", [
      dropped("assets/hero.png"),
      dropped("assets/notes.txt"),
    ]);
    expect(mocks.recordScriptChange).not.toHaveBeenCalled();
    expect(mocks.recordAssetChange).toHaveBeenCalledTimes(1);
  });
});

describe("importDroppedFiles routing into the layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existing = [];
  });

  const createdPaths = () =>
    (
      mocks.createFiles.mock.calls[0] as unknown as [
        { files: { uri: string }[] },
      ]
    )[0].files.map((f) => f.uri.slice("file://p/".length));

  it("files a dropped asset under assets/ and a dropped script under scripts/ whichever list received them", async () => {
    mocks.existing = ["main.sd"];
    await importDroppedFiles("p", [
      dropped("scripts/art/hero.png"),
      dropped("assets/intro.sd"),
      dropped("assets/urls/notes.txt"),
      dropped("scripts/song.url"),
    ]);
    expect(createdPaths()).toEqual([
      "assets/art/hero.png",
      "scripts/intro.sd",
      "assets/notes.txt",
      "assets/urls/song.url",
    ]);
  });

  it("keeps a file dropped inside a sub-project's folder with that sub-project", async () => {
    mocks.existing = ["main.sd", "scripts/other/main.sd"];
    await importDroppedFiles("p", [
      dropped("scripts/other/assets/forest.svg"),
      dropped("scripts/fresh/main.sd"),
      dropped("scripts/fresh/tree.png"),
    ]);
    expect(createdPaths()).toEqual([
      "scripts/other/assets/forest.svg",
      "scripts/fresh/main.sd",
      "scripts/fresh/tree.png",
    ]);
  });
});
