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
});
