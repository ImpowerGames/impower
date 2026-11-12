import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import { parseSource } from "../compiler/grammarSnapshot";
import { tokenize } from "../compiler/vscodeGrammarSnapshot";
import { compareEngines } from "../compiler/scopeEquality";

const compile = (text: string) => {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      } as any,
    ],
  });
  const result = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } });
  const errors: { message: string; line: number; endLine: number }[] = [];
  for (const ds of Object.values(result.program.diagnostics ?? {})) {
    for (const d of ds as any[]) {
      if (d?.severity === 1) {
        errors.push({
          message: typeof d.message === "string" ? d.message : d.message.value,
          line: d.range.start.line,
          endLine: d.range.end.line,
        });
      }
    }
  }
  return { result, errors };
};

const choose = (line: string) =>
  `store t = {"a", "b"}\nstore x = true\nscene start\n  choose\n    ${line}\n      Body.\n      done\n  end\nend\nscene next\n  Next.\n  done\nend\n`;

const CHOICE_LINE = 4;

const outcome = (line: string) => {
  const { result, errors } = compile(choose(line));
  const story = testStory(result.program.chunks);
  story.Continue();
  const choices = story.currentChoices.map((c: any) => c.text);
  story.ChooseChoiceIndex(0);
  return { errors, choices, chosen: story.ContinueMaximally() };
};

const choiceNodeLines = (line: string) => {
  const source = choose(line);
  const cursor = parseSource(source).cursor();
  do {
    if (cursor.name === "Choice") {
      const lineOf = (offset: number) => source.slice(0, offset).split("\n").length - 1;
      return { from: lineOf(cursor.from), to: lineOf(cursor.to) };
    }
  } while (cursor.next());
  throw new Error("no Choice node");
};

describe("choice lines without a comment that read differently from main, as the maintainer decided for #2083", () => {
  test("A: a bracket or an arrow inside an interpolation is part of the interpolation", () => {
    expect(outcome("+ Go {t[1]} home")).toEqual({
      errors: [],
      choices: ["Go a home"],
      chosen: "Go a home\nBody.\n",
    });
    expect(outcome('+ Go {"[x]"} home').choices).toEqual(["Go [x] home"]);
    expect(outcome('+ Go {"->"} home').choices).toEqual(["Go -> home"]);
  });

  test("B: a `{` whose only later `}` closes another interpolation reads on past its line, as on a display line", () => {
    expect(choiceNodeLines("+ Go { {1} home").to).toBeGreaterThan(CHOICE_LINE);
    const malformed = outcome("+ Go { {1} home").errors.find((e) =>
      e.message.startsWith("Malformed interpolated string"),
    );
    expect(malformed?.line).toBe(CHOICE_LINE);
    expect(malformed?.endLine).toBeGreaterThan(CHOICE_LINE);
  });

  test("a `{` that no `}` follows on its line stays on its line, as on main", () => {
    expect(choiceNodeLines("+ Go {x")).toEqual({ from: CHOICE_LINE, to: CHOICE_LINE });
    const result = outcome("+ Go {x");
    expect(result.choices).toEqual(["Go true"]);
    expect(result.chosen).toBe("Go true\nBody.\n");
    expect(result.errors.map((e) => [e.message.split(";")[0], e.line, e.endLine])).toEqual([
      ["Malformed interpolated string", CHOICE_LINE, CHOICE_LINE],
    ]);
  });

  test("C: an unclosed bracket after a choice's divert arrow reads on past its line, as a divert on its own line does", () => {
    expect(choiceNodeLines("+ Go -> next(").to).toBeGreaterThan(CHOICE_LINE);
    expect(outcome("+ Go -> next(").chosen).not.toContain("Body.");
  });

  test("D: an arrow before or inside a bracket pair ends the choice text and diverts", () => {
    expect(outcome("+ [Go -> next] x")).toEqual({
      errors: [],
      choices: ["[Go"],
      chosen: "[Go Next.\n",
    });
    expect(outcome("+ Go -> next [a] b")).toEqual({
      errors: [],
      choices: ["Go"],
      chosen: "Go Next.\n",
    });
  });

  test("B: an interpolation whose only `}` sits in a Luau comment inside it reads on past its line", () => {
    expect(choiceNodeLines("+ Go {x -- c}").to).toBeGreaterThan(CHOICE_LINE);
  });
});

