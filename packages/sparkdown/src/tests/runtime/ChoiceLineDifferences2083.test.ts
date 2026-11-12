import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import { parseSource } from "../compiler/grammarSnapshot";
import { tokenize } from "../compiler/vscodeGrammarSnapshot";

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

  test("E: glue right before an interpolation read as a unit is highlighted as glue", async () => {
    const lines = await tokenize(choose("+ Go .. {#{{{{1}}}}}"));
    const glue = lines[CHOICE_LINE]!.tokens.find((token) => token.text === "..");
    expect(glue?.scopes).toContain("meta.glue.sd");
    expect(outcome("+ Go .. {#{{{{1}}}}}").choices).toEqual(["Go .. 1"]);
  });

  test.each(["{x}", "{`a`}", "{t[1]}", '{"/*"}', "{x // 2}"])(
    "glue right before %s is highlighted as on main",
    async (interpolation) => {
      const lines = await tokenize(choose(`+ Go .. ${interpolation}`));
      const dots = lines[CHOICE_LINE]!.tokens.filter((token) => token.text.includes("."));
      expect(dots.length).toBeGreaterThan(0);
      expect(dots.filter((token) => token.scopes.includes("meta.glue.sd"))).toEqual([]);
    },
  );

  test("F: a styled span stops at an interpolation read as a unit", async () => {
    const lines = await tokenize(choose("+ Go *far {#{{{{1}}}}} away"));
    const away = lines[CHOICE_LINE]!.tokens.find((token) => token.text.includes("away"));
    expect(away?.scopes).not.toContain("markup.other.italic.sd");
    expect(outcome("+ Go *far {#{{{{1}}}}} away").choices).toEqual(["Go *far 1 away"]);
  });

  const italic = async (line: string, word: string) => {
    const lines = await tokenize(choose(line));
    const token = lines[CHOICE_LINE]!.tokens.find((t) => t.text.includes(word));
    return token?.scopes.includes("markup.other.italic.sd");
  };

  test.each(["{x}", "{`a`}", "{t[1]}", '{"/*"}', '{"->"}', '{"\\n"}', "{#{{{1}}}}"])(
    "a styled span around %s is highlighted as on main",
    async (interpolation) => {
      expect(await italic(`+ Go *far ${interpolation} away`, "away")).toBe(true);
      expect(await italic(`+ Go *far ${interpolation} away* now`, "away")).toBe(true);
      expect(await italic(`+ Go *far ${interpolation} away* now`, "now")).toBe(false);
      expect(await italic(`+ Go *far* ${interpolation} away`, "away")).toBe(false);
    },
  );
});
