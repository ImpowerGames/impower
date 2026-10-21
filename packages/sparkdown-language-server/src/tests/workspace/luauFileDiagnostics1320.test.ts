// A `.luau` file open in the language server is read from the grammar's Luau
// root, as the compiler reads it (I-1320): the server reports the diagnostics
// a compile of the file reports, and a `local` list continued after a
// trailing comma at the file's top level is not an error (I-732).
//
// The workspace is the language server's own, with its compiler's worker in
// this process (`languageServerWorker.ts`).
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { quietly, silentConnection, TestWorkspace } from "./languageServerWorker";

const UTIL = "file:///project/util.luau";

/** A `.luau` file as VS Code's client holds it: the `sparkdown-luau` language. */
const hostConfig = (text: string) => ({
  files: [{ uri: UTIL, type: "script", name: "util", ext: "luau", text, version: 1, languageId: "sparkdown-luau" }],
  workspace: "file:///project",
});

/** A cold compile of `text` with the configuration the language server's compiler holds. */
const coldCompile = (text: string): SparkProgram => {
  const compiler = new SparkdownCompiler();
  compiler.configure(hostConfig(text) as never);
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return compiler.compile({ textDocument: { uri: UTIL } } as never).program;
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const messages = (diagnostics: readonly { message: unknown }[] | undefined) =>
  (diagnostics ?? []).map((d) => (typeof d.message === "string" ? d.message : JSON.stringify(d.message)));

describe("a .luau file in the language server (I-1320)", () => {
  // The continued list is Luau's; `local = 3` is an error Luau reports.
  const TEXT = "local a, b = 1,\n  2\nprint(b)\nlocal = 3\n";

  it("reports the diagnostics a compile of the file reports", async () => {
    const workspace = new TestWorkspace(silentConnection);
    await quietly(() => workspace.loadCompiler(hostConfig(TEXT) as never));
    const { program } = await quietly<{ program: SparkProgram }>(() => (workspace as any).compileDocument(UTIL));
    const served = messages(program.diagnostics?.[UTIL]);
    const compiled = messages(coldCompile(TEXT).diagnostics?.[UTIL]);
    expect(served).toEqual(compiled);
    expect(served.length).toBeGreaterThan(0);
    expect(served.filter((m) => m.includes("got '2'"))).toEqual([]);
  }, 60_000);

  // A story that runs the file reads it; while an editor has it open, the
  // document's own compile owns its diagnostics ("luau-document"), and the
  // story's compile, which reports the file's diagnostics under its uri too,
  // leaves them alone. Closing the document clears them.
  it("publishes an open .luau document's own diagnostics, which no story entry takes over", async () => {
    const MAIN = "file:///project/main.sd";
    // The workspace's compile debounce runs on a worker's global scope.
    vi.stubGlobal("self", globalThis);
    const workspace = new TestWorkspace(silentConnection);
    const sent = vi.spyOn(workspace, "sendNotification").mockImplementation(() => undefined as never);
    await quietly(() =>
      workspace.loadCompiler({
        files: [
          { uri: MAIN, type: "script", name: "main", ext: "sd", text: 'run "util"\n', version: 1, languageId: "sparkdown" },
          { uri: UTIL, type: "script", name: "util", ext: "luau", text: TEXT, version: 1, languageId: "sparkdown-luau" },
        ],
        workspace: "file:///project",
      } as never),
    );
    expect((workspace as any).isScriptDocument(UTIL)).toBe(false);
    const published = () =>
      sent.mock.calls
        .filter(([method, params]) => method === "textDocument/publishDiagnostics" && (params as { uri: string }).uri === UTIL)
        .map(([, params]) => messages((params as { diagnostics: { message: unknown }[] }).diagnostics));
    const own = messages(coldCompile(TEXT).diagnostics?.[UTIL]);

    await quietly(() => workspace.openTextDocument({ textDocument: { uri: UTIL, languageId: "sparkdown-luau", version: 1, text: TEXT } }));
    await vi.waitFor(() => expect(published().at(-1)).toEqual(own), { timeout: 10000 });
    expect((workspace as any)._lastPublishedDiagnostics.get(UTIL).owner).toBe("luau-document");

    // The story's compile, which reports the file's errors under its uri
    // too, does not replace them.
    const { program: story } = await quietly<{ program: SparkProgram }>(() => (workspace as any).compileDocument(MAIN));
    expect(Object.keys(story.diagnostics ?? {})).toContain(UTIL);
    workspace.onCompiledTextDocument({ textDocument: { uri: MAIN }, program: story });
    expect((workspace as any)._lastPublishedDiagnostics.get(UTIL).owner).toBe("luau-document");
    expect(published().at(-1)).toEqual(own);

    await workspace.closeTextDocument({ textDocument: { uri: UTIL } });
    expect(published().at(-1)).toEqual([]);
    expect((workspace as any)._lastPublishedDiagnostics.has(UTIL)).toBe(false);
  }, 60_000);

  // An edit to an open `.luau` file changes the story that runs it: the
  // story compiles again and its scripts' diagnostics follow, here the
  // GlobalUsedAsLocal warning a use in the file kept away. A runtime report
  // the story's run sends later for the file leaves the open document's own
  // diagnostics in place.
  it("recompiles the story an edit to an open .luau file changes, whose runtime report keeps the file's own diagnostics", async () => {
    const MAIN = "file:///project/main.sd";
    const STORY = 'run "util"\nfunction f()\n  score = 1\n  return score\nend\n& f()\n';
    vi.stubGlobal("self", globalThis);
    const workspace = new TestWorkspace(silentConnection);
    const sent = vi.spyOn(workspace, "sendNotification").mockImplementation(() => undefined as never);
    const files = [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text: STORY, version: 1, languageId: "sparkdown" },
      { uri: UTIL, type: "script", name: "util", ext: "luau", text: "print(score)\n", version: 1, languageId: "sparkdown-luau" },
    ];
    await quietly(() => workspace.loadCompiler({ files, workspace: "file:///project" } as never));
    // The project the host watches, as its configuration sets it.
    Object.assign(workspace as any, { _scriptFilePattern: /\.sd$/ });
    for (const file of files) (workspace as any)._watchedFiles.set(file.uri, file);
    const published = (uri: string) =>
      sent.mock.calls
        .filter(([method, params]) => method === "textDocument/publishDiagnostics" && (params as { uri: string }).uri === uri)
        .map(([, params]) => messages((params as { diagnostics: { message: unknown }[] }).diagnostics));
    const unused = (uri: string) => (published(uri).at(-1) ?? []).filter((m) => m.includes("Global 'score' is only used"));

    await quietly(() => workspace.compile(MAIN, true));
    expect(unused(MAIN)).toEqual([]);
    await quietly(() => workspace.openTextDocument({ textDocument: { uri: UTIL, languageId: "sparkdown-luau", version: 1, text: "print(score)\n" } }));
    await vi.waitFor(() => expect((workspace as any)._lastPublishedDiagnostics.get(UTIL)?.owner).toBe("luau-document"), { timeout: 10000 });

    await quietly(() =>
      workspace.changeTextDocument({
        textDocument: { uri: UTIL, version: 2 },
        contentChanges: [{ range: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } }, text: "1" }],
      }),
    );
    await vi.waitFor(() => expect(unused(MAIN)).toHaveLength(1), { timeout: 10000 });
    await vi.waitFor(() => expect((workspace as any)._lastPublishedDiagnostics.get(UTIL)?.version).toBe(2), { timeout: 10000 });
    const own = published(UTIL).at(-1);
    expect(own).not.toContain("boom");

    // A run of the story as it compiled last, whose report the story's
    // diagnostics would carry.
    const story = (workspace as any)._entryPrograms.get(MAIN);
    expect(story.scripts[UTIL]).toBe(2);
    workspace.reportRuntimeDiagnostics({
      program: { uri: MAIN, scripts: story.scripts },
      diagnostics: { [UTIL]: [{ severity: 1, message: "boom", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, source: "runtime" }] },
    } as never);
    expect(published(UTIL).at(-1)).toEqual(own);
    expect((workspace as any)._lastPublishedDiagnostics.get(UTIL).owner).toBe("luau-document");
  }, 60_000);
});
