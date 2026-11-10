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
