// A divert, a tunnel, a thread or an onward return to a dotted target passes
// its arguments (`-> outer.second(a, "b")`), as one to a relative target does
// (#1642). The grammar reads the arguments after a dotted path into the
// target, both grammar engines scope the line alike, and the compiler reports
// whatever the target holds after the one argument list it passes, which it
// would otherwise drop without a word.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { parseSource } from "./grammarSnapshot";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";

const LINES = [
  "-> a.b(x + 1, \"s\")",
  "-> a.b (x)",
  "-> a.b(f(x), -> c.d)",
  "-> .^.b(x)",
  "-> a.b(x)(y)",
  "-> b(x)(y)",
  "-> a.b(x) -> c.d(y) ->",
  "-> a.b(x) ->->",
  "->-> a.b(x)",
  "<- a.b(x)",
  "<- a.b(x)(y)",
  "-> a.b(x) > After",
  "-> a.b(x) // note",
  "-> a.b",
  "-> a.b -> c",
  "x .. queue|-> a.b(1)|c .. z",
  "queue | -> a.b(1) | c end",
  "HERO: Go -> a.b(1)",
  "+ [Go] -> a.b(1)",
  "-> a.b #tag",
  "-> a.b(x",
  "<- a.b(x, ",
  "-> a.b(1; 2)",
  "-> a.b(1 ; } 2) -> c",
  "-> a.b(x + 1,\n  \"s\")\nAfter.",
];

/** The names of a line's `DivertTarget` children, in order, for each
 *  target on the line. */
const targetShapes = (line: string): string[][] => {
  const shapes: string[][] = [];
  parseSource(`${line}\n`).iterate({
    enter: (node) => {
      if (node.name !== "DivertTarget_content") return;
      const names: string[] = [];
      let child = node.node.firstChild;
      while (child) {
        names.push(child.name);
        child = child.nextSibling;
      }
      shapes.push(names);
    },
  });
  return shapes;
};

describe("the grammar reads a dotted target's arguments", () => {
  test.each(LINES)("%j scopes the same in both engines", async (line) => {
    const result = await compareEnginesFull(`${line}\n`);
    expect(
      result.divergences,
      formatDivergences(result.source, result.divergences),
    ).toEqual([]);
  });

  test.each(LINES)("%j parses without error nodes", (line) => {
    const errors: string[] = [];
    parseSource(`${line}\n`).iterate({
      enter: (node) => {
        if (node.type.isError || node.name.startsWith("ERROR")) {
          errors.push(`${node.name} @ ${node.from}`);
        }
      },
    });
    expect(errors).toEqual([]);
  });

  test.each([
    ["-> a.b(x + 1, \"s\")", [["DivertPath", "DivertArguments"]]],
    ["-> a.b (x)", [["DivertPath", "DivertArguments"]]],
    ["<- a.b(x)", [["DivertPath", "DivertArguments"]]],
    ["->-> a.b(x)", [["DivertPath", "DivertArguments"]]],
    [
      "-> a.b(x) -> c.d(y) ->",
      [
        ["DivertPath", "DivertArguments"],
        ["DivertPath", "DivertArguments"],
      ],
    ],
    [
      "-> a.b(x)(y)",
      [["DivertPath", "DivertArguments", "DivertArguments"]],
    ],
    ["-> b(x)", [["LuauFunctionCall"]]],
    ["-> a.b", [["DivertPath"]]],
  ])("%j holds its target's children %j", (line, shapes) => {
    expect(targetShapes(line)).toEqual(shapes);
  });
});

const URI = "file:///main.sd";

/** Every error a full compile reports, with the text it underlines. */
const errorsOf = (text: string) => {
  const compiler = new SparkdownCompiler();
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
  } as any);
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const lines = text.split("\n");
  return (program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === 1)
    .map((d) => {
      const { start, end } = d.range;
      return {
        message: typeof d.message === "string" ? d.message : d.message.value,
        line: start.line,
        text: lines[start.line]!.slice(start.character, end.character),
      };
    });
};

/** A scene whose branches take parameters, entered through `line`. */
const script = (line: string) =>
  [
    "scene outer",
    "  branch inner",
    `    ${line}`,
    "    done",
    "  end",
    "  branch second(n)",
    "    Second {n}.",
    "    ->->",
    "  end",
    "end",
    "",
  ].join("\n");

