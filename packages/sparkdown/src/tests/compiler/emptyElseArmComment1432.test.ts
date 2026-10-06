import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { officialSyntaxErrors } from "./officialSyntax";

// An empty `else` arm of an if expression that a line comment follows reports
// the missing expression where Luau does: at the next line's token, with its
// `got` part (#1432).

const URI = "inmemory:///main.sd";

function errors(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] });
  const { program } = compiler.compile({ textDocument: { uri: URI } });
  return (program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === 1)
    .map((d) => ({ message: typeof d.message === "string" ? d.message : d.message.value, line: d.range.start.line, column: d.range.start.character }));
}

function official(text: string) {
  return officialSyntaxErrors(text).map((e) => ({ message: e.message, line: e.location.begin.line, column: e.location.begin.column }));
}

const script = (afterElse: string, next = "b = 2") => `function f()
  local a = if true then 1 else${afterElse}
  ${next}
  return a
end
`;

describe("an empty else arm before a line comment (#1432)", () => {
  const cases: [string, string, string?][] = [
    ["line comment", " -- note"],
    ["line comment without a space", "--note"],
    ["block comment", " --[[ note ]]"],
    ["no comment", ""],
    ["line comment before a call", " -- note", "print(2)"],
  ];
  for (const [name, afterElse, next] of cases) {
    test(name, () => {
      const text = script(afterElse, next);
      expect(errors(text)).toEqual(official(text));
    });
  }

  const thenScript = (head: string, next: string) => `function f(c)
  local a = if ${head}
  ${next}
  return a
end
`;
  const thenCases: [string, string, string][] = [
    ["a then arm whose value follows a line comment", "c then -- note", "1 else 2"],
    ["a then arm whose value follows a block comment", "c then --[[ note ]]", "1 else 2"],
    ["a glued then whose value follows a comment", "(c)then -- note", "1 else 2"],
    ["a glued then with a comment glued to it", "(c)then--note", "1 else 2"],
    ["an else arm whose value follows a comment", "c then 1 else -- note", "2"],
  ];
  for (const [name, head, next] of thenCases) {
    test(name, () => {
      const text = thenScript(head, next);
      expect(errors(text)).toEqual(official(text));
    });
  }

  // A then arm that takes the next line's `b` and then meets `=` lacks its
  // `else`. The comment after `then` must change nothing: the errors equal
  // those of the same script without the comment, and Luau's parser reads
  // both alike.
  const withoutComment: [string, string, string][] = [
    ["an empty then arm before a line comment", "c then -- note", "c then"],
    ["an empty then arm before a block comment", "c then --[[ note ]]", "c then"],
    ["an empty glued then with a comment glued to it", "(c)then--note", "(c)then"],
    ["an empty glued then before a spaced comment", "(c)then -- note", "(c)then"],
  ];
  for (const [name, head, plain] of withoutComment) {
    test(name, () => {
      const text = thenScript(head, "b = 2");
      const control = thenScript(plain, "b = 2");
      expect(errors(text)).toEqual(errors(control));
      expect(official(text)).toEqual(official(control));
    });
  }

  test("an arm before a comment and a column-0 line", () => {
    for (const head of ["c then -- note", "(c)then--note", "c then 1 else -- note"]) {
      const text = `function f(c)\n  local a = if ${head}\nend\n`;
      expect(errors(text).map((e) => e.message)).toEqual(official(text).map((e) => e.message));
    }
  });
});

describe("no grammar loop around comments after then or else (#1432)", () => {
  test("the parser logs no empty-match warning", () => {
    const warnings: unknown[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void warnings.push(args.join(" "));
    try {
      for (const text of [
        script(" -- note"),
        script("--note", "print(2)"),
        `function f(c)\n  local a = if (c)then--note\n  1 else 2\n  return a\nend\n`,
        `function f(c)\n  local a = if c then --[[ a\n  b ]] 1 else 2\n  return a\nend\n`,
        `function f(c)\n  local a = if c then -- note\nend\n`,
      ]) {
        errors(text);
      }
    } finally {
      console.warn = original;
    }
    expect(warnings.filter((w) => String(w).includes("empty matches"))).toEqual([]);
  });
});
