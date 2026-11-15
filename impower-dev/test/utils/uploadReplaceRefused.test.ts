import { expect, it, vi } from "vitest";

const deleteFiles = vi.hoisted(() => vi.fn());

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: {
      getFiles: async () => ({ "file:///p/a.png": {}, "file:///p/b.png": {} }),
      getRelativePath: (_projectId: string, uri: string) => uri.slice("file:///p/".length),
      getFileUri: (_projectId: string, rel: string) => `file:///p/${rel}`,
      deleteFiles,
    },
  },
}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

it("keeps an upload from replacing a file storage refused to move to the bin, and replaces the rest", async () => {
  deleteFiles.mockImplementation(async () => {
    throw {
      code: -32603,
      message: "Cannot move file:///p/a.png to the bin",
      data: { files: [{ uri: "file:///p/b.png" }], skipped: ["file:///p/a.png"] },
    };
  });
  const { conflictRequest, resolveUploadConflicts } = await import(
    "../../src/modules/spark-editor/utils/uploadConflicts"
  );
  const upload = resolveUploadConflicts(
    "p",
    [
      { rel: "a.png", payload: "new a" },
      { rel: "b.png", payload: "new b" },
    ],
    async (resolved) => resolved,
  );
  await settle();
  conflictRequest.peek()!.resolve({ action: "replace", applyToAll: true });
  conflictRequest.value = null;
  const resolved = await upload;
  expect(deleteFiles).toHaveBeenCalledWith({
    files: [{ uri: "file:///p/a.png" }, { uri: "file:///p/b.png" }],
    mode: "trash",
  });
  expect(resolved.survivors).toEqual([{ uri: "file:///p/b.png", payload: "new b" }]);
  expect(resolved.trashedOldUris).toEqual(["file:///p/b.png"]);
  expect(resolved.refused).toEqual(["new a"]);
});

it("passes on a trash failure that names no skipped files", async () => {
  const failure = { code: -32603, message: "storage gone" };
  deleteFiles.mockImplementation(async () => {
    throw failure;
  });
  const { conflictRequest, resolveUploadConflicts } = await import(
    "../../src/modules/spark-editor/utils/uploadConflicts"
  );
  const upload = resolveUploadConflicts("p", [{ rel: "a.png", payload: "new a" }], async (resolved) => resolved);
  await settle();
  conflictRequest.peek()!.resolve({ action: "replace", applyToAll: false });
  conflictRequest.value = null;
  await expect(upload).rejects.toBe(failure);
});
