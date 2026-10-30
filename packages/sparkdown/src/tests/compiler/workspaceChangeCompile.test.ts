import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompileProgramMessage } from "../../compiler/classes/messages/CompileProgramMessage";
import { SelectCompilerDocumentMessage } from "../../compiler/classes/messages/SelectCompilerDocumentMessage";
import { SelectedCompilerDocumentMessage } from "../../compiler/classes/messages/SelectedCompilerDocumentMessage";
import { UpdateCompilerDocumentMessage } from "../../compiler/classes/messages/UpdateCompilerDocumentMessage";
import type { File } from "../../compiler/types/File";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";

const MAIN = "file://proj/main.sd";
const LOOSE = "file://loose/scene.sd";

const DELAY = 10;

interface CompileRequest {
  uri: string;
  version: number;
  sentVersion: number | undefined;
  startFrom: { file: string; line: number } | undefined;
  answer: () => void;
  fail: (e: Error) => void;
  answered: boolean;
}

class TestWorkspace extends SparkdownWorkspace {
  declare compiles: CompileRequest[];
  declare sentVersions: Map<string, number>;
  declare answerCompiles: boolean;
  declare requests: string[];
  declare holdUpdates: boolean;
  declare heldUpdates: (() => void)[];
  declare holdSelects: boolean;
  declare heldSelects: (() => void)[];
  declare notifications: { method: string; params: any }[];

  override debouncedCompile = (async () => undefined) as any;

  override debouncesFromEdit = true;

  constructor(delay = DELAY) {
    super("");
    this._changeCompileDebounceDelay = delay;
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
    this.compiles ??= [];
    this.sentVersions ??= new Map();
    this.requests ??= [];
    this.heldUpdates ??= [];
    this.heldSelects ??= [];
    const mine: CompileRequest[] = [];
    const connection = {
      sendRequest: (type: { method: string }, params: any) => {
        this.requests.push(type.method);
        if (type.method === UpdateCompilerDocumentMessage.method) {
          this.sentVersions.set(
            params.textDocument.uri,
            params.textDocument.version,
          );
          if (this.holdUpdates) {
            return new Promise((resolve) => {
              this.heldUpdates.push(() => resolve(true));
            });
          }
        }
        if (type.method === SelectCompilerDocumentMessage.method) {
          if (this.holdSelects) {
            return new Promise((resolve) => {
              this.heldSelects.push(() => resolve({ ...params }));
            });
          }
          return Promise.resolve({ ...params });
        }
        if (type.method !== CompileProgramMessage.method) {
          return Promise.resolve(undefined);
        }
        const uri = params.textDocument.uri;
        const version = this._documentVersions.get(uri) ?? 0;
        const scripts: Record<string, number> = { [uri]: version };
        for (const [other, v] of this._documentVersions) {
          if (other !== uri && this.getMainScriptUri(other) === uri) {
            scripts[other] = v;
          }
        }
        return new Promise((resolve, reject) => {
          const request: CompileRequest = {
            uri,
            version,
            sentVersion: this.sentVersions.get(uri),
            startFrom: params.startFrom,
            answered: false,
            answer: () => {
              request.answered = true;
              resolve({
                textDocument: params.textDocument,
                program: { summary: true, uri, scripts },
              });
            },
            fail: (e) => {
              request.answered = true;
              reject(e);
            },
          };
          this.compiles.push(request);
          mine.push(request);
          if (this.answerCompiles) {
            request.answer();
          }
        });
      },
      abandon: (e: Error) => {
        for (const request of mine) {
          if (!request.answered) {
            request.fail(e);
          }
        }
      },
      addEventListener() {},
      removeEventListener() {},
      close() {},
    };
    this._compilerChannelConnection = connection as any;
    this._compilerWorker = { terminate() {} } as any;
    this._initializedCompiler = true;
  }

  get running() {
    return this.compiles.filter((c) => !c.answered);
  }

  answerUpdates() {
    for (const answer of this.heldUpdates.splice(0)) answer();
  }

  answerSelects() {
    for (const answer of this.heldSelects.splice(0)) answer();
  }

