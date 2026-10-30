import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PreviewCompileProgramMessage } from "../../compiler/classes/messages/PreviewCompileProgramMessage";
import { RemoveCompilerFileMessage } from "../../compiler/classes/messages/RemoveCompilerFileMessage";
import { UpdateCompilerFileMessage } from "../../compiler/classes/messages/UpdateCompilerFileMessage";
import type { File } from "../../compiler/types/File";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";

const MAIN = "file://proj/main.sd";
const IMAGE = "file://proj/mia~happy.png";

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

class TestWorkspace extends SparkdownWorkspace {
  requests: { method: string; resolve: (result: any) => void }[] = [];
  loads: ((file: File) => void)[] = [];

  constructor() {
    super("");
    this._compilerConfigured = true;
    this._projectLoaded = true;
    this._imageFilePattern = /\.png$/;
    this._compilerChannelConnection = {
      sendRequest: (type: { method: string }) =>
        new Promise((resolve) =>
          this.requests.push({ method: type.method, resolve }),
        ),
    } as any;
  }

  protected override async connectToWorker() {}

  override loadFile(_file: { uri: string }) {
    return new Promise<File>((resolve) => this.loads.push(resolve));
  }

  sendRequest(): any {
    throw new Error("not used");
  }
  async sendNotification() {}
  async getFileText() {
    return "";
  }
  async getFileSrc() {
    return "";
  }
  async getFileVersion() {
    return 0;
  }
  async getFileLanguageId() {
    return "";
  }

  get sent() {
    return this.requests.map((r) => r.method);
  }
}

const originalWorker = globalThis.Worker;

beforeEach(() => {
  globalThis.Worker = class {
    onerror: unknown;
    postMessage() {}
    addEventListener() {}
    removeEventListener() {}
    terminate() {}
  } as any;
});

afterEach(() => {
  globalThis.Worker = originalWorker;
});

describe("a preview compile asked for while a project file changes", () => {
  it("is sent only after the change has reached the compiler", async () => {
    const workspace = new TestWorkspace();
    const changing = workspace.changeFile(IMAGE);
    expect(workspace.filesRevision).toBe(1);

    const preview = workspace.previewCompile({
      textDocument: { uri: MAIN, version: 1 },
      contentChanges: [],
      startFrom: { file: MAIN, line: 0 },
    });
    await settle();
    expect(workspace.sent).toEqual([]);

    workspace.loads.shift()!({
      uri: IMAGE,
      name: "mia~happy",
      type: "image",
      ext: "png",
      src: "blob:mia",
    } as File);
    await settle();
    expect(workspace.sent).toEqual([UpdateCompilerFileMessage.method]);

    workspace.requests[0]!.resolve(undefined);
    await changing;
    await settle();
    expect(workspace.sent).toEqual([
      UpdateCompilerFileMessage.method,
      PreviewCompileProgramMessage.method,
    ]);

    workspace.requests[1]!.resolve({ textDocument: { uri: MAIN, version: 1 } });
    expect(await preview).toEqual({ textDocument: { uri: MAIN, version: 1 } });
  });

  it("does not wait for a change that has already reached the compiler", async () => {
    const workspace = new TestWorkspace();
    const changing = workspace.changeFile(IMAGE);
    await settle();
    workspace.loads.shift()!({ uri: IMAGE, name: "mia~happy", type: "image", ext: "png" } as File);
    await settle();
    workspace.requests[0]!.resolve(undefined);
    await changing;

    void workspace.previewCompile({
      textDocument: { uri: MAIN, version: 1 },
      contentChanges: [],
      startFrom: { file: MAIN, line: 0 },
    });
    await settle();
    expect(workspace.sent).toEqual([
      UpdateCompilerFileMessage.method,
      PreviewCompileProgramMessage.method,
    ]);
  });

  it("waits for a second change to the same file that waits behind the first", async () => {
    const workspace = new TestWorkspace();
    const changing = workspace.changeFile(IMAGE);
    const deleting = workspace.deleteFile(IMAGE);
    expect(workspace.filesRevision).toBe(2);

    const preview = workspace.previewCompile({
      textDocument: { uri: MAIN, version: 1 },
      contentChanges: [],
      startFrom: { file: MAIN, line: 0 },
    });
    workspace.loads.shift()!({ uri: IMAGE, name: "mia~happy", type: "image", ext: "png" } as File);
    await settle();
    expect(workspace.sent).toEqual([UpdateCompilerFileMessage.method]);

    workspace.requests[0]!.resolve(undefined);
    await settle();
    expect(workspace.sent).toEqual([
      UpdateCompilerFileMessage.method,
      RemoveCompilerFileMessage.method,
    ]);

    workspace.requests[1]!.resolve(undefined);
    await Promise.all([changing, deleting]);
    await settle();
    expect(workspace.sent).toEqual([
      UpdateCompilerFileMessage.method,
      RemoveCompilerFileMessage.method,
      PreviewCompileProgramMessage.method,
    ]);
    workspace.requests[2]!.resolve({ textDocument: { uri: MAIN, version: 1 } });
    await preview;
  });
});
