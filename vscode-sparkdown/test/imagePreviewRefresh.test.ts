import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SparkdownWorkspace } from "../../packages/sparkdown/src/workspace/classes/SparkdownWorkspace";
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

class ImageWorkspace extends SparkdownWorkspace {
  updates: any[] = [];
  constructor() {
    super("");
    this._compilerConfigured = true;
    this._imageFilePattern = /\.png$/;
    this._compilerChannelConnection = {
      sendRequest: async (_type: unknown, params: any) => {
        this.updates.push(params.file);
      },
    } as any;
  }
  protected override async connectToWorker() {}
  async sendRequest(): Promise<any> { return undefined; }
  async sendNotification() {}
  async getFileText() { return ""; }
  async getFileSrc(uri: string) { return uri; }
  async getFileVersion(uri: string): Promise<any> {
    return executeLanguageCommand({ command: "sparkdown.getFileVersion", arguments: [uri] });
  }
  async getFileLanguageId(): Promise<any> { return null; }
}

beforeEach(() => {
  host.uiKind = 1;
  vi.stubGlobal("Worker", class {
    postMessage() {}
    addEventListener() {}
    removeEventListener() {}
    terminate() {}
  });
  vi.stubGlobal("fetch", async () => { throw new Error("bridge only"); });
  vi.stubGlobal("createImageBitmap", async (blob: Blob) => ({
    width: 10, height: 10, text: await blob.text(), close() {},
  }));
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

describe("image previews across workspace file events", () => {
  it("reuses unchanged previews and refreshes same-size edits and delete/recreate events", async () => {
    const watchers = getWorkspaceFileWatchers();
    const events = watchers[1] as unknown as ReturnType<typeof watcher>;
    const initial = await getWorkspaceImageFile({ toString: () => URI } as any);
    const workspace = new ImageWorkspace();
    let bytes = "old";
    const read = vi.fn(async () => btoa(bytes));
    const original = await workspace.loadFile({ uri: URI });
    expect(original.version).toBe(initial.version);
    expect(text(await preview(original, read))).toBe("old");
    expect(text(await preview(original, read))).toBe("old");
    expect(read).toHaveBeenCalledTimes(1);

    bytes = "new";
    events.emit("change");
    const changed = await workspace.changeFile(URI);
    expect(changed?.version).not.toBe(original.version);
    expect(workspace.updates.at(-1)?.version).toBe(changed?.version);
    expect(text(await preview(changed, read))).toBe("new");
    expect(text(await preview(changed, read))).toBe("new");
    expect(read).toHaveBeenCalledTimes(2);

    events.emit("delete");
    await workspace.deleteFile(URI);
    bytes = "red";
    events.emit("create");
    const recreated = await workspace.createFile(URI);
    expect(recreated.version).not.toBe(original.version);
    expect(recreated.version).not.toBe(changed?.version);
    expect(text(await preview(recreated, read))).toBe("red");
    expect(read).toHaveBeenCalledTimes(3);
    watchers.forEach(watcher => watcher.dispose());
    expect(await workspace.getFileVersion(URI)).toBeNull();
    const restarted = getWorkspaceFileWatchers();
    const replacement = await getWorkspaceImageFile({ toString: () => URI } as any);
    expect(replacement.version).not.toBe(recreated.version);
    restarted.forEach(watcher => watcher.dispose());
  });

  it("keeps web images unversioned and rereads changed bytes without watcher events", async () => {
    host.uiKind = 2;
    const watchers = getWorkspaceFileWatchers();
    const initial = await getWorkspaceImageFile({ toString: () => URI } as any);
    expect(initial.version).toBeNull();
    expect(await new ImageWorkspace().getFileVersion(URI)).toBeNull();
    const file = { ...initial, src: URI };
    let bytes = "old";
    const read = vi.fn(async () => btoa(bytes));
    expect(text(await preview(file, read))).toBe("old");
    bytes = "new";
    expect(text(await preview(file, read))).toBe("new");
    expect(read).toHaveBeenCalledTimes(2);
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
});
