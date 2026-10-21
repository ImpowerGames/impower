// A throw the compile catches is an error at the statement that threw, and the
// compile makes no program (#1895): it is never only a line on the console.
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatementMemoRetry } from "../../compiler/lower/statementMemo";
import { Conditional } from "../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import {
  MAIN_URI,
  compileScript,
  errorsOf,
  programCompiler,
  programSession,
} from "./programHarness";

const SCRIPT = [
  "store k = 1",
  "-> main",
  "scene main",
  "  Before.",
  "  match (k)",
  "  | 1 = One.",
  "  end",
  "end",
  "",
].join("\n");

describe("a compile whose statement throws", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports an error at the statement's line and makes no program", () => {
    vi.spyOn(Conditional.prototype, "EmitProgram").mockImplementation(() => {
      throw new TypeError("emit failed");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { program } = compileScript(SCRIPT);
    expect(program.chunks).toBeUndefined();
    expect(errorsOf(program)).toEqual([
      [4, "The compile stopped at this statement, so no program was made: emit failed"],
    ]);
  });

  it("reports a store whose value raises an error when the declarations run at its line", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { program } = compileScript("store b = nil\nstore a = 1 // b\n");
    expect(program.chunks).toBeUndefined();
    const errors = errorsOf(program);
    expect(errors.map(([line]) => line)).toEqual([1]);
    expect(errors[0]![1]).toMatch(
      /^The compile stopped at this statement, so no program was made: .*perform \/\/ on a nil value/,
    );
  });

  it("reports that store beside an error on another statement", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { program } = compileScript(
      "store b = nil\nstore a = 1 // b\n\nmatch 1\n  case 1\n    One.\nend\n",
    );
    expect(program.chunks).toBeUndefined();
    expect(errorsOf(program).map(([line]) => line).sort()).toEqual([1, 4, 5]);
  });

  it("reports a store whose value raises inside a function it calls at the store", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { program } = compileScript(
      'function fail()\n  error("bad")\n  return 0\nend\n\nstore a = fail()\n',
    );
    expect(program.chunks).toBeUndefined();
    const errors = errorsOf(program);
    expect(errors.map(([line]) => line)).toEqual([5]);
    expect(errors[0]![1]).toMatch(/^The compile stopped at this statement, so no program was made: .*bad/);
  });

  it("reports such a store in the other script of the project that holds it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const MAIN = "file://proj/main.sd";
    const VALUES = "file://proj/includes/values.sd";
    const program = programCompiler({
      [MAIN]: 'function fail()\n  error("bad")\n  return 0\nend\nHello.\n',
      [VALUES]: "store b = 1\nstore a = fail()\n",
    }).compile(MAIN).program;
    expect(program.chunks).toBeUndefined();
    const errorLines = (uri: string) =>
      (program.diagnostics?.[uri] ?? []).filter((d) => d.severity === 1).map((d) => d.range.start.line);
    expect(errorLines(MAIN)).toEqual([]);
    expect(errorLines(VALUES)).toEqual([1]);
  });

  it("reports the store again when the next compile, after an edit elsewhere, still cannot run it", () => {
    const session = programSession("store b = nil\nstore a = 1 // b\nHello.\n");
    expect(errorsOf(session.program).map(([line]) => line)).toEqual([1]);
    session.edit("Hello.", "Hello there.");
    expect(session.program.chunks).toBeUndefined();
    expect(errorsOf(session.program).map(([line]) => line)).toEqual([1]);
  });

  it("reports a store whose value throws a host error at the store", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { program } = compileScript('store b = 1\nstore a = string.rep("", math.huge)\n');
    expect(program.chunks).toBeUndefined();
    const errors = errorsOf(program);
    expect(errors.map(([line]) => line)).toEqual([1]);
    expect(errors[0]![1]).toMatch(/^The compile stopped at this statement, so no program was made: .*Infinity/);
  });

  it("reports that store below a line of spacing", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { program } = compileScript('   \nstore a = string.rep("", math.huge)\n');
    expect(program.chunks).toBeUndefined();
    expect(errorsOf(program).map(([line]) => line)).toEqual([1]);
  });

  it("reports a store inside a function body at the store, not the function", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const value of ['string.rep("", math.huge)', "1 // nil"]) {
      const { program } = compileScript(
        `function holder()\n  store b = 1\n  store a = ${value}\n  return 0\nend\nHello.\n`,
      );
      expect(program.chunks, value).toBeUndefined();
      expect(errorsOf(program).map(([line]) => line), value).toEqual([2]);
    }
  });

  it("reports that store beside an error elsewhere in the same function", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { program } = compileScript(
      'function holder()\n  store a = string.rep("", math.huge)\n  match 1\n    case 1\n      One.\n  end\n  return 0\nend\nHello.\n',
    );
    expect(program.chunks).toBeUndefined();
    expect(errorsOf(program).map(([line]) => line)).toContain(1);
  });

  it("reports a store whose value raises a warning inside a function it calls at the store", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { program } = compileScript(
      'function trigger()\n  display({text = "A", continues = true})\n  return 0\nend\n\nstore a = trigger()\n',
    );
    expect(program.chunks).toBeUndefined();
    expect(errorsOf(program).map(([line]) => line)).toEqual([5]);
  });

  it("reports a store whose called function assigns its global at that store", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { program } = compileScript(
      'function fail()\n  a = 1\n  error("bad")\n  return 0\nend\nfunction holder()\n  store a = fail()\n  store b = 2\n  return 0\nend\nHello.\n',
    );
    expect(program.chunks).toBeUndefined();
    expect(errorsOf(program).map(([line]) => line)).toEqual([6]);
  });

  it("reports a store whose call gives the names after it values at that store", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { program } = compileScript(
      'function fail()\n  error("bad")\n  return 1, 2\nend\nfunction holder()\n  store c = 1\n  store a, b = fail()\n  store d = 2\n  return 0\nend\nHello.\n',
    );
    expect(program.chunks).toBeUndefined();
    const errors = errorsOf(program);
    expect(errors.map(([line]) => line)).toEqual([6]);
    expect(errors[0]![1]).toMatch(/^The compile stopped at this statement, so no program was made: .*bad/);
  });

  it("reports a store after such a store at its own line", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { program } = compileScript(
      "function pair()\n  return 3, 4\nend\nfunction holder()\n  store a, b = pair()\n  store c = 1 // nil\n  return 0\nend\nHello.\n",
    );
    expect(program.chunks).toBeUndefined();
    const errors = errorsOf(program);
    expect(errors.map(([line]) => line)).toEqual([5]);
    expect(errors[0]![1]).toMatch(
      /^The compile stopped at this statement, so no program was made: .*perform \/\/ on a nil value/,
    );
  });

  it("reports a store whose error reads like a diagnostic the compile leaves out", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { program } = compileScript(
      'function fail()\n  error("A temp named `x` already exists on null")\n  return 0\nend\nstore a = fail()\n',
    );
    expect(program.chunks).toBeUndefined();
    expect(errorsOf(program).map(([line]) => line)).toEqual([4]);
  });

  it("reports a compile whose memo retries run out", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // The first line holds only spacing, where the error still has a range.
    const c = programCompiler({ [MAIN_URI]: "   \nHello.\n" });
    const compiler = c.compiler as any;
    vi.spyOn(compiler, "compileStoryOnce").mockImplementation(() => ({
      textDocument: { uri: MAIN_URI, version: 1 },
      program: {},
      produced: false,
      memoRetry: new StatementMemoRetry([], "a test"),
    }));
    vi.spyOn(compiler, "relowerMemos").mockImplementation(() => {});
    const { program } = c.compile();
    expect(program.chunks).toBeUndefined();
    expect(errorsOf(program)).toEqual([
      [
        0,
        "The compile stopped in this script, so no program was made: A statement served from its memo has to be lowered again: a test",
      ],
    ]);
  });
});
