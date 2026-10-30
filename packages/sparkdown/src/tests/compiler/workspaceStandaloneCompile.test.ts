import { describe, expect, it } from "vitest";
import { CompileProgramMessage } from "../../compiler/classes/messages/CompileProgramMessage";
import { CompiledProgramMessage } from "../../compiler/classes/messages/CompiledProgramMessage";
import type { File } from "../../compiler/types/File";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";

const MAIN = "file://proj/main.sd";
const LOOSE = "file://proj/loose.sd";

const story = (filesEpoch: number) => ({
  summary: true,
  uri: MAIN,
  scripts: { [MAIN]: 1 },
  filesEpoch,
});

class TestWorkspace extends SparkdownWorkspace {
  declare compiledStory: unknown;
  declare published: { uri: string; scripts: Record<string, number> }[];

  constructor(publishesStory: boolean) {
    super("");
    this.publishesStoryOfStandaloneCompiles = publishesStory;
    this.published = [];
    this._scriptFilePattern = /\.sd$/;
    this._compilerConfig = { files: [] } as any;
    this._compilerConfigured = true;
    this._projectLoaded = true;
    for (const uri of [MAIN, LOOSE]) {
      this._watchedFiles.set(uri, {
        uri,
        name: uri.split("/").at(-1)!.split(".")[0]!,
        type: "script",
        ext: "sd",
        text: "",
        version: 0,
        languageId: "sparkdown",
      } as File);
    }
  }

  protected override startCompilerWorker() {
    const workspace = this;
    this._compilerChannelConnection = {
      sendRequest: async (type: { method: string }, params: any) => {
        if (type.method !== CompileProgramMessage.method) {
          return undefined;
        }
        const program =
          params.textDocument.uri === MAIN
            ? workspace.compiledStory
            : { summary: true, uri: LOOSE, scripts: { [LOOSE]: 1 } };
        return structuredClone({ textDocument: params.textDocument, program });
      },
      addEventListener() {},
      removeEventListener() {},
    } as any;
    this._compilerWorker = { terminate() {} } as any;
    this._initializedCompiler = true;
  }

  override async sendNotification(method: string, params: any) {
    if (method === CompiledProgramMessage.method) {
      this.published.push({
        uri: params.program.uri,
        scripts: params.program.scripts,
      });
    }
  }
  sendRequest(): any {
    throw new Error("not used");
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

describe("a compile of a script the story does not include (#1874)", () => {
  it("publishes the story's program first when the story changed, for a host that shows the story", async () => {
    const workspace = new TestWorkspace(true);
    workspace.compiledStory = story(1);
    await workspace.compile(MAIN, true);
    workspace.published = [];

    workspace.compiledStory = story(2);
    await workspace.compile(LOOSE, true);

    expect(workspace.published.map((p) => p.uri)).toEqual([MAIN, LOOSE]);
  });

  it("does not publish the story again when it did not change", async () => {
    const workspace = new TestWorkspace(true);
    workspace.compiledStory = story(1);
    await workspace.compile(MAIN, true);
    workspace.published = [];

    await workspace.compile(LOOSE, true);
    await workspace.compile(LOOSE, true);

    expect(workspace.published.map((p) => p.uri)).toEqual([LOOSE, LOOSE]);
  });

  it("publishes only the script's program by default, as the language server needs", async () => {
    const workspace = new TestWorkspace(false);
    workspace.compiledStory = story(1);
    await workspace.compile(MAIN, true);
    workspace.published = [];

    workspace.compiledStory = story(2);
    await workspace.compile(LOOSE, true);

    expect(workspace.published.map((p) => p.uri)).toEqual([LOOSE]);
  });
});
