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
  let errors = 0;
  for (const ds of Object.values(result.program.diagnostics ?? {})) {
    for (const d of ds as any[]) if (d?.severity === 1) errors++;
  }
  return { result, errors };
};

const run = (compiled: any): string => {
  const story = testStory(compiled);
  const rtErrors: string[] = [];
  story.onError = (m: string) => rtErrors.push(m);
  const out = story.ContinueMaximally();
  expect(rtErrors).toEqual([]);
  return out;
};

describe("`//` display line comments", () => {
  test("whole-line `//` comments are removed (scene + dialogue), newline swallowed", () => {
    const SRC = `-> main

scene main
  // a whole-line scene comment
  Action line one.
  RAFFLES
  // a whole-line dialogue comment
  Real dialogue.
  Action line two.
  done
end
`;
    const { result, errors } = compile(SRC);
    expect(errors).toBe(0);
    const out = run(result.program.chunks);
    expect(out).not.toContain("whole-line");
    expect(out).not.toContain("//");
    expect(out).toContain("Action line one.");
    expect(out).toContain("Real dialogue.");
    expect(out).toContain("Action line two.");
    expect(out).not.toContain("\n\nReal dialogue.");
  });

  test("end-of-line `//` comment is stripped but the newline is preserved", () => {
    const SRC = `-> main

scene main
  Action before. // trailing note
  Action after.
  done
end
`;
    const { result, errors } = compile(SRC);
    expect(errors).toBe(0);
    const out = run(result.program.chunks);
    expect(out).not.toContain("trailing note");
    expect(out).toContain("Action before.");
    expect(out).toContain("Action after.");
    expect(out).not.toContain("Action before.Action after.");
    expect(out).not.toContain("Action before. Action after.");
  });

  test("`//` not followed by whitespace (a URL) is NOT a comment", () => {
    const SRC = `-> main

scene main
  Visit http://example.com today.
  done
end
`;
    const { result, errors } = compile(SRC);
    expect(errors).toBe(0);
    const out = run(result.program.chunks);
    expect(out).toContain("http://example.com");
    expect(out).toContain("Visit http://example.com today.");
  });
});
