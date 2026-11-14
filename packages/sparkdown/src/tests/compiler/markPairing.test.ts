import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import CORPUS from "./fixtures/mark-pairing-corpus.json";
import { parseSource } from "./grammarSnapshot";
import { treeScopeStackAt, vscodeScopeStacksPerChar } from "./scopeEquality";

interface CorpusLine {
  line: string;
  from: string;
  styled: string;
  commonmark?: string;
  reason?: string;
}

const LINES = (CORPUS as { lines: CorpusLine[] }).lines;

const SCOPE_STYLES: [scope: string, style: string][] = [
  ["markup.other.bold.sd", "bold"],
  ["markup.other.italic.sd", "italic"],
  ["markup.other.underline.sd", "underline"],
  ["constant.character.escape.centered.sd", "centered"],
  ["markup.emphasis.tilde.sd", "wavy"],
  ["markup.emphasis.colon.sd", "shaky"],
];

const stylesOf = (scopes: string[]): string => {
  const styles = SCOPE_STYLES.filter(([scope]) => scopes.includes(scope)).map(([, style]) => style);
  if (scopes.filter((scope) => scope.startsWith("markup.raw.")).length >= 2) styles.push("raw");
  return [...new Set(styles)].sort().join(" ");
};

const show = (cells: { char: string; style: string }[]): string => {
  let out = "";
  let current = "";
  for (const { char, style } of cells) {
    if (style !== current) {
      out += (current ? "]" : "") + (style ? `[${style}: ` : "");
      current = style;
    }
    out += char;
  }
  return out + (current ? "]" : "");
};

const VALUES = `store x = "plain"\n`;

const displayScript = (line: string) => `${VALUES}scene start\n  ${line}\nend\n`;

const choiceScript = (text: string) =>
  `${VALUES}scene start\n  choose\n    + ${text}\n      Body.\n      done\n  end\nend\nscene next\n  Next.\n  done\nend\n`;

async function readingsOf(source: string, text: string) {
  const from = source.indexOf(text);
  const tree = parseSource(source);
  const vscode = await vscodeScopeStacksPerChar(source);
  const hidden = new Set<number>();
  const cursor = tree.cursor();
  do {
    const name = cursor.name;
    if (/^Span(?:Open|Close)Mark$/.test(name) || /^Escape_c[135]$/.test(name) || /^SparkdownBlockComment(OnLine)?$/.test(name)) {
      for (let i = cursor.from; i < cursor.to; i++) hidden.add(i);
    }
  } while (cursor.next());
  const treeCells: { char: string; style: string }[] = [];
  const vscodeCells: { char: string; style: string }[] = [];
  for (let i = from; i < from + text.length; i++) {
    if (hidden.has(i)) continue;
    treeCells.push({ char: source[i]!, style: stylesOf(treeScopeStackAt(tree, i)) });
    vscodeCells.push({ char: source[i]!, style: stylesOf(vscode[i] ?? []) });
  }
  return { tree: show(treeCells), vscode: show(vscodeCells) };
}

const readings = (line: string) => readingsOf(displayScript(line), line);

const choiceReadings = (text: string) => readingsOf(choiceScript(text), text);

const both = (reading: string) => ({ tree: reading, vscode: reading });

const choiceStory = (text: string) => {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: choiceScript(text),
        version: 1,
        languageId: "sparkdown",
      } as any,
    ],
  });
  const result = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } });
  const story = testStory(result.program.chunks);
  story.ContinueMaximally();
  return story;
};

const choiceTextOf = (text: string): string =>
  choiceStory(text)
    .currentChoices.map((choice: { text: string }) => choice.text)
    .join("|");

const chosenOutputOf = (text: string): string => {
  const story = choiceStory(text);
  story.ChooseChoiceIndex(0);
  return story.ContinueMaximally();
};

const SUPPRESSION_BRACKET = "punctuation.definition.template-expression.begin.choice.suppression.sd";

async function opensSuppressionAt(text: string, at: number) {
  const source = choiceScript(text);
  const index = source.indexOf(text) + at;
  const vscode = await vscodeScopeStacksPerChar(source);
  return {
    tree: treeScopeStackAt(parseSource(source), index).includes(SUPPRESSION_BRACKET),
    vscode: (vscode[index] ?? []).includes(SUPPRESSION_BRACKET),
  };
}

