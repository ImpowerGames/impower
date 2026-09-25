// #816 — the player's runtime errors and warnings reach the language server,
// which publishes them beside the compile's diagnostics for the same document.
// The next compile of an edited document clears them, since they describe the
// text as it was when the run raised them.
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

const main = "file:///project/main.sd";
const story = "file:///project/story.sd";
const range = (line: number) => ({
  start: { line, character: 0 },
  end: { line, character: 4 },
});
const compileWarning = {
  severity: 2,
  message: "Unused variable x",
  range: range(0),
};
const runtimeWarning = {
  severity: 2,
  message: "This line begins with `..`, but the line before it had already ended.",
  range: range(3),
  source: "runtime",
};
const runtimeError = {
  severity: 1,
  message: "boom",
  range: range(5),
  source: "runtime",
};

function setup() {
  const requests = new Map<string, (params: any) => any>();
  const notifications = new Map<string, (params: any) => any>();
  const workspace = Object.create(
    SparkdownLanguageServerWorkspace.prototype,
  ) as SparkdownLanguageServerWorkspace;
  Object.assign(workspace, {
    _documents: new SparkdownDocumentRegistry([]),
    _scriptFilePattern: /\.sd$/,
    _imageFilePattern: /\.svg$/,
    _documentVersions: new Map([
      [main, 1],
      [story, 1],
    ]),
    _lastPublishedDiagnostics: new Map(),
    _lastFormattedText: new Map(),
    _watchedFiles: new Map([
      [main, {}],
      [story, {}],
    ]),
    _programStates: new Map(),
    _fileChanges: 0,
    _entryPrograms: new Map(),
    _connection: new Proxy(
      {},
      {
        get: (_target, key) =>
          key === "onRequest"
            ? (method: string, handler: (params: any) => any) => {
                requests.set(method, handler);
                return { dispose() {} };
              }
            : key === "onNotification"
              ? (method: string, handler: (params: any) => any) => {
                  notifications.set(method, handler);
                  return { dispose() {} };
                }
              : () => ({ dispose() {} }),
      },
    ),
    sendNotification: vi.fn(),
    sendRequest: vi.fn(),
  });
  workspace.listen();
  /** Compile `program` as the workspace's compiler would report it, holding
   *  it as the main script's program. */
  const compiled = (program: any) => {
    (workspace as any)._programStates.set(main, { program });
    workspace.onCompiledTextDocument({ textDocument: { uri: main }, program });
  };
  const report = (params: any) =>
    notifications.get("sparkdown/runtimeDiagnostics")!(params);
  const published = (uri: string) =>
    vi
      .mocked(workspace.sendNotification)
      .mock.calls.filter(([method]) => method === "textDocument/publishDiagnostics")
      .map(([, params]) => params as any)
      .filter((p) => p.uri === uri)
      .map((p) => p.diagnostics);
  return { workspace, requests, compiled, report, published };
}

afterEach(() => vi.restoreAllMocks());

