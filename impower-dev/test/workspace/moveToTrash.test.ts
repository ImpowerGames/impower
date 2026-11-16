import { beforeEach, expect, it, vi } from "vitest";

const recordTrashDeletion = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../src/modules/spark-editor/utils/fileUndo", () => ({ recordTrashDeletion }));

const { moveToTrash } = await import("../../src/modules/spark-editor/workspace/moveToTrash");

const PROJECT = "p";
const uri = (path: string) => `file:///${PROJECT}/${path}`;

const refusal = (files: string[], skipped: string[]) => ({
  code: -32603,
  message: `Cannot move ${skipped.join(", ")} to the bin`,
  data: { files: files.map((u) => ({ uri: u })), skipped },
});

const fakeFs = (overrides: Record<string, unknown> = {}) => ({
  getFileUri: (projectId: string, path: string) => `file:///${projectId}/${path}`,
  deleteFiles: vi.fn(async () => []),
  deleteFolder: vi.fn(async () => ({ files: [], folders: [] })),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

it("names the files the worker could not move and records only the moved ones, cached or not", async () => {
  const fs = fakeFs({
    deleteFiles: vi.fn(async () => {
      throw refusal([], [uri("Scripts/a.sd")]);
    }),
  });
  await expect(
    moveToTrash(fs as never, PROJECT, [
      { path: "Scripts/a.sd", folder: false },
      { path: "Scripts/b.sd", folder: false },
    ], "2 scripts"),
  ).rejects.toThrow("Couldn't move a.sd to the bin. It is still where it was.");
  const { batchKey } = (fs.deleteFiles.mock.calls[0] as unknown as [{ batchKey: string }])[0];
  expect(batchKey).toMatch(/^[0-9a-f]{32}$/);
  expect(recordTrashDeletion).toHaveBeenCalledWith(PROJECT, [uri("Scripts/b.sd")], "2 scripts", [batchKey], []);
});

it("records a folder's moved files and names its refused ones", async () => {
  const fs = fakeFs({
    deleteFolder: vi.fn(async () => {
      throw refusal([uri("Drafts/b.sd")], [uri("Drafts/a.sd")]);
    }),
  });
  await expect(
    moveToTrash(fs as never, PROJECT, [{ path: "Drafts", folder: true }], "Drafts"),
  ).rejects.toThrow("Couldn't move a.sd to the bin.");
  const batchKey = (fs.deleteFolder.mock.calls[0] as unknown[])[3];
  expect(fs.deleteFolder).toHaveBeenCalledWith(PROJECT, "Drafts", "trash", expect.stringMatching(/^[0-9a-f]{32}$/));
  expect(recordTrashDeletion).toHaveBeenCalledWith(PROJECT, [uri("Drafts/b.sd")], "Drafts", [batchKey], []);
});

it("passes on a worker failure that names no skipped files", async () => {
  const failure = { code: -32603, message: "storage gone" };
  const fs = fakeFs({
    deleteFiles: vi.fn(async () => {
      throw failure;
    }),
  });
  await expect(
    moveToTrash(fs as never, PROJECT, [{ path: "Scripts/a.sd", folder: false }], "a.sd"),
  ).rejects.toBe(failure);
  expect(recordTrashDeletion).not.toHaveBeenCalled();
});