const SUPPRESSION_BRACKET = "punctuation.definition.template-expression.begin.choice.suppression.sd";

const tokensOf = async (line: string) => (await tokenize(choose(line)))[CHOICE_LINE]!.tokens;

const scopesOf = async (line: string, text: string) =>
  (await tokensOf(line)).find((token) => token.text.includes(text))?.scopes ?? [];

const READ_AS_UNIT = ["{#{{{{1}}}}}", "{[[a]]}", "{[=[a]=]}", "{1 --[[c]] + 1}", "{1 /* c */}"];
const KEPT_IN_TEXT = ["{x}", "{`a`}", "{t[1]}", '{"/*"}', '{"->"}', '{"\\n"}', "{#{{{1}}}}"];

const SPAN_MARKS = [
  ["**", "markup.other.bold.sd"],
  ["***", "markup.other.italic.sd"],
  ["_", "markup.other.underline.sd"],
  ["^", "constant.character.escape.centered.sd"],
  ["~~", "markup.emphasis.tilde.sd"],
  ["::", "markup.emphasis.colon.sd"],
] as const;

const ACROSS_UNITS = [
  ["inside a suppression", "+ Go [*far {#{{{{1}}}}} away* now]"],
  ["after a suppression", "+ Go [x] *far {#{{{{1}}}}} away* now"],
  ["across a block comment", "+ Go *far /* c */ away* now"],
] as const;

const BRACKET_LINES = ["+ Go [arrow -> next] x", "+ Go [x {t[1]} -> next", "+ Go [a] b", "+ Go [a {#{{{{1}}}}} -> next] x"];

const glueLine = (after: string) => `+ Go .. ${after} x`;
const spanLines = (interpolation: string) => [
  `+ Go *far ${interpolation} away`,
  `+ Go *far ${interpolation} away* now`,
  `+ Go *far* ${interpolation} away`,
];
const markLine = (mark: string) => `+ Go ${mark}far {#{{{{1}}}}} away${mark} now`;
const RAW_LINE = "+ Go `far {#{{{{1}}}}} away` now";
const REGION_END_LINE = "+ Go *a [b] c";

const COMMAND_LINES = [
  ["an audio command", "+ Go ((a {#{{{{1}}}}} b)) now", "Go ((a {#{{{{1}}}}} b)) now", "meta.audio.sd"],
  ["an image command", "+ Go [x] [[a {#{{{{1}}}}} b]] now", "Go x", "meta.image.sd"],
  ["a text command", "+ Go <wait {#{{{{1}}}}}> now", "Go <wait {#{{{{1}}}}}> now", "meta.text.sd"],
] as const;

const COMMENTED_COMMAND_LINES = [
  ["an audio command", "+ Go ((a /* c */ b)) now", "Go ((a /* c */ b)) now", "meta.audio.sd"],
  ["an image command", "+ Go [x] [[a /* c */ b]] now", "Go x", "meta.image.sd"],
  ["a text command", "+ Go <wait /* c */ 1> now", "Go <wait /* c */ 1> now", "meta.text.sd"],
  ["an audio command whose comment holds an arrow", "+ Go ((a /* -> x */ b)) now", "Go ((a /* -> x */ b)) now", "meta.audio.sd"],
] as const;

const ESCAPED_COMMAND_LINES = [
  ["choice start text, closed by its escaped `>`", "+ Go <b: *x*\\> now", "Go <b: *x*> now", "<b: *x*\\>"],
  ["a suppression, closed by its escaped `>`", "+ Go [<b: *x*\\>] now", "Go <b: *x*>", "<b: *x*\\>"],
  ["inner text, closed by its escaped `>`", "+ Go [there] <b: *x*\\> now", "Go there", "<b: *x*\\>"],
  ["choice start text, closed by a later `>`", "+ Go <b: \\> *x*> now", "Go <b: > *x*> now", "<b: \\> *x*>"],
] as const;