describe("a backtick run is raw only where a run of its own length closes it", () => {
  test.each([
    ["A ``a`b`` c", "A [raw: a`b] c"],
    ["A ```a``` b", "A [raw: a] b"],
    ["A ``a` b", "A ``a` b"],
    ["A `a`` b", "A `a`` b"],
    ["A `*a*` b", "A [raw: *a*] b"],
    ["A `{x}` b", "A [raw: {x}] b"],
    ["A `far {x} now", "A `far {x} now"],
  ])("on a display line, %s", async (line, reading) => {
    expect(await readings(line)).toEqual(both(reading));
  });

  test.each([
    ["Go ``a`b`` now", "Go [raw: a`b] now"],
    ["Go ```a``` now", "Go [raw: a] now"],
    ["Go ``a` now", "Go ``a` now"],
    ["Go `*a*` now", "Go [raw: *a*] now"],
    ["Go `{x}` now", "Go [raw: {x}] now"],
    ["Go `far {x} now", "Go `far {x} now"],
  ])("in choice text, %s", async (text, reading) => {
    expect(await choiceReadings(text)).toEqual(both(reading));
  });

  test("an interpolation after an unclosed backtick evaluates", () => {
    expect(choiceTextOf("Go `far {x} now")).toBe("Go `far plain now");
  });

  test("a raw span holding an arrow is raw on a display line", async () => {
    expect(await readings('A `far {"->"} away` now')).toEqual(both('A [raw: far {"->"} away] now'));
  });

  test("in choice text a raw span holding an arrow inside braces is raw, as on a display line", async () => {
    expect(await choiceReadings('Go `far {"->"} away` now')).toEqual(both('Go [raw: far {"->"} away] now'));
    expect(choiceTextOf('Go `far {"->"} away` now')).toBe('Go `far {"->"} away` now');
  });

  test("in choice text a raw span holding a bracket inside braces is raw, as on a display line", async () => {
    expect(await readings("A `far {[[a]]} away` now")).toEqual(both("A [raw: far {[[a]]} away] now"));
    expect(await choiceReadings("Go `far {[[a]]} away` now")).toEqual(both("Go [raw: far {[[a]]} away] now"));
    expect(choiceTextOf("Go `far {[[a]]} away` now")).toBe("Go `far {[[a]]} away` now");
  });

  test.each([
    ["`far [a] away`", "far [a] away"],
    ["`far ] away`", "far ] away"],
    ["`far -> next away`", "far -> next away"],
    ['`far {"}->"} away`', 'far {"}->"} away'],
    ["`far { ({ { {x} } })[1] } away`", "far { ({ { {x} } })[1] } away"],
    ["`far {[[a } -> next} away`", "far {[[a } -> next} away"],
    ["`far {[===[a]===]} away`", "far {[===[a]===]} away"],
    [`\`far {[[${"a".repeat(65)}]]} away\``, `far {[[${"a".repeat(65)}]]} away`],
    ["``far `[a]` away``", "far `[a]` away"],
  ])("in choice text a raw span holding %s is raw in each part, as on a display line", async (span, raw) => {
    expect(await readings(`A ${span} now`)).toEqual(both(`A [raw: ${raw}] now`));
    expect(await choiceReadings(`Go ${span} now`)).toEqual(both(`Go [raw: ${raw}] now`));
    expect(choiceTextOf(`Go ${span} now`)).toBe(`Go ${span} now`);
    expect(chosenOutputOf(`Go ${span} now`)).toBe(`Go ${span} now\nBody.\n`);
    expect(await choiceReadings(`Go [${span}] now`)).toEqual(both(`Go [[raw: ${raw}]] now`));
    expect(choiceTextOf(`Go [${span}] now`)).toBe(`Go ${span}`);
    expect(await opensSuppressionAt(`Go [${span}] now`, 3)).toEqual({ tree: true, vscode: true });
    expect(await choiceReadings(`Go [a] ${span} now`)).toEqual(both(`Go [a] [raw: ${raw}] now`));
    expect(chosenOutputOf(`Go [a] ${span} now`)).toBe(`Go ${span} now\nBody.\n`);
  });

  test("an unclosed backtick is text, and a suppression after it still opens and closes", async () => {
    expect(choiceTextOf("Go `far [away] now")).toBe("Go `far away");
    expect(chosenOutputOf("Go `far [away] now")).toBe("Go `far now\nBody.\n");
    expect(await opensSuppressionAt("Go `far [away] now", 8)).toEqual({ tree: true, vscode: true });
    expect(choiceTextOf("Go [far `away] now")).toBe("Go far `away");
    expect(chosenOutputOf("Go [far `away] now")).toBe("Go now\nBody.\n");
  });

  test("a raw span that opens before a bracket takes the bracket as its text, so no suppression opens", async () => {
    expect(await choiceReadings("Go `far [away` now] then")).toEqual(both("Go [raw: far [away] now] then"));
    expect(choiceTextOf("Go `far [away` now] then")).toBe("Go `far [away` now] then");
    expect(chosenOutputOf("Go `far [away` now] then")).toBe("Go `far [away` now] then\nBody.\n");
  });

  test("a raw span that opens inside a suppression and holds its only closer leaves the opening bracket as text", async () => {
    expect(await choiceReadings("Go [far `away] now` then")).toEqual(both("Go [far [raw: away] now] then"));
    expect(await opensSuppressionAt("Go [far `away] now` then", 3)).toEqual({ tree: false, vscode: false });
    expect(choiceTextOf("Go [far `away] now` then")).toBe("Go [far `away] now` then");
    expect(chosenOutputOf("Go [far `away] now` then")).toBe("Go [far `away] now` then\nBody.\n");
  });

  test.each([1, 2, 3, 4, 8])("a suppression's bracket is coloured as a raw span of %i backticks inside it is read", async (n) => {
    const ticks = "`".repeat(n);
    const closes = `Go [${ticks}a -> next ] b${ticks}] now`;
    expect(await opensSuppressionAt(closes, 3)).toEqual({ tree: true, vscode: true });
    expect(choiceTextOf(closes)).toBe(`Go ${ticks}a -> next ] b${ticks}`);
    expect(chosenOutputOf(closes)).toBe("Go now\nBody.\n");
    const holds = `Go [${ticks}a ] b${ticks} now`;
    expect(await opensSuppressionAt(holds, 3)).toEqual({ tree: false, vscode: false });
    expect(choiceTextOf(holds)).toBe(holds);
    expect(chosenOutputOf(holds)).toBe(`${holds}\nBody.\n`);
  });

  test.each([1, 2, 3, 4, 5])("past an unclosed brace a run of %i backticks is text to the suppression's colour, as to its text", async (n) => {
    const ticks = "`".repeat(n);
    const closes = `Go [{ ${ticks}a ] b${ticks} now`;
    expect(await opensSuppressionAt(closes, 3)).toEqual({ tree: true, vscode: true });
    expect(choiceTextOf(closes)).not.toContain("[");
    const runsOn = `Go [{ ${ticks}a -> next b${ticks} /*\n      */ c] now`;
    expect(await opensSuppressionAt(runsOn, 3)).toEqual({ tree: false, vscode: false });
    expect(choiceTextOf(runsOn).startsWith("Go [")).toBe(true);
  });

  test.each([1, 2, 3])("a run of %i backticks closed only by a run of another length is text, so the bracket after it closes", async (n) => {
    const text = `Go [${"`".repeat(n)}a ${"`".repeat(n + 1)}] b now`;
    expect(await opensSuppressionAt(text, 3)).toEqual({ tree: true, vscode: true });
    expect(choiceTextOf(text)).not.toContain("[");
  });

  test("an arrow inside a raw span diverts nowhere, and one after it diverts", () => {
    expect(chosenOutputOf("Go `far -> next` now")).toBe("Go `far -> next` now\nBody.\n");
    expect(chosenOutputOf("Go `far` now -> next")).toBe("Go `far` now Next.\n");
  });

  test("a code span holding braces inside a styled span leaves the styled span read", async () => {
    expect(await readings("A *a `far {x -- c} away` b* c")).toEqual(
      both("A [italic: a ][italic raw: far {x -- c} away][italic:  b] c"),
    );
    expect(await choiceReadings("Go *a `far {x -- c} away` b* now")).toEqual(
      both("Go [italic: a ][italic raw: far {x -- c} away][italic:  b] now"),
    );
  });

  test("in choice text a raw span holding a bracketed interpolation inside a suppression is raw", async () => {
    expect(await choiceReadings("Go [`far {t[1]} away`] now")).toEqual(both("Go [[raw: far {t[1]} away]] now"));
    expect(choiceTextOf("Go [`far {t[1]} away`] now")).toBe("Go `far {t[1]} away`");
  });
});

