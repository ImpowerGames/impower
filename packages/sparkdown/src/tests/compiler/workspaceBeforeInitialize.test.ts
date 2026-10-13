// #1817 — the editor forwards file events to the language server as they
// happen, and on a large project some arrive before `initialize`. Sent on to
// the compiler then, each was answered "Compiler has not been configured!".
// A file event or document that arrives before `initialize` waits for the
// compiler's configuration, and is recorded after the files `initialize`
// registers, so they do not overwrite it.
//
// The workspace is driven with a stand-in compiler connection that holds the
// configuration until the test releases it, since what is under test is the
// order in which the workspace sends its requests.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AddCompilerFileMessage } from "../../compiler/classes/messages/AddCompilerFileMessage";
import { ConfigureCompilerMessage } from "../../compiler/classes/messages/ConfigureCompilerMessage";
import { RemoveCompilerFileMessage } from "../../compiler/classes/messages/RemoveCompilerFileMessage";
import { UpdateCompilerDocumentMessage } from "../../compiler/classes/messages/UpdateCompilerDocumentMessage";
import { UpdateCompilerFileMessage } from "../../compiler/classes/messages/UpdateCompilerFileMessage";
import type { File } from "../../compiler/types/File";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";

const MAIN = "file://proj/main.sd";
const EXTRA = "file://proj/extra.sd";
const ADDED = "file://proj/added.sd";
const IMAGE = "file://proj/mia~happy.png";

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

class TestWorkspace extends SparkdownWorkspace {
  /** Every request sent to the compiler, in order. */
  requests: { method: string; params: any }[] = [];
  /** Resolves the configuration request, which is held until then. */
  configure?: () => void;
  /** File loads held until the test resolves them, by uri. */
  heldLoads = new Map<string, () => void>();
  holdLoadsOf = new Set<string>();

  constructor() {
    super("");
    this._initializedCompiler = true;
    this._compilerChannelConnection = {
      sendRequest: (type: { method: string }, params: any) => {
        this.requests.push({ method: type.method, params });
        if (type.method === ConfigureCompilerMessage.method) {
          return new Promise<void>((resolve) => (this.configure = resolve));
        }
        return Promise.resolve(undefined);
      },
    } as any;
  }

  protected override async connectToWorker() {}

  override async loadFile(file: { uri: string }) {
    if (this.holdLoadsOf.has(file.uri)) {
      await new Promise<void>((resolve) =>
        this.heldLoads.set(file.uri, resolve),
      );
    }
    return {
      uri: file.uri,
      name: this.getFileName(file.uri),
      type: this.getFileType(file.uri),
      ext: this.getFileExtension(file.uri),
      text: "",
      version: 0,
      languageId: "sparkdown",
    } as File;
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
    return "sparkdown";
  }

  get sent() {
    return this.requests.map((r) => r.method);
  }

  get watched() {
    return Array.from(this._watchedFiles.keys()).sort();
  }

