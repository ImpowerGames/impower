import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";

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
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const errors: { message: string; line: number; character: number }[] = [];
  for (const ds of Object.values(result.program.diagnostics ?? {})) {
    for (const d of ds as any[]) {
      if (d?.severity === 1) {
        errors.push({
          message: d.message,
          line: d.range.start.line,
          character: d.range.start.character,
        });
      }
    }
  }
  return { result, errors };
};

const run = (text: string): string => {
  const { result, errors } = compile(text);
  expect(errors).toEqual([]);
  const story = testStory(result.program.chunks);
  const rtErrors: string[] = [];
  story.onError = (m: string) => rtErrors.push(m);
  const out = story.ContinueMaximally();
  expect(rtErrors).toEqual([]);
  return out;
};

describe("`/* */` story block comments", () => {
  test("a whole-line comment in a scene body is not shown and leaves no blank line", () => {
    const out = run(`scene start
  Before.
  /* a whole-line note */
  After.
  done
end
`);
    expect(out).toBe("Before.\nAfter.\n");
  });

  test("a comment across several lines is not shown and leaves no blank line", () => {
    const out = run(`scene start
  Before.
  /* first hidden line
  second hidden line
  third hidden line */
  After.
  done
end
`);
    expect(out).toBe("Before.\nAfter.\n");
  });

  test("a top-level comment across lines is read as a comment, not a statement", () => {
    const out = run(`/* top note
still the note */
scene start
  Shown.
  done
end
`);
    expect(out).toBe("Shown.\n");
  });

  test("an inline comment keeps the text around it and drops the whitespace before it", () => {
    const out = run(`scene start
  Hello /* note */ there
  done
end
`);
    expect(out).toBe("Hello there\n");
  });

  test("an inline comment that opens without whitespace after `/*` is still a comment", () => {
    const out = run(`scene start
  Hello /*note*/ there
  done
end
`);
    expect(out).toBe("Hello there\n");
  });

  test("an inline comment that runs onto later lines leaves the text after it", () => {
    const out = run(`scene start
  Hello /* note
  more note */ there
  done
end
`);
    expect(out).not.toContain("note");
    expect(out).toContain("Hello");
    expect(out).toContain("there");
  });

  test("a comment inside a dialogue block is not shown", () => {
    const out = run(`scene start
  RAFFLES:
    Real line.
    /* hidden
    still hidden */
    Second line.
  done
end
`);
    expect(out).not.toContain("hidden");
    expect(out).toContain("Real line.");
    expect(out).toContain("Second line.");
  });

  test("a comment in choice text is not shown", () => {
    const { result, errors } = compile(`scene start
  choose
    + Go /* inner */ left /* note */
      Hi /* outer */ there.
      done
    + [Wait /* inner */ here] now
      done
  end
end
`);
    expect(errors).toEqual([]);
    const story = testStory(result.program.chunks);
    story.Continue();
    expect(story.currentChoices.map((c: any) => c.text)).toEqual([
      "Go left",
      "Wait here",
    ]);
    story.ChooseChoiceIndex(0);
    expect(story.ContinueMaximally()).toBe("Go left\nHi there.\n");
  });

  describe("in choice text and on chain lines, a block comment must close on its line", () => {
    const outcome = (script: string) => {
      const { result, errors } = compile(script);
      const story = testStory(result.program.chunks);
      story.Continue();
      const choices = story.currentChoices.map((c: any) => c.text);
      story.ChooseChoiceIndex(0);
      return {
        errors: errors.map((e) => JSON.stringify(e.message)),
        choices,
        chosen: story.ContinueMaximally(),
      };
    };
    const asText = (script: string) =>
      script.replaceAll("/*", "/+").replaceAll("*/", "+/");
    const fromText = (value: string) =>
      value.replaceAll("/+", "/*").replaceAll("+/", "*/");
    const outcomeAsText = (script: string) => {
      const plain = outcome(asText(script));
      return {
        errors: plain.errors,
        choices: plain.choices.map(fromText),
        chosen: fromText(plain.chosen),
      };
    };
    const choose = (...lines: string[]) =>
      `scene start\n  choose\n${lines.map((l) => `    ${l}`).join("\n")}\n  end\nend\n`;
    const unclosedErrors = (errors: string[]) =>
      errors.filter((m) => m.includes("missing its closing `*/`"));

    test("a `/*` in choice text with no `*/` on its line is text, and the next line is the choice's body", () => {
      const script = choose("+ Go /* draft", "  hidden */ left", "  Gone.", "  done");
      expect(outcome(script)).toEqual(outcomeAsText(script));
      expect(outcome(script).errors).toEqual([]);
    });

    test("a suppression bracket around a comment that does not close on its line behaves as it does around text", () => {
      const script = choose("+ [Wait /* draft", "  hidden */ here] now", "  done");
      expect(outcome(script)).toEqual(outcomeAsText(script));
    });

    test("a suppression bracket after a comment that does not close on its line behaves as it does after text", () => {
      const script = choose("+ Go /* draft", "  hidden */ [left] home", "  done");
      expect(outcome(script)).toEqual(outcomeAsText(script));
    });

    test("a `/*` in a string, a long string or a backtick string inside an interpolation opens no comment", () => {
      const result = outcome(
        choose(
          '+ Go {"/*"} home',
          "  done",
          '+ Go {if true then "/*" else tostring({})} home',
          "  done",
          "+ Go {`/*{1}`} near",
          "  done",
          '+ Go {#{"/*"}} count',
          "  done",
        ),
      );
      expect(result.errors).toEqual([]);
      expect(result.choices).toEqual([
        "Go /* home",
        "Go /* home",
        "Go /*1 near",
        "Go 1 count",
      ]);
    });

    test("a `/*` in a long string inside an interpolation behaves as the same text does", () => {
      const script = choose("+ Go {[[/*]]} far", "  done");
      expect(unclosedErrors(outcome(script).errors)).toEqual([]);
      expect(outcome(script)).toEqual(outcomeAsText(script));
    });

    test("a `/*` in a string inside a deeply nested interpolation opens no comment", () => {
      const script = choose('+ Go {#{{{{"} [foo] /*"}}}}} home', "  done");
      expect(unclosedErrors(outcome(script).errors)).toEqual([]);
      expect(outcome(script)).toEqual(outcomeAsText(script));
    });

    test("a real comment after a deeply nested interpolation that does not close on its line is text, with no error", () => {
      const script = choose("+ Go {#{{{{1}}}}} /* draft {1}", "  hidden */ after", "  done");
      expect(outcome(script).errors).toEqual([]);
      expect(outcome(script)).toEqual(outcomeAsText(script));
    });

    test("an unclosed `/*` in choice text reports no error and comments out nothing", () => {
      const script = choose("+ Go /* never closed", "  Still here.", "  done");
      expect(outcome(script).errors).toEqual([]);
      expect(outcome(script)).toEqual(outcomeAsText(script));
    });

    test("an unclosed `/*` after a divert reports no unclosed-comment error", () => {
      const { errors } = compile(`scene start
  -> next /* why
  done
end
scene next
  Next.
  done
end
`);
      expect(
        errors.filter((e) => JSON.stringify(e.message).includes("missing its closing `*/`")),
      ).toEqual([]);
    });

    test("a `/*` on a chain line with no `*/` on its line is text, and the line still chains", () => {
      const source = String.raw`scene start
  Before /* note \
  still */ after
  done
end
`;
      expect(compile(source).errors).toEqual([]);
      expect(run(source)).toBe(fromText(run(asText(source))));
    });

    test("a comment that closes on a chain line is left out, and the line still chains", () => {
      expect(
        run(String.raw`scene start
  One /* a note */ two \
  three
  done
end
`),
      ).toBe(
        run(String.raw`scene start
  One two \
  three
  done
end
`),
      );
    });

    test("adjacent comments that close on a choice line are all left out", () => {
      const result = outcome(
        choose("+ Go /*one*//*two*/ home", "  done", "+ Go /*one*/ /*two*/ /*three*/ home", "  done"),
      );
      expect(result.errors).toEqual([]);
      expect(result.choices).toEqual(["Go home", "Go home"]);
    });

    test("adjacent comments that close on a chain line are all left out, and the line still chains", () => {
      expect(
        run(String.raw`scene start
  One /*one*//*two*/ two \
  three
  done
end
`),
      ).toBe(
        run(String.raw`scene start
  One two \
  three
  done
end
`),
      );
    });

    describe("a bracket or an arrow inside a comment in choice text is read by the choice rule, for `//` and `/* */` alike", () => {
      const chooseThenNext = (line: string) =>
        `scene start\n  choose\n    ${line}\n      Body.\n      done\n  end\nend\nscene next\n  Next.\n  done\nend\n`;

      test("a bracket inside a line comment suppresses as it does on main", () => {
        expect(outcome(chooseThenNext("+ Go // [secret] home"))).toEqual({
          errors: [],
          choices: ["Gosecret"],
          chosen: "Go home\nBody.\n",
        });
      });

      test("a bracket inside a same-line block comment suppresses as it does on main", () => {
        expect(outcome(chooseThenNext("+ Go /* [secret] */ home"))).toEqual({
          errors: [],
          choices: ["Go /* secret"],
          chosen: "Go /* */ home\nBody.\n",
        });
      });

      test("an arrow inside a line comment diverts as it does on main", () => {
        expect(outcome(chooseThenNext("+ Go // -> next"))).toEqual({
          errors: [],
          choices: ["Go"],
          chosen: "Go Next.\n",
        });
      });

      test("an arrow inside a same-line block comment diverts as it does on main", () => {
        expect(outcome(chooseThenNext("+ Go /* -> next */ home"))).toEqual({
          errors: [],
          choices: ["Go /*"],
          chosen: "Go /* Next.\n",
        });
      });
    });

    test("adjacent comments after a divert are left out", () => {
      expect(
        run(`scene start
  -> next /*one*//*two*/
  done
end
scene next
  Next.
  done
end
`),
      ).toBe("Next.\n");
    });
  });

  describe("a comment inside a styled span", () => {
    const SPANS = [
      ["*", "*"],
      ["**", "**"],
      ["***", "***"],
      ["_", "_"],
      ["^", "^"],
      ["~~", "~~"],
      ["::", "::"],
    ] as const;

    test.each(SPANS)("is not shown inside %s on a display line, and the span's marks stay around its text", (open, close) => {
      expect(
        run(`scene start\n  Go ${open}far /*note*/ away${close} home\n  done\nend\n`),
      ).toBe(`Go ${open}far away${close} home\n`);
    });

    test.each(SPANS)("is not shown inside %s in choice text, and the span's marks stay around its text", (open, close) => {
      const { result, errors } = compile(
        `scene start\n  choose\n    + Go ${open}far /*note*/ away${close} home\n      done\n  end\nend\n`,
      );
      expect(errors).toEqual([]);
      const story = testStory(result.program.chunks);
      story.Continue();
      expect(story.currentChoices.map((c: any) => c.text)).toEqual([
        `Go ${open}far away${close} home`,
      ]);
    });

    test("a lone `*/` before a comment stays text and the comment is not shown", () => {
      expect(run("scene start\n  Go *//*note*/ home\n  done\nend\n")).toBe("Go */ home\n");
    });

    test("an italic span followed by a comment, and a closing `*` before a `/` with no comment, read as they do without the rule", () => {
      expect(run("scene start\n  Go *italic*/* note */ after\n  done\nend\n")).toBe(
        "Go *italic* after\n",
      );
      expect(run("scene start\n  Go *a*/ b\n  done\nend\n")).toBe("Go *a*/ b\n");
    });

    test("a comment that opens inside a span and does not close on its line is text, with no error", () => {
      expect(run("scene start\n  Go *x /* open\n  Next.\n  done\nend\n")).toBe(
        "Go *x /* open\nNext.\n",
      );
    });

    test("a `//` inside a span is text, as on main", () => {
      expect(run("scene start\n  Go *far // note* home\n  done\nend\n")).toBe(
        "Go *far // note* home\n",
      );
    });
  });

  test("a comment after `end` is not read as a line of story text", () => {
    const { result } = compile(`scene start
  if true then
    Inside.
  end /* closes the if */
  done
end
`);
    const messages = Object.values(result.program.diagnostics ?? {})
      .flat()
      .map((d: any) => JSON.stringify(d.message));
    expect(messages.filter((m) => m.includes("The text after this"))).toEqual([]);
  });

  test("a colon inside a comment does not make the line dialogue", () => {
    const out = run(`scene start
  Hello there. /* note: x */
  Hello /* aside: y */ there.
  RAFFLES: Hi /* cue: z */ there.
  done
end
`);
    expect(out).toBe(
      run(`scene start
  Hello there.
  Hello there.
  RAFFLES: Hi there.
  done
end
`),
    );
  });

  test("a lone `*/` is text", () => {
    const out = run(`scene start
  A */ B
  done
end
`);
    expect(out).toBe("A */ B\n");
  });

  test("an unclosed `/*` comments out the rest of the script and reports an error at the opener", () => {
    const { errors } = compile(`scene start
  Shown.
  /* never closed
  Hidden.
  done
end
`);
    const unclosed = errors.filter((e) =>
      JSON.stringify(e.message).includes("missing its closing `*/`"),
    );
    expect(unclosed.map((e) => [e.line, e.character])).toEqual([[2, 2]]);
  });
});