const ESCAPED_OPENER_LINES = [
  ["choice start text", "+ Go \\/* c */ b", "Go /* c */ b"],
  ["choice start text, before an arrow it does not hide", "+ Go \\/* -> next */ b", "Go /*"],
  ["a suppression", "+ Go [a \\/* c */ b] c", "Go a /* c */ b"],
  ["a suppression, before a bracket it does not hide", "+ Go [a \\/* ] */ b] c", "Go a /*"],
  ["inner text", "+ Go [a] b \\/* c */ d", "Go a"],
  ["a text command, before an arrow it does not hide", "+ Go <wait \\/* -> next */ b> now", "Go <wait /*"],
  ["an audio command, before an arrow it does not hide", "+ Go ((a \\/* -> next */ b)) now", "Go ((a /*"],
  ["a styled span", "+ Go *far \\/* c */ away* now", "Go *far /* c */ away* now"],
  ["a line comment opener", "+ Go \\// c -> next", "Go // c"],
  ["an interpolation left unclosed", "+ Go {x \\/* c */ now", "Go true"],
  ["an interpolation left unclosed, before a comment it would run on", "+ Go {x \\/* c now", "Go true"],
  ["a glued alternator", "+ Go .. cycle |a \\/* c */ b| now", "Go .. cycle |a /* c */ b| now"],
] as const;

const RAW_LINES = [
  ["an interpolation read as a unit elsewhere", "+ Go `far {#{{{{1}}}}} away` now", "Go `far {#{{{{1}}}}} away` now"],
  ["a plain interpolation", "+ Go `far {x} away` now", "Go `far {x} away` now"],
  ["a block comment", "+ Go `far /* secret */ away` now", "Go `far /* secret */ away` now"],
  ["a suppression", "+ Go [`far {#{{{{1}}}}} away`] now", "Go `far {#{{{{1}}}}} away`"],
] as const;

const BOLD_ITALIC_LINES = [
  ["an interpolation read as a unit elsewhere", "+ Go ***a* {#{{{{1}}}}} b** now", "Go ***a* {#{{{{1}}}}} b** now"],
  ["a block comment", "+ Go ***a* /* c */ b** now", "Go ***a* /* c */ b** now"],
] as const;

const HIGHLIGHTED_LINES = [
  ...BRACKET_LINES,
  ...COMMAND_LINES.map(([, line]) => line),
  ...COMMENTED_COMMAND_LINES.map(([, line]) => line),
  ...ESCAPED_COMMAND_LINES.map(([, line]) => line),
  ...ESCAPED_OPENER_LINES.map(([, line]) => line),
  ...RAW_LINES.map(([, line]) => line),
  ...BOLD_ITALIC_LINES.map(([, line]) => line),
  ...[...READ_AS_UNIT, ...KEPT_IN_TEXT, "*far*"].map(glueLine),
  ...[...READ_AS_UNIT, ...KEPT_IN_TEXT].flatMap(spanLines),
  ...SPAN_MARKS.map(([mark]) => markLine(mark)),
  RAW_LINE,
  ...ACROSS_UNITS.map(([, line]) => line),
  REGION_END_LINE,
];

