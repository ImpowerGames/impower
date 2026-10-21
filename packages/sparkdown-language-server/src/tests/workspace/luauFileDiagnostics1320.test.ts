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
  });

  it("compiles a document of the sparkdown-luau language", async () => {
    const workspace = new TestWorkspace(silentConnection);
    await quietly(() => workspace.loadCompiler(hostConfig(TEXT) as never));
    (workspace as any)._documents.add({ textDocument: { uri: UTIL, languageId: "sparkdown-luau", version: 1, text: TEXT } });
    expect((workspace as any).isScriptDocument(UTIL)).toBe(true);
  });
});
