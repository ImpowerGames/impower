import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dumpTree, stripAnsi } from "./grammarSnapshot";
import { formatTokens, tokenize } from "./vscodeGrammarSnapshot";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..", "..", "..");
const NAMES_DIR = join(HERE, "__snapshots__", "grammar", "names");
const YAML_SOURCES = ["sparkdown.language-grammar.yaml", "sparkdown-luau.language-grammar.yaml"].map((file) =>
  join(ROOT, "definitions", "yaml", file),
);
const GENERATED = ["packages/sparkdown/language", "vscode-sparkdown/language"].flatMap((dir) =>
  ["sparkdown.language-grammar.json", "sparkdown-luau.language-grammar.json"].map((file) => join(ROOT, dir, file)),
);
const WORD_BOUNDARY = String.raw`\b`;
const NAME_BEHIND_SOURCE = String.raw`(?:[a-zA-Z_][a-zA-Z0-9_]*{{LUAU_NAME_AT_PART}}*\b)`;
const NAME_BEHIND_EXPANDED = String.raw`[a-zA-Z_][a-zA-Z0-9_]*(?:@[a-zA-Z0-9_]+)*\b`;

const patternStrings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => patternStrings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => patternStrings(item, out));
  return out;
};

const boundaries = (text: string, allowed: string): number => {
  const all = text.split(WORD_BOUNDARY).length - 1;
  const named = text.split(allowed).length - 1;
  return all - named;
};

const withUnderscores = (source: string) => source.replace(/([\p{L}\p{N}_])@(?=[\p{L}\p{N}_])/gu, "$1_");
const shape = (dump: string) => dump.replace(/: ".*$/gm, "");

describe("an @ joins a name in both grammar engines (#2109)", () => {
  it("leaves no word boundary in a grammar source but the name-end of LUAU_NAME_BEHIND", () => {
    const found = YAML_SOURCES.map((path) => {
      const code = readFileSync(path, "utf8")
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("#"))
        .join("\n");
      return boundaries(code, NAME_BEHIND_SOURCE);
    });
    expect(found).toEqual([0, 0]);
  });

  it("generates no word boundary in a rule but the name-end of LUAU_NAME_BEHIND", () => {
    const found = GENERATED.map((path) => {
      const grammar = JSON.parse(readFileSync(path, "utf8"));
      const rules = patternStrings([grammar.patterns, grammar.repository]).join("\n");
      return boundaries(rules, NAME_BEHIND_EXPANDED);
    });
    expect(found).toEqual([0, 0, 0, 0]);
  });

  it.each(["while c) x@end style card {}", "for i = 1) x@end style card {}", "for k in t) x@end style card {}"])(
    "reads `%s` in a .luau file as it reads the same line with the @ an _",
    async (line) => {
      const source = `${line}\nlocal after = 1\n`;
      const read = async (text: string) => shape(formatTokens(await tokenize(text, { luauFile: true })));
      expect(await read(source)).toBe(await read(withUnderscores(source)));
    },
  );

  const fixtures = readdirSync(NAMES_DIR).filter((file) => file.endsWith(".sd"));

  it.each(fixtures)("reads %s as it reads the same script with each @ an _", async (file) => {
    const source = readFileSync(join(NAMES_DIR, file), "utf8");
    const underscored = withUnderscores(source);
    expect(underscored).not.toBe(source);
    expect(shape(stripAnsi(dumpTree(source)))).toBe(shape(stripAnsi(dumpTree(underscored))));
    expect(shape(formatTokens(await tokenize(source)))).toBe(shape(formatTokens(await tokenize(underscored))));
  });
});
