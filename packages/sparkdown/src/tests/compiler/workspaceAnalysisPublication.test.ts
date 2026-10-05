// The compiler may finish checking a captured revision after an edit or after
// another compile already answered. Drive the actual workspace through its
// public methods, using the same held-connection pattern as workspaceRestart.
// No native artifact or new host API is required to reproduce publication.
import { describe, expect, it } from "vitest";
import { CompileProgramMessage } from "../../compiler/classes/messages/CompileProgramMessage";
import type { CompileProgramResult } from "../../compiler/classes/messages/CompileProgramMessage";
import type { File } from "../../compiler/types/File";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";

const MAIN = "file://publication/main.sd";
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

class PublicationWorkspace extends SparkdownWorkspace {
  // startCompilerWorker runs from super(), before derived field initialization.
  declare compiles: { resolve: (result: CompileProgramResult) => void }[];
  notifications: { method: string; params: unknown }[] = [];
  publications: SparkProgram[] = [];

  constructor() {
    super("");
    this._compilerConfigured = true;
    this._compilerConfig = { files: [] } as never;
    this._watchedFiles.set(MAIN, {
      uri: MAIN, name: "main", type: "script", ext: "sd",
      languageId: "sparkdown", text: "A line.\n", version: 1,
    } as File);
  }

  protected override startCompilerWorker() {
    this.compiles = [];
    this._initializedCompiler = true;
    this._compilerChannelConnection = {
      sendRequest: (type: { method: string }) => {
        if (type.method === CompileProgramMessage.method) {
          return new Promise<CompileProgramResult>(resolve => this.compiles.push({ resolve }));
        }
        return Promise.resolve(undefined);
      },
    } as never;
  }

  override debouncedCompile = (async () => undefined) as never;
  protected override scheduleChangeCompile() {}
  sendRequest(): never { throw Error("not used"); }
  async sendNotification(method: string, params: unknown) {
    this.notifications.push({ method, params });
  }
  override onCompiledTextDocument(params: { textDocument: { uri: string }; program: SparkProgram }) {
    this.publications.push(params.program);
  }
  async getFileText() { return ""; }
  async getFileSrc() { return ""; }
  async getFileVersion() { return 0; }
  async getFileLanguageId() { return "sparkdown"; }
}

const open = (workspace: PublicationWorkspace) => workspace.openTextDocument({
  textDocument: { uri: MAIN, version: 1, languageId: "sparkdown", text: "A line.\n" },
});

const edit = (workspace: PublicationWorkspace) => workspace.changeTextDocument({
  textDocument: { uri: MAIN, version: 2 },
  contentChanges: [{ text: "An inserted line.\nA line.\n" }],
});

// Summary responses bypass the program decoder exactly as the player's actual
// summary transport does. The diagnostic still has an authored version/range.
const response = (version: number): CompileProgramResult => ({
  textDocument: { uri: MAIN, version },
  program: {
    summary: true, uri: MAIN, scripts: { [MAIN]: version },
    diagnostics: { [MAIN]: [{ severity: 2, code: "TypeMismatch", source: "sparkdown",
      message: "Expected number, got string", range: {
        start: { line: version - 1, character: 0 }, end: { line: version - 1, character: 1 },
      } }] },
  } as unknown as SparkProgram,
});

describe("current compiler analysis publication", () => {
  it("accepts and publishes a response for the current document revision", async () => {
    const workspace = new PublicationWorkspace();
    await open(workspace);
    const compiling = workspace.compile(MAIN, true);
    await settle();
    expect(workspace.compiles).toHaveLength(1);
    workspace.compiles[0]!.resolve(response(1));
    const program = await compiling;
    expect(workspace.program(MAIN)).toBe(program);
    expect(program?.scripts[MAIN]).toBe(1);
    expect(workspace.publications).toEqual([program]);
    expect(workspace.notifications.map(n => n.method)).toEqual(["compiler/didCompile"]);
  });

  it("does not publish diagnostics captured before a document edit", async () => {
    const workspace = new PublicationWorkspace();
    await open(workspace);
    const compiling = workspace.compile(MAIN, true);
    await settle();
    expect(workspace.compiles).toHaveLength(1);
    await edit(workspace);
    workspace.compiles[0]!.resolve(response(1));
    expect(await compiling).toBeUndefined();
    expect(workspace.program(MAIN)).toBeUndefined();
    expect(workspace.publications).toEqual([]);
    expect(workspace.notifications).toEqual([]);
  });

  it("does not let an older response replace an already published newer result", async () => {
    const workspace = new PublicationWorkspace();
    await open(workspace);
    const oldCompile = workspace.compile(MAIN, true);
    await settle();
    await edit(workspace);
    const currentCompile = workspace.compile(MAIN, true);
    await settle();
    expect(workspace.compiles).toHaveLength(2);
    workspace.compiles[1]!.resolve(response(2));
    const current = await currentCompile;
    expect(current?.scripts[MAIN]).toBe(2);
    workspace.compiles[0]!.resolve(response(1));
    expect(await oldCompile).toBeUndefined();
    expect(workspace.program(MAIN)).toBe(current);
    expect(workspace.publications).toEqual([current]);
    expect(workspace.notifications.map(n => n.method)).toEqual(["compiler/didCompile"]);
  });
});
