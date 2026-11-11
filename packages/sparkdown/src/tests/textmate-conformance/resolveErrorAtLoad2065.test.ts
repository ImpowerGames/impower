import { vscodeLanguage } from "@impower/codemirror-vscode-language/src/extensions/vscodeLanguage";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { describe, expect, test } from "vitest";

const badTag = { match: "[a-z]+", tag: "(/Block_content/) keyword" };

const block = (patterns: object[]) => ({ name: "Outer", begin: "[{]", end: "[}]", patterns });

const load = (grammar: object) => vscodeLanguage({ name: "x", grammar: grammar as any }).language.parser;

describe("a grammar error deeper than $self surfaces where the grammar is loaded (I-2065)", () => {
  test.each([
    [
      "through resolveAll, in a repository rule's patterns",
      { scopeName: "source.probe", patterns: [{ include: "#outer" }], repository: { outer: block([badTag]) } },
    ],
    [
      "through bind, in a rule-level repository",
      {
        scopeName: "source.probe",
        patterns: [{ repository: { Inner: block([badTag]) }, patterns: [{ include: "#Inner" }] }],
      },
    ],
  ])("%s", (_, grammar) => {
    expect(() => load(grammar)).toThrow(/^Invalid tag modifier in /);
  });
});

describe("a pattern the matcher cannot compile is deferred to the parse that reaches it (I-2065)", () => {
  const grammar = {
    scopeName: "source.probe",
    patterns: [{ match: "a", name: "a" }, { include: "#outer" }],
    repository: { outer: block([{ name: "Bad", match: "(?<=a)(?!b" }]) },
  };

  test("an unreached rule loads and the grammar parses text that does not reach it", () => {
    const parser = new TextmateGrammarParser(grammar as any);
    expect(() => parser.parse("a")).not.toThrow();
  });

  test("a reached rule fails at the parse", () => {
    const parser = new TextmateGrammarParser(grammar as any);
    expect(() => parser.parse("{ x }")).toThrow("Invalid RegExp: (?<=a)(?!b");
  });

  test("an unsupported while rule no text reaches still loads", () => {
    const withWhile = {
      scopeName: "source.probe",
      patterns: [{ match: "a", name: "a" }, block([{ begin: "x", while: "x", patterns: [] }])],
    };
    expect(() => new TextmateGrammarParser(withWhile as any).parse("a")).not.toThrow();
  });
});
