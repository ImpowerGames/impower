import { describe, expect, it } from "vitest";
import { AddCompilerFileMessage } from "../../compiler/classes/messages/AddCompilerFileMessage";
import { RemoveCompilerFileMessage } from "../../compiler/classes/messages/RemoveCompilerFileMessage";
import { UpdateCompilerFileMessage } from "../../compiler/classes/messages/UpdateCompilerFileMessage";
import { CompileProgramMessage } from "../../compiler/classes/messages/CompileProgramMessage";
import { ConfigureCompilerMessage } from "../../compiler/classes/messages/ConfigureCompilerMessage";
import { SelectCompilerDocumentMessage } from "../../compiler/classes/messages/SelectCompilerDocumentMessage";
import { UpdateCompilerDocumentMessage } from "../../compiler/classes/messages/UpdateCompilerDocumentMessage";
import type { File } from "../../compiler/types/File";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";

const MAIN = "file://proj/main.sd";

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

class StandInConnection {
  requests: {
    method: string;
    params: any;
    resolve: (value: unknown) => void;
    reject: (e: unknown) => void;
  }[] = [];

  constructor(
    protected answers?: (method: string, params: any) => unknown,
    protected hold = new Set<string>(),
  ) {}

  sendRequest(type: { method: string }, params: any) {
    return new Promise((resolve, reject) => {
      this.requests.push({ method: type.method, params, resolve, reject });
      if (this.answers && !this.hold.has(type.method)) {
        resolve(this.answers(type.method, params));
      }
    });
  }

  release(method: string) {
    for (const request of this.requests) {
      if (request.method === method) {
        request.resolve(this.answers?.(method, request.params));
      }
    }
  }

  abandon(error: Error) {
    for (const request of this.requests.splice(0)) {
      request.reject(error);
    }
  }

  closed = false;

  close() {
    this.closed = true;
  }

  addEventListener() {}

  removeEventListener() {}

  get sent() {
    return this.requests.map((r) => r.method);
  }
}

const compiled = (params: any) => ({
  textDocument: params.textDocument,
  program: { summary: true, uri: MAIN, scripts: { [MAIN]: 1 } },
});

class TestWorkspace extends SparkdownWorkspace {
  declare connections: StandInConnection[];
  declare terminated: number;
  declare hold: Set<string> | undefined;

  protected override _mirrorDocumentTexts = true;

  override debouncedCompile = (async () => undefined) as any;
  protected override scheduleChangeCompile() {}

  constructor() {
    super("");
    this._scriptFilePattern = /\.sd$/;
    this._compilerConfig = { files: [] } as any;
    this._compilerConfigured = true;
    this._projectLoaded = true;
    this._watchedFiles.set(MAIN, {
      uri: MAIN,
      name: "main",
      type: "script",
      ext: "sd",
      text: "",
      version: 0,
      languageId: "sparkdown",
    } as File);
  }

  protected override startCompilerWorker() {
    this.connections ??= [];
    this.terminated ??= 0;
    const connection = new StandInConnection(
      this.connections.length === 0
        ? undefined
        : (method, params) =>
            method === CompileProgramMessage.method
              ? compiled(params)
              : method === SelectCompilerDocumentMessage.method
                ? params
                : "sparkdown",
      new Set(this.hold),
    );
    this.connections.push(connection);
    this._compilerChannelConnection = connection as any;
    this._compilerWorker = {
      terminate: () => {
        this.terminated += 1;
      },
    } as any;
    this._initializedCompiler = true;
  }

  get stuck() {
    return this.connections[0]!;
  }

  get restarted() {
    return this.connections[1]!;
  }

  select(line: number) {
    this._documentSelected = { file: MAIN, line };
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
}

const open = (workspace: TestWorkspace, text: string) =>
  workspace.openTextDocument({
    textDocument: { uri: MAIN, languageId: "sparkdown", version: 1, text },
  });

const insertAtStart = (
  workspace: TestWorkspace,
  version: number,
  text: string,
) =>
  workspace.changeTextDocument({
    textDocument: { uri: MAIN, version },
    contentChanges: [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        text,
      },
    ],
  });

