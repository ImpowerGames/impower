// A read of a name that nothing declares or assigns is reported on the name
// itself, from its first character to its last, in every script expression:
// statements, `&` lines, `local` declarations, `return` values, the conditions
// and subjects of block statements, and interpolations in display lines. An
// unknown dotted path is reported on the whole path (#990).

import { describe, expect, test } from "vitest";
import { diagnoseDetailed, diagnosticMessage } from "./diagnosticTestHarness";
import { testCompiler } from "../engineUnderTest";

type Range = {
  start: { line: number; character: number };
  end: { line: number; character: number };
};

function rangesOf(source: string, message: string): Range[] {
  return diagnoseDetailed(source)
    .filter((d) => d.message === message)
    .map((d) => d.range as Range);
}

// The range of the last occurrence of `name` as a whole word on `line`.
function nameRange(source: string, line: number, name: string): Range {
  const text = source.split("\n")[line]!;
  const matches = [
    ...text.matchAll(new RegExp(`(?<![A-Za-z0-9_.])${name.replaceAll(".", "[.]")}(?![A-Za-z0-9_])`, "g")),
  ];
  const at = matches.at(-1)!.index!;
  return {
    start: { line, character: at },
    end: { line, character: at + name.length },
  };
}

const FOO = "Cannot find variable named `foo`";

describe("an unknown global read inside a function", () => {
  test.each([
    "print(foo)",
    "  print(foo)",
    "    print(foo)",
    "return foo",
    "  return foo",
    "    return foo",
    "local x = foo",
    "  local x = foo",
    "  local _ = `unknown {foo}`",
    "  local x = foo + 1",
    "  if foo then end",
    "local y = 1; local x = foo",
  ])("%j is reported on the name", (body) => {
    const source = `function run()\n${body}\nend\n`;
    expect(rangesOf(source, FOO)).toEqual([nameRange(source, 1, "foo")]);
  });
});

describe("an unknown global read at the top level", () => {
  test.each(["& print(foo)", "& local x = foo", "  & print(1 + foo)"])(
    "%j is reported on the name",
    (line) => {
      const source = `${line}\n`;
      expect(rangesOf(source, FOO)).toEqual([nameRange(source, 0, "foo")]);
    },
  );
});

describe("an unknown global read in a block statement", () => {
  test.each([
    [
      "an if in a function",
      "function run()\n  if foo then\n    print(1)\n  end\nend\n",
      1,
    ],
    ["an if in a scene", "scene start()\n  if foo >= 1 then\n    Yes.\n  end\nend\n", 1],
    [
      "an if in a branch",
      "scene start()\n  branch first\n    if foo >= 1 then\n      Yes.\n    end\n  end\nend\n",
      2,
    ],
    [
      "an elseif after a valid if in a scene",
      "store known = false\nscene start()\n  if known then\n    First.\n  elseif foo then\n    Second.\n  end\nend\n",
      4,
    ],
    [
      "an elseif after a valid if in a function",
      "function run()\n  if true then\n    print(1)\n  elseif foo then\n    print(2)\n  end\nend\n",
      3,
    ],
    [
      "a while in a function",
      "function run()\n  while foo do\n    print(1)\n  end\nend\n",
      1,
    ],
    ["a match in a scene", "scene start()\n  match (foo)\n    | other = A recruit.\n  end\nend\n", 1],
    [
      "a top-level match after a scene",
      "scene start()\n  Hello.\nend\n\nmatch (foo)\n  | other = A recruit.\nend\n",
      4,
    ],
  ])("%s is reported on the name", (_name, source, line) => {
    expect(rangesOf(source, FOO)).toEqual([nameRange(source, line, "foo")]);
  });
});

describe("an unknown global read in a display line", () => {
  test("an interpolation is reported on the name", () => {
    const source = "scene start()\n  You have {foo} coins.\nend\n";
    expect(rangesOf(source, FOO)).toEqual([nameRange(source, 1, "foo")]);
  });
});

describe("the reported name among others", () => {
  test("only the unknown second name of a condition is reported", () => {
    const source =
      "store player_hp = 1\nscene start()\n  if player_hp > 0 and foo > 3 then\n    Yes.\n  end\nend\n";
    expect(rangesOf(source, FOO)).toEqual([nameRange(source, 2, "foo")]);
  });

  test("an interpolation among known names is reported on the unknown one", () => {
    const source = "store coins = 1\nscene start()\n  You have {coins} and {foo}.\nend\n";
    expect(rangesOf(source, FOO)).toEqual([nameRange(source, 2, "foo")]);
  });

  test("a dotted path whose root is unknown is reported on the path", () => {
    const source = "function run()\n  print(foo.bar)\nend\n";
    expect(rangesOf(source, "Cannot find item or path named `foo.bar`")).toEqual([
      nameRange(source, 1, "foo.bar"),
    ]);
  });
});

// An edit above a chunk carries it into the next compile, shifted; the names in
// it keep their own ranges, at their new lines.
describe("an unknown global read in a carried chunk", () => {
  const URI = "inmemory:///main.sd";
  const FIRST_LINE = "  Line one.";
  const BELOW =
    "\n\nfunction run()\n  print(1 + foo)\n  if foo then\n    print(2)\n  end\nend\n\nscene later()\n  You have {foo} coins.\nend\n";

  const rangesIn = (program: { diagnostics?: Record<string, any[]> }) =>
    Object.values(program.diagnostics ?? {})
      .flat()
      .filter((d) => diagnosticMessage(d) === FOO)
      .map((d) => d.range as Range);

  const expected = (source: string) => {
    const lines = source.split("\n");
    const at = (text: string) => lines.findIndex((l) => l.includes(text));
    return [
      nameRange(source, at("print(1 + foo)"), "foo"),
      nameRange(source, at("if foo then"), "foo"),
      nameRange(source, at("You have {foo}"), "foo"),
    ];
  };

  const sorted = (ranges: Range[]) =>
    [...ranges].sort(
      (a, b) => a.start.line - b.start.line || a.start.character - b.start.character,
    );

  test.each([
    ["a line inserted above", "  Line one.\n  An extra line.\n  And another."],
    ["a line removed above", ""],
  ])("%s moves the ranges with their names", (_name, replacement) => {
    const before = `scene start()\n${FIRST_LINE}\n  Line two.\nend${BELOW}`;
    const compiler = testCompiler();
    compiler.configure({
      files: [
        { uri: URI, type: "script", name: "main", ext: "sd", text: before, version: 1, languageId: "sparkdown" },
      ],
    });
    const first = compiler.compile({ textDocument: { uri: URI } }).program;
    expect(sorted(rangesIn(first))).toEqual(expected(before));

    const line = 1;
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [
        {
          range: {
            start: { line, character: 0 },
            end: replacement ? { line, character: FIRST_LINE.length } : { line: line + 1, character: 0 },
          },
          text: replacement,
        },
      ],
    });
    const after = replacement
      ? before.replace(FIRST_LINE, replacement)
      : before.replace(`${FIRST_LINE}\n`, "");
    const second = compiler.compile({ textDocument: { uri: URI } }).program;
    expect(sorted(rangesIn(second))).toEqual(expected(after));
  });
});
