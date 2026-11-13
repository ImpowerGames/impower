import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddCompilerFileMessage } from "../../compiler/classes/messages/AddCompilerFileMessage";
import { CompileProgramMessage } from "../../compiler/classes/messages/CompileProgramMessage";
import { RemoveCompilerFileMessage } from "../../compiler/classes/messages/RemoveCompilerFileMessage";
import type { File } from "../../compiler/types/File";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";

const MAIN = "file://proj/main.sd";
const FROM = "file://proj/Portraits/ava.png";
const TO = "file://proj/Portraits/Cast/ava.png";

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const programAt = (src: string) => ({
  uri: MAIN,
  scripts: { [MAIN]: 0 },
  summary: true,
  context: { image: { ava: { src } } },
});

class TestWorkspace extends SparkdownWorkspace {
  requests: { method: string; resolve: (result: any) => void }[] = [];

  constructor() {
    super("");
    this._compilerConfigured = true;
    this._projectLoaded = true;
    this._imageFilePattern = /\.png$/;
    this._watchedFiles.set(MAIN, { uri: MAIN, name: "main", ext: "sd", type: "script" } as File);
    this._watchedFiles.set(FROM, { uri: FROM, name: "ava", ext: "png", type: "image", src: FROM } as File);
    this._compilerChannelConnection = {
      sendRequest: (type: { method: string }) =>
        new Promise((resolve) => this.requests.push({ method: type.method, resolve })),
    } as any;
  }

  protected override async connectToWorker() {}

  override async loadFile(file: { uri: string }) {
    return { uri: file.uri, name: "ava", ext: "png", type: "image", src: file.uri } as File;
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

  answer(method: string, result: unknown = undefined) {
    const request = this.requests.find((r) => r.method === method && !(r as { done?: true }).done);
    if (!request) throw new Error(`no ${method} request`);
    (request as { done?: true }).done = true;
    request.resolve(result);
  }

  async compiled(src: string) {
    const compiling = this.compile(MAIN, false);
    await settle();
    this.answer(CompileProgramMessage.method, { program: programAt(src) });
    return compiling;
  }

  async moved() {
    void this.deleteFile(FROM);
    await settle();
    this.answer(RemoveCompilerFileMessage.method);
    await settle();
    void this.createFile(TO);
    await settle();
    this.answer(AddCompilerFileMessage.method);
    await settle();
  }
}

const originalWorker = globalThis.Worker;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("self", globalThis);
  globalThis.Worker = class {
    onerror: unknown;
    postMessage() {}
    addEventListener() {}
    removeEventListener() {}
    terminate() {}
  } as any;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  globalThis.Worker = originalWorker;
});

describe("the program of a main script that was compiled but never opened as a document", () => {
  it("compiles again once a file it uses moves to another folder", async () => {
    const workspace = new TestWorkspace();
    await workspace.compiled(FROM);
    expect(workspace.textDocumentExists(MAIN)).toBe(false);

    await workspace.moved();
    await vi.advanceTimersByTimeAsync(1000);

    expect(workspace.sent.filter((method) => method === CompileProgramMessage.method)).toHaveLength(2);
  });
});

describe("the current program", () => {
  it("is the program already compiled while no file has changed since", async () => {
    const workspace = new TestWorkspace();
    const program = await workspace.compiled(FROM);

    expect(await workspace.currentProgram(MAIN)).toBe(program);
    expect(workspace.sent).toEqual([CompileProgramMessage.method]);
  });

  it("is compiled from the moved file's new place, never the program compiled before the move", async () => {
    const workspace = new TestWorkspace();
    await workspace.compiled(FROM);
    await workspace.moved();

    const current = workspace.currentProgram(MAIN);
    await settle();
    workspace.answer(CompileProgramMessage.method, { program: programAt(TO) });

    expect((await current)?.context?.["image"]?.["ava"]?.src).toBe(TO);
  });

  it("is compiled once for every request that asks while the same move is unanswered", async () => {
    const workspace = new TestWorkspace();
    await workspace.compiled(FROM);
    await workspace.moved();

    const first = workspace.currentProgram(MAIN);
    const second = workspace.currentProgram(MAIN);
    await settle();
    expect(workspace.sent.filter((method) => method === CompileProgramMessage.method)).toHaveLength(2);
    workspace.answer(CompileProgramMessage.method, { program: programAt(TO) });

    expect(await first).toBe(await second);
    expect(workspace.sent.filter((method) => method === CompileProgramMessage.method)).toHaveLength(2);
  });

  it("waits for a move still reaching the compiler before it compiles", async () => {
    const workspace = new TestWorkspace();
    await workspace.compiled(FROM);
    void workspace.deleteFile(FROM);

    const current = workspace.currentProgram(MAIN);
    await settle();
    expect(workspace.sent).toEqual([CompileProgramMessage.method, RemoveCompilerFileMessage.method]);

    workspace.answer(RemoveCompilerFileMessage.method);
    await settle();
    expect(workspace.sent.at(-1)).toBe(CompileProgramMessage.method);
    workspace.answer(CompileProgramMessage.method, { program: programAt(TO) });
    expect((await current)?.context?.["image"]?.["ava"]?.src).toBe(TO);
  });
});
