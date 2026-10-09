// #1703: a divert target to DONE or END used as a value (`-> DONE`,
// `-> END`) can't be stored, passed or held. The compile reports that on the
// target's name, where a divert reports `target not found`, and still builds
// its program, rather than throwing with no diagnostic and no program.
import { describe, expect, it } from "vitest";
import { testCompiler } from "../engineUnderTest";

const URI = "file:///main.sd";

const MESSAGE = "Can't use '-> DONE' or '-> END' as variable divert targets";

function compile(text: string) {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler.compile({ textDocument: { uri: URI } } as never)
    .program as any;
}

interface Found {
  message: string;
  line: number;
  start: number;
  end: number;
  endLine: number;
}

function diagnostics(program: any): Found[] {
  return (program.diagnostics?.[URI] ?? []).map((d: any) => ({
    message: typeof d.message === "string" ? d.message : d.message?.value,
    line: d.range.start.line,
    start: d.range.start.character,
    end: d.range.end.character,
    endLine: d.range.end.line,
  }));
}

/** Where `target` (the target's name) is written on `line` of `text`: its
 *  line and columns. */
function rangeOf(text: string, line: number, target: string) {
  const lineText = text.split("\n")[line]!;
  const start = lineText.indexOf(target);
  expect(start).toBeGreaterThanOrEqual(0);
  return { line, start, end: start + target.length, endLine: line };
}

describe("a divert target to DONE or END used as a value", () => {
  it.each([
    ["a store", "store route = -> DONE\n\nHello.\n", 0, "DONE"],
    ["a store to END", "store route = -> END\n\nHello.\n", 0, "END"],
    [
      "a local in a scene",
      "-> main\n\nscene main\n  local r = -> DONE\n  Hello.\nend\n",
      3,
      "DONE",
    ],
    [
      "an argument",
      "function f(x)\nend\n\n& f(-> END)\n\nHello.\n",
      3,
      "END",
    ],
  ])(
    "%s reports the error on the target and builds the program",
    (_name, text, line, target) => {
      const program = compile(text);
      expect(diagnostics(program)).toEqual([
        { message: MESSAGE, ...rangeOf(text, line, target) },
      ]);
      expect(program.chunks).toBeDefined();
    },
  );

  it("a divert target to a scene still compiles with no diagnostic", () => {
    const program = compile(
      "store route = -> main\n\n-> main\n\nscene main\n  Hello.\nend\n",
    );
    expect(diagnostics(program)).toEqual([]);
    expect(program.chunks).toBeDefined();
  });
});