  sendRequest(): any {
    throw new Error("not used");
  }
  async sendNotification(method: string, params: unknown) {
    (this.notifications ??= []).push({ method, params });
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

const versions = new Map<string, number>();

const open = async (workspace: TestWorkspace, uri = MAIN) => {
  versions.set(uri, 1);
  await workspace.openTextDocument({
    textDocument: { uri, languageId: "sparkdown", version: 1, text: "" },
  });
  await vi.advanceTimersByTimeAsync(0);
};

const type = (workspace: TestWorkspace, uri = MAIN, changedAt?: number) => {
  const version = versions.get(uri)! + 1;
  versions.set(uri, version);
  void workspace.changeTextDocument({
    textDocument: { uri, version },
    changedAt,
    contentChanges: [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        text: "a",
      },
    ],
  });
  return version;
};

beforeEach(() => {
  vi.useFakeTimers();
  versions.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("keystroke compiles", () => {
  it("never start a second compile beside one in flight, and the next compile has the latest text", async () => {
    const workspace = new TestWorkspace();
    await open(workspace);
    type(workspace);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(workspace.compiles).toHaveLength(1);
    expect(workspace.compiles[0]!.version).toBe(2);

    let latest = 0;
    for (let i = 0; i < 6; i++) {
      latest = type(workspace);
      await vi.advanceTimersByTimeAsync(DELAY);
    }
    await vi.advanceTimersByTimeAsync(DELAY * 8);
    expect(workspace.compiles).toHaveLength(1);

    workspace.compiles[0]!.answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.compiles).toHaveLength(2);
    expect(workspace.compiles[1]!.version).toBe(latest);
    expect(workspace.compiles[1]!.sentVersion).toBe(latest);

    workspace.compiles[1]!.answer();
    await vi.advanceTimersByTimeAsync(DELAY * 8);
    expect(workspace.compiles).toHaveLength(2);
  });

  it("with no debounce (a host override of 0) still run one at a time", async () => {
    const workspace = new TestWorkspace(0);
    await open(workspace);
    type(workspace);
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.compiles).toHaveLength(1);
    let latest = 0;
    for (let i = 0; i < 4; i++) {
      latest = type(workspace);
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(workspace.compiles).toHaveLength(1);
    workspace.compiles[0]!.answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.compiles).toHaveLength(2);
    expect(workspace.compiles[1]!.version).toBe(latest);
  });

  it("are bounded by the max-wait during sustained typing", async () => {
    const workspace = new TestWorkspace();
    workspace.answerCompiles = true;
    await open(workspace);
    const started: number[] = [];
    let time = 0;
    for (let i = 0; i < 40; i++) {
      type(workspace);
      const before = workspace.compiles.length;
      await vi.advanceTimersByTimeAsync(DELAY / 2);
      time += DELAY / 2;
      if (workspace.compiles.length > before) {
        started.push(time);
      }
    }
    expect(started.length).toBeGreaterThanOrEqual(4);
    let previous = 0;
    for (const at of started) {
      expect(at - previous).toBeLessThanOrEqual(DELAY * 4);
      previous = at;
    }
  });

  it("start the next compile at once when the last outlived the max-wait", async () => {
    const workspace = new TestWorkspace();
    await open(workspace);
    type(workspace);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(workspace.compiles).toHaveLength(1);
    for (let i = 0; i < 20; i++) {
      type(workspace);
      await vi.advanceTimersByTimeAsync(DELAY / 2);
    }
    expect(workspace.compiles).toHaveLength(1);
    workspace.compiles[0]!.answer();
    type(workspace);
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.compiles).toHaveLength(2);
  });

  it("go on after a compile that fails", async () => {
    const workspace = new TestWorkspace();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await open(workspace);
    type(workspace);
    await vi.advanceTimersByTimeAsync(DELAY);
    type(workspace);
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(workspace.compiles).toHaveLength(1);
    workspace.compiles[0]!.fail(new Error("compile failed"));
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toHaveBeenCalled();
    expect(workspace.compiles).toHaveLength(2);
    workspace.compiles[1]!.answer();
    const latest = type(workspace);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(workspace.compiles).toHaveLength(3);
    expect(workspace.compiles[2]!.version).toBe(latest);
    errors.mockRestore();
  });

  it("compile every pending document across trees, one at a time", async () => {
    const workspace = new TestWorkspace();
    await open(workspace, MAIN);
    await open(workspace, LOOSE);
    type(workspace, MAIN);
    type(workspace, LOOSE);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(workspace.compiles.map((c) => c.uri)).toEqual([MAIN]);
    const latest = type(workspace, MAIN);
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(workspace.running).toHaveLength(1);
    workspace.compiles[0]!.answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.compiles.map((c) => c.uri)).toEqual([MAIN, LOOSE]);
    expect(workspace.running).toHaveLength(1);
    workspace.compiles[1]!.answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.compiles.map((c) => c.uri)).toEqual([MAIN, LOOSE, MAIN]);
    expect(workspace.compiles[2]!.version).toBe(latest);
    workspace.compiles[2]!.answer();
    await vi.advanceTimersByTimeAsync(DELAY * 8);
    expect(workspace.compiles).toHaveLength(3);
  });

  it("wait for a forced compile in flight, then compile the latest text at once", async () => {
    const workspace = new TestWorkspace();
    await open(workspace);
    type(workspace);
    await vi.advanceTimersByTimeAsync(0);
    const forced = workspace.compile(MAIN, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.compiles).toHaveLength(1);
    let latest = 0;
    for (let i = 0; i < 4; i++) {
      latest = type(workspace);
      await vi.advanceTimersByTimeAsync(DELAY);
    }
    expect(workspace.compiles).toHaveLength(1);
    workspace.compiles[0]!.answer();
    await forced;
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.compiles).toHaveLength(2);
    expect(workspace.compiles[1]!.version).toBe(latest);
  });

  it("compile the latest text on the new worker when it restarts while one waits", async () => {
    const workspace = new TestWorkspace();
    await open(workspace);
    type(workspace);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(workspace.compiles).toHaveLength(1);
    const latest = type(workspace);
    await vi.advanceTimersByTimeAsync(DELAY * 8);
    expect(workspace.compiles).toHaveLength(1);

    const restarting = workspace.restartCompiler();
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.compiles[0]!.answered).toBe(true);
    const after = workspace.compiles.slice(1);
    expect(after.length).toBeGreaterThanOrEqual(1);
    expect(after.every((c) => c.version === latest)).toBe(true);
    for (const c of after) c.answer();
    await restarting;
    await vi.advanceTimersByTimeAsync(DELAY * 8);
    expect(workspace.running).toHaveLength(0);
  });

  it("compile documents of one tree once", async () => {
    const SCENE = "file://proj/scene.sd";
    const workspace = new TestWorkspace();
    await open(workspace, MAIN);
    await open(workspace, SCENE);
    type(workspace, SCENE);
    type(workspace, MAIN);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(workspace.compiles.map((c) => c.uri)).toEqual([MAIN]);
    workspace.compiles[0]!.answer();
    await vi.advanceTimersByTimeAsync(DELAY * 8);
    expect(workspace.compiles).toHaveLength(1);
  });

  it("settle a request that piggybacks on a pending keystroke compile", async () => {
    const workspace = new TestWorkspace();
    await open(workspace);
    type(workspace);
    await vi.advanceTimersByTimeAsync(DELAY);
    type(workspace);
    await vi.advanceTimersByTimeAsync(0);
    const waiting = workspace.compile(MAIN, false);
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(workspace.compiles).toHaveLength(1);
    workspace.compiles[0]!.answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.compiles).toHaveLength(2);
    workspace.compiles[1]!.answer();
    expect((await waiting)?.uri).toBe(MAIN);
  });
});

