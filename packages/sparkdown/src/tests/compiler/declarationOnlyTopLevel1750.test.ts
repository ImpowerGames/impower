
import { describe, expect, it } from "vitest";
import {
  MAIN_URI,
  errorsOf,
  programCompiler,
  programSession,
} from "../program/programHarness";

const MAIN = "file://proj/main.sd";
const OTHER = "file://proj/scripts/other.sd";
const HELPERS = "file://proj/helpers.luau";
const NEWLINE = String.fromCharCode(10);
const lines = (...text: string[]) => text.join(NEWLINE) + NEWLINE;

const TOP_LEVEL =
  "statement must be inside a scene or branch; the top level holds declarations only";
const NO_START = "no scene named start; the story starts in a scene named start";
const START_PARAMS =
  "scene start cannot take parameters; the story starts there with none";

const quiet = <T>(run: () => T): T => {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const diagnose = (
  texts: Record<string, string>,
): { uri: string; line: number; message: string; text: string }[] => {
  const program = quiet(() => programCompiler(texts).compile(MAIN)).program;
  return Object.entries(program.diagnostics ?? {}).flatMap(([uri, diagnostics]) =>
    diagnostics.filter((d) => d.severity === 1).map((d) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      const { start, end } = d.range;
      const text = (texts[uri] ?? "").split(NEWLINE);
      return {
        uri,
        line: start.line,
        message,
        text:
          start.line === end.line
            ? text[start.line]!.slice(start.character, end.character)
            : "",
      };
    }),
  );
};

const START = ["scene start", "  Begin.", "end"];
const DECLARED = ["store x = 0", "function f()", "end"];

const refused: [string, string[]][] = [
  ["a display line", ["Hello."]],
  ["a choice", ["choose", "  * Go", "    Went.", "end"]],
  ["a divert", ["-> start"]],
  ["an assignment", ["x = 1"]],
  ["a call", ["f()"]],
  ["an if block", ["if x == 0 then", "  Zero.", "end"]],
  ["a for block", ["for i = 1, 2 do", "  Again.", "end"]],
  ["a while block", ["while x < 1 do", "  x = x + 1", "end"]],
  ["a do block", ["do", "  f()", "end"]],
  ["a marked assignment", ["& x = 1"]],
  ["a marked call", ["& f()"]],
];

describe("a runnable line at the top level", () => {
  it.each(refused)("refuses %s at the top level of main.sd", (_, written) => {
    const found = diagnose({ [MAIN]: lines(...DECLARED, ...written, ...START) });
    expect(found).toEqual([
      { uri: MAIN, line: DECLARED.length, message: TOP_LEVEL, text: written[0] },
    ]);
  });

  it.each(refused)("refuses %s at the top level of another script", (_, written) => {
    const found = diagnose({
      [MAIN]: lines(...DECLARED, ...START),
      [OTHER]: lines(...written),
    });
    expect(found).toEqual([
      { uri: OTHER, line: 0, message: TOP_LEVEL, text: written[0] },
    ]);
  });

  it("refuses each runnable line of main.sd, before and after its scenes", () => {
    const found = diagnose({
      [MAIN]: lines("Before.", ...START, "After."),
    });
    expect(found.map((d) => [d.line, d.message])).toEqual([
      [0, TOP_LEVEL],
      [4, TOP_LEVEL],
    ]);
  });
});

describe("the syntax errors beside the top-level and start errors", () => {
  it("keeps a refused statement's syntax errors beside the top-level error", () => {
    const found = diagnose({
      [MAIN]: lines("if (1 2) then", "  X.", "end", ...START),
    });
    expect(found.map((d) => [d.line, d.text, d.message])).toEqual([
      [0, "if (1 2) then", TOP_LEVEL],
      [0, "2", "Expected ')' (to close '(' at column 4), got '2'"],
      [0, ")", "Expected identifier when parsing expression, got ')'"],
      [0, "then", "Expected identifier when parsing expression, got 'then'"],
    ]);
  });

  it("keeps a store's bracket error on the first line of a project with no start scene", () => {
    const found = diagnose({ [MAIN]: lines("store s = (1", "`a {} b`)") });
    expect(found.map((d) => [d.line, d.message])).toEqual([
      [0, NO_START],
      [1, "Expected ')' (to close '(' at line 1), got `a {"],
      [1, "Expected identifier when parsing expression, got } b`"],
      [1, "Expected identifier when parsing expression, got ')'"],
    ]);
  });
});

describe("an edit that leaves a scene's line at the top level", () => {
  it("reports and leaves out the line as a cold compile does", () => {
    const text = lines("scene start", "  First.", "  Second.", "end");
    const session = programSession(text);
    session.edit("  First.\n", "  First.\nend\n");
    const cold = quiet(() => programCompiler({ [MAIN_URI]: session.text }).compile()).program;
    expect(errorsOf(session.program)).toEqual(errorsOf(cold));
    expect(errorsOf(session.program)).toEqual([
      [3, TOP_LEVEL],
      [4, "Expected <eof>, got 'end'"],
    ]);
  });
});

describe("a declaration at the top level", () => {
  it("compiles a title page, each declaration, a marked declaration, a comment and a run without the error", () => {
    const found = diagnose({
      [MAIN]: lines(
        "---",
        "title: The Ides of March",
        "---",
        "// a comment",
        "store hp = 10",
        "const MAX = 10",
        "define D with",
        "  k = 1",
        "end",
        "style S with",
        "  color = 1",
        "end",
        "layout L with",
        "end",
        "screen Sc with",
        "end",
        "component C() with",
        "end",
        "animation A with",
        "end",
        "theme T with",
        "end",
        "morph M with",
        "end",
        "function heal()",
        "  return 1",
        "end",
        "type Health = number",
        "external tick(x)",
        "& store visited = false",
        "run helpers",
        ...START,
      ),
      [HELPERS]: lines("helped = true"),
    });
    expect(found.filter((d) => d.message === TOP_LEVEL)).toEqual([]);
  });
});

describe("the scene named start", () => {
  it("reports a project with no start scene on the first line of main.sd", () => {
    const found = diagnose({
      [MAIN]: lines("store x = 0", "scene other", "  Other.", "end"),
    });
    expect(found).toEqual([
      { uri: MAIN, line: 0, message: NO_START, text: "store x = 0" },
    ]);
  });

  it("finds a start scene another script declares", () => {
    const found = diagnose({
      [MAIN]: lines("store x = 0"),
      [OTHER]: lines(...START),
    });
    expect(found).toEqual([]);
  });

  it("reports a start scene that takes parameters on its header", () => {
    const found = diagnose({
      [MAIN]: lines("scene start(x)", "  Begin {x}.", "end"),
    });
    expect(found).toEqual([
      { uri: MAIN, line: 0, message: START_PARAMS, text: "scene start(x)" },
    ]);
  });
});
