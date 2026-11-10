import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  memoryRoot,
  writeMemoryFile,
} from "../../../packages/opfs-workspace/test/memoryOpfs";
import type WorkspaceFileSystemType from "../../src/modules/spark-editor/workspace/WorkspaceFileSystem";

class StubWorker {
  onerror = null;
  addEventListener() {}
  postMessage() {}
}

let fs: WorkspaceFileSystemType;
const root = memoryRoot();

beforeEach(async () => {
  vi.stubGlobal("Worker", StubWorker);
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: { getDirectory: async () => root },
  });
  const { default: WorkspaceFileSystem } = await import(
    "../../src/modules/spark-editor/workspace/WorkspaceFileSystem"
  );
  fs = new WorkspaceFileSystem(
    { connection: { sendNotification() {} } } as never,
    { settings: {}, onDidChange: () => () => {} } as never,
  );
});

afterEach(() => {
  delete (navigator as { storage?: unknown }).storage;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reading a project's metadata as stored", () => {
  it("reads what is on disk, which another tab may have written after this tab's cache", async () => {
    writeMemoryFile(root, "local/.remindedAt", new TextEncoder().encode("1794312000000"));
    expect(await fs.readStoredProjectMetadata("local", "remindedAt")).toBe(
      "1794312000000",
    );
  });

  it("reads a field that was never written as empty", async () => {
    expect(await fs.readStoredProjectMetadata("local", "backedUpAt")).toBe("");
    expect(await fs.readStoredProjectMetadata("drive-123", "backedUpAt")).toBe("");
  });
});

describe("removing batches from the trash", () => {
  const steps: string[] = [];

  beforeEach(() => {
    steps.length = 0;
    vi.spyOn(fs, "listTrash").mockResolvedValue([
      { batchId: "a", deletedAt: 5_000, entries: [] },
      { batchId: "b", deletedAt: 9_000, entries: [] },
    ]);
    vi.spyOn(fs, "writeProjectMetadata").mockImplementation(
      async (_id, field, value) => {
        steps.push(`keep ${field}=${value}`);
      },
    );
    const requests = fs as unknown as {
      sendRequest: (type: unknown, params: { action: string }) => Promise<unknown>;
    };
    vi.spyOn(requests, "sendRequest").mockImplementation(async (_type, params) => {
      steps.push(`request ${params.action}`);
      return {};
    });
  });

  it.each<[string, (fs: WorkspaceFileSystemType) => Promise<void>, string]>([
    ["emptying it", (fs) => fs.emptyTrash("local"), "empty"],
    ["deleting one batch", (fs) => fs.deleteTrashBatch("local", "b"), "deleteBatch"],
    ["purging expired batches", (fs) => fs.purgeExpiredTrash("local"), "purge"],
  ])("keeps the newest deletion time before %s", async (_case, remove, action) => {
    await remove(fs);
    expect(steps).toEqual(["keep deletedAt=9000", `request ${action}`]);
  });

  it("never moves the kept deletion time back", async () => {
    writeMemoryFile(root, "local/.deletedAt", new TextEncoder().encode("20000"));
    await fs.emptyTrash("local");
    expect(steps).toEqual(["request empty"]);
  });
});
