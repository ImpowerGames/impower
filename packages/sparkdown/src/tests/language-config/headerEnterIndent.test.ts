import { describe, expect, it } from "vitest";
import LUAU_LANGUAGE_CONFIG from "../../../language/sparkdown-luau.language-config.json";
import STORY_LANGUAGE_CONFIG from "../../../language/sparkdown.language-config.json";
import {
  treeLanguagesPerPosition,
  vscodeLanguagesPerPosition,
} from "../compiler/languageEquality";

const INCREASE: Record<string, RegExp> = {
  sparkdown: new RegExp(STORY_LANGUAGE_CONFIG.indentationRules.increaseIndentPattern),
  "sparkdown-luau": new RegExp(LUAU_LANGUAGE_CONFIG.indentationRules.increaseIndentPattern),
};

function enterIndents(source: string, line: number, languages: string[]): boolean {
  const lines = source.split("\n");
  const start = lines.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0);
  const text = lines[line - 1]!;
  const at = (column: number) => languages[start + column]!;
  const language = at(text.length);
  let runStart = text.length - 1;
  while (runStart > 0 && at(runStart - 1) === language) runStart--;
  const scoped = runStart > 0 && at(0) !== language;
  return INCREASE[language]!.test(scoped ? text.slice(runStart) : text);
}

const HEADERS: [header: string, source: string, line: number][] = [
  ["scene name", "scene name\n  Hello\nend\n", 1],
  ["branch name", "branch name\n  Hello\nend\n", 1],
  ["define Hero with", "define Hero with\n  x = 1\nend\n", 1],
  ["define companion as character with", "define companion as character with\n  x = 1\nend\n", 1],
  ["define Hero", "define Hero\nend\n", 1],
  ["function f()", "function f()\nend\n", 1],
  ["function f(a: number): number", "function f(a: number): number\n  return a\nend\n", 1],
  ["local function f(a, b)", "local function f(a, b)\nend\n", 1],
  ["layout sheet {", "layout sheet {\n}\n", 1],
  ["style list {", "style list {\n}\n", 1],
  ["component card(title) {", "component card(title) {\n}\n", 1],
  ["screen hud {", "screen hud {\n}\n", 1],
  ["animation fade {", "animation fade {\n}\n", 1],
  ["theme label {", "theme label {\n}\n", 1],
  ["morph blink {", "morph blink {\n}\n", 1],
  ["if x then", "scene s\n  if x then\n    Hi\n  end\nend\n", 2],
  ["for i = 1, 3 do", "scene s\n  for i = 1, 3 do\n    Hi\n  end\nend\n", 2],
  ["while x do", "scene s\n  while x do\n    Hi\n  end\nend\n", 2],
];

describe("Enter at the end of a line, read as VS Code reads the language there", () => {
  describe.each([
    ["vscode-textmate", vscodeLanguagesPerPosition],
    ["the tree's language reader", async (source: string) => treeLanguagesPerPosition(source)],
  ])("%s", (_engine, languagesOf) => {
    it.each(HEADERS)("indents after `%s`", async (_header, source, line) => {
      expect(enterIndents(source, line, await languagesOf(source))).toBe(true);
    });
  });
});
