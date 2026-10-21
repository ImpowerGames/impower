// A `.luau` file open in the language server is read from the grammar's Luau
// root, as the compiler reads it (I-1320): the server reports the diagnostics
// a compile of the file reports, and a `local` list continued after a
// trailing comma at the file's top level is not an error (I-732).
//
// The workspace is the language server's own, with its compiler's worker
// (`installSparkdownWorker`) in this process behind a connection that
// delivers every message as a structured clone, one task later, in order,
// as a worker's port does.
import { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { installSparkdownWorker } from "@impower/sparkdown/src/worker/installSparkdownWorker";
import { describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

const UTIL = "file:///project/util.luau";

/** One end of a port: what it posts arrives at its peer as a structured
 *  clone, one task later, in the order it was posted. */
class LoopbackConnection extends MessageConnection {
  peer?: LoopbackConnection;
  protected _listeners = new Set<(e: MessageEvent) => void>();

  constructor() {
    super((message) => {
      const copy = structuredClone(message);
      const peer = this.peer;
      setTimeout(() => {
        for (const listener of [...(peer?._listeners ?? [])]) {
          listener({ data: copy } as MessageEvent);
        }
      }, 0);
    });
  }

  override addEventListener(_event: "message", listener: (e: MessageEvent) => void) {
    this._listeners.add(listener);
  }

  override removeEventListener(_event: "message", listener: (e: MessageEvent) => void) {
    this._listeners.delete(listener);
  }

  close() {}
}

const silentConnection = new Proxy(
  {},
  { get: () => () => ({ dispose() {} }) },
) as never;

class TestWorkspace extends SparkdownLanguageServerWorkspace {
  // Set by `startCompilerWorker`, which the constructor calls before this
  // class's own fields are initialized, so neither has an initializer.
  declare worker: ReturnType<typeof installSparkdownWorker>;
  declare page: LoopbackConnection;

  protected override startCompilerWorker() {
    const page = new LoopbackConnection();
    const worker = new LoopbackConnection();
    page.peer = worker;
    worker.peer = page;
    this.page = page;
    this._compilerChannelConnection = page as never;
    this.worker = installSparkdownWorker(worker);
    this._initializedCompiler = true;
  }
}

const quietly = async <T>(run: () => Promise<T>): Promise<T> => {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return await run();
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

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
