import { beforeEach, describe, expect, test, vi } from "vitest";
import { imageSizeFixtures } from "@impower/sparkdown/test/morph/imageSizeFixtures";

const state = vi.hoisted(() => ({
  bytes: new Uint8Array() as Uint8Array<ArrayBufferLike>,
  mtime: 1,
  reads: 0,
}));

vi.mock("vscode", () => ({
  Uri: { parse: (text: string) => ({ toString: () => text }) },
  workspace: {
    fs: {
      stat: async () => ({ mtime: state.mtime, size: state.bytes.byteLength }),
      readFile: async () => {
        state.reads++;
        return state.bytes;
      },
    },
  },
}));

vi.mock("../src/managers/SparkdownPreviewGamePanelManager", () => ({
  SparkdownPreviewGamePanelManager: { instance: {} },
}));
vi.mock("../src/utils/getEditor", () => ({ getEditor: () => undefined }));
vi.mock("../src/utils/getOpenTextDocument", () => ({ getOpenTextDocument: async () => undefined }));

const png = imageSizeFixtures().find((f) => f.mime === "image/png" && !f.exif && f.read)!;
const widened = () => {
  const bytes = png.bytes.slice();
  new DataView(bytes.buffer).setUint32(16, png.read!.width * 2);
  return bytes;
};

const size = async (uri: string) => {
  const { executeLanguageCommand } = await import("../src/utils/executeLanguageCommand");
  return executeLanguageCommand({ command: "sparkdown.getFileImageSize", arguments: [uri] });
};

beforeEach(() => {
  vi.resetModules();
  state.bytes = png.bytes;
  state.mtime = 1;
  state.reads = 0;
});

describe("the extension's image-size read (#2755)", () => {
  test("reads an unchanged image once when the language server and the player both ask", async () => {
    const uri = "file:///project/face.png";
    const { executeLanguageCommand } = await import("../src/utils/executeLanguageCommand");
    const ask = () => executeLanguageCommand({ command: "sparkdown.getFileImageSize", arguments: [uri] });
    expect(await Promise.all([ask(), ask()])).toEqual([png.read, png.read]);
    expect(await ask()).toEqual(png.read);
    expect(state.reads).toBe(1);
  });

  test("reads the image again once it changes on disk", async () => {
    const uri = "file:///project/face.png";
    const { executeLanguageCommand } = await import("../src/utils/executeLanguageCommand");
    const ask = () => executeLanguageCommand({ command: "sparkdown.getFileImageSize", arguments: [uri] });
    expect(await ask()).toEqual(png.read);
    state.bytes = widened();
    state.mtime = 2;
    expect(await ask()).toEqual({ width: png.read!.width * 2, height: png.read!.height });
    expect(state.reads).toBe(2);
  });

  test("answers null for a file that cannot be read", async () => {
    state.bytes = new Uint8Array([1, 2, 3]);
    expect(await size("file:///project/broken.png")).toBeNull();
  });
});
