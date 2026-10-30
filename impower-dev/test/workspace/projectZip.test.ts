import { FileData } from "@impower/spark-editor-protocol/src/types";
import { unzipSync, zipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildZippable,
  parseUnzipEntries,
} from "../../../packages/opfs-workspace/src/utils/assetArchive";

import WorkspaceFileSystem from "../../src/modules/spark-editor/workspace/WorkspaceFileSystem";

const PROJECT = "proj1";
const enc = new TextEncoder();
const dec = new TextDecoder();

const basename = (uri: string) => uri.split("/").slice(-1).join("");

interface Harness {
  fs: WorkspaceFileSystem;
  opfs: Map<string, Uint8Array>;
  files: Record<string, FileData>;
}

function makeFileData(uri: string, bytes: Uint8Array): FileData {
  const fn = basename(uri);
  const dot = fn.lastIndexOf(".");
  const name = dot >= 0 ? fn.slice(0, dot) : fn;
  const ext = dot >= 0 ? fn.slice(dot + 1) : "";
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

    const dst = makeHarness({});
    await writeProjectZip(dst, zip);

    expect(dec.decode(dst.opfs.get(u("main.sd"))!)).toBe("MAIN BODY");
    expect(Array.from(dst.opfs.get(u("logo.png"))!)).toEqual([1, 2, 3, 250]);
  });

  it("import DELETES files not present in the imported zip", async () => {
    const dst = makeHarness({
      [u("main.sd")]: enc.encode("OLD"),
      [u("stale.sd")]: enc.encode("REMOVE ME"),
    });
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
      expect(dst.opfs.has(u("images/logo.png"))).toBe(true);
      expect(dst.opfs.has(u("icons/logo.png"))).toBe(true);
    });
  });
});

describe("asset bundle round-trip (readProjectAssetBundle <-> writeProjectAssetBundle)", () => {
  it("bundles ONLY binary assets (skips scripts/text)", async () => {
    const src = makeHarness({
      [u("main.sd")]: enc.encode("MAIN"),
      [u("logo.png")]: new Uint8Array([1, 2, 3]),
    });
    const zip = await readAssetBundle(src);
    const entries = unzipSync(new Uint8Array(zip));
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
      expect(dst.opfs.has(u("audio/music/theme.mp3"))).toBe(true);
    });
  });
});
