import { FileData } from "@impower/spark-editor-protocol/src/types";
import { unzipSync, zipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildZippable,
  parseUnzipEntries,
} from "../../../packages/opfs-workspace/src/utils/assetArchive";

// Stub the Workspace singleton (Worker-spawning, circular import).
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { fs: {}, ls: {}, configuration: { settings: {} } },
}));

import WorkspaceFileSystem from "../../src/modules/spark-editor/workspace/WorkspaceFileSystem";

// AREAS 2 & 3: project zip + asset bundle round-trip, exercised through the
// REAL WorkspaceFileSystem.readProjectZip / writeProjectZip /
// readProjectAssetBundle / writeProjectAssetBundle (and their delete-set
// logic), with the OPFS worker replaced by an in-memory fake that mirrors the
// worker's zip/unzip strategy via the REAL opfs-workspace assetArchive helpers
// (buildZippable / parseUnzipEntries), i.e. PROJECT-RELATIVE-PATH keying.
// createFiles / deleteFiles mutate the same in-memory OPFS map.
//
// This lets us assert the export->import contract (content + folder path intact,
// nested dirs preserved, import deletes files absent from the zip) against the
// genuine class behavior. The "known gaps on main" nested-path specs FAIL on
// main (basename keying flattens folders) and PASS here (the worker now keys by
// the relative path — commit 2f79eb510).

const PROJECT = "proj1";
const enc = new TextEncoder();
const dec = new TextDecoder();

const basename = (uri: string) => uri.split("/").slice(-1).join("");

interface Harness {
  fs: WorkspaceFileSystem;
  opfs: Map<string, Uint8Array>; // uri -> bytes
  files: Record<string, FileData>; // FileData cache the class reads via getFiles
}

function makeFileData(uri: string, bytes: Uint8Array): FileData {
  const fn = basename(uri);
  const dot = fn.lastIndexOf(".");
  const name = dot >= 0 ? fn.slice(0, dot) : fn;
  const ext = dot >= 0 ? fn.slice(dot + 1) : "";
  // text vs binary: treat .sd / .txt as text, everything else binary.
  const isText = ext === "sd" || ext === "txt";
  return {
    uri,
    name,
    ext,
    type: isText ? (ext === "sd" ? "script" : "text") : "image",
    src: "",
    version: 0,
    text: isText ? dec.decode(bytes) : undefined,
  };
}

function makeHarness(initial: Record<string, Uint8Array>): Harness {
  const opfs = new Map<string, Uint8Array>(Object.entries(initial));
  const files: Record<string, FileData> = {};
  for (const [uri, bytes] of opfs) {
    files[uri] = makeFileData(uri, bytes);
  }

  const fs = {
    getDirectoryUri: WorkspaceFileSystem.prototype.getDirectoryUri,
    getFileUri: WorkspaceFileSystem.prototype.getFileUri,
    getRelativePath: WorkspaceFileSystem.prototype.getRelativePath,
    _scheme: "file://",
    getFiles: async () => files,

    // --- in-memory replicas of the OPFS worker, mirroring the FIXED worker via
    // the REAL assetArchive helpers (project-relative-path keying). readProjectZip
    // now supplies a `path` per file. ---
    zipFiles: async ({
      files: list,
    }: {
      files: { uri: string; path?: string }[];
    }) => {
      const refs = list.map(({ uri, path }) => ({
        path: path ?? basename(uri),
        data: opfs.get(uri)!,
      }));
      return zipSync(buildZippable(refs), { level: 0 }).buffer;
    },
    unzipFiles: async ({ data }: { data: ArrayBuffer }) =>
      parseUnzipEntries(unzipSync(new Uint8Array(data))),
    createFiles: async ({
      files: list,
    }: {
      files: { uri: string; data: ArrayBuffer }[];
    }) => {
      for (const { uri, data } of list) {
        const bytes = new Uint8Array(data);
        opfs.set(uri, bytes);
        files[uri] = makeFileData(uri, bytes);
      }
    },
    deleteFiles: async ({ files: list }: { files: { uri: string }[] }) => {
      for (const { uri } of list) {
        opfs.delete(uri);
        delete files[uri];
      }
    },
  } as unknown as WorkspaceFileSystem;

  return { fs, opfs, files };
}

const readProjectZip = (h: Harness) =>
  WorkspaceFileSystem.prototype.readProjectZip.call(h.fs, PROJECT);
const writeProjectZip = (h: Harness, content: ArrayBuffer) =>
  WorkspaceFileSystem.prototype.writeProjectZip.call(h.fs, PROJECT, content);
const readAssetBundle = (h: Harness) =>
  WorkspaceFileSystem.prototype.readProjectAssetBundle.call(h.fs, PROJECT);
const writeAssetBundle = (h: Harness, content: ArrayBuffer) =>
  WorkspaceFileSystem.prototype.writeProjectAssetBundle.call(
    h.fs,
    PROJECT,
    content,
  );

const u = (uri: string) => `file://${PROJECT}/${uri}`;

