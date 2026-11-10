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

  test("a comment that opens in choice text and closes on a later line leaves the text after it in the choice", () => {
    const { result, errors } = compile(`scene start
  choose
    + Go /* draft
      hidden */ left
      Gone.
      done
    + [Wait /* [inner] */ here] /* open
      still */ now
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
    expect(story.ContinueMaximally()).toBe("Go left\nGone.\n");
    const second = testStory(result.program.chunks);
    second.Continue();
    second.ChooseChoiceIndex(1);
    const out = second.ContinueMaximally();
    expect(out).toContain("now");
    expect(out).not.toMatch(/still|open|inner|Wait/);
  });

  test("an unclosed `/*` in choice text reports an error at the opener", () => {
    const { errors } = compile(`scene start
  choose
    + Go /* never closed
      done
  end
end
`);
    const unclosed = errors.filter((e) =>
      JSON.stringify(e.message).includes("missing its closing `*/`"),
    );
    expect(unclosed.map((e) => [e.line, e.character])).toEqual([[2, 9]]);
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