describe("text after a divert's one argument list is reported", () => {
  test.each([
    ["-> outer.second(1)(2)", "(2)"],
    ["-> second(1)(2)", "(2)"],
    ["-> outer.second(1) (2)", "(2)"],
    ["-> outer.second(1)(2) ->", "(2)"],
    ["<- outer.second(1)(2)", "(2)"],
    ["->-> outer.second(1)(2)", "(2)"],
  ])("%j reports %j as not passed", (line, extra) => {
    expect(errorsOf(script(line))).toEqual([
      {
        message: `A divert passes one argument list; \`${extra}\` is not passed.`,
        line: 2,
        text: extra,
      },
    ]);
  });

  test.each([
    ["-> second(1).x", ".x"],
    ["-> second \"x\"", "\"x\""],
    ["-> outer.second(1).x", ".x"],
  ])("%j reports %j as unexpected", (line, extra) => {
    expect(errorsOf(script(line))).toEqual([
      {
        message: `Unexpected \`${extra}\` after this divert's target.`,
        line: 2,
        text: extra,
      },
    ]);
  });

  test.each([
    "-> outer.second(1)",
    "-> outer.second (1)",
    "-> second(1)",
    "-> outer.second(1) ->",
    "<- outer.second(1)",
    "->-> outer.second(1)",
  ])("%j reports nothing", (line) => {
    expect(errorsOf(script(line))).toEqual([]);
  });
});

describe("a bracketed argument list spans lines in every spelling (#1655)", () => {
  // The editor closes a `(` as it is typed, so a list written across lines
  // reads to its `)` whether the target is relative or dotted. A dotted path
  // itself stays on its line.
  test.each([
    "-> outer.second(\n      1\n    )",
    "-> outer.second(1,\n      2)",
    "-> second(1,\n      2)",
    "<- outer.second(\n      1)",
  ])("%j reports nothing", (line) => {
    expect(errorsOf(script(line))).toEqual([]);
  });

  test("a multi-line dotted list holds its target's children", () => {
    expect(targetShapes("-> a.b(x,\n  y)")).toEqual([
      ["DivertPath", "DivertArguments"],
    ]);
  });

  test("a multi-line dotted list scopes the same in both engines", async () => {
    const result = await compareEnginesFull("-> a.b(x + 1,\n  \"s\")\nAfter.\n");
    expect(
      result.divergences,
      formatDivergences(result.source, result.divergences),
    ).toEqual([]);
  });

  test("an unclosed dotted list diverges between engines nowhere a relative one does not", async () => {
    // An unclosed list followed by more of the script scopes differently in
    // the two engines for a relative call already. The dotted list also ends
    // before the next `scene` or `branch` line, so it diverges only at
    // characters where the relative spelling does (shifted by its two extra
    // characters), and at fewer of them.
    const shape = async (target: string, shift: number) =>
      (
        await compareEnginesFull(
          `scene a\n  branch b\n    -> ${target}(1, "s"\n  end\n  branch c(n, s)\n    done\n  end\nend\n`,
        )
      ).divergences.map(({ offset, vscode, tree }) => ({
        offset: offset - shift,
        vscode,
        tree,
      }));
    const dotted = (await shape("a.c", 2)).map(({ offset }) => offset);
    const relative = (await shape("c", 0)).map(({ offset }) => offset);
    expect(relative).toEqual(expect.arrayContaining(dotted));
    expect(dotted.length).toBeLessThan(relative.length);
  });

  test("an unclosed dotted list reports what an unclosed relative one does", () => {
    const at = (errors: ReturnType<typeof errorsOf>) =>
      errors.map(({ message, line }) => ({ message, line }));
    const dotted = errorsOf(script("-> outer.second(1, "));
    const relative = errorsOf(script("-> second(1, "));
    expect(relative.length).toBeGreaterThan(0);
    expect(at(dotted)).toEqual(at(relative));
  });

  test("a dotted path with no arguments does not read the next line", () => {
    expect(errorsOf(script("-> outer.\n    Story text."))).toEqual(
      MAIN_DOTTED_PATH_ERRORS,
    );
  });

  test.each([
    ["-> outer.second(1; 2)", ";"],
    ["-> outer.second(1 ;; 2)", ";;"],
  ])("%j reports %j inside the list and closes it", (line, stray) => {
    expect(errorsOf(script(line))).toEqual([
      {
        message: `Unexpected \`${stray}\` in this divert's arguments.`,
        line: 2,
        text: stray,
      },
    ]);
  });
});

/** What `-> outer.` followed by story text reports on main at bbc912833. */
const MAIN_DOTTED_PATH_ERRORS: ReturnType<typeof errorsOf> = [];
