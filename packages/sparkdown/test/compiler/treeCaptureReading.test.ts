import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { describe, expect, test } from "vitest";
import { stripAnsi } from "./grammarSnapshot";

const WORD = { match: "[a-z]+", name: "variable.test" };

function dump(
  repository: Record<string, any>,
  source: string,
): string {
  const parser = new TextmateGrammarParser({
    name: "test",
    patterns: [{ include: "#Root" }],
    repository: { Word: WORD, ...repository },
  });
  return stripAnsi(printTree(parser.parse(source), source));
}

describe("tree capture reading", () => {
  test("a begin/end rule with only `captures` uses them for begin and end", () => {
    const tree = dump(
      {
        Root: {
          begin: "(<)",
          end: "(>)",
          patterns: [{ include: "#Word" }],
          captures: { 1: { name: "punctuation.angle.test" } },
        },
      },
      "<a>",
    );
    expect(tree).toMatch(/Root_begin_c1 \[0\.\.1\]: "<"/);
    expect(tree).toMatch(/Root_end \[2\.\.3\]\n\s+└─ Root_\w+_c1 \[2\.\.3\]: ">"/);
  });

  test("beginCaptures and endCaptures take precedence over `captures`", () => {
    const tree = dump(
      {
        Root: {
          begin: "(<)",
          end: "(>)",
          patterns: [{ include: "#Word" }],
          beginCaptures: { 1: { name: "punctuation.open.test" } },
          captures: { 1: { name: "punctuation.angle.test" } },
        },
      },
      "<a>",
    );
    expect(tree).toMatch(/Root_begin_c1 \[0\.\.1\]: "<"/);
    expect(tree).toMatch(/Root_end \[2\.\.3\]\n\s+└─ Root_\w+_c1 \[2\.\.3\]: ">"/);
  });

  test("a capture scans on past a character its patterns cannot read", () => {
    const tree = dump(
      {
        Root: {
          match: "([$]?[a-z]+)",
          captures: { 1: { patterns: [{ include: "#Word" }] } },
        },
      },
      "$c",
    );
    expect(tree).toMatch(/Word \[1\.\.2\]: "c"/);
  });
});
