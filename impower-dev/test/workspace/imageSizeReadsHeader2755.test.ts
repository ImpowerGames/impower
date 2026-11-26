import { afterEach, describe, expect, it } from "vitest";
import { imageSizeFixtures } from "@impower/sparkdown/test/morph/imageSizeFixtures";
import { IMAGE_HEADER_BYTES } from "@impower/sparkdown/src/workspace/utils/imageSize";
import { writeMemoryFile } from "../../../packages/opfs-workspace/test/memoryOpfs";
import { releaseStorageWorker, storageWorkerHarness } from "./storageWorkerHarness";

afterEach(releaseStorageWorker);

async function load(files: Record<string, Uint8Array>) {
  const harness = await storageWorkerHarness(
    { fs: undefined, window: undefined },
    { "main.sd": "x", ".layout": "1", ".folders": "1" },
  );
  const stored = Object.fromEntries(
    Object.entries(files).map(([path, bytes]) => [path, writeMemoryFile(harness.root, `local/${path}`, bytes)]),
  );
  await harness.fs.getFiles("local");
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { ...harness, stored };
}

describe("the editor's image-size read", () => {
  it("takes only the image header out of storage for a large image", async () => {
    const png = imageSizeFixtures().find((f) => f.mime === "image/png" && !f.exif && f.read)!;
    const bytes = new Uint8Array(IMAGE_HEADER_BYTES * 4);
    bytes.set(png.bytes);
    const { fs, uri, stored } = await load({ "large.png": bytes });
    const image = stored["large.png"]!;
    image.bytesRead = 0;

    const size = await fs.getFileImageSize(uri("large.png"));

    expect(size).toEqual(png.read);
    expect(image.bytesRead).toBeGreaterThan(0);
    expect(image.bytesRead).toBeLessThanOrEqual(IMAGE_HEADER_BYTES);
  });

  it("reads an unchanged image once when both workspaces ask for its size", async () => {
    const png = imageSizeFixtures().find((f) => f.mime === "image/png" && !f.exif && f.read)!;
    const { fs, uri, stored } = await load({ "face.png": png.bytes });
    const image = stored["face.png"]!;
    image.bytesRead = 0;

    const sizes = await Promise.all([fs.getFileImageSize(uri("face.png")), fs.getFileImageSize(uri("face.png"))]);
    const later = await fs.getFileImageSize(uri("face.png"));

    expect(sizes).toEqual([png.read, png.read]);
    expect(later).toEqual(png.read);
    expect(image.bytesRead).toBe(png.bytes.byteLength);
  });

  it("reads a whole file without a length and only its start with one", async () => {
    const bytes = new Uint8Array(IMAGE_HEADER_BYTES * 2).fill(7);
    const { fs, uri } = await load({ "data.png": bytes });

    const whole = await fs.readFile({ file: { uri: uri("data.png") } });
    const start = await fs.readFile({ file: { uri: uri("data.png") }, length: 10 });

    expect(whole.byteLength).toBe(bytes.byteLength);
    expect(new Uint8Array(start)).toEqual(bytes.slice(0, 10));
  });
});