describe("styling marks pair by CommonMark's rules in both grammar engines", () => {
  test("an unclosed mark is literal text", async () => {
    expect(await readings("Go *far away")).toEqual({ tree: "Go *far away", vscode: "Go *far away" });
  });

  test("strong emphasis inside strong emphasis is bold", async () => {
    expect(await readings("A ****x**** y")).toEqual({ tree: "A [bold: x] y", vscode: "A [bold: x] y" });
  });

  test("the first span to close wins and the marks it leaves are literal", async () => {
    expect(await readings("A *a _b* c_ d")).toEqual({ tree: "A [italic: a _b] c_ d", vscode: "A [italic: a _b] c_ d" });
  });

  test("an underscore inside a word never underlines", async () => {
    expect(await readings("snake_case_name")).toEqual({ tree: "snake_case_name", vscode: "snake_case_name" });
  });

  test.each(["A a___b_ c", "A a____b_ c", "A a____b____ c", "A a_____b_ c"])(
    "an underscore run inside a word opens nothing at any of its marks: %s",
    async (line) => {
      expect(await readings(line)).toEqual(both(line));
    },
  );

  test("a run of more than 64 of one mark closes no span", async () => {
    const run = "*".repeat(70);
    expect(await readings(`A *x${run} y`)).toEqual(both(`A *x${run} y`));
    expect(await readings(`A _x${"_".repeat(70)} y`)).toEqual(both(`A _x${"_".repeat(70)} y`));
  });

  test("every line read differently from CommonMark says how CommonMark reads it and why", () => {
    for (const entry of LINES) {
      expect(entry.commonmark === undefined, entry.line).toBe(entry.reason === undefined);
      if (entry.commonmark !== undefined) expect(entry.commonmark, entry.line).not.toBe(entry.styled);
    }
  });

  test.each(LINES.map((entry) => [`${entry.from}: ${entry.line}`, entry] as const))("%s", async (_name, entry) => {
    expect(await readings(entry.line)).toEqual({ tree: entry.styled, vscode: entry.styled });
  });
});