describe("restarting the compiler's worker", () => {
  it("gives the new worker each open document as the editor last sent it, and compiles", async () => {
    const workspace = new TestWorkspace();
    await open(workspace, "Line one.\n");
    await insertAtStart(workspace, 2, "BOB:\n  ");
    const compiling = workspace.compile(MAIN, true);
    await settle();
    expect(workspace.stuck.sent).toContain(CompileProgramMessage.method);
    workspace.select(3);

    await workspace.restartCompiler();

    expect(workspace.terminated).toBe(1);
    expect(workspace.stuck.closed).toBe(true);
    expect(await compiling).toBeUndefined();
    const configure = workspace.restarted.requests.find(
      (r) => r.method === ConfigureCompilerMessage.method,
    )!;
    const main = configure.params.files.find((f: File) => f.uri === MAIN);
    expect(main.text).toBe("BOB:\n  Line one.\n");
    expect(main.version).toBe(2);
    expect(configure.params.startFrom).toEqual({ file: MAIN, line: 3 });
    const compile = workspace.restarted.requests.find(
      (r) => r.method === CompileProgramMessage.method,
    )!;
    expect(compile.params).toEqual({
      textDocument: { uri: MAIN },
      startFrom: { file: MAIN, line: 3 },
    });
  });

  it("does not apply a change the new worker was configured with again", async () => {
    const workspace = new TestWorkspace();
    await open(workspace, "Line one.\n");
    await settle();
    void insertAtStart(workspace, 2, "BOB:\n  ");
    const restarting = workspace.restartCompiler();
    await restarting;
    await settle();
    const main = workspace.restarted.requests
      .find((r) => r.method === ConfigureCompilerMessage.method)!
      .params.files.find((f: File) => f.uri === MAIN);
    expect(main.text).toBe("BOB:\n  Line one.\n");
    expect(workspace.restarted.sent).not.toContain(
      UpdateCompilerDocumentMessage.method,
    );

    await insertAtStart(workspace, 3, "~ ");
    await settle();
    const update = workspace.restarted.requests.find(
      (r) => r.method === UpdateCompilerDocumentMessage.method,
    )!;
    expect(update.params.textDocument).toEqual({ uri: MAIN, version: 3 });
  });

  it("waits for the newest worker's configuration when it restarts again before the last was configured", async () => {
    const workspace = new TestWorkspace();
    workspace.hold = new Set([ConfigureCompilerMessage.method]);
    const first = workspace.restartCompiler();
    await settle();
    const configuring = workspace.whenCompilerConfigured!;
    let configured = false;
    void configuring.then(() => (configured = true));

    const second = workspace.restartCompiler();
    await settle();
    let newestConfigured = false;
    void workspace.whenCompilerConfigured!.then(
      () => (newestConfigured = true),
    );
    await expect(first).resolves.toBeUndefined();
    expect((workspace as any)._compilerConfigured).toBe(false);
    expect(configured).toBe(false);
    expect(newestConfigured).toBe(false);

    workspace.connections[2]!.release(ConfigureCompilerMessage.method);
    await settle();
    expect((workspace as any)._compilerConfigured).toBe(true);
    expect(configured).toBe(true);
    expect(newestConfigured).toBe(true);
    await second;
  });

  it("settles a selection the stuck worker never answered", async () => {
    const workspace = new TestWorkspace();
    await open(workspace, "Line one.\n");
    const params = {
      textDocument: { uri: MAIN },
      selectedRange: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      docChanged: false,
      userEvent: true,
    };
    const selecting = workspace.selectTextDocument(params);
    await settle();
    expect(workspace.stuck.sent).toContain(SelectCompilerDocumentMessage.method);

    await workspace.restartCompiler();

    expect(await selecting).toEqual(params);
  });

  it("settles a file change the stuck worker never answered", async () => {
    const workspace = new TestWorkspace();
    const creating = workspace.createFile("file://proj/other.sd");
    await settle();
    expect(workspace.stuck.sent).toContain(AddCompilerFileMessage.method);

    await workspace.restartCompiler();

    expect((await creating)?.uri).toBe("file://proj/other.sd");
    const configure = workspace.restarted.requests.find(
      (r) => r.method === ConfigureCompilerMessage.method,
    )!;
    expect(
      configure.params.files.some((f: File) => f.uri === "file://proj/other.sd"),
    ).toBe(true);
  });

  it("settles a changed or deleted file the stuck worker never answered", async () => {
    const workspace = new TestWorkspace();
    const OTHER = "file://proj/other.sd";
    (workspace as any)._watchedFiles.set(OTHER, {
      uri: OTHER,
      name: "other",
      type: "script",
      ext: "sd",
      text: "",
      version: 0,
      languageId: "sparkdown",
    });
    const changing = workspace.changeFile(OTHER);
    const deleting = workspace.deleteFile(MAIN);
    await settle();
    expect(workspace.stuck.sent).toEqual(
      expect.arrayContaining([
        UpdateCompilerFileMessage.method,
        RemoveCompilerFileMessage.method,
      ]),
    );

    await workspace.restartCompiler();

    expect((await changing)?.uri).toBe(OTHER);
    expect((await deleting)?.uri).toBe(MAIN);
  });

  it("sends a document opened again after a restart, whatever version it starts from", async () => {
    const workspace = new TestWorkspace();
    await open(workspace, "Line one.\n");
    await insertAtStart(workspace, 2, "BOB:\n  ");
    await insertAtStart(workspace, 3, "~ ");
    await workspace.restartCompiler();
    await settle();

    await workspace.closeTextDocument({ textDocument: { uri: MAIN } });
    await open(workspace, "Line two.\n");
    await settle();
    const update = workspace.restarted.requests.find(
      (r) => r.method === UpdateCompilerDocumentMessage.method,
    );
    expect(update?.params.textDocument).toEqual({
      uri: MAIN,
      languageId: "sparkdown",
      version: 1,
      text: "Line two.\n",
    });
  });
});
