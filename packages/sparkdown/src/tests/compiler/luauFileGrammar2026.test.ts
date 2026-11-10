import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { type Tree } from "@lezer/common";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { createSparkdownParser } from "../../compiler/utils/createSparkdownParser";
import { sparkdownGrammarFor } from "../../compiler/utils/sparkdownGrammarFor";

const TESTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const LUAU_FIXTURES = (readdirSync(TESTS_DIR, { recursive: true }) as string[])
  .filter((file) => file.endsWith(".luau"))
  .sort();

const ROOT_SWAPPED = new TextmateGrammarParser({
  ...GRAMMAR_DEFINITION,
  patterns: [{ include: `#${GRAMMAR_DEFINITION.luauFile.rule}` }],
});

const LUAU_FILE_PARSER = createSparkdownParser("inmemory:///fixture.luau");

const nodesOf = (tree: Tree) => {
  const nodes: string[] = [];
  tree.iterate({ enter: (node) => void nodes.push(`${node.name} ${node.from}-${node.to}`) });
  return nodes;
};

describe("a .luau document is read through sparkdown-luau.language-grammar.json (I-2026)", () => {
  test("the .luau root is the Luau grammar file, not a rewritten Sparkdown root", () => {
    const grammar = sparkdownGrammarFor("inmemory:///fixture.luau");
    expect("start" in grammar && grammar.start.scopeName).toBe("source.sparkdown.luau");
    expect(sparkdownGrammarFor("inmemory:///main.sd")).toBe(GRAMMAR_DEFINITION);
  });

  test("the fixtures are found", () => {
    expect(LUAU_FIXTURES.length).toBeGreaterThan(50);
  });

  test.each(LUAU_FIXTURES)("%s parses to the tree of the rewritten root", (file) => {
    const text = readFileSync(join(TESTS_DIR, file), "utf8");
    expect(nodesOf(LUAU_FILE_PARSER.parse(text))).toEqual(nodesOf(ROOT_SWAPPED.parse(text)));
  });
});
