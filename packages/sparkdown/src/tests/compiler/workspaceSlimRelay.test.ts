// The slim `compiler/didCompile` relay (#1815). The web editor initializes the
// language server with `slimProgramNotifications`, and its main thread clones
// every compile result the server relays. The relay carries only what the page
// reads: the compile's identity (uri, scripts, version) and the per-file
// diagnostic counts. A program's `files` table describes every asset of the
// project and measured 5.8 MB of JSON on a real one, so it stays behind.
//
// The workspace is driven with a stand-in compiler connection that answers a
// compile at once with a program carrying a large `files` table.
import { describe, expect, it } from "vitest";
import { CompiledProgramMessage } from "../../compiler/classes/messages/CompiledProgramMessage";
import { CompileProgramMessage } from "../../compiler/classes/messages/CompileProgramMessage";
import type { File } from "../../compiler/types/File";
import { NO_START_SCENE_MESSAGE } from "../../compiler/utils/startScene";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";

const MAIN = "file://proj/main.sd";

const FILES = Object.fromEntries(
  Array.from({ length: 200 }, (_, i) => [
    `file://proj/images/portrait_${i}.svg`,
    {
      uri: `file://proj/images/portrait_${i}.svg`,
      name: `portrait_${i}`,
      type: "image",
      ext: "svg",
    },
  ]),
);

const DIAGNOSTICS = {
  [MAIN]: [
    { severity: 1, message: NO_START_SCENE_MESSAGE },
    { severity: 2, message: "a warning" },
    { severity: 2, message: "another warning" },
  ],
};

class TestWorkspace extends SparkdownWorkspace {
  declare notifications: { method: string; params: any }[];

  constructor(slim: boolean) {
    super("");
    this.notifications = [];
    this.slimProgramNotifications = slim;
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
    const connection = {
      sendRequest: (type: { method: string }, params: any) => {
        if (type.method !== CompileProgramMessage.method) {
          return Promise.resolve(undefined);
        }
        const uri = params.textDocument.uri;
        return Promise.resolve({
          textDocument: params.textDocument,
          program: {
            uri,
            scripts: { [uri]: this._documentVersions.get(uri) ?? 0 },
            files: FILES,
            diagnostics: DIAGNOSTICS,
          },
        });
      },
      abandon() {},
      addEventListener() {},
      removeEventListener() {},
      close() {},
    };
    this._compilerChannelConnection = connection as any;
    this._compilerWorker = { terminate() {} } as any;
    this._initializedCompiler = true;
  }

  sendRequest(): any {
    throw new Error("not used");
  }
  async sendNotification(method: string, params: any) {
    this.notifications?.push({ method, params });
  }
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

const compiled = async (slim: boolean) => {
  const workspace = new TestWorkspace(slim);
  const program = await workspace.compile(MAIN, true);
  const relayed = workspace.notifications.filter(
    (n) => n.method === CompiledProgramMessage.method,
  );
  expect(relayed).toHaveLength(1);
  return { program, params: relayed[0]!.params };
};

describe("the compiler/didCompile relay", () => {
  it("leaves the program's files table out of a slim relay", async () => {
    const { program, params } = await compiled(true);
    expect(params.program.files).toEqual({});
    // The workspace keeps the full program for its own requests.
    expect(Object.keys(program!.files)).toHaveLength(200);
  });

  it("keeps what the editor reads in a slim relay", async () => {
    const { params } = await compiled(true);
    expect(params.program.uri).toBe(MAIN);
    expect(params.program.scripts).toEqual({ [MAIN]: 0 });
    expect(params.program.version).toBeTypeOf("number");
    expect(params.program.diagnostics).toBeUndefined();
    expect(params.program.playRefusal).toBe(NO_START_SCENE_MESSAGE);
    expect(params.diagnosticsSummary).toEqual({
      [MAIN]: { errors: 1, warnings: 2, infos: 0 },
    });
  });

  it("keeps a slim relay small however many assets the project has", async () => {
    const { params } = await compiled(true);
    expect(JSON.stringify(params).length).toBeLessThan(1000);
  });

  it("relays the whole program when not slim", async () => {
    const { params } = await compiled(false);
    expect(Object.keys(params.program.files)).toHaveLength(200);
    expect(params.program.diagnostics).toEqual(DIAGNOSTICS);
  });
});
