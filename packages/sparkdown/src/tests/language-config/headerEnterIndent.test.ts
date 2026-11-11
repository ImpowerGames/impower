import { describe, expect, it } from "vitest";
import LUAU_LANGUAGE_CONFIG from "../../../language/sparkdown-luau.language-config.json";
import STORY_LANGUAGE_CONFIG from "../../../language/sparkdown.language-config.json";
import {
  treeLanguagesPerPosition,
  vscodeLanguagesPerPosition,
} from "../compiler/languageEquality";

interface Config {
  brackets: [open: string, close: string][];
  onEnterRules: { beforeText: string; afterText?: string; previousLineText?: string; action: { indent: string } }[];
  indentationRules: { increaseIndentPattern: string };
}

const CONFIGS: Record<string, Config> = {
  sparkdown: STORY_LANGUAGE_CONFIG as unknown as Config,
  "sparkdown-luau": LUAU_LANGUAGE_CONFIG as unknown as Config,
};

const DOCUMENT_LANGUAGE = "sparkdown";

function enterIndents(source: string, line: number, languages: string[]): boolean {
  const lines = source.split("\n");
  const lineStart = (n: number) => lines.slice(0, n - 1).reduce((sum, text) => sum + text.length + 1, 0);
  const start = lineStart(line);
  const text = lines[line - 1]!;
  const at = (column: number) => languages[start + column]!;
  const language = at(text.length);
  let runStart = text.length - 1;
  while (runStart > 0 && at(runStart - 1) === language) runStart--;
  const scoped = runStart > 0 && at(0) !== language;
  const beforeText = scoped ? text.slice(runStart) : text;
  const rule = CONFIGS[language]!.onEnterRules.find(
    (r) =>
      r.previousLineText === undefined &&
      new RegExp(r.beforeText, "u").test(beforeText) &&
      (r.afterText === undefined || new RegExp(r.afterText, "u").test("")),
  );
  if (rule) {
    return rule.action.indent === "indent" || rule.action.indent === "indentOutdent";
  }
  if (CONFIGS[language]!.brackets.some(([open]) => beforeText.trimEnd().endsWith(open))) return true;
  const next = line < lines.length ? lineStart(line + 1) : start;
  if (languages[next] !== at(0)) return false;
  return new RegExp(CONFIGS[DOCUMENT_LANGUAGE]!.indentationRules.increaseIndentPattern).test(beforeText);
}

const TOP_LEVEL = [
  "scene name",
  "branch name",
  "define Hero with",
  "define companion as character with",
  "define Hero",
  "function f()",
  "local function f(a, b)",
  "function f(callback: () -> ())",
  "define Hero as Actor as Character with",
];

const BRACE = [
  "layout sheet {",
  "style list {",
  "component card(title) {",
  "screen hud {",
  "animation fade {",
  "theme label {",
  "morph blink {",
];

const NARRATIVE = ["if x then", "for i = 1, 3 do", "while x do"];

const closeOf = (header: string) => (header.endsWith("{") ? "}" : "end");
const bodyOf = (header: string) =>
  header.endsWith("{") ? "  color = red" : header.startsWith("scene") || header.startsWith("branch") ? "  Hello." : header.startsWith("define") ? "  x = 1" : "  return 1";

const CASES: [label: string, source: string, line: number][] = [
  ...[...TOP_LEVEL, ...BRACE].flatMap((header): [string, string, number][] => [
    [`\`${header}\` with its close directly below`, `${header}\n${closeOf(header)}\n`, 1],
    [`\`${header}\` with a body line directly below`, `${header}\n${bodyOf(header)}\n${closeOf(header)}\n`, 1],
    [`\`${header}\` as the document's last line`, `scene s\n  Hello.\nend\n${header}`, 4],
  ]),
  ...NARRATIVE.flatMap((header): [string, string, number][] => [
    [`\`${header}\` with its end directly below`, `scene s\n  ${header}\n  end\nend\n`, 2],
    [`\`${header}\` with a body line directly below`, `scene s\n  ${header}\n    Hello.\n  end\nend\n`, 2],
  ]),
];

const PROSE: [line: string, source: string, row: number][] = [
  ["What should I do", "scene s\n  What should I do\n  Then.\nend\n", 2],
  ["We reached a new branch", "scene s\n  We reached a new branch\nend\n", 2],
  ["  if a then", "function f()\n  if a then\nscene s\n  Hello.\nend\n", 2],
];

describe("Enter at the end of a line, read as VS Code reads it: Enter rules by the cursor's language, then indentation only when the next line starts in the same language", () => {
  describe.each([
    ["vscode-textmate", vscodeLanguagesPerPosition],
    ["the tree's language reader", async (source: string) => treeLanguagesPerPosition(source)],
  ])("%s", (_engine, languagesOf) => {
    it.each(CASES)("indents after %s", async (_label, source, line) => {
      expect(enterIndents(source, line, await languagesOf(source))).toBe(true);
    });

    it.each(PROSE)("keeps the indentation after `%s`", async (_line, source, row) => {
      expect(enterIndents(source, row, await languagesOf(source))).toBe(false);
    });
  });
});
