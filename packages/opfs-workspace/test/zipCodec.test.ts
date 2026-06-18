import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { getFileName } from "../src/utils/getFileName";

// AREA 2/3 (pure layer): Project zip + asset bundle path preservation.
//
// The worker's `zipFiles`/`unzipFiles` read OPFS, so we can't run them in
// node/jsdom. But the codec (fflate) is pure and importable, and the
// directory-path handling is the part that matters. These tests:
//   1. prove fflate preserves full nested paths (the codec is NOT the problem);
//   2. replicate the worker's actual key strategy and assert the DESIRED
//      contract: every file survives export->import with its FOLDER PATH intact
//      and nested directories are NOT flattened to basename.
//
// On `main` the worker keys the zip by `ref.name` (the File's basename) in
// zipFiles, and `unzipFiles` maps each entry through `getFileName(...)` — both
// drop the directory. So the "preserves nested directories" specs are expected
// to FAIL on main; they document the flattening bug / regression oracle.

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

// Replicates the worker's actual export path (zipFiles): the zip key is the
// File's basename (`fileRef.name`). Two files in different folders sharing a
// basename are the canonical collision case.
function workerZipFilesKeyStrategy(
  files: { uri: string; basename: string; bytes: Uint8Array }[],
) {
  const zippable: Record<string, Uint8Array> = {};
  files.forEach((f) => {
    zippable[f.basename] = f.bytes; // <- main keys by basename, dropping dirs
  });
  return zipSync(zippable, { level: 0 });
}

// Replicates the worker's import path (unzipFiles): map each entry name through
// getFileName, i.e. keep only the basename.
function workerUnzipFilesEntries(zip: Uint8Array) {
  const unzipped = unzipSync(zip);
  return Object.entries(unzipped)
    .filter(([filename]) => Boolean(getFileName(filename)))
    .map(([filename, data]) => ({
      filename: getFileName(filename),
      data,
    }));
}

describe("project zip round-trip — DESIRED folder-path preservation", () => {
  it("a single nested file keeps its folder path through export->import", () => {
    // What the worker should produce: a zip keyed by the full relative path.
    const z = zipSync(
      { "images/ui/btn.png": new Uint8Array([9, 8, 7]) },
      { level: 0 },
    );
    const entries = workerUnzipFilesEntries(z);
    // DESIRED: the re-imported entry filename is the full nested path so it
    // round-trips back to the same OPFS location. main returns just "btn.png".
    expect(entries[0]!.filename).toBe("images/ui/btn.png");
  });

  it("two files sharing a basename in different folders do NOT collide on export", () => {
    const a = { uri: "file://p/images/logo.png", basename: "logo.png", bytes: new Uint8Array([1]) };
    const b = { uri: "file://p/icons/logo.png", basename: "logo.png", bytes: new Uint8Array([2]) };
    const zip = workerZipFilesKeyStrategy([a, b]);
    const u = unzipSync(zip);
    // DESIRED: both survive (distinct nested keys). main keys both by "logo.png"
    // so the second overwrites the first and one file is lost.
    expect(Object.keys(u).length).toBe(2);
  });

  it("re-imported entries map back to distinct nested filenames", () => {
    const a = { uri: "file://p/images/logo.png", basename: "logo.png", bytes: new Uint8Array([1]) };
    const b = { uri: "file://p/icons/logo.png", basename: "logo.png", bytes: new Uint8Array([2]) };
    const zip = workerZipFilesKeyStrategy([a, b]);
    const entries = workerUnzipFilesEntries(zip);
    const filenames = entries.map((e) => e.filename).sort();
    // DESIRED: ["icons/logo.png", "images/logo.png"].
    expect(filenames).toEqual(["icons/logo.png", "images/logo.png"]);
  });
});
