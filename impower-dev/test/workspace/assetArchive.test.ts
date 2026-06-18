import { describe, expect, it } from "vitest";
import {
  buildZippable,
  parseUnzipEntries,
} from "../../../packages/opfs-workspace/src/utils/assetArchive";

describe("assetArchive", () => {
  it("keys the zippable by archive path, preserving folders + same-basename files", () => {
    const z = buildZippable([
      { path: "main.sd", data: new Uint8Array([1]) },
      { path: "backgrounds/forest.png", data: new Uint8Array([2, 3]) },
      { path: "characters/forest.png", data: new Uint8Array([4]) },
    ]);
    expect(Object.keys(z).sort()).toEqual([
      "backgrounds/forest.png",
      "characters/forest.png",
      "main.sd",
    ]);
    expect(z["backgrounds/forest.png"]).toEqual(new Uint8Array([2, 3]));
  });

  it("accepts ArrayBuffer entries (the worker passes file arrayBuffers)", () => {
    const z = buildZippable([{ path: "a/b.bin", data: new Uint8Array([9, 9]).buffer }]);
    expect(z["a/b.bin"]).toEqual(new Uint8Array([9, 9]));
  });

  it("parseUnzipEntries keeps the full path and drops pure-directory entries", () => {
    const unzipped: Record<string, Uint8Array> = {
      "main.sd": new Uint8Array([1]),
      "backgrounds/": new Uint8Array([]),
      "backgrounds/forest.png": new Uint8Array([2]),
      "characters/forest.png": new Uint8Array([3]),
    };
    const out = parseUnzipEntries(unzipped);
    expect(out.map((e) => e.filename).sort()).toEqual([
      "backgrounds/forest.png",
      "characters/forest.png",
      "main.sd",
    ]);
  });

  it("round-trips distinct nested basenames through the path layer (codec-agnostic)", () => {
    const zippable = buildZippable([
      { path: "a/forest.png", data: new Uint8Array([1]) },
      { path: "b/forest.png", data: new Uint8Array([2]) },
    ]);
    const out = parseUnzipEntries(zippable);
    expect(out.map((e) => e.filename).sort()).toEqual([
      "a/forest.png",
      "b/forest.png",
    ]);
  });
});
