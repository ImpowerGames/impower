// The language server compiles with the binary program back end (#704): its
// compiler builds statement chunks whatever its host sends, so its
// diagnostics come from the program path's resolver and its global
// initializers run as the declaration sequences, and its program is located
// by the chunks' root, which stays in the compiler's worker. The copy of the
// program the language server holds has neither the root nor a path
// location table, so the address of a line, where an address stands and the
// previous and next beat are asked of the worker (`locatorOf`).
//
// The workspace is the language server's own, with its compiler's worker
// (`installSparkdownWorker`) in this process behind a connection that
// delivers every message as a structured clone, one task later, in order,
// as a worker's port does.
import "@impower/sparkdown/src/inkjs/engine/Container";
import { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import { UpdateCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/UpdateCompilerDocumentMessage";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { installSparkdownWorker } from "@impower/sparkdown/src/worker/installSparkdownWorker";
import { describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import {
  getOffsetSourceLocation,
  ownBeats,
} from "../../utils/providers/getOffsetSourceLocation";

const MAIN = "file:///project/main.sd";
const NEWLINE = String.fromCharCode(10);

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

const scriptFile = (text: string) => ({
  uri: MAIN,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

/** What the language server's hosts configure its compiler with, less the
 *  definitions only the editor's completions read. */
const hostConfig = (text: string) => ({
  files: [scriptFile(text)],
  workspace: "file:///project",
  emitCompiledProgram: false,
});

const posAt = (text: string, offset: number) => {
  const before = text.slice(0, offset).split(NEWLINE);
  return { line: before.length - 1, character: before.at(-1)!.length };
};

/** The language server's workspace over one script, compiled. */
async function languageServer(initial: string) {
  const workspace = new TestWorkspace(silentConnection);
  let text = initial;
  let version = 1;
  await quietly(() => workspace.loadCompiler(hostConfig(text) as never));
  const compile = async (): Promise<SparkProgram> =>
    (
      await quietly<{ program: SparkProgram }>(() =>
        (workspace as any).compileDocument(MAIN),
      )
    ).program;
  let program = await compile();
  return {
    workspace,
    get program() {
      return program;
    },
    get text() {
      return text;
    },
    /** The program the worker compiled, which the copy above was made from. */
    get compiled(): SparkProgram {
      return (workspace.worker.compiler as any)._lastCompileResult.program;
    },
    get compiler(): SparkdownCompiler {
      return workspace.worker.compiler;
    },
    /** Replaces the first `find` with `replace` as one edit, and compiles. */
    async edit(find: string, replace: string) {
      const offset = text.indexOf(find);
      expect(offset, `"${find}" is in the script`).toBeGreaterThanOrEqual(0);
      version += 1;
      await workspace.page.sendRequest(UpdateCompilerDocumentMessage.type, {
        textDocument: { uri: MAIN, version },
        contentChanges: [
          {
            range: { start: posAt(text, offset), end: posAt(text, offset + find.length) },
            text: replace,
          },
        ],
      });
      text = text.slice(0, offset) + replace + text.slice(offset + find.length);
      program = await compile();
      return program;
    },
  };
}

/** A cold compile of `text` with the configuration the language server's
 *  compiler holds, statement chunks on or off. */
const coldCompile = (text: string, programChunks: boolean) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({ ...hostConfig(text), programChunks } as never);
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return compiler.compile({ textDocument: { uri: MAIN } } as never).program;
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const diagnosticsOf = (program: SparkProgram) => program.diagnostics?.[MAIN] ?? [];

const globalsOf = (program: SparkProgram, names: readonly string[]) => {
  const story = new ProgramStory(program.chunks!);
  return Object.fromEntries(names.map((name) => [name, story.variablesState.$(name)]));
};

const BEATS = [
  "store trust = 0",
  "",
  "Raffles waits by the door.",
  "",
  "scene A",
  "  He looks around.",
  "",
  "  RAFFLES:",
  "    (quietly)",
  "    Nobody here.",
  "",
  "  & trust = trust + 1",
  "  He looks again.",
  "",
  "  branch hall",
  "    He waits.",
  "  end",
  "end",
  "",
  "scene B",
  "  Bunny arrives.",
  "",
  "  Bunny leaves.",
  "end",
  "",
].join(NEWLINE);

const lineOf = (text: string, needle: string) =>
  text.split(NEWLINE).findIndex((line) => line.includes(needle));

describe("the language server's compiler", () => {
  it("builds statement chunks whatever its host sends", async () => {
    const ls = await languageServer(BEATS);
    expect(ls.compiler.config.programChunks).toBe(true);
    // The worker's program runs from its chunks, and the copy the language
    // server holds carries neither the root nor a path location table.
    expect(ls.compiled.fallback).toBeUndefined();
    expect(ls.compiled.chunks == null).toBe(false);
    expect(ls.program.chunks == null).toBe(true);
    expect(ls.program.pathLocations == null).toBe(true);
    // Its diagnostics are those of the current back end's compile.
    expect(diagnosticsOf(ls.program)).toEqual(diagnosticsOf(coldCompile(BEATS, false)));
  });
});

describe("the language server's locations", () => {
  it("give every line the address and place the program's own accessor gives it", async () => {
    const ls = await languageServer(BEATS);
    const remote = ls.workspace.locatorOf(ls.program);
    const own = programLocator(ls.compiled);
    const lines = BEATS.split(NEWLINE).length;
    const addresses: unknown[] = [];
    for (let line = 0; line < lines; line++) {
      const address = await remote.addressAt(MAIN, line);
      expect(address, `line ${line}`).toBe(own.addressAt(MAIN, line));
      const functions = await remote.addressAt(MAIN, line, { functions: true });
      expect(functions, `line ${line}, functions`).toBe(own.addressAt(MAIN, line, { functions: true }));
      if (address !== undefined) {
        expect(await remote.locationOf(address), `line ${line}`).toEqual(own.locationOf(address));
        addresses.push(address);
      }
    }
    // A program of statement chunks names its positions by number, and the
    // script's beats are found.
    expect(addresses.length).toBeGreaterThan(5);
    expect(addresses.every((a) => typeof a === "number")).toBe(true);
  });

  it("give the previous and next beat the current back end gave", async () => {
    const ls = await languageServer(BEATS);
    const remote = ls.workspace.locatorOf(ls.program);
    // What the language server answered before it compiled with chunks: the
    // program of the current back end and its path locations. The script
    // ends its scenes with no divert or `done`, which only the program
    // engine stops on (`offsetSourceLocation.test.ts`).
    const current = coldCompile(BEATS, false);
    const before = ownBeats(programLocator(current));
    const lines = BEATS.split(NEWLINE).length;
    for (let line = 0; line < lines; line++) {
      for (const offset of [-1, 1, 2]) {
        expect(
          await getOffsetSourceLocation(ls.program, remote, MAIN, line, offset),
          `line ${line}, offset ${offset}`,
        ).toEqual(await getOffsetSourceLocation(current, before, MAIN, line, offset));
      }
    }
    const at = (line: number, offset: number) =>
      getOffsetSourceLocation(ls.program, remote, MAIN, line, offset);
    // A dialogue's lines are one beat, which starts where its location
    // starts (`offsetSourceLocation.test.ts`).
    expect(await at(lineOf(BEATS, "He looks around."), 1)).toEqual({
      file: MAIN,
      line: lineOf(BEATS, "(quietly)"),
    });
    expect(await at(lineOf(BEATS, "Nobody here."), -1)).toEqual({
      file: MAIN,
      line: lineOf(BEATS, "(quietly)"),
    });
    expect(await at(lineOf(BEATS, "Bunny arrives."), 1)).toEqual({
      file: MAIN,
      line: lineOf(BEATS, "Bunny leaves."),
    });
    // A scene's header is a stop of its own, as a branch's is.
    expect(await at(lineOf(BEATS, "Bunny arrives."), -1)).toEqual({
      file: MAIN,
      line: lineOf(BEATS, "scene B"),
    });
    expect(await at(lineOf(BEATS, "He waits."), -1)).toEqual({
      file: MAIN,
      line: lineOf(BEATS, "branch hall"),
    });
    // Every question is a message to the worker and its answer, each a task
    // later here.
  }, 60_000);

  it("are none for a program the worker never compiled", async () => {
    const ls = await languageServer(BEATS);
    const remote = ls.workspace.locatorOf({ ...ls.program, uri: "file:///project/other.sd" });
    expect(await remote.addressAt(MAIN, lineOf(BEATS, "Bunny arrives."))).toBeUndefined();
  });
});

describe("the language server's global initializers", () => {
  const GLOBALS = [
    "store a = 1",
    "store b = a + 1",
    "const C = 2",
    "const D = C + 1",
    "",
    "scene MAIN",
    "  Values {a} {b} {D}.",
    "  if a > 0 then",
    "    Positive.",
    "  end",
    "end",
    "",
  ].join(NEWLINE);
  const NAMES = ["a", "b", "C", "D"];

  it("run none for an edit inside a flow, and every sequence again for an edit to a global another reads", async () => {
    const ls = await languageServer(GLOBALS);
    const store = ls.compiler.chunkStore!;
    let runs = store.initializerRuns;
    expect(runs).toBe(1);

    await ls.edit("Positive.", "Plus.");
    await ls.edit("Values", "Totals");
    expect(store.initializerRuns).toBe(runs);

    await ls.edit("store a = 1", "store a = 5");
    expect(store.initializerRuns).toBe(runs + 1);
    runs = store.initializerRuns;
    expect(globalsOf(ls.compiled, NAMES)).toEqual({ a: 5, b: 6, C: 2, D: 3 });
    expect(globalsOf(ls.compiled, NAMES)).toEqual(globalsOf(coldCompile(ls.text, true), NAMES));
    expect(diagnosticsOf(ls.program)).toEqual(diagnosticsOf(coldCompile(ls.text, false)));

    await ls.edit("const C = 2", "const C = 7");
    expect(store.initializerRuns).toBe(runs + 1);
    expect(globalsOf(ls.compiled, NAMES)).toEqual({ a: 5, b: 6, C: 7, D: 8 });
    expect(globalsOf(ls.compiled, NAMES)).toEqual(globalsOf(coldCompile(ls.text, true), NAMES));
  });

  it("report a cold compile's diagnostics when an edit makes a constant that another reads stop being constant", async () => {
    const ls = await languageServer(GLOBALS);
    expect(diagnosticsOf(ls.program)).toEqual([]);
    await ls.edit("const C = 2", "const C = a");
    const cold = diagnosticsOf(coldCompile(ls.text, false));
    expect(cold.length).toBeGreaterThan(0);
    expect(diagnosticsOf(ls.program)).toEqual(cold);
    await ls.edit("const C = a", "const C = 2");
    expect(diagnosticsOf(ls.program)).toEqual([]);
  });
});

describe("the language server's diagnostics", () => {
  it("place a bad constant expression and a naming collision on the lines the current back end places them", async () => {
    const text = [
      "store gold = 3",
      "const LIMIT = gold * 2",
      "store tally = 0",
      "store tally = 1",
      "",
      "scene MAIN",
      "  Count {tally}.",
      "end",
      "",
    ].join(NEWLINE);
    const ls = await languageServer(text);
    const reported = diagnosticsOf(ls.program);
    const lines = new Set(reported.map((d) => d.range.start.line));
    expect(lines.has(lineOf(text, "const LIMIT"))).toBe(true);
    expect([...lines].some((line) => line === lineOf(text, "store tally = 0") || line === lineOf(text, "store tally = 1"))).toBe(true);
    expect(reported).toEqual(diagnosticsOf(coldCompile(text, false)));
  });
});
