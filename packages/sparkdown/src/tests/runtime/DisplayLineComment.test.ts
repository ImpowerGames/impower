// `//` line comments are sparkdown's end-of-line comment form for DISPLAY
// (non-Luau) contexts. Luau `--` comments are NOT allowed outside Luau bodies
// (the script uses `--` for em-dashes and `---` for front-matter), so `//`
// fills that gap for scene/dialogue text.
//
// A comment marker is `//` FOLLOWED BY whitespace or end-of-line (mirroring
// the `#` tag convention). This keeps a URL like `http://x` — where a host
// char follows `//` — from reading as a comment.
//
// Behaviors guarded here:
//   1. A whole-line `// ` comment (only indent before it) is removed AND its
//      trailing newline is swallowed, so the line vanishes cleanly.
//   2. An end-of-line `// ` comment with text before it removes the comment
//      but KEEPS the newline, so the following line does not merge up.
//   3. `//` NOT followed by whitespace (e.g. `http://x`) stays as display
//      text — it is not a comment.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
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
  const story = new RuntimeStory(compiled);
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
    const out = run((result.program as any).compiled);
    expect(out).not.toContain("whole-line");
    expect(out).not.toContain("//");
    expect(out).toContain("Action line one.");
    expect(out).toContain("Real dialogue.");
    expect(out).toContain("Action line two.");
    // No blank line left where the comment was removed.
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
    const out = run((result.program as any).compiled);
    expect(out).not.toContain("trailing note");
    expect(out).toContain("Action before.");
    expect(out).toContain("Action after.");
    // The two lines must stay separate — the newline before the comment is kept.
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
    const out = run((result.program as any).compiled);
    // The whole URL survives — `//` inside it is not a comment.
    expect(out).toContain("http://example.com");
    expect(out).toContain("Visit http://example.com today.");
  });
});
