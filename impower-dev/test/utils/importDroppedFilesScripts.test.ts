import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createFiles: vi.fn(async () => undefined),
  recordScriptChange: vi.fn(async () => undefined),
  recordAssetChange: vi.fn(async () => undefined),
  recordResolvedUpload: vi.fn(async () => undefined),
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
    fs: { createFiles: mocks.createFiles },
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