describe("an edit's compile", () => {
  const selectAfterEdit = (workspace: TestWorkspace, line: number) =>
    workspace.selectTextDocument({
      textDocument: { uri: MAIN },
      selectedRange: {
        start: { line, character: 0 },
        end: { line, character: 0 },
      },
      docChanged: true,
      userEvent: true,
    });

  it("starts a debounce after the edit arrives, without waiting for the compiler to answer its update", async () => {
    const workspace = new TestWorkspace();
    await open(workspace);
    workspace.holdUpdates = true;
    const latest = type(workspace);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(workspace.compiles).toHaveLength(1);
    expect(workspace.compiles[0]!.version).toBe(latest);
    expect(workspace.compiles[0]!.sentVersion).toBe(latest);
    expect(workspace.requests.slice(-2)).toEqual([
      UpdateCompilerDocumentMessage.method,
      CompileProgramMessage.method,
    ]);
  });

  it("counts the debounce from when the editor made the edit", async () => {
    const workspace = new TestWorkspace();
    await open(workspace);
    type(workspace, MAIN, Date.now() - DELAY);
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.compiles).toHaveLength(1);

    workspace.compiles[0]!.answer();
    type(workspace, MAIN, Date.now() + DELAY * 100);
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(workspace.compiles).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(workspace.compiles).toHaveLength(2);
  });

  it("counts the debounce from the edit's arrival in a workspace that keeps its own pace", async () => {
    const workspace = new TestWorkspace();
    workspace.debouncesFromEdit = false;
    await open(workspace);
    type(workspace, MAIN, Date.now() - DELAY);
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(workspace.compiles).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(workspace.compiles).toHaveLength(1);
  });

  it("routes to the selection the editor sent after the edit, which does not go to the compiler ahead of it", async () => {
    const workspace = new TestWorkspace();
    await open(workspace);
    const latest = type(workspace);
    await selectAfterEdit(workspace, 3);
    expect(workspace.requests).not.toContain(
      SelectCompilerDocumentMessage.method,
    );
    expect(workspace.notifications).toEqual([
      {
        method: SelectedCompilerDocumentMessage.method,
        params: expect.objectContaining({
          selectedRange: expect.objectContaining({
            start: { line: 3, character: 0 },
          }),
          programOutdated: true,
        }),
      },
    ]);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(workspace.compiles).toHaveLength(1);
    expect(workspace.compiles[0]!.version).toBe(latest);
    expect(workspace.compiles[0]!.sentVersion).toBe(latest);
    expect(workspace.compiles[0]!.startFrom).toEqual({ file: MAIN, line: 3 });
  });

  it("is answered by the compile already sent for the edit when that compile routes to the selection", async () => {
    const workspace = new TestWorkspace();
    await open(workspace);
    await selectAfterEdit(workspace, 3);
    type(workspace, MAIN, Date.now() - DELAY);
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.compiles).toHaveLength(1);
    expect(workspace.compiles[0]!.startFrom).toEqual({ file: MAIN, line: 3 });
    workspace.requests.length = 0;
    await selectAfterEdit(workspace, 3);
    expect(workspace.requests).not.toContain(
      SelectCompilerDocumentMessage.method,
    );
    expect(workspace.notifications.at(-1)?.params.programOutdated).toBe(true);
  });

  it("leaves a selection to the compiler once a compile routing elsewhere has been sent", async () => {
    const workspace = new TestWorkspace();
    await open(workspace);
    await selectAfterEdit(workspace, 3);
    type(workspace, MAIN, Date.now() - DELAY);
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.compiles).toHaveLength(1);
    void selectAfterEdit(workspace, 4);
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.requests).toContain(SelectCompilerDocumentMessage.method);
  });

  it("keeps the page on the later selection when the compiler answers an earlier one after it", async () => {
    const workspace = new TestWorkspace();
    await open(workspace);
    workspace.holdSelects = true;
    const first = workspace.selectTextDocument({
      textDocument: { uri: MAIN },
      selectedRange: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 0 },
      },
      docChanged: false,
      userEvent: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.heldSelects).toHaveLength(1);
    type(workspace);
    await selectAfterEdit(workspace, 3);
    workspace.answerSelects();
    await first;
    const lines = (workspace.notifications ?? []).map(
      (n) => n.params.selectedRange.start.line,
    );
    expect(lines).toEqual([3]);
  });

  it("leaves a selection to the compiler when a compile already answered the edit", async () => {
    const workspace = new TestWorkspace();
    workspace.answerCompiles = true;
    await open(workspace);
    type(workspace);
    await workspace.compile(MAIN, true);
    expect(workspace.compiles).toHaveLength(1);
    await selectAfterEdit(workspace, 3);
    expect(workspace.requests).toContain(SelectCompilerDocumentMessage.method);
    expect(workspace.notifications.at(-1)?.params.programOutdated).not.toBe(
      true,
    );
    await vi.advanceTimersByTimeAsync(DELAY * 8);
    expect(workspace.compiles).toHaveLength(1);
  });

  it("leaves a selection to the compiler once the compile has returned", async () => {
    const workspace = new TestWorkspace();
    workspace.answerCompiles = true;
    await open(workspace);
    await selectAfterEdit(workspace, 3);
    type(workspace);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(workspace.compiles).toHaveLength(1);
    workspace.requests.length = 0;
    void selectAfterEdit(workspace, 3);
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.requests).toContain(SelectCompilerDocumentMessage.method);
  });
});