describe("runtime diagnostics", () => {
  it("are published beside the compile's, and cleared by the compile of an edit", () => {
    const { workspace, compiled, report, published } = setup();
    compiled({
      uri: main,
      scripts: { [main]: 1, [story]: 1 },
      diagnostics: { [main]: [compileWarning] },
    });
    report({
      program: { uri: main, scripts: { [main]: 1, [story]: 1 } },
      diagnostics: { [main]: [runtimeWarning], [story]: [runtimeError] },
    });
    expect(published(main).at(-1)).toEqual([compileWarning, runtimeWarning]);
    expect(published(story).at(-1)).toEqual([runtimeError]);

    // An edit to either script recompiles the program, and the run that raised
    // them described the program before it.
    (workspace as any)._documentVersions.set(story, 2);
    compiled({
      uri: main,
      scripts: { [main]: 1, [story]: 2 },
      diagnostics: { [main]: [compileWarning] },
    });
    expect(published(main).at(-1)).toEqual([compileWarning]);
    expect(published(story).at(-1)).toEqual([]);
  });

  it("from a run of a newer edit wait for the compile of that edit", () => {
    const { workspace, compiled, report, published } = setup();
    compiled({
      uri: main,
      scripts: { [main]: 1 },
      diagnostics: { [main]: [compileWarning] },
    });
    report({
      program: { uri: main, scripts: { [main]: 2 } },
      diagnostics: { [main]: [runtimeWarning] },
    });
    expect(published(main).at(-1)).toEqual([compileWarning]);
    (workspace as any)._documentVersions.set(main, 2);
    compiled({
      uri: main,
      scripts: { [main]: 2 },
      diagnostics: { [main]: [compileWarning] },
    });
    expect(published(main).at(-1)).toEqual([compileWarning, runtimeWarning]);
  });

  it("replace the last run's", () => {
    const { compiled, report, published } = setup();
    compiled({ uri: main, scripts: { [main]: 1 }, diagnostics: {} });
    const program = { uri: main, scripts: { [main]: 1 } };
    report({ program, diagnostics: { [main]: [runtimeError] } });
    report({ program, diagnostics: { [main]: [runtimeWarning] } });
    expect(published(main).at(-1)).toEqual([runtimeWarning]);
    report({ program, diagnostics: {} });
    expect(published(main).at(-1)).toEqual([]);
  });

  it("keep one diagnostic for a warning repeated at the same place", () => {
    const { compiled, report, published } = setup();
    compiled({ uri: main, scripts: { [main]: 1 }, diagnostics: {} });
    report({
      program: { uri: main, scripts: { [main]: 1 } },
      diagnostics: { [main]: [runtimeWarning, { ...runtimeWarning }, runtimeError] },
    });
    expect(published(main).at(-1)).toEqual([runtimeWarning, runtimeError]);
  });

  it("of a script main does not import are published against that script's own program", () => {
    const { workspace, compiled, report, published } = setup();
    compiled({ uri: main, scripts: { [main]: 1 }, diagnostics: {} });
    // The workspace compiles a script main does not import on its own.
    const standalone = { uri: story, scripts: { [story]: 1 }, diagnostics: {} };
    (workspace as any)._programStates.set(story, { program: standalone });
    workspace.onCompiledTextDocument({ textDocument: { uri: story }, program: standalone });
    report({
      program: { uri: story, scripts: { [story]: 1 } },
      diagnostics: { [story]: [runtimeWarning] },
    });
    expect(published(story).at(-1)).toEqual([runtimeWarning]);
  });

  it("of a document two entry scripts import are published against the new run's entry", () => {
    const { workspace, compiled, report, published } = setup();
    const other = "file:///project/other.sd";
    compiled({ uri: main, scripts: { [main]: 1, [story]: 1 }, diagnostics: {} });
    const second = { uri: other, scripts: { [other]: 1, [story]: 1 }, diagnostics: {} };
    (workspace as any)._programStates.set(other, { program: second });
    workspace.onCompiledTextDocument({ textDocument: { uri: other }, program: second });
    report({
      program: { uri: main, scripts: { [main]: 1, [story]: 1 } },
      diagnostics: { [story]: [runtimeWarning] },
    });
    expect(published(story).at(-1)).toEqual([runtimeWarning]);
    // A run of the other entry raises something else in the same document.
    report({
      program: { uri: other, scripts: { [other]: 1, [story]: 1 } },
      diagnostics: { [story]: [runtimeError] },
    });
    expect(published(story).at(-1)).toEqual([runtimeError]);
  });

  it("of a run whose entry has not compiled here yet replace the last run's at once", () => {
    const { compiled, report, published } = setup();
    const other = "file:///project/other.sd";
    compiled({ uri: main, scripts: { [main]: 1, [story]: 1 }, diagnostics: {} });
    report({
      program: { uri: main, scripts: { [main]: 1, [story]: 1 } },
      diagnostics: { [story]: [runtimeWarning] },
    });
    expect(published(story).at(-1)).toEqual([runtimeWarning]);
    // The player compiled the other entry before this server did.
    report({
      program: { uri: other, scripts: { [other]: 1, [story]: 1 } },
      diagnostics: { [story]: [runtimeError] },
    });
    expect(published(story).at(-1)).toEqual([]);
  });

  it("stay when another entry script compiles", () => {
    const { workspace, compiled, report, published } = setup();
    const other = "file:///project/other.sd";
    compiled({ uri: main, scripts: { [main]: 1, [story]: 1 }, diagnostics: {} });
    report({
      program: { uri: main, scripts: { [main]: 1, [story]: 1 } },
      diagnostics: { [story]: [runtimeWarning] },
    });
    // A script main does not import compiles on its own, and publishes the
    // documents it names.
    const standalone = { uri: other, scripts: { [other]: 1 }, diagnostics: {} };
    (workspace as any)._programStates.set(other, { program: standalone });
    workspace.onCompiledTextDocument({ textDocument: { uri: other }, program: standalone });
    expect(published(story).at(-1)).toEqual([runtimeWarning]);
  });

  it("stay when an entry that includes the run's entry compiles", () => {
    const { workspace, compiled, report, published } = setup();
    const nested = "file:///project/sub/main.sd";
    compiled({ uri: main, scripts: { [main]: 1, [story]: 1 }, diagnostics: {} });
    report({
      program: { uri: main, scripts: { [main]: 1, [story]: 1 } },
      diagnostics: { [story]: [runtimeWarning] },
    });
    // The workspace stores a compile under every script it names, so the
    // nested entry's program takes main's state too.
    const program = {
      uri: nested,
      scripts: { [nested]: 1, [main]: 1, [story]: 1 },
      diagnostics: {},
    };
    for (const uri of [nested, main, story]) {
      (workspace as any)._programStates.set(uri, { program });
    }
    workspace.onCompiledTextDocument({ textDocument: { uri: nested }, program });
    expect(published(story).at(-1)).toEqual([runtimeWarning]);
  });

  it("are not shown against a program with other scripts", () => {
    const { compiled, report, published } = setup();
    compiled({ uri: main, scripts: { [main]: 1, [story]: 1 }, diagnostics: {} });
    // A run of main before it imported story shares main's version.
    report({
      program: { uri: main, scripts: { [main]: 1 } },
      diagnostics: { [main]: [runtimeWarning] },
    });
    expect(published(main).at(-1)).toEqual([]);
  });

  it("are cleared by the compile that follows a change to a project file", () => {
    const { workspace, compiled, report, published } = setup();
    const program = { uri: main, scripts: { [main]: 1 }, diagnostics: {} };
    compiled(program);
    report({
      program: { uri: main, scripts: { [main]: 1 } },
      diagnostics: { [main]: [runtimeWarning] },
    });
    expect(published(main).at(-1)).toEqual([runtimeWarning]);
    // Replacing an asset recompiles the same script versions into another
    // program, which the run did not run.
    workspace.onChangedFile({ uri: "file:///project/hero.svg", name: "hero", ext: "svg", type: "image" });
    compiled({ ...program });
    expect(published(main).at(-1)).toEqual([]);
    // A run of the program as it is now is shown again.
    report({
      program: { uri: main, scripts: { [main]: 1 } },
      diagnostics: { [main]: [runtimeWarning] },
    });
    expect(published(main).at(-1)).toEqual([runtimeWarning]);
  });

  it("are included when the client pulls a document's diagnostics", async () => {
    const { workspace, requests, compiled, report } = setup();
    const program = {
      uri: main,
      scripts: { [main]: 1 },
      diagnostics: { [main]: [compileWarning] },
    };
    compiled(program);
    report({
      program: { uri: main, scripts: { [main]: 1 } },
      diagnostics: { [main]: [runtimeWarning] },
    });
    (workspace as any)._documents.add({
      textDocument: { uri: main, languageId: "sparkdown", version: 1, text: "" },
    });
    vi.spyOn(workspace, "compile").mockResolvedValue(program as any);
    const pulled = await requests.get("textDocument/diagnostic")!({
      textDocument: { uri: main },
    });
    expect(pulled.items).toEqual([compileWarning, runtimeWarning]);
  });
});
