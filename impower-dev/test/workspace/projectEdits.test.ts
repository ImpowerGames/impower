import { DidChangeDirectoriesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeDirectoriesMessage";
import { DidDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFilesMessage";
import { DidRenameFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidRenameFilesMessage";
import { DidWriteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFilesMessage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type WorkspaceFileSystemType from "../../src/modules/spark-editor/workspace/WorkspaceFileSystem";

let deliver: (message: unknown) => Promise<void>;

class StubWorker {
  onerror = null;
  addEventListener(_type: string, listener: (event: { data: unknown }) => unknown) {
    deliver = async (message) => {
      await listener({ data: structuredClone(message) });
    };
  }
  postMessage() {}
}

let fs: WorkspaceFileSystemType;
let edits: string[];

const uri = (path: string, project = "local") => fs.getFileUri(project, path);

const asset = (path: string, size: number) => ({
  uri: uri(path),
  name: path.replace(/^.*\//, "").replace(/[.][^.]*$/, ""),
  ext: path.split(".").pop(),
  type: "image",
  src: "",
  version: 0,
  size,
  modified: 1,
  languageId: null,
});

beforeEach(async () => {
  vi.stubGlobal("Worker", StubWorker);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { default: WorkspaceFileSystem } = await import(
    "../../src/modules/spark-editor/workspace/WorkspaceFileSystem"
  );
  fs = new WorkspaceFileSystem(
    { connection: { sendNotification() {} } } as never,
    { settings: {}, onDidChange: () => () => {} } as never,
  );
  edits = [];
  fs.onProjectEdit((projectId) => edits.push(projectId));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the file system reports every change to the loaded project's files", () => {
  it("reports a written asset, even one replaced by different bytes of the same size", async () => {
    await deliver(
      DidWriteFilesMessage.type.notification({
        files: [asset("art/forest.png", 2048)],
      } as never),
    );
    await deliver(
      DidWriteFilesMessage.type.notification({
        files: [asset("art/forest.png", 2048)],
      } as never),
    );
    expect(edits).toEqual(["local", "local"]);
  });

  it("reports a deleted file, a renamed file and a created or deleted folder", async () => {
    await deliver(
      DidDeleteFilesMessage.type.notification({
        files: [{ uri: uri("scenes/intro.sd") }],
      } as never),
    );
    await deliver(
      DidRenameFilesMessage.type.notification({
        files: [{ oldUri: uri("notes.sd"), newUri: uri("ideas.sd") }],
      } as never),
    );
    await deliver(
      DidChangeDirectoriesMessage.type.notification({
        created: [uri("chapters")],
        deleted: [],
      } as never),
    );
    await deliver(
      DidChangeDirectoriesMessage.type.notification({
        created: [],
        deleted: [uri("chapters")],
      } as never),
    );
    expect(edits).toEqual(["local", "local", "local", "local"]);
  });

  it("does not report the project's own metadata or another project's files", async () => {
    await deliver(
      DidWriteFilesMessage.type.notification({
        files: [
          { ...asset("x", 13), uri: uri(".changedAt"), type: "text" },
          { ...asset("x", 13), uri: uri(".remindedAt"), type: "text" },
        ],
      } as never),
    );
    await deliver(
      DidWriteFilesMessage.type.notification({
        files: [{ ...asset("art/forest.png", 10), uri: uri("main.sd", "drive-123") }],
      } as never),
    );
    expect(edits).toEqual([]);
  });
});
