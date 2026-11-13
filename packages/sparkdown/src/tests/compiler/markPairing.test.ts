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
  `${VALUES}scene start\n  choose\n    + ${text}\n      Body.\n      done\n  end\nend\n`;

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

const choiceTextOf = (text: string): string => {
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
  return story.currentChoices.map((choice: { text: string }) => choice.text).join("|");
};

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

  test("in choice text a raw span cannot hold the arrow that ends the text, so its backticks are literal", async () => {
    expect(await choiceReadings('Go `far {"->"} away` now')).toEqual(both('Go `far {"->"} away` now'));
    expect(choiceTextOf('Go `far {"->"} away` now')).toBe("Go `far -> away` now");
  });

  test("in choice text a raw span cannot hold a bracket that would open a suppression, so its backticks are literal", async () => {
    expect(await readings("A `far {[[a]]} away` now")).toEqual(both("A [raw: far {[[a]]} away] now"));
    expect(await choiceReadings("Go `far {[[a]]} away` now")).toEqual(both("Go `far {[[a]]} away` now"));
    expect(choiceTextOf("Go `far {[[a]]} away` now")).toBe("Go `far a away` now");
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
