import { describe, expect, it } from "vitest";
import { CompiledProgramMessage } from "../../compiler/classes/messages/CompiledProgramMessage";
import { CompileProgramMessage } from "../../compiler/classes/messages/CompileProgramMessage";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { File } from "../../compiler/types/File";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";

const MAIN = "file://proj/main.sd";

class TestWorkspace extends SparkdownWorkspace {
  declare notifications: { method: string; params: any }[];
  declare compiler: SparkdownCompiler;

  constructor(text: string) {
    super("");
    this.notifications = [];
    this._scriptFilePattern = /\.sd$/;
    this._compilerConfig = { files: [] } as any;
    this._compilerConfigured = true;
    const file = {
      uri: MAIN,
      name: "main",
      type: "script",
      ext: "sd",
      text,
      version: 1,
      languageId: "sparkdown",
    } as File;
    this._watchedFiles.set(MAIN, file);
    this._documentVersions.set(MAIN, 1);
    this.compiler = new SparkdownCompiler();
    this.compiler.configure({ files: [file] } as never);
  }

  edit(text: string, version: number) {
    this._documentVersions.set(MAIN, version);
    this.compiler.configure({
      files: [
        {
          uri: MAIN,
          name: "main",
          type: "script",
          ext: "sd",
          text,
          version,
          languageId: "sparkdown",
        },
      ],
    } as never);
  }

  protected override startCompilerWorker() {
    const connection = {
      sendRequest: (type: { method: string }, params: any) => {
        if (type.method !== CompileProgramMessage.method) {
          return Promise.resolve(undefined);
        }
        return Promise.resolve(
          this.compiler.compile({ textDocument: { uri: params.textDocument.uri } }),
        );
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
    this.notifications.push({ method, params });
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

const published = (workspace: TestWorkspace) =>
  workspace.notifications
    .filter((n) => n.method === CompiledProgramMessage.method)
    .map((n) => n.params.program.version);

describe("the published program.version", () => {
  it("is the workspace's counter and advances after an edit", async () => {
    const workspace = new TestWorkspace("Hello.\n");
    const first = await workspace.compile(MAIN, true);
    workspace.edit("Hello again.\n", 2);
    const second = await workspace.compile(MAIN, true);

    const versions = published(workspace);
    expect(versions).toHaveLength(2);
    expect(versions[0]).toBe(1);
    expect(versions[1]).toBe(2);
    expect(first!.scripts[MAIN]).toBe(1);
    expect(second!.scripts[MAIN]).toBe(2);
    expect(second!.version).toBe(2);
  });
});