describe("choice text is highlighted as the choice reads it (#2083)", () => {
  test("D: a `[` that only an arrow follows is highlighted as the literal text the choice reads", async () => {
    const line = BRACKET_LINES[0]!;
    const bracket = (await tokensOf(line)).find((token) => token.text === "[");
    expect(bracket?.scopes).not.toContain(SUPPRESSION_BRACKET);
    expect(bracket?.scopes).toContain("string.choice.sd");
    expect(outcome(line).choices).toEqual(["Go [arrow"]);
  });

  test("D: a `[` whose only `]` sits inside an interpolation is highlighted as literal text", async () => {
    const line = BRACKET_LINES[1]!;
    const bracket = (await tokensOf(line)).find((token) => token.text === "[");
    expect(bracket?.scopes).not.toContain(SUPPRESSION_BRACKET);
    expect(outcome(line).choices).toEqual(["Go [x a"]);
  });

  test("a `[` that a `]` closes is highlighted as a suppression bracket", async () => {
    const line = BRACKET_LINES[2]!;
    const bracket = (await tokensOf(line)).find((token) => token.text === "[");
    expect(bracket?.scopes).toContain(SUPPRESSION_BRACKET);
    expect(outcome(line).choices).toEqual(["Go a"]);
  });

  test("D's limit: an interpolation read as a unit between the `[` and the arrow, with a `]` after it, keeps the `[` highlighted as a suppression bracket", async () => {
    const line = BRACKET_LINES[3]!;
    const bracket = (await tokensOf(line)).find((token) => token.text === "[");
    expect(bracket?.scopes).toContain(SUPPRESSION_BRACKET);
    expect(outcome(line).choices).toEqual(["Go [a 1"]);
  });

  test.each([...READ_AS_UNIT, ...KEPT_IN_TEXT, "*far*"])(
    "E: `..` right before %s is highlighted as the text the choice keeps",
    async (after) => {
      const dots = (await tokensOf(glueLine(after))).filter((token) => token.text.includes("."));
      expect(dots.length).toBeGreaterThan(0);
      expect(dots.filter((token) => token.scopes.includes("meta.glue.sd"))).toEqual([]);
    },
  );

  test("E: the dots stay in the choice's text", () => {
    expect(outcome("+ Go .. {#{{{{1}}}}} x").choices).toEqual(["Go .. 1 x"]);
  });

  test.each([...READ_AS_UNIT, ...KEPT_IN_TEXT])(
    "F: a styled span around %s is highlighted as the player renders it",
    async (interpolation) => {
      const [unclosed, closedAfter, closedBefore] = spanLines(interpolation);
      const italic = async (line: string, word: string) =>
        (await scopesOf(line, word)).includes("markup.other.italic.sd");
      expect(await italic(unclosed!, "away")).toBe(true);
      expect(await italic(closedAfter!, "away")).toBe(true);
      expect(await italic(closedAfter!, "now")).toBe(false);
      expect(await italic(closedBefore!, "away")).toBe(false);
    },
  );

  test("F: the player renders the span across the interpolation", () => {
    expect(outcome("+ Go *far {#{{{{1}}}}} away* now").choices).toEqual(["Go *far 1 away* now"]);
    expect(outcome("+ Go *far {[[a]]} away* now").choices).toEqual(["Go *far a away* now"]);
  });

  test.each(SPAN_MARKS)("F: a `%s` span reads across an interpolation read as a unit", async (mark, scope) => {
    const line = markLine(mark);
    expect(await scopesOf(line, "away")).toContain(scope);
    expect(await scopesOf(line, "now")).not.toContain(scope);
  });

  test("F: a raw span reads across an interpolation read as a unit", () => {
    const source = choose(RAW_LINE);
    const cursor = parseSource(source).cursor();
    let raw: { from: number; to: number } | undefined;
    do {
      if (cursor.name === "ChoiceStartRaw") raw = { from: cursor.from, to: cursor.to };
    } while (cursor.next());
    expect(source.slice(raw!.from, raw!.to)).toBe("`far {#{{{{1}}}}} away`");
  });

  test.each(ACROSS_UNITS)("F: a styled span %s reads across what is read as a unit", async (_where, line) => {
    expect(await scopesOf(line, "away")).toContain("markup.other.italic.sd");
    expect(await scopesOf(line, "now")).not.toContain("markup.other.italic.sd");
  });

  test("a styled span ends before the whitespace that ends its region, as on main", async () => {
    const tokens = await tokensOf(REGION_END_LINE);
    const bracket = tokens.findIndex((token) => token.text === "[");
    expect(tokens[bracket - 1]!.text).toBe(" ");
    expect(tokens[bracket - 1]!.scopes).not.toContain("markup.other.italic.sd");
  });

  test.each(COMMAND_LINES)(
    "in %s a brace is the command's text, read and highlighted as on main",
    async (_kind, line, label, scope) => {
      expect(outcome(line).choices).toEqual([label]);
      const tokens = await tokensOf(line);
      const braces = tokens.filter((token) => token.text.includes("{"));
      expect(braces.length).toBeGreaterThan(0);
      for (const token of braces) {
        expect(token.scopes).toContain(scope);
        expect(token.scopes).not.toContain("meta.embedded.line.luau");
      }
    },
  );

  test.each(COMMENTED_COMMAND_LINES)(
    "a comment inside %s in choice text is the command's text, read and highlighted as one command as on a display line",
    async (_kind, line, label, scope) => {
      expect(outcome(line).choices).toEqual([label]);
      const dump = (await tokenize(choose(line)))[CHOICE_LINE]!;
      const command = line.slice(line.search(/\(\(|\[\[|</), line.search(/\)\)|\]\]|>(?= now)/) + 2).trimEnd();
      const from = dump.lineText.indexOf(command);
      const covered = dump.tokens.filter((token) => token.startIndex >= from && token.endIndex <= from + command.length);
      expect(covered.map((token) => token.text).join("")).toBe(command);
      for (const token of covered) {
        expect(token.scopes).toContain(scope);
        expect(token.scopes).not.toContain("comment.block.sd");
      }
    },
  );

  test.each(ESCAPED_COMMAND_LINES)(
    "a text command in %s is highlighted as one command, as on main",
    async (_where, line, label, command) => {
      expect(outcome(line).choices).toEqual([label]);
      const dump = (await tokenize(choose(line)))[CHOICE_LINE]!;
      const from = dump.lineText.indexOf(command);
      const covered = dump.tokens.filter((token) => token.startIndex >= from && token.endIndex <= from + command.length);
      expect(covered.map((token) => token.text).join("")).toBe(command);
      for (const token of covered) {
        expect(token.scopes).toContain("meta.text.sd");
        expect(token.scopes).not.toContain("markup.other.italic.sd");
      }
    },
  );

  test.each(ESCAPED_OPENER_LINES)(
    "a backslash before a comment opener in %s escapes it, so no comment starts, as on a display line and on main",
    async (_where, line, label) => {
      expect(outcome(line).choices).toEqual([label]);
      const tokens = await tokensOf(line);
      const opener = tokens.filter((token) => token.text.includes("/"));
      expect(opener.length).toBeGreaterThan(0);
      for (const token of tokens) {
        expect(token.scopes).not.toContain("comment.block.sd");
        expect(token.scopes).not.toContain("comment.line.double-slash.sd");
      }
    },
  );

  test.each(BOLD_ITALIC_LINES)(
    "%s inside a bold-italic span but outside its italic is text, as on main and in display text",
    async (_what, line, label) => {
      expect(outcome(line).choices).toEqual([label]);
      for (const token of (await tokensOf(line)).filter((token) => /[{}/]/.test(token.text))) {
        expect(token.scopes).toContain("markup.other.bold.sd");
        expect(token.scopes).not.toContain("meta.embedded.line.luau");
        expect(token.scopes).not.toContain("comment.block.sd");
      }
    },
  );

  test.each(RAW_LINES)("a raw span around %s in choice text keeps its text literal, as on main", async (_what, line, label) => {
    expect(outcome(line).choices).toEqual([label]);
    const tokens = await tokensOf(line);
    for (const token of tokens.filter((token) => /[{}/]/.test(token.text))) {
      expect(token.scopes).not.toContain("meta.embedded.line.luau");
      expect(token.scopes).not.toContain("comment.block.sd");
    }
  });

  test("both highlighting engines give every line above the same scopes", async () => {
    for (const line of HIGHLIGHTED_LINES) {
      expect({ line, divergences: await compareEngines(choose(line)) }).toEqual({ line, divergences: [] });
    }
  });
});
