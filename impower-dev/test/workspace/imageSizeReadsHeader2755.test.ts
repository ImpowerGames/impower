import { afterEach, describe, expect, it, vi } from "vitest";
import { imageSizeFixtures } from "@impower/sparkdown/src/tests/morph/imageSizeFixtures";
import { IMAGE_HEADER_BYTES } from "@impower/sparkdown/src/workspace/utils/imageSize";
import {
  memoryLocks,
  memoryRoot,
  writeMemoryFile,
  MemoryDirectory,
} from "../../../packages/opfs-workspace/test/memoryOpfs";

const PROJECT = "local";

const settings = {
  scriptFiles: "*.{sd,luau}",
  imageFiles: "*.{png,jpg,jpeg,gif,webp,svg}",
  audioFiles: "*.{mp3,wav,ogg}",
  videoFiles: "*.{mp4,webm}",
  fontFiles: "*.{ttf,otf,woff,woff2}",
};

let workers: { deliver(message: unknown): void }[] = [];

afterEach(() => {
  workers = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as { storage?: unknown }).storage;
  delete (navigator as { locks?: unknown }).locks;
});

async function load(root: MemoryDirectory) {
  vi.resetModules();
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: { getDirectory: async () => root },
  });
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: memoryLocks(),
  });
  class LoopbackWorker {
    listeners: ((event: { data: unknown }) => void)[] = [];
    onerror = null;
    constructor() {
      workers.push(this);
    }
    addEventListener(_type: string, listener: (event: { data: unknown }) => void) {
      this.listeners.push(listener);
    }
    postMessage(message: unknown) {
      const data = structuredClone(message);
      setTimeout(() => void (globalThis as any).onmessage({ data }), 0);
    }
    deliver(message: unknown) {
      const data = structuredClone(message);
      setTimeout(() => this.listeners.forEach((listener) => listener({ data })), 0);
    }
  }
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  });
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, {
      createObjectURL: () => "blob:test",
      revokeObjectURL: () => {},
    }),
  );
  vi.stubGlobal("Worker", LoopbackWorker);
  vi.stubGlobal("BroadcastChannel", class { onmessage = null; postMessage() {} close() {} });
  vi.stubGlobal("postMessage", (message: unknown) =>
    workers.forEach((w) => w.deliver(message)),
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  await import("../../../packages/opfs-workspace/src/opfs-workspace");
  await (globalThis as any).onmessage({
    data: { jsonrpc: "2.0", method: "workspace/didChangeConfiguration", params: { settings } },
  });
  const { default: WorkspaceFileSystem } = await import(
    "../../src/modules/spark-editor/workspace/WorkspaceFileSystem"
  );
  const ls = {
    connection: { onRequest() {}, sendNotification() {} },
    start: async () => {},
  };
  const fs = new WorkspaceFileSystem(ls as never, { settings, onDidChange: () => () => {} } as never);
  await fs.getFiles(PROJECT);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return fs;
}

describe("the editor's image-size read", () => {
  it("takes only the image header out of storage for a large image", async () => {
    const png = imageSizeFixtures().find((f) => f.mime === "image/png" && !f.exif && f.read)!;
    const bytes = new Uint8Array(IMAGE_HEADER_BYTES * 4);
    bytes.set(png.bytes);
    const root = memoryRoot();
    writeMemoryFile(root, `${PROJECT}/main.sd`, new TextEncoder().encode("x"));
    for (const marker of [".layout", ".folders"]) writeMemoryFile(root, `${PROJECT}/${marker}`, new TextEncoder().encode("1"));
    const image = writeMemoryFile(root, `${PROJECT}/large.png`, bytes);
    const fs = await load(root);
    image.bytesRead = 0;

    const size = await fs.getFileImageSize(`file://${PROJECT}/large.png`);

    expect(size).toEqual(png.read);
    expect(image.bytesRead).toBeGreaterThan(0);
    expect(image.bytesRead).toBeLessThanOrEqual(IMAGE_HEADER_BYTES);
  });

  it("reads a whole file without a length and only its start with one", async () => {
    const root = memoryRoot();
    writeMemoryFile(root, `${PROJECT}/main.sd`, new TextEncoder().encode("x"));
    for (const marker of [".layout", ".folders"]) writeMemoryFile(root, `${PROJECT}/${marker}`, new TextEncoder().encode("1"));
    const bytes = new Uint8Array(IMAGE_HEADER_BYTES * 2).fill(7);
    writeMemoryFile(root, `${PROJECT}/data.png`, bytes);
    const fs = await load(root);

    const whole = await fs.readFile({ file: { uri: `file://${PROJECT}/data.png` } });
    const start = await fs.readFile({ file: { uri: `file://${PROJECT}/data.png` }, length: 10 });

    expect(whole.byteLength).toBe(bytes.byteLength);
    expect(new Uint8Array(start)).toEqual(bytes.slice(0, 10));
  });
});