describe("project zip round-trip (readProjectZip <-> writeProjectZip)", () => {
  it("flat text + binary files survive export->import with content intact", async () => {
    const src = makeHarness({
      [u("main.sd")]: enc.encode("MAIN BODY"),
      [u("logo.png")]: new Uint8Array([1, 2, 3, 250]),
    });
    const zip = await readProjectZip(src);

    // Import into a fresh empty project.
    const dst = makeHarness({});
    await writeProjectZip(dst, zip);

    expect(dec.decode(dst.opfs.get(u("main.sd"))!)).toBe("MAIN BODY");
    expect(Array.from(dst.opfs.get(u("logo.png"))!)).toEqual([1, 2, 3, 250]);
  });

  it("import DELETES files not present in the imported zip", async () => {
    // Existing project has an extra stale file.
    const dst = makeHarness({
      [u("main.sd")]: enc.encode("OLD"),
      [u("stale.sd")]: enc.encode("REMOVE ME"),
    });
    // Build a zip that only contains main.sd (+new content).
    const src = makeHarness({ [u("main.sd")]: enc.encode("NEW") });
    const zip = await readProjectZip(src);

    await writeProjectZip(dst, zip);

    expect(dec.decode(dst.opfs.get(u("main.sd"))!)).toBe("NEW");
    expect(dst.opfs.has(u("stale.sd"))).toBe(false);
  });

  describe("known gaps on main", () => {
    it("nested directories are preserved (not flattened to basename)", async () => {
      const src = makeHarness({
        [u("main.sd")]: enc.encode("MAIN"),
        [u("images/ui/btn.png")]: new Uint8Array([9, 8, 7]),
      });
      const zip = await readProjectZip(src);
      const dst = makeHarness({});
      await writeProjectZip(dst, zip);
      // DESIRED: the nested asset lands back at its nested uri. On main the
      // worker keys the zip by basename, so it round-trips to
      // file://proj1/btn.png (folder lost).
      expect(dst.opfs.has(u("images/ui/btn.png"))).toBe(true);
      expect(Array.from(dst.opfs.get(u("images/ui/btn.png"))!)).toEqual([
        9, 8, 7,
      ]);
    });

    it("two same-basename files in different folders both survive", async () => {
      const src = makeHarness({
        [u("main.sd")]: enc.encode("MAIN"),
        [u("images/logo.png")]: new Uint8Array([1]),
        [u("icons/logo.png")]: new Uint8Array([2]),
      });
      const zip = await readProjectZip(src);
      const dst = makeHarness({});
      await writeProjectZip(dst, zip);
      // DESIRED: both nested logos survive. On main both zip under "logo.png"
      // and one overwrites the other.
      expect(dst.opfs.has(u("images/logo.png"))).toBe(true);
      expect(dst.opfs.has(u("icons/logo.png"))).toBe(true);
    });
  });
});

describe("asset bundle round-trip (readProjectAssetBundle <-> writeProjectAssetBundle)", () => {
  it("bundles ONLY binary assets (skips scripts/text)", async () => {
    const src = makeHarness({
      [u("main.sd")]: enc.encode("MAIN"), // text -> excluded
      [u("logo.png")]: new Uint8Array([1, 2, 3]),
    });
    const zip = await readAssetBundle(src);
    const entries = unzipSync(new Uint8Array(zip));
    // Asset bundle filters file.text == null (binary only).
    expect(Object.keys(entries)).toEqual(["logo.png"]);
  });

  it("binary assets survive export->import with bytes intact", async () => {
    const src = makeHarness({
      [u("logo.png")]: new Uint8Array([5, 6, 7, 200, 0]),
    });
    const zip = await readAssetBundle(src);
    const dst = makeHarness({ [u("main.sd")]: enc.encode("KEEP ME") });
    await writeAssetBundle(dst, zip);
    expect(Array.from(dst.opfs.get(u("logo.png"))!)).toEqual([
      5, 6, 7, 200, 0,
    ]);
    // Asset import must NOT delete the script (it only reconciles binary assets).
    expect(dst.opfs.has(u("main.sd"))).toBe(true);
  });

  it("asset import deletes stale binary assets but leaves scripts alone", async () => {
    const dst = makeHarness({
      [u("main.sd")]: enc.encode("SCRIPT"),
      [u("old.png")]: new Uint8Array([9]),
    });
    const src = makeHarness({ [u("new.png")]: new Uint8Array([1]) });
    const zip = await readAssetBundle(src);
    await writeAssetBundle(dst, zip);
    expect(dst.opfs.has(u("new.png"))).toBe(true);
    expect(dst.opfs.has(u("old.png"))).toBe(false);
    expect(dst.opfs.has(u("main.sd"))).toBe(true);
  });

  describe("known gaps on main", () => {
    it("nested asset paths are preserved through the asset bundle", async () => {
      const src = makeHarness({
        [u("audio/music/theme.mp3")]: new Uint8Array([3, 1, 4, 1, 5]),
      });
      const zip = await readAssetBundle(src);
      const dst = makeHarness({});
      await writeAssetBundle(dst, zip);
      // DESIRED: nested asset round-trips to its nested uri.
      expect(dst.opfs.has(u("audio/music/theme.mp3"))).toBe(true);
    });
  });
});
