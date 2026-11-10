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

  test("a suppression bracket that spans a comment across lines keeps its meaning", () => {
    const { result, errors } = compile(`scene start
  choose
    + [Wait /* draft
      hidden */ here] now
      done
    + Go [left /* one
      two */ /* three
      four */ side] way
      done
  end
end
`);
    expect(errors).toEqual([]);
    const story = testStory(result.program.chunks);
    story.Continue();
    expect(story.currentChoices.map((c: any) => c.text)).toEqual([
      "Wait here",
      "Go left side",
    ]);
    const plain = compile(`scene start
  choose
    + [Wait here] now
      done
    + Go [left side] way
      done
  end
end
`).result.program.chunks;
    const chosen = (chunks: any, index: number) => {
      const s = testStory(chunks);
      s.Continue();
      s.ChooseChoiceIndex(index);
      return s.ContinueMaximally();
    };
    expect(chosen(result.program.chunks, 0)).toBe(chosen(plain, 0));
    expect(chosen(result.program.chunks, 1)).toBe(chosen(plain, 1));
    expect(chosen(plain, 0)).toContain("now");
    expect(chosen(plain, 1)).toContain("Go way");
  });

  test("a bracket left open across a comment is text", () => {
    const { result, errors } = compile(`scene start
  choose
    + Go [left /* one
      two */ way
      done
  end
end
`);
    expect(errors).toEqual([]);
    const story = testStory(result.program.chunks);
    story.Continue();
    expect(story.currentChoices.map((c: any) => c.text)).toEqual(["Go [left way"]);
  });

  test("a `/*` inside a string in choice text opens no comment", () => {
    const { result, errors } = compile(`scene start
  choose
    + Go {"/*"} home
      done
  end
end
`);
    expect(errors).toEqual([]);
    const story = testStory(result.program.chunks);
    story.Continue();
    expect(story.currentChoices.map((c: any) => c.text)).toEqual(["Go /* home"]);
  });

  test("a `/*` in a nested interpolation, a long string or a backtick string in choice text opens no comment", () => {
    const { result, errors } = compile(`scene start
  choose
    + Go {if true then "/*" else tostring({})} home
      done
    + Go {[[/*]]} far
      done
    + Go {\`/*{1}\`} near
      done
    + Go {#{"/*"}} count
      done
  end
end
`);
    expect(errors).toEqual([]);
    const story = testStory(result.program.chunks);
    story.Continue();
    expect(story.currentChoices.map((c: any) => c.text)).toEqual([
      "Go /* home",
      "Go /* far",
      "Go /*1 near",
      "Go 1 count",
    ]);
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

  test("a line chain mark inside a comment does not chain the line, and one after a comment does", () => {
    const out = run(String.raw`scene start
  Before /* note \
  still */ after
  One /* a \ b */ two\
  three
  done
end
`);
    expect(out).toBe(
      run(String.raw`scene start
  Before after
  One two\
  three
  done
end
`),
    );
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
