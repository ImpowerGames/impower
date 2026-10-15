// A throw the compile catches is an error at the statement that threw, and the
// compile makes no program (#1895): it is never only a line on the console.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Conditional } from "../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { compileScript, errorsOf } from "./programHarness";

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
});
