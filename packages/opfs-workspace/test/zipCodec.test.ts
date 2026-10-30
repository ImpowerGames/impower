import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildZippable, parseUnzipEntries } from "../src/utils/assetArchive";

const enc = new TextEncoder();
const dec = new TextDecoder();

const sortKeys = (o: Record<string, unknown>) => Object.keys(o).sort();

describe("fflate codec is path-preserving (sanity: the codec is not the bug)", () => {
  it("round-trips text content under a nested key", () => {
    const z = zipSync(
      { "scripts/dialogue.sd": enc.encode("== START ==\nHi.\n") },
      { level: 0 },
    );
    const u = unzipSync(z);
    expect(dec.decode(u["scripts/dialogue.sd"]!)).toBe("== START ==\nHi.\n");
  });

  it("round-trips binary content byte-for-byte", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 128, 7]);
    const z = zipSync({ "images/ui/btn.png": bytes }, { level: 0 });
    const u = unzipSync(z);
    expect(Array.from(u["images/ui/btn.png"]!)).toEqual(Array.from(bytes));
  });

  it("preserves multiple distinct nested keys", () => {
    const z = zipSync(
      {
        "main.sd": enc.encode("main"),
        "scripts/a.sd": enc.encode("a"),
        "images/logo.png": new Uint8Array([1]),
        "images/ui/btn.png": new Uint8Array([2]),
      },
      { level: 0 },
    );
    const u = unzipSync(z);
    expect(sortKeys(u)).toEqual([
      "images/logo.png",
      "images/ui/btn.png",
      "main.sd",
      "scripts/a.sd",
    ]);
  });
});

const relativePath = (uri: string) => uri.replace(/^file:\/\/[^/]+\//, "");

function workerZipFilesKeyStrategy(
  files: { uri: string; basename: string; bytes: Uint8Array }[],
) {
  return zipSync(
    buildZippable(files.map((f) => ({ path: relativePath(f.uri), data: f.bytes }))),
    { level: 0 },
  );
}

function workerUnzipFilesEntries(zip: Uint8Array) {
  return parseUnzipEntries(unzipSync(zip));
}

describe("project zip round-trip — DESIRED folder-path preservation", () => {
  it("a single nested file keeps its folder path through export->import", () => {
    const z = zipSync(
      { "images/ui/btn.png": new Uint8Array([9, 8, 7]) },
      { level: 0 },
    );
    const entries = workerUnzipFilesEntries(z);
    expect(entries[0]!.filename).toBe("images/ui/btn.png");
  });

  it("two files sharing a basename in different folders do NOT collide on export", () => {
    const a = { uri: "file://p/images/logo.png", basename: "logo.png", bytes: new Uint8Array([1]) };
    const b = { uri: "file://p/icons/logo.png", basename: "logo.png", bytes: new Uint8Array([2]) };
    const zip = workerZipFilesKeyStrategy([a, b]);
    const u = unzipSync(zip);
    expect(Object.keys(u).length).toBe(2);
  });

  it("re-imported entries map back to distinct nested filenames", () => {
    const a = { uri: "file://p/images/logo.png", basename: "logo.png", bytes: new Uint8Array([1]) };
    const b = { uri: "file://p/icons/logo.png", basename: "logo.png", bytes: new Uint8Array([2]) };
    const zip = workerZipFilesKeyStrategy([a, b]);
    const entries = workerUnzipFilesEntries(zip);
    const filenames = entries.map((e) => e.filename).sort();
    expect(filenames).toEqual(["icons/logo.png", "images/logo.png"]);
  });
});
