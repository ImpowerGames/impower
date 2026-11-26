import { describe, expect, test } from "vitest";
import { treeLanguagesPerPosition, vscodeLanguagesPerPosition } from "./languageEquality";

const STORY = "sparkdown";
const LUAU = "sparkdown-luau";

const SOURCE = [
  'store player = { name = "Hero" }',
  "",
  "function greet(name)",
  '  local greeting = "Hello, "',
  "  return greeting .. name",
  "end",
  "",
  "scene start()",
  "  Hello {greet(player.name)}!",
  '  & player.name = "Nova"',
  '  if player.name == "Nova" then',
  "    What should I do",
  "  end",
  "end",
  "",
].join("\n");

const LINES = SOURCE.split("\n");

const lineStart = (line: number) =>
  LINES.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0);

const at = (line: number, find: string | number): number => {
  const column = typeof find === "number" ? find : LINES[line - 1]!.indexOf(find);
  if (column < 0) throw new Error(`${JSON.stringify(find)} is not on line ${line}`);
  return lineStart(line) + column;
};

const wholeLines = (from: number, to: number): number[] => {
  const offsets: number[] = [];
  for (let line = from; line <= to; line++) {
    for (let c = 0; c < LINES[line - 1]!.length; c++) offsets.push(lineStart(line) + c);
  }
  return offsets;
};

const ROWS: { cursor: string; offsets: number[]; language: string }[] = [
  { cursor: "line 1, first column (store)", offsets: [at(1, 0)], language: STORY },
  { cursor: "line 1, inside the table", offsets: [at(1, "name ="), at(1, '"Hero"')], language: LUAU },
  { cursor: "line 3, first column (function)", offsets: [at(3, 0)], language: STORY },
  { cursor: "lines 4 to 6, the body and its end", offsets: wholeLines(4, 6), language: LUAU },
  { cursor: "line 9, first column", offsets: [at(9, 0)], language: STORY },
  { cursor: "line 9, on Hello", offsets: [at(9, "Hello")], language: STORY },
  { cursor: "line 9, inside {…}", offsets: [at(9, "greet"), at(9, "player.name")], language: LUAU },
  { cursor: "line 10, first column", offsets: [at(10, 0), at(10, "&")], language: STORY },
  { cursor: "line 10, after &", offsets: [at(10, "player"), at(10, '"Nova"')], language: LUAU },
  { cursor: "line 11, first column (if)", offsets: [at(11, 0), at(11, "if")], language: STORY },
  { cursor: "line 11, in the condition", offsets: [at(11, "player"), at(11, "==")], language: LUAU },
  { cursor: "lines 12 and 13", offsets: wholeLines(12, 13), language: STORY },
];

describe("language at each position of the #2019 table", () => {
  for (const engine of ["tree reader", "vscode-textmate"] as const) {
    describe(engine, () => {
      for (const row of ROWS) {
        test(row.cursor, async () => {
          const languages =
            engine === "tree reader"
              ? treeLanguagesPerPosition(SOURCE)
              : await vscodeLanguagesPerPosition(SOURCE);
          expect(row.offsets.map((offset) => languages[offset])).toEqual(
            row.offsets.map(() => row.language),
          );
        });
      }
    });
  }
});
