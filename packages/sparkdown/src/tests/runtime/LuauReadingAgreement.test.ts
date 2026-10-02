// Where the compiler used to re-derive Luau's structure from the syntax tree
// and read it differently from Luau, it now lowers the AST the type checker
// reads (#1287), so the story runs what Luau reads.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function run(source: string) {
  const ctx = makeRuntimeStoryFromSource(source);
  const errors = [...ctx.errorMessages];
  ctx.story.onError = (m: string) => errors.push(m);
  return { errors, text: ctx.story.ContinueMaximally() };
}

describe("a return list continued on the next line", () => {
  test("returns every value, as Luau reads it", () => {
    const { errors, text } = run(
      "Value {g()}.\n" +
        "function f()\n  local a, b = 1, 2\n  return a,\n    b\nend\n" +
        "function g()\n  local x, y = f()\n  return tostring(x) .. tostring(y)\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Value 12.\n");
  });
});

describe("a regex literal as a define value", () => {
  test("reaches the struct registry as the string it lowers to, with or without parentheses", () => {
    const compiler = new SparkdownCompiler();
    const uri = "inmemory:///main.sd";
    compiler.configure({
      files: [
        {
          uri,
          type: "script",
          name: "main",
          ext: "sd",
          text: "define Thing with\n  plain = @/ab+c/i\n  grouped = @/(ab)+c/\nend\n",
          version: 1,
          languageId: "sparkdown",
        },
      ],
    });
    const program: any = compiler.compile({ textDocument: { uri } }).program;
    const thing = program.context?.Thing?.$default;
    expect(thing?.plain).toBe("/ab+c/i");
    expect(thing?.grouped).toBe("/(ab)+c/");
  });
});
