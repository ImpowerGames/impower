import { strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  importFiles: vi.fn(async (_projectId: string, items: { rel: string }[]) => items.map((item) => item.rel)),
  upload: vi.fn(async (files: readonly { name: string }[], _folder: string) => files.map((file) => `Assets/Images/${file.name}`)),
  load: vi.fn(async () => null),
}));

vi.mock("../../src/modules/spark-editor/utils/importDroppedFiles", () => ({ importFiles: mocks.importFiles }));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { assets: { upload: mocks.upload, load: mocks.load }, window: {}, fs: {} },
}));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const session = await import("../../src/modules/spark-editor/workspace/uploadSession");
const { addAssetFiles, landedView } = await import("../../src/modules/spark-editor/workspace/addAssetFiles");

const file = (name: string, size = 10) => ({ name, size, getBuffer: async () => new ArrayBuffer(size) });

const zipped = (name: string, entries: Record<string, Uint8Array>) => {
  const bytes = zipSync(entries);
  return { name, size: bytes.byteLength, getBuffer: async () => bytes.slice().buffer };
};

const estimate = (quota: number, usage: number) =>
  Object.defineProperty(navigator, "storage", {
    value: { estimate: async () => ({ quota, usage }) },
    configurable: true,
  });

beforeEach(() => {
  vi.clearAllMocks();
  workspace.uploads.value = [];
  workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: "p" } };
  workspace.assetListing.value = { projectId: "p", files: {}, folders: ["Assets", "Assets/Images/Backdrops"] };
});

afterEach(() => {
  delete (navigator as { storage?: unknown }).storage;
});

describe("the upload panel's heading", () => {
  it("counts up while files are being added, then says how many were and were not added", () => {
    const [a, b, c] = session.startUploads(["a.png", "b.png", "c.png"]);
    expect(session.uploadHeading(workspace.uploads.value)).toBe("Uploading 1 of 3");
    session.updateUpload(a!, { state: "added", path: "Assets/Images/a.png" });
    session.updateUpload(b!, { state: "working" });
    expect(session.uploadHeading(workspace.uploads.value)).toBe("Uploading 2 of 3");
    session.updateUpload(b!, { state: "added", path: "Assets/Images/b.png" });
    session.updateUpload(c!, { state: "added", path: "Assets/Images/c.png" });
    expect(session.uploadHeading(workspace.uploads.value)).toBe("3 files added");
    session.updateUpload(c!, { state: "failed", reason: { kind: "skipped" } });
    expect(session.uploadHeading(workspace.uploads.value)).toBe("2 files added, 1 not added");
    session.closeUploads();
    expect(workspace.uploads.value).toEqual([]);
  });

  it("is replaced by the next upload, keeping only files still being added", () => {
    const [first] = session.startUploads(["old.png", "slow.png"]);
    session.updateUpload(first!, { state: "added", path: "Assets/Images/old.png" });
    session.startUploads(["new.png"]);
    expect(workspace.uploads.value.map((row) => row.name)).toEqual(["slow.png", "new.png"]);
  });

  it("names the folder a file landed in by its tab, or by its path under the tab", () => {
    const listing = workspace.assetListing.value!;
    expect(session.landedIn(listing, "Assets/Images/Backdrops/forest.png")).toBe("Backdrops");
    expect(session.landedIn(listing, "Assets/Audio/rain.ogg")).toBe("Audio");
    expect(session.landedIn(listing, "Scripts/intro.sd")).toBe("Scripts");
  });
});

describe("adding files through the one upload path", () => {
  it("refuses a batch the browser's storage cannot hold before writing anything, and says so for each file", async () => {
    estimate(1000, 990);
    const landed = await addAssetFiles([file("a.png", 2048), file("b.png", 4096)], "");
    expect(landed).toEqual([]);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.importFiles).not.toHaveBeenCalled();
    expect(workspace.uploads.value.map((row) => session.uploadNote(row, () => ""))).toEqual([
      "Not added: these files need 6 kB and this browser has 10 B left, so free some space or add fewer at once.",
      "Not added: these files need 6 kB and this browser has 10 B left, so free some space or add fewer at once.",
    ]);
  });

  it("adds a batch that fits through the Assets upload, with the folder in view", async () => {
    estimate(1_000_000, 0);
    const landed = await addAssetFiles([file("ada.png"), file("bo.png")], "Assets/Images");
    expect(mocks.upload).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "ada.png" }), expect.objectContaining({ name: "bo.png" })],
      "Assets/Images",
    );
    expect(landed).toEqual(["Assets/Images/ada.png", "Assets/Images/bo.png"]);
    expect(workspace.uploads.value).toEqual([]);
  });

  it("adds without asking the estimate when the browser has none", async () => {
    await addAssetFiles([file("a.png", 10_000_000_000)], "");
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });

  it("unpacks a zip with no main script picked through Upload files into the folder in view, as a dropped one is", async () => {
    estimate(1_000_000, 0);
    const landed = await addAssetFiles([zipped("art.zip", { "Cast/hero.png": strToU8("hero"), "Thumbs.db": strToU8("x") })], "Assets/Images");
    expect(mocks.upload).toHaveBeenCalledWith([expect.objectContaining({ name: "Cast/hero.png", size: 4 })], "Assets/Images");
    expect(landed).toEqual(["Assets/Images/Cast/hero.png"]);
  });

  it("refuses an unpacked zip the storage cannot hold by the sizes its directory gives, before inflating or writing anything", async () => {
    estimate(3_000_000, 1_000_000);
    const bytes = zipSync({ "big/zeros.png": new Uint8Array(3_000_000), "small.png": strToU8("x") });
    expect(bytes.byteLength).toBeLessThan(10_000);
    const name = strToU8("big/zeros.png");
    const start = bytes.findIndex((_, at) => name.every((byte, i) => bytes[at + i] === byte)) + name.length;
    bytes.fill(0xff, start, start + 16);
    expect(() => unzipSync(bytes)).toThrow();
    const landed = await addAssetFiles([{ name: "art.zip", size: bytes.byteLength, getBuffer: async () => bytes.slice().buffer }], "");
    expect(landed).toEqual([]);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(workspace.uploads.value.map((row) => [row.name, session.uploadNote(row, () => "")])).toEqual([
      ["art.zip", "Not added: these files need 2.9 MB and this browser has 1.9 MB left, so free some space or add fewer at once."],
    ]);
  });

  it("shows the folder an unpacked zip made in the folder in view, rather than opening its last file's folder", () => {
    const facts = { modified: 1, size: 1 };
    workspace.assetListing.value = {
      projectId: "p",
      files: { "Assets/Images/Cast/hero.png": facts, "Assets/Images/Cast/Extras/ada.png": facts, "Assets/Audio/sfx/rain.wav": facts },
      folders: ["Assets", "Assets/Images/Cast", "Assets/Images/Cast/Extras", "Assets/Audio/sfx"],
    };
    expect(
      landedView(["Assets/Images/Cast/hero.png", "Assets/Images/Cast/Extras/ada.png", "Assets/Audio/sfx/rain.wav"], "Assets/Images"),
    ).toEqual({ last: "Assets/Images/Cast" });
  });
});