  initializeWith(uris: string[]) {
    return this.initialize({
      rootUri: "file://proj",
      capabilities: {},
      initializationOptions: {
        settings: { scriptFiles: "**/*.sd", imageFiles: "**/*.png" },
        files: uris.map((uri) => ({ uri, text: "", version: 0 })),
      } as any,
    });
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

describe("a file event that arrives before the workspace is initialized", () => {
  it("reaches the compiler only after its configuration, once each", async () => {
    const workspace = new TestWorkspace();
    const events = Promise.all([
      workspace.deleteFile(EXTRA),
      workspace.createFile(ADDED),
      workspace.changeFile(IMAGE),
    ]);
    await settle();
    expect(workspace.sent).toEqual([]);

    await workspace.initializeWith([MAIN, EXTRA, IMAGE]);
    await settle();
    // Configured with the files `initialize` was given, and nothing else
    // sent while the compiler is being configured.
    expect(workspace.sent).toEqual([ConfigureCompilerMessage.method]);

    workspace.configure!();
    await events;
    await settle();
    expect(workspace.sent).toEqual([
      ConfigureCompilerMessage.method,
      RemoveCompilerFileMessage.method,
      AddCompilerFileMessage.method,
      UpdateCompilerFileMessage.method,
    ]);
    expect(workspace.requests[1]!.params.file.uri).toBe(EXTRA);
    expect(workspace.requests[2]!.params.file.uri).toBe(ADDED);
    expect(workspace.requests[3]!.params.file.uri).toBe(IMAGE);
  });

  it("is not undone by the files initialize registers", async () => {
    const workspace = new TestWorkspace();
    const deleting = workspace.deleteFile(EXTRA);
    const creating = workspace.createFile(ADDED);
    await workspace.initializeWith([MAIN, EXTRA]);
    workspace.configure!();
    await Promise.all([deleting, creating]);
    expect(workspace.watched).toEqual([ADDED, MAIN]);
  });

  it("is applied after an earlier event for the same file, however long that one takes", async () => {
    const workspace = new TestWorkspace();
    workspace.holdLoadsOf.add(ADDED);
    // Created, then deleted, before initialize: the file is gone.
    const creating = workspace.createFile(ADDED);
    const deleting = workspace.deleteFile(ADDED);
    await workspace.initializeWith([MAIN]);
    workspace.configure!();
    await settle();
    // The create's load is still out, and the delete waits behind it.
    expect(workspace.sent).toEqual([ConfigureCompilerMessage.method]);

    workspace.heldLoads.get(ADDED)!();
    await Promise.all([creating, deleting]);
    await settle();
    expect(workspace.sent).toEqual([
      ConfigureCompilerMessage.method,
      AddCompilerFileMessage.method,
      RemoveCompilerFileMessage.method,
    ]);
    expect(workspace.watched).toEqual([MAIN]);
  });

  it("still reaches the compiler when initialize configures nothing", async () => {
    const workspace = new TestWorkspace();
    const deleting = workspace.deleteFile(EXTRA);
    await workspace.initialize({ rootUri: "file://proj", capabilities: {} });
    await deleting;
    // Sent on, so the compiler answers it (with its error), rather than held
    // for a configuration that will never come.
    expect(workspace.sent).toEqual([RemoveCompilerFileMessage.method]);
  });
});

describe("file events after the workspace is initialized", () => {
  it("are applied to a file in the order they arrived", async () => {
    const workspace = new TestWorkspace();
    await workspace.initializeWith([MAIN]);
    workspace.configure!();
    workspace.holdLoadsOf.add(ADDED);
    const creating = workspace.createFile(ADDED);
    const deleting = workspace.deleteFile(ADDED);
    await settle();
    expect(workspace.sent).toEqual([ConfigureCompilerMessage.method]);

    workspace.heldLoads.get(ADDED)!();
    await Promise.all([creating, deleting]);
    await settle();
    expect(workspace.sent).toEqual([
      ConfigureCompilerMessage.method,
      AddCompilerFileMessage.method,
      RemoveCompilerFileMessage.method,
    ]);
    expect(workspace.watched).toEqual([MAIN]);
  });
});

describe("a document opened before the workspace is initialized", () => {
  it("reaches the compiler only after its configuration", async () => {
    const workspace = new TestWorkspace();
    workspace.debouncedCompile = (async () => undefined) as any;
    await workspace.openTextDocument({
      textDocument: {
        uri: MAIN,
        languageId: "sparkdown",
        version: 1,
        text: "Line one.\n",
      },
    });
    await settle();
    expect(workspace.sent).toEqual([]);

    await workspace.initializeWith([MAIN]);
    await settle();
    expect(workspace.sent).toEqual([ConfigureCompilerMessage.method]);

    workspace.configure!();
    await settle();
    expect(workspace.sent).toEqual([
      ConfigureCompilerMessage.method,
      UpdateCompilerDocumentMessage.method,
    ]);
  });
});
