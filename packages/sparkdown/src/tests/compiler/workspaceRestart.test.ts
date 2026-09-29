// Restarting the compiler's worker (#679). The player restarts its worker when
// a script runs in it without yielding, and nothing the old worker held
// survives: the new one is given the project as the editor holds it, which
// for an open document is the text the editor last sent, kept on the page for
// this. Whatever was still waiting on the old worker settles, and nothing the
// new worker was given is applied to it twice.
//
// The workspace is driven with stand-in compiler connections: the first never
// answers, as a worker that is stuck does not, and each later one answers at
// once, recording what it was sent.
import { describe, expect, it } from "vitest";
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

/** A compiler connection that records every request, and answers each at
 *  once when it is given answers, or never. */
class StandInConnection {
  requests: {
    method: string;
    params: any;
    reject: (e: unknown) => void;
  }[] = [];

  constructor(protected answers?: (method: string, params: any) => unknown) {}

  sendRequest(type: { method: string }, params: any) {
    return new Promise((resolve, reject) => {
      this.requests.push({ method: type.method, params, reject });
      if (this.answers) {
        resolve(this.answers(type.method, params));
      }
    });
  }

  abandon(error: Error) {
    for (const request of this.requests.splice(0)) {
      request.reject(error);
    }
  }

  addEventListener() {}

  removeEventListener() {}

  get sent() {
    return this.requests.map((r) => r.method);
  }
}

/** A compile's answer: a summary, which the page does not decode. */
const compiled = (params: any) => ({
  textDocument: params.textDocument,
  program: { summary: true, uri: MAIN, scripts: { [MAIN]: 1 } },
});

class TestWorkspace extends SparkdownWorkspace {
  // Set by `startCompilerWorker`, which the constructor calls before this
  // class's own fields are initialized, so neither has an initializer.
  declare connections: StandInConnection[];
  declare terminated: number;

  protected override _mirrorDocumentTexts = true;

  // The compiles an open or an edit schedules are not under test: each test
  // compiles when it means to.
  override debouncedCompile = (async () => undefined) as any;
  protected override scheduleChangeCompile() {}

  constructor() {
    super("");
    this._scriptFilePattern = /\.sd$/;
    this._compilerConfig = { files: [] } as any;
    this._compilerConfigured = true;
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
    // The first worker is the one that gets stuck; the ones after answer.
    const connection = new StandInConnection(
      this.connections.length === 0
        ? undefined
        : (method, params) =>
            method === CompileProgramMessage.method
              ? compiled(params)
              : method === SelectCompilerDocumentMessage.method
                ? params
                : "sparkdown",
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
    // A compile the stuck worker never answers.
    const compiling = workspace.compile(MAIN, true);
    await settle();
    expect(workspace.stuck.sent).toContain(CompileProgramMessage.method);
    workspace.select(3);

    await workspace.restartCompiler();

    expect(workspace.terminated).toBe(1);
    // The compile the stuck worker held settles, with nothing.
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
    // An edit whose update is still on its way when the restart begins.
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

    // A later edit reaches the new worker as an edit.
    await insertAtStart(workspace, 3, "~ ");
    await settle();
    const update = workspace.restarted.requests.find(
      (r) => r.method === UpdateCompilerDocumentMessage.method,
    )!;
    expect(update.params.textDocument).toEqual({ uri: MAIN, version: 3 });
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

    // Unrouted: the restarted worker routes to it as it compiles.
    expect(await selecting).toEqual(params);
  });
});
