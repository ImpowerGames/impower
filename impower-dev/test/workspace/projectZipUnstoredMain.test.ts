import { FileData } from "@impower/spark-editor-protocol/src/types";
import { unzipSync, zipSync } from "fflate";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { parseUnzipEntries } from "../../../packages/opfs-workspace/src/utils/assetArchive";

let WorkspaceFileSystem: typeof import("../../src/modules/spark-editor/workspace/WorkspaceFileSystem").default;

beforeAll(async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  });
  WorkspaceFileSystem = (
    await import("../../src/modules/spark-editor/workspace/WorkspaceFileSystem")
  ).default;
});

const PROJECT = "proj1";
const MAIN_URI = `file://${PROJECT}/main.sd`;
const enc = new TextEncoder();

const fileData = (uri: string, text?: string): FileData => {
  const filename = uri.split("/").pop()!;
  const dot = filename.lastIndexOf(".");
  return {
    uri,
    name: filename.slice(0, dot),
    ext: filename.slice(dot + 1),
    type: text == null ? "image" : "script",
    src: "",
    version: 0,
    text,
  };
};

const starterProject = (stored: Record<string, string | undefined> = {}) => {
  const onDisk = new Map<string, Uint8Array>();
  const files: Record<string, FileData> = {
    [MAIN_URI]: fileData(MAIN_URI, "scene start\n  \nend\n"),
  };
  for (const [path, text] of Object.entries(stored)) {
    const uri = `file://${PROJECT}/${path}`;
    files[uri] = fileData(uri, text);
    onDisk.set(uri, enc.encode(text ?? "binary"));
  }
  const proto = WorkspaceFileSystem.prototype as any;
  const fs = {
    getDirectoryUri: proto.getDirectoryUri,
    getFileUri: proto.getFileUri,
    getFilename: proto.getFilename,
    getRelativePath: proto.getRelativePath,
    splitProjectTextContent: proto.splitProjectTextContent,
    isStored: proto.isStored,
    storedFiles: proto.storedFiles,
    foldersOutside: proto.foldersOutside,
    replaceFolders: proto.replaceFolders,
    clearFoldersAt: proto.clearFoldersAt,
    _scheme: "file://",
    _unstoredUris: new Set<string>([MAIN_URI]),
    getFiles: async () => files,
    getFolders: async () => [],
    listFolders: async () => [],
    createFolders: async () => [],
    deleteFolders: async () => [],
    writeProjectMetadata: async () => {},
    unzipFiles: async ({ data }: { data: ArrayBuffer }) =>
      parseUnzipEntries(unzipSync(new Uint8Array(data))),
    createFiles: async ({
      files: list,
    }: {
      files: { uri: string; data: ArrayBuffer }[];
    }) => {
      for (const { uri, data } of list) {
        onDisk.set(uri, new Uint8Array(data));
        files[uri] = fileData(uri, new TextDecoder().decode(data));
      }
    },
    deleteFiles: async ({ files: list }: { files: { uri: string }[] }) => {
      for (const { uri } of list) {
        if (!onDisk.has(uri)) {
          throw new DOMException(`${uri} was not found`, "NotFoundError");
        }
        onDisk.delete(uri);
        delete files[uri];
      }
    },
  } as unknown as InstanceType<typeof WorkspaceFileSystem>;
  return { fs, onDisk };
};

const wrapperZip = () =>
  zipSync({
    "project/main.sd": enc.encode("Hello.\n"),
    "project/Scripts/a.sd": enc.encode("Second.\n"),
  }).buffer as ArrayBuffer;

