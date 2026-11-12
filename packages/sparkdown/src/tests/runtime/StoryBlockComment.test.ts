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

  describe("in choice text, a divert and on a chain line, a comment is read as one unit before the line is split", () => {
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
    const choose = (...lines: string[]) =>
      `scene start\n  choose\n${lines.map((l) => `    ${l}`).join("\n")}\n  end\nend\nscene next\n  Next.\n  done\nend\n`;
    const unclosedErrors = (errors: { message: string; line: number; character: number }[]) =>
      errors.filter((e) => JSON.stringify(e.message).includes("missing its closing `*/`"));

    test("a comment in choice text that runs onto a later line is not shown (#2022 round 1)", () => {
      expect(outcome(choose("+ Go /* draft", "  hidden */ left", "  Gone.", "  done"))).toEqual({
        errors: [],
        choices: ["Go left"],
        chosen: "Go left\nGone.\n",
      });
    });

    test("a suppression bracket around a comment that runs onto a later line keeps its meaning (#2022 round 1)", () => {
      expect(outcome(choose("+ [Wait /* draft", "  hidden */ here] now", "  done"))).toEqual({
        errors: [],
        choices: ["Wait here"],
        chosen: "now",
      });
    });

    test("a suppression bracket after a comment that runs onto a later line keeps its meaning (#2022 round 2)", () => {
      expect(outcome(choose("+ Go /* draft", "  hidden */ [left] home", "  done"))).toEqual({
        errors: [],
        choices: ["Go left"],
        chosen: "Go home",
      });
    });

    test("a bracket or an arrow inside a comment that runs onto a later line is part of the comment", () => {
      expect(outcome(choose("+ [Wait /* draft", "  hidden ] -> next */ here] now", "  done"))).toEqual({
        errors: [],
        choices: ["Wait here"],
        chosen: "now",
      });
    });

    test("a `/*` in a string, a long string or a backtick string inside an interpolation opens no comment (#2022 round 1)", () => {
      const result = outcome(
        choose(
          '+ Go {"/*"} home',
          "  done",
          '+ Go {if true then "/*" else tostring({})} home',
          "  done",
          "+ Go {[[/*]]} far",
          "  done",
          "+ Go {`/*{1}`} near",
          "  done",
          '+ Go {#{"/*"}} count',
          "  done",
        ),
      );
      expect(result.errors).toEqual([]);
      expect(result.choices).toEqual(["Go /* home", "Go /* home", "Go /* far", "Go /*1 near", "Go 1 count"]);
    });

    test("a `/*` and a bracket in a string inside a deeply nested interpolation are the string's (#2022 round 2)", () => {
      expect(outcome(choose('+ Go {#{{{{"} [foo] /*"}}}}} home', "  done"))).toEqual({
        errors: [],
        choices: ["Go 1 home"],
        chosen: "Go 1 home",
      });
    });

    test("a comment after a deeply nested interpolation runs onto a later line (#2022 round 2)", () => {
      expect(outcome(choose("+ Go {#{{{{1}}}}} /* draft {1}", "  hidden */ after", "  done"))).toEqual({
        errors: [],
        choices: ["Go 1 after"],
        chosen: "Go 1 after",
      });
    });

    test("a comment after a deeply nested interpolation on an action or a dialogue chain line hides the line's `\\` (#2022 round 2)", () => {
      const action = String.raw`scene start
  Go {#{{{{1}}}}} /* draft {1} \
  hidden */ after
  done
end
`;
      const dialogue = String.raw`scene start
  BOB: Go {#{{{{1}}}}} /* draft {1} \
  hidden */ after
  done
end
`;
      expect(run(action)).toBe("Go 1 after\n");
      expect(run(dialogue)).toBe("Go 1 after\n");
    });

    test("a bracket inside a block comment in choice text creates no suppression (#2022 round 3)", () => {
      expect(outcome(choose("+ Go /* [secret] */ home", "  Body.", "  done"))).toEqual({
        errors: [],
        choices: ["Go home"],
        chosen: "Go home\nBody.\n",
      });
    });

    test("an arrow inside a block comment in choice text creates no divert (#2022 round 3)", () => {
      expect(outcome(choose("+ Go /* -> next */ home", "  Body.", "  done"))).toEqual({
        errors: [],
        choices: ["Go home"],
        chosen: "Go home\nBody.\n",
      });
    });

    test("a bracket or an arrow inside a line comment in choice text creates no suppression or divert", () => {
      expect(outcome(choose("+ Go // [secret] home", "  Body.", "  done"))).toEqual({
        errors: [],
        choices: ["Go"],
        chosen: "Go\nBody.\n",
      });
      expect(outcome(choose("+ Go // -> next", "  Body.", "  done"))).toEqual({
        errors: [],
        choices: ["Go"],
        chosen: "Go\nBody.\n",
      });
    });

    test("a comment inside a string in an interpolation is the string's text (#2022 round 3)", () => {
      expect(outcome(choose('+ Go {"[foo] /*note*/"} home', "  done")).choices).toEqual(["Go [foo] /*note*/ home"]);
      expect(outcome(choose("+ Go {[[/*note*/]]} home", "  done")).choices).toEqual(["Go /*note*/ home"]);
    });

    test("a `[` that a comment's `]` follows never closes and stays text", () => {
      expect(outcome(choose("+ Go [left /* ] */ way", "  done")).choices).toEqual(["Go [left way"]);
      expect(outcome(choose("+ Go [left /* c */ way", "  done")).choices).toEqual(["Go [left way"]);
    });

    test("an unclosed `/*` in choice text comments out the rest of the script and reports an error at the opener", () => {
      const { errors } = compile(choose("+ Go /* never closed", "  Still here.", "  done"));
      expect(unclosedErrors(errors).map((e) => [e.line, e.character])).toEqual([[2, 9]]);
    });

    test("an unclosed `/*` after a divert comments out the rest of the script and reports an error at the opener", () => {
      const { errors } = compile(`scene start
  -> next /* why
  done
end
scene next
  Next.
  done
end
`);
      expect(unclosedErrors(errors).map((e) => [e.line, e.character])).toEqual([[1, 10]]);
    });

    test("a comment after a divert's target runs onto a later line", () => {
      expect(
        run(`scene start
  -> next /* why
  because */
  done
end
scene next
  Next.
  done
end
`),
      ).toBe("Next.\n");
    });

    test("a `\\` inside a comment that runs onto a later line does not chain the line", () => {
      const source = String.raw`scene start
  Before /* note \
  still */ after
  Next line.
  done
end
`;
      expect(compile(source).errors).toEqual([]);
      expect(run(source)).toBe("Before after\nNext line.\n");
    });

    test("a `\\` inside a line comment does not chain the line", () => {
      const story = (source: string) => {
        const { result } = compile(source);
        const s = testStory(result.program.chunks);
        const beats: string[] = [];
        while (s.canContinue) beats.push(s.Continue() ?? "");
        return beats;
      };
      expect(story("scene start\n  One // note \\\n  two\n  done\nend\n")).toEqual(
        story("scene start\n  One\n  two\n  done\nend\n"),
      );
    });

    test.each([
      ["a block comment opener inside a tag", "  One # tag /* c */ \\\n  two\n"],
      ["a line comment opener inside a tag", "  One # tag // c \\\n  two\n"],
      ["a comment before a tag", "  One /* c */ # tag \\\n  two\n"],
      ["a dialogue line's tag", "  BOB: One # tag /* c */ \\\n  two\n"],
    ])("a chain mark after %s chains the line into one beat, as on main", (_where, lines) => {
      const beats = (source: string) => {
        const { result } = compile(source);
        const s = testStory(result.program.chunks);
        const out: string[] = [];
        while (s.canContinue) out.push(s.Continue() ?? "");
        return out;
      };
      expect(beats(`scene start\n${lines}  done\nend\n`)).toEqual(["One\ntwo\n", ""]);
    });

    test("a chain mark followed by comments still chains the line", () => {
      const chained = run("scene start\n  One \\\n  two\n  done\nend\n");
      expect(run("scene start\n  One \\ // note\n  two\n  done\nend\n")).toBe(chained);
      expect(run("scene start\n  One \\ /* note */\n  two\n  done\nend\n")).toBe(chained);
    });

    test("a chain mark after a comment that ran onto its line chains the line", () => {
      expect(run("scene start\n  One /* a\n  b */ two \\\n  three\n  done\nend\n")).toBe(
        run("scene start\n  One two \\\n  three\n  done\nend\n"),
      );
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

    test("adjacent comments that close on a choice line are all left out (#2022 round 3)", () => {
      const result = outcome(
        choose("+ Go /*one*//*two*/ home", "  done", "+ Go /*one*/ /*two*/ /*three*/ home", "  done"),
      );
      expect(result.errors).toEqual([]);
      expect(result.choices).toEqual(["Go home", "Go home"]);
    });

    test("adjacent comments that close on a chain line are all left out, and the line still chains (#2022 round 3)", () => {
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

    test("adjacent comments after a divert are left out (#2022 round 3)", () => {
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

    test("in choice text, a comment that opens inside a span may run onto a later line", () => {
      const { result, errors } = compile(
        "scene start\n  choose\n    + Go *far /* a\n      b */ away* home\n      done\n  end\nend\n",
      );
      expect(errors).toEqual([]);
      const story = testStory(result.program.chunks);
      story.Continue();
      expect(story.currentChoices.map((c: any) => c.text)).toEqual(["Go *far away* home"]);
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
