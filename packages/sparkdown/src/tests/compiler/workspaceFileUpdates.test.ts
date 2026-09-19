// Autocomplete suggestion previews and project file changes (#634). A preview
// compile is the document as a suggestion would leave it, compiled against the
// project files. When a file changes (an image added, replaced or removed), the
// workspace's files revision moves at once, and a preview compile asked for
// after that must compile against the changed file: it is not sent to the
// compiler until the change has reached it.
//
// The workspace is driven with a stand-in compiler connection whose requests
// resolve when the test says, since what is under test is the order in which
// the workspace sends them.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PreviewCompileProgramMessage } from "../../compiler/classes/messages/PreviewCompileProgramMessage";
import { UpdateCompilerFileMessage } from "../../compiler/classes/messages/UpdateCompilerFileMessage";
import type { File } from "../../compiler/types/File";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";

const MAIN = "file://proj/main.sd";
const IMAGE = "file://proj/mia~happy.png";

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

class TestWorkspace extends SparkdownWorkspace {
  /** Every request sent to the compiler, in order, with its resolver. */
  requests: { method: string; resolve: (result: any) => void }[] = [];
  /** File loads in progress, with their resolvers. */
  loads: ((file: File) => void)[] = [];

  constructor() {
    super("");
    this._compilerConfigured = true;
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
    // The revision moves as the change begins, so a suggestion compiled
    // against the files as they were is recognized from here on.
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
});
