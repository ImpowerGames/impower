import { AddCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/AddCompilerFileMessage";
import { RemoveCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/RemoveCompilerFileMessage";
import { UpdateCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/UpdateCompilerDocumentMessage";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { getOffsetSourceLocation } from "../../utils/providers/getOffsetSourceLocation";
import { quietly, silentConnection, TestWorkspace } from "./languageServerWorker";

const MAIN = "file:///project/main.sd";
const NEWLINE = String.fromCharCode(10);

const scriptFile = (text: string) => ({
  uri: MAIN,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

const hostConfig = (text: string) => ({
  files: [scriptFile(text)],
  workspace: "file:///project",
});

const posAt = (text: string, offset: number) => {
  const before = text.slice(0, offset).split(NEWLINE);
  return { line: before.length - 1, character: before.at(-1)!.length };
};

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
    get compiled(): SparkProgram {
      return (workspace.worker.compiler as any)._lastCompileResult.program;
    },
    get compiler(): SparkdownCompiler {
      return workspace.worker.compiler;
    },
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

const coldCompile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure(hostConfig(text) as never);
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
  "  -> B",
  "",
  "  branch hall",
  "    He waits.",
  "    -> B",
  "  end",
  "end",
  "",
  "scene B",
  "  Bunny arrives.",
  "",
  "  Bunny leaves.",
  "",
  "  done",
  "end",
  "",
].join(NEWLINE);

const lineOf = (text: string, needle: string) =>
  text.split(NEWLINE).findIndex((line) => line.includes(needle));

describe("the language server's compiler", () => {
  it("builds statement chunks, which stay in its worker", async () => {
    const ls = await languageServer(BEATS);
    expect(ls.compiled.chunks).toBeDefined();
    expect(ls.compiled.chunks == null).toBe(false);
    expect(ls.program.chunks == null).toBe(true);
    expect(diagnosticsOf(ls.program)).toEqual(diagnosticsOf(coldCompile(BEATS)));
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
    expect(addresses.length).toBeGreaterThan(5);
    expect(addresses.every((a) => typeof a === "number")).toBe(true);
  });

  it("give the previous and next beat", async () => {
    const ls = await languageServer(BEATS);
    const remote = ls.workspace.locatorOf(ls.program);
    const at = (line: number, offset: number) =>
      getOffsetSourceLocation(ls.program, remote, MAIN, line, offset);
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
    expect(await at(lineOf(BEATS, "Bunny arrives."), -1)).toEqual({
      file: MAIN,
      line: lineOf(BEATS, "scene B"),
    });
    expect(await at(lineOf(BEATS, "He waits."), -1)).toEqual({
      file: MAIN,
      line: lineOf(BEATS, "branch hall"),
    });
  }, 60_000);

  it("give the previous and next beat around diverts that pass arguments", async () => {
    const text = [
      "store n = 0",
      "scene A",
      "  Before.",
      "  -> B(n + 1)",
      "  After.",
      "  -> B(f(n) * 2)",
      "  Later.",
      "  -> B(\"value {n}\")",
      "  Captured.",
      "  -> B(function()",
      "    return 1",
      "  end)",
      "  Function.",
      "end",
      "scene B(x)",
      "  Value {x}.",
      "  done",
      "end",
      "function f(v)",
      "  return v",
      "end",
      "",
    ].join(NEWLINE);
    const ls = await languageServer(text);
    expect(ls.compiled.chunks).toBeDefined();
    const remote = ls.workspace.locatorOf(ls.program);
    expect(await getOffsetSourceLocation(ls.program, remote, MAIN, lineOf(text, "Before."), 1)).toEqual({
      file: MAIN,
      line: lineOf(text, "After."),
    });
  }, 60_000);

  it("are none once the script the program was compiled for is removed, which the worker then holds no longer", async () => {
    const ls = await languageServer(BEATS);
    const OTHER = "file:///project/other.sd";
    const other = ["scene C", "  Alone here.", "end", ""].join(NEWLINE);
    await ls.workspace.page.sendRequest(AddCompilerFileMessage.type, {
      file: { ...scriptFile(other), uri: OTHER, name: "other" } as never,
    });
    const program: SparkProgram = (
      await quietly<{ program: SparkProgram }>(() =>
        (ls.workspace as any).compileDocument(OTHER),
      )
    ).program;
    const remote = ls.workspace.locatorOf(program);
    expect(typeof (await remote.addressAt(OTHER, 1))).toBe("number");
    await ls.workspace.page.sendRequest(RemoveCompilerFileMessage.type, {
      file: { uri: OTHER },
    });
    expect(await remote.addressAt(OTHER, 1)).toBeUndefined();
    expect(typeof (await ls.workspace.locatorOf(ls.program).addressAt(MAIN, lineOf(BEATS, "Bunny arrives.")))).toBe("number");
  });

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
    expect(globalsOf(ls.compiled, NAMES)).toEqual(globalsOf(coldCompile(ls.text), NAMES));
    expect(diagnosticsOf(ls.program)).toEqual(diagnosticsOf(coldCompile(ls.text)));

    await ls.edit("const C = 2", "const C = 7");
    expect(store.initializerRuns).toBe(runs + 1);
    expect(globalsOf(ls.compiled, NAMES)).toEqual({ a: 5, b: 6, C: 7, D: 8 });
    expect(globalsOf(ls.compiled, NAMES)).toEqual(globalsOf(coldCompile(ls.text), NAMES));
  });

  it("report a cold compile's diagnostics when an edit makes a constant that another reads stop being constant", async () => {
    const ls = await languageServer(GLOBALS);
    expect(diagnosticsOf(ls.program)).toEqual([]);
    await ls.edit("const C = 2", "const C = a");
    const cold = diagnosticsOf(coldCompile(ls.text));
    expect(cold.length).toBeGreaterThan(0);
    expect(diagnosticsOf(ls.program)).toEqual(cold);
    await ls.edit("const C = a", "const C = 2");
    expect(diagnosticsOf(ls.program)).toEqual([]);
  });
});

describe("the language server's diagnostics", () => {
  it("place a bad constant expression and a naming collision on the lines a cold compile places them", async () => {
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
    expect(reported).toEqual(diagnosticsOf(coldCompile(text)));
  });
});
