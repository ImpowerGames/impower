import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getImageCompositeSrc } from "../../packages/sparkdown/src/compiler/utils/getImageComposite";
import { getWorkspaceFileWatchers } from "../src/utils/getWorkspaceFileWatchers";
import { getWorkspaceImageFile } from "../src/utils/getWorkspaceImageFile";
import { executeLanguageCommand } from "../src/utils/executeLanguageCommand";

const URI = "vscode-vfs:///preview-refresh/hero.png";
const host = vi.hoisted(() => ({ uiKind: 1 }));

const watcher = () => {
  const listeners: Record<string, (uri: { toString(): string }) => void> = {};
  return {
    onDidChange: (listener: any) => { listeners["change"] = listener; },
    onDidCreate: (listener: any) => { listeners["create"] = listener; },
    onDidDelete: (listener: any) => { listeners["delete"] = listener; },
    dispose: vi.fn(),
    emit: (event: string) => listeners[event]?.({ toString: () => URI }),
  };
};

vi.mock("vscode", () => ({
  env: { get uiKind() { return host.uiKind; } },
  UIKind: { Desktop: 1, Web: 2 },
  workspace: {
    createFileSystemWatcher: () => watcher(),
    getConfiguration: () => ({ scriptFiles: "*.sd", imageFiles: "*.png", audioFiles: "*.wav", fontFiles: "*.ttf", worldFiles: "*.json" }),
  },
}));
vi.mock("../src/managers/SparkdownPreviewGamePanelManager", () => ({ SparkdownPreviewGamePanelManager: { instance: {} } }));
vi.mock("../src/utils/getEditor", () => ({ getEditor: () => undefined }));
vi.mock("../src/utils/getOpenTextDocument", () => ({ getOpenTextDocument: async () => null }));

beforeEach(() => {
  host.uiKind = 1;
  vi.stubGlobal("Worker", class {
    postMessage() {}
    addEventListener() {}
    removeEventListener() {}
    terminate() {}
  });
  vi.stubGlobal("fetch", async () => { throw new Error("bridge only"); });
  vi.stubGlobal("createImageBitmap", vi.fn(async (blob: Blob) => ({
    width: 10, height: 10, text: await blob.text(), close() {},
  })));
  vi.stubGlobal("OffscreenCanvas", class {
    drawn: string[] = [];
    getContext() { return { drawImage: (bitmap: any) => this.drawn.push(bitmap.text) }; }
    async convertToBlob() { return new Blob([this.drawn.join(",")], { type: "image/webp" }); }
  });
});
afterEach(() => vi.unstubAllGlobals());

const preview = (file: any, readFileBytes: (uri: string) => Promise<string | undefined>) => {
  const image = { ...file, $type: "image", $name: "hero" };
  return getImageCompositeSrc({ image: { hero: image } }, image, { readFileBytes });
};
const text = (src: string | undefined) => src ? atob(src.split(",")[1]!) : undefined;

describe("image preview freshness and bridge lifetime", () => {
  it.each([1, 2])("refreshes same-size edits and delete/recreate without watcher events (UI kind %s)", async uiKind => {
    host.uiKind = uiKind;
    const watchers = getWorkspaceFileWatchers();
    const initial = await getWorkspaceImageFile({ toString: () => URI } as any);
    expect(initial.version).toBeNull();
    expect(await executeLanguageCommand({ command: "sparkdown.getFileVersion", arguments: [URI] })).toBeNull();
    const file = { ...initial, src: URI };
    let bytes = "old";
    const read = vi.fn(async () => btoa(bytes));
    expect(text(await preview(file, read))).toBe("old");
    const decoded = vi.mocked(createImageBitmap).mock.calls.length;
    expect(text(await preview(file, read))).toBe("old");
    expect(read).toHaveBeenCalledTimes(2);
    // Reuse decoding/composition only after checking the current bytes.
    expect(createImageBitmap).toHaveBeenCalledTimes(decoded);
    bytes = "new";
    expect(text(await preview(file, read))).toBe("new");
    read.mockRejectedValueOnce(new Error("deleted"));
    expect(await preview(file, read)).toBeUndefined();
    bytes = "red";
    expect(text(await preview(file, read))).toBe("red");
    expect(read).toHaveBeenCalledTimes(5);
    watchers.forEach(watcher => watcher.dispose());
  });

  it.each([undefined, 7])("isolates bridge sessions (revision %s)", async version => {
    const file = { uri: URI, src: URI, version };
    expect(text(await preview(file, async () => btoa("one")))).toBe("one");
    expect(text(await preview(file, async () => btoa("two")))).toBe("two");
  });

  it.each([undefined, 8])("retries a transient bridge failure (revision %s)", async version => {
    const file = { uri: URI, src: URI, version };
    const read = vi.fn().mockRejectedValueOnce(new Error("temporarily unavailable"))
      .mockResolvedValue(btoa("new"));
    expect(await preview(file, read)).toBeUndefined();
    expect(text(await preview(file, read))).toBe("new");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, 9])("retries a transient image decode failure (revision %s)", async version => {
    const file = { uri: URI, src: URI, version };
    const read = vi.fn(async () => btoa("decoded"));
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error("decoder temporarily unavailable"));
    expect(await preview(file, read)).toBeUndefined();
    expect(text(await preview(file, read))).toBe("decoded");
    expect(createImageBitmap).toHaveBeenCalledTimes(2);
  });
});
