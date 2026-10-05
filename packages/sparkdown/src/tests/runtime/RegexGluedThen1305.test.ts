import { expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";
import { compareEnginesFull } from "../compiler/scopeEquality";

const expressions = [
  ["direct glued", "if @/x/githen 1 else 2", "1 1"],
  ["direct spaced", "if @/x/gi then 1 else 2", "1 1"],
  ["nested glued", "if if c then false else @/x/githen 1 else 2", "2 1"],
  ["nested spaced", "if if c then false else @/x/gi then 1 else 2", "2 1"],
] as const;

function source(expression: string) {
  return `Result {f(true)} {f(false)}.\nfunction f(c)\n  local s = ${expression}\n  return s\nend\ndone\n`;
}

test.each(expressions)("%s executes both expected arms", (_name, expression, values) => {
  const runtime = makeRuntimeStoryFromSource(source(expression));
  // Keep diagnostic and execution evidence independent when the base fails.
  expect.soft(runtime.errorMessages).toEqual([]);
  expect(runtime.story.ContinueMaximally()).toBe(`Result ${values}.\n`);
});

test.each(expressions)("%s keeps TextMate/Oniguruma and spark-morph grammar scopes aligned", async (_name, expression) => {
  expect((await compareEnginesFull(source(expression))).divergences).toEqual([]);
});