describe("replacing a project whose starter main.sd was never saved", () => {
  it("imports a zip that has no main.sd at its root", async () => {
    const { fs, onDisk } = starterProject();
    await expect(
      WorkspaceFileSystem.prototype.writeProjectZip.call(
        fs,
        PROJECT,
        wrapperZip(),
      ),
    ).resolves.toEqual({ leftOut: { count: 0, folders: [] } });
    expect([...onDisk.keys()].sort()).toEqual([
      `file://${PROJECT}/Scripts/a.sd`,
      `file://${PROJECT}/main.sd`,
    ]);
  });

  it("refuses a zip with no main.sd and changes nothing", async () => {
    const { fs, onDisk } = starterProject({ "Scripts/kept.sd": "Kept.\n" });
    const before = [...onDisk.entries()];
    const zip = zipSync({ "notes/readme.txt": enc.encode("Hi.\n") })
      .buffer as ArrayBuffer;
    await expect(
      WorkspaceFileSystem.prototype.writeProjectZip.call(fs, PROJECT, zip),
    ).rejects.toMatchObject({ reason: "no_main_script" });
    expect([...onDisk.entries()]).toEqual(before);
  });

  it("leaves the project untouched when the zip holds two projects", async () => {
    const { fs, onDisk } = starterProject({ "Scripts/kept.sd": "Kept.\n" });
    const before = [...onDisk.entries()];
    const zip = zipSync({
      "one/main.sd": enc.encode("One.\n"),
      "two/main.sd": enc.encode("Two.\n"),
    }).buffer as ArrayBuffer;
    await expect(
      WorkspaceFileSystem.prototype.writeProjectZip.call(fs, PROJECT, zip),
    ).rejects.toMatchObject({
      reason: "several_main_scripts",
      folders: ["one", "two"],
    });
    expect([...onDisk.entries()]).toEqual(before);
  });

  it("imports the project two folders deep and reports the readme beside it", async () => {
    const { fs, onDisk } = starterProject();
    const zip = zipSync({
      "README.md": enc.encode("Read me.\n"),
      "outer/": new Uint8Array(),
      "outer/story/": new Uint8Array(),
      "outer/story/main.sd": enc.encode("Hello.\n"),
      "outer/story/.vscode/settings.json": enc.encode("{}"),
      "outer/story/art/": new Uint8Array(),
      "__MACOSX/outer/story/._main.sd": enc.encode("x"),
      "outer/story/.DS_Store": enc.encode("x"),
    }).buffer as ArrayBuffer;
    await expect(
      WorkspaceFileSystem.prototype.writeProjectZip.call(fs, PROJECT, zip),
    ).resolves.toEqual({
      settingsJson: "{}",
      leftOut: { count: 1, folders: [""] },
    });
    expect([...onDisk.keys()]).toEqual([`file://${PROJECT}/main.sd`]);
  });

  it("imports a second wrapper zip over the first", async () => {
    const { fs, onDisk } = starterProject();
    await WorkspaceFileSystem.prototype.writeProjectZip.call(
      fs,
      PROJECT,
      wrapperZip(),
    );
    const second = zipSync({ "other/main.sd": enc.encode("Third.\n") })
      .buffer as ArrayBuffer;
    await expect(
      WorkspaceFileSystem.prototype.writeProjectZip.call(fs, PROJECT, second),
    ).resolves.toEqual({ leftOut: { count: 0, folders: [] } });
    expect([...onDisk.keys()]).toEqual([`file://${PROJECT}/main.sd`]);
  });

  it("refuses a file that is not a zip as unreadable_zip", async () => {
    const { fs } = starterProject();
    await expect(
      WorkspaceFileSystem.prototype.writeProjectZip.call(
        fs,
        PROJECT,
        enc.encode("not a zip").buffer as ArrayBuffer,
      ),
    ).rejects.toMatchObject({ reason: "unreadable_zip" });
  });

  it("reports a storage failure as storage", async () => {
    const { fs } = starterProject();
    (fs as any).createFiles = async () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    const flat = zipSync({ "main.sd": enc.encode("Hi.\n") })
      .buffer as ArrayBuffer;
    await expect(
      WorkspaceFileSystem.prototype.writeProjectZip.call(fs, PROJECT, flat),
    ).rejects.toMatchObject({ reason: "storage" });
  });

  it("replaces its scripts from a script bundle", async () => {
    const { fs, onDisk } = starterProject({ "Scripts/a.sd": "Old.\n" });
    await expect(
      WorkspaceFileSystem.prototype.writeProjectScriptBundle.call(
        fs,
        PROJECT,
        "",
      ),
    ).resolves.toBeUndefined();
    expect(onDisk.has(`file://${PROJECT}/Scripts/a.sd`)).toBe(false);
  });

  it("replaces its assets from an asset bundle", async () => {
    const { fs, onDisk } = starterProject({ "art/old.png": undefined });
    const bundle = zipSync({ "art/new.png": enc.encode("png") })
      .buffer as ArrayBuffer;
    await expect(
      WorkspaceFileSystem.prototype.writeProjectAssetBundle.call(
        fs,
        PROJECT,
        bundle,
      ),
    ).resolves.toBeUndefined();
    expect([...onDisk.keys()]).toEqual([`file://${PROJECT}/art/new.png`]);
  });
});
