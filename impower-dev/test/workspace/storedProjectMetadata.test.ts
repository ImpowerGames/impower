import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryDirectory,
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
let root: MemoryDirectory;
const steps: string[] = [];
const encode = (text: string) => new TextEncoder().encode(text);

const recordSteps = () => {
  vi.spyOn(fs, "writeProjectMetadata").mockImplementation(
    async (id, field, value) => {
      writeMemoryFile(root, `${id}/.${field}`, encode(value));
      steps.push(`keep ${field}=${value}`);
    },
  );
  const requests = fs as unknown as {
    sendRequest: (
      type: unknown,
      params: { action?: string; batchId?: string },
    ) => Promise<unknown>;
  };
  vi.spyOn(requests, "sendRequest").mockImplementation(async (_type, params) => {
    steps.push(
      ["request", params.action ?? "deleteFiles", params.batchId]
        .filter(Boolean)
        .join(" "),
    );
    return { uris: [] };
  });
};

beforeEach(async () => {
  steps.length = 0;
  root = memoryRoot();
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
    writeMemoryFile(root, "local/.remindedAt", encode("1794312000000"));
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
  beforeEach(() => {
    vi.spyOn(fs, "listTrash").mockResolvedValue([
      { batchId: "a", deletedAt: 5_000, entries: [] },
      { batchId: "b", deletedAt: 9_000, entries: [] },
    ]);
    recordSteps();
  });

  it("keeps the newest deletion time, then empties only the batches it saw", async () => {
    await fs.emptyTrash("local");
    expect(steps).toEqual([
      "keep deletedAt=9000",
      "request deleteBatch a",
      "request deleteBatch b",
    ]);
  });

  it.each<[string, (fs: WorkspaceFileSystemType) => Promise<void>, string]>([
    ["deleting one batch", (fs) => fs.deleteTrashBatch("local", "b"), "request deleteBatch b"],
    ["purging expired batches", (fs) => fs.purgeExpiredTrash("local"), "request purge"],
  ])("keeps the newest deletion time before %s", async (_case, remove, request) => {
    await remove(fs);
    expect(steps).toEqual(["keep deletedAt=9000", request]);
  });

  it("never moves the kept deletion time back", async () => {
    writeMemoryFile(root, "local/.deletedAt", encode("20000"));
    await fs.emptyTrash("local");
    expect(steps).toEqual(["request deleteBatch a", "request deleteBatch b"]);
  });

  it("keeps the newest deletion time when two removals overlap", async () => {
    const listings = [
      [{ batchId: "a", deletedAt: 5_000, entries: [] }],
      [{ batchId: "b", deletedAt: 9_000, entries: [] }],
    ];
    vi.mocked(fs.listTrash).mockImplementation(async () => listings.shift()!);
    const read = fs.readStoredProjectMetadata.bind(fs);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    vi.spyOn(fs, "readStoredProjectMetadata").mockImplementation(
      async (id, field) => {
        const value = await read(id, field);
        if (first) {
          first = false;
          await held;
        }
        return value;
      },
    );
    const earlier = fs.deleteTrashBatch("local", "a");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const later = fs.deleteTrashBatch("local", "b");
    await new Promise((resolve) => setTimeout(resolve, 5));
    release();
    await Promise.all([earlier, later]);
    expect(await read("local", "deletedAt")).toBe("9000");
  });
});

describe("changes that leave no time of their own", () => {
  let now: number;

  beforeEach(() => {
    now = 7_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    recordSteps();
    const requests = fs as unknown as {
      sendRequest: (type: unknown, params: { action?: string }) => Promise<unknown>;
    };
    const record = vi.mocked(requests.sendRequest).getMockImplementation()!;
    vi.mocked(requests.sendRequest).mockImplementation(async (type, params) => {
      const result = await record(type, params);
      now = 8_000;
      return result;
    });
  });

  it.each<[string, (fs: WorkspaceFileSystemType) => Promise<unknown>, string]>([
    ["creating a folder", (fs) => fs.createFolder("local", "chapters"), "request create"],
    ["deleting a folder", (fs) => fs.deleteFolders("local", ["chapters"]), "request delete"],
    [
      "deleting a file outright",
      (fs) => fs.deleteFiles({ files: [{ uri: fs.getFileUri("local", "notes.sd") }] }),
      "request deleteFiles",
    ],
  ])("records the change time before and after %s", async (_case, change, request) => {
    await change(fs);
    expect(steps).toEqual(["keep changedAt=7000", request, "keep changedAt=8000"]);
  });

  it("leaves a deletion to the trash its own time", async () => {
    await fs.deleteFiles({
      files: [{ uri: fs.getFileUri("local", "notes.sd") }],
      mode: "trash",
    });
    expect(steps).toEqual(["request deleteFiles"]);
  });
});
