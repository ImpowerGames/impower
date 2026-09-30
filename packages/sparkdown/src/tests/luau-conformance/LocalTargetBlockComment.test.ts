import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";
import { parseSource } from "../compiler/grammarSnapshot";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

// A block comment right after a `local` target, with `=`, `,` or `:` after
// the comment, is a comment, so the declaration is read to its end.

function nodeNames(source: string): string[] {
  const tree = parseSource(source);
  const names: string[] = [];
  const cur = tree.cursor();
  do {
    names.push(cur.name.replace(/_c\d+$/, ""));
  } while (cur.next());
  return names;
}

const STATEMENTS = [
  "local x --[[c]] = 1",
  "local x --[[c]], y = 1, 2",
  "local x --[[c]]: number = 1",
  "local x --[[c]] : number = 1",
  "local x --[=[c]]]=] = 1",
] as const;

describe("a local target followed by a block comment", () => {
  test.each(STATEMENTS)("%s leaves no unfinished node", (statement) => {
    expect(nodeNames(`${statement}\n`)).not.toContain("ERROR_INCOMPLETE");
    expect(nodeNames(`function f()\n  ${statement}\nend\n`)).not.toContain("ERROR_INCOMPLETE");
    expect(checkLuau(`${statement}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });
});

// Each is the same declaration with the comment removed, so the value lowers
// and runs as it does without the comment.
describe("a local target followed by a block comment lowers and runs", () => {
  function run(source: string) {
    const ctx = makeRuntimeStoryFromSource(source);
    return { errors: ctx.errorMessages, output: ctx.story.ContinueMaximally() };
  }

  test.each([
    ["local x --[[c]] = 1\n  return x", "Value 1.\n"],
    ["local x --[[c]]: number = 2\n  return x", "Value 2.\n"],
    ["local x --[[c]] : number = 3\n  return x", "Value 3.\n"],
    ["local x --[[c]], y = 4, 5\n  return x + y", "Value 9.\n"],
    ["local x --[[c]] = 1\n  x = x + 6\n  return x", "Value 7.\n"],
    ["local x --[=[c]]]=] = 8\n  return x", "Value 8.\n"],
    ["local x --[[c]] --[[d]] = 9\n  return x", "Value 9.\n"],
    ["local x --[[c]]= 10\n  return x", "Value 10.\n"],
    ["local x --[[a\n  b]] = 11\n  return x", "Value 11.\n"],
    ["local x --[[c]], --[[d]] y = 5, 7\n  return x + y", "Value 12.\n"],
    ["local x --[[c]] return 13", "Value 13.\n"],
    // A `]` before a cast in the value is not a comment's close.
    ["local t = {14}\n  local x = t[1] :: number\n  return x", "Value 14.\n"],
  ])("%j", (statements, output) => {
    expect(run(`Value {f()}.\nfunction f()\n  ${statements}\nend\n`)).toEqual({ errors: [], output });
  });
});

describe("a local target followed by a block comment and `::`", () => {
  test("keeps the one error for the `::`", () => {
    const statement = "local x --[[c]] :: number";
    const col = statement.indexOf("::");
    expect(
      checkLuau(`${statement}\n`).syntaxDiagnostics.map((d) => [d.line, d.column, d.endLine, d.endColumn, d.message]),
    ).toEqual([[0, col, 0, col + 2, "Expected identifier when parsing expression, got '::'"]]);
  });

  test("leaves a cast after an index in the value alone", () => {
    expect(checkLuau("local t = {1}\nlocal x = t[1] :: number\n").syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });
});

describe("a local target followed by a line comment", () => {
  test.each(["local x -- note", "local x -- note\nlocal y = 1", "local x --[[c]]"])("%j leaves no unfinished node", (source) => {
    expect(nodeNames(`${source}\n`)).not.toContain("ERROR_INCOMPLETE");
    expect(checkLuau(`${source}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });
});
