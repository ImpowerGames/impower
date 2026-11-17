import { FileData } from "@impower/spark-editor-protocol/src/types";
import { beforeAll, describe, expect, it, vi } from "vitest";

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

const MAIN_URI = "file://local/main.sd";
const STARTER = "scene start\n  \nend\n";

const starterFileSystem = () => {
  const onDisk = new Map<string, ArrayBuffer>();
  const fs = {
    _unstoredUris: new Set<string>([MAIN_URI]),
    _files: {
      [MAIN_URI]: {
        uri: MAIN_URI,
        name: "main",
        ext: "sd",
        type: "script",
        src: "",
        version: 0,
        text: STARTER,
      } as FileData,
    },
    sendRequest: async (
      type: { method: string },
      params: { files?: { uri: string; data: ArrayBuffer }[]; file?: { uri: string } },
    ) => {
      if (type.method === "workspace/willCreateFiles") {
        return params.files!.map(({ uri, data }) => {
          onDisk.set(uri, data);
          return { uri, size: data.byteLength };
        });
      }
      if (type.method === "workspace/readFile") {
        return onDisk.get(params.file!.uri);
      }
      throw new Error(`unexpected ${type.method}`);
    },
  } as unknown as InstanceType<typeof WorkspaceFileSystem>;
  return fs;
};

describe("creating a file over the unsaved starter main.sd", () => {
  it("reads back the created bytes before the worker's write notification arrives", async () => {
    const fs = starterFileSystem();
    const data = new TextEncoder().encode("Hello.\n").buffer as ArrayBuffer;
    await WorkspaceFileSystem.prototype.createFiles.call(fs, {
      files: [{ uri: MAIN_URI, data }],
    });
    const readBack = await WorkspaceFileSystem.prototype.readFile.call(fs, {
      file: { uri: MAIN_URI },
    });
    expect(new TextDecoder().decode(readBack)).toBe("Hello.\n");
  });

  it("still serves the starter text while main.sd is unsaved", async () => {
    const fs = starterFileSystem();
    const readBack = await WorkspaceFileSystem.prototype.readFile.call(fs, {
      file: { uri: MAIN_URI },
    });
    expect(new TextDecoder().decode(readBack)).toBe(STARTER);
  });
});
