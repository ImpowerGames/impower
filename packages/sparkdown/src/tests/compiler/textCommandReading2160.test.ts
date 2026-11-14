import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { createSparkdownParser } from "../../compiler/utils/createSparkdownParser";
import { TEXT_COMMAND, readStoryTag } from "../../runtime/storyTags";
import { parseSource } from "./grammarSnapshot";
import { treeScopeStackAt, vscodeScopeStacksPerChar } from "./scopeEquality";

const __dirname = dirname(fileURLToPath(import.meta.url));
const grammar = JSON.parse(
  readFileSync(join(__dirname, "../../../language/sparkdown.language-grammar.json"), "utf8"),
);

const BACKSLASH = String.fromCharCode(92);
const WS = "(?:[^\\S\\n\\r])";
const OVERLAPPING_TEXT_COMMAND = `([<](?!${WS}))((?:\\\\.|[^>\\r\\n])*?)((?<![-])[>])`;

const readings = (pattern: string, line: string) => {
  const re = new RegExp(pattern, "g");
  const out: string[] = [];
  for (let m = re.exec(line); m; m = re.exec(line)) {
    out.push(`${m.index}:${m[0]}|${m[2]}|${m[3]}`);
  }
  return out.join(";");
};

describe("TextCommand reads a tag with disjoint alternatives (#2160)", () => {
  test("the player's reader of a tag in an inserted value is the grammar's rule", () => {
    expect(TEXT_COMMAND).toBe(grammar.repository.TextCommand.match);
  });

  test("every line of up to six characters reads as it did with the overlapping rule", () => {
    const alphabet = ["<", ">", BACKSLASH, "-", "a", " ", ":"];
    const differences: { line: string; before: string; after: string }[] = [];
    let lines = [""];
    for (let length = 1; length <= 6; length++) {
      lines = lines.flatMap((line) => alphabet.map((c) => line + c));
      for (const line of lines) {
        const before = readings(OVERLAPPING_TEXT_COMMAND, line);
        const after = readings(TEXT_COMMAND, line);
        if (before !== after && differences.length < 10) differences.push({ line, before, after });
      }
    }
    expect(differences).toEqual([]);
  });

  test("an unclosed tag before many backslash escapes is parsed at once", () => {
    const parse = (n: number) => {
      const line = "One <wait" + (" " + BACKSLASH + "x").repeat(n) + " now";
      const parser = createSparkdownParser("inmemory:///a.sd");
      const t0 = performance.now();
      parser.parse(`scene main\n  ${line}\nend\n`);
      return performance.now() - t0;
    };
    parse(4);
    const ms = Math.min(parse(28), parse(28));
    expect(ms, `28 escapes took ${ms.toFixed(1)} ms`).toBeLessThan(250);
  });

  test("a trailing escaped > still ends a tag that has no other end", () => {
    const line = `Go <wait${BACKSLASH}> now`;
    const source = `scene main\n  ${line}\nend\n`;
    const tree = parseSource(source);
    const at = source.indexOf("<wait");
    const node = tree.resolveInner(at, 1);
    let command: any = node;
    while (command && command.name !== "TextCommand") command = command.parent;
    expect(command && source.slice(command.from, command.to)).toBe(`<wait${BACKSLASH}>`);
    expect(readStoryTag(`wait${BACKSLASH}`)).toEqual({ name: `wait${BACKSLASH}`, known: false, closes: false });
  });
});

describe("a tag never changes the colouring of the text around it (#2145, #193 decision 9)", () => {
  test.each([
    "A <b>word</b> here.",
    "A <color:red>word</color> here.",
    "A <b2>word</b2> here.",
    "NOVA: A <i>word</i> here.",
  ])("%s", async (line) => {
    const source = `scene main\n  ${line}\nend\n`;
    const word = source.indexOf("word");
    const before = source.indexOf("A ");
    const tree = parseSource(source);
    const vscode = await vscodeScopeStacksPerChar(source);
    for (let i = word; i < word + 4; i++) {
      expect(treeScopeStackAt(tree, i)).toEqual(treeScopeStackAt(tree, before));
      expect(vscode[i]).toEqual(vscode[before]);
    }
  });
});
