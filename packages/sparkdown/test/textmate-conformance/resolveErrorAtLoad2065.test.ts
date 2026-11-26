import { vscodeLanguage } from "@impower/codemirror-vscode-language/src/extensions/vscodeLanguage";
import { GrammarRegistry } from "@impower/textmate-grammar-tree/src/grammar/classes/GrammarRegistry";
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

});

describe("an unsupported while rule is deferred to the parse whose text begins it (I-2065)", () => {
  const whileRule = { begin: "x", while: "x", patterns: [] };
  const a = { match: "a", name: "a" };

  test.each<[string, object, object[], string, string | null]>([
    ["in the grammar's root patterns", { scopeName: "source.probe", patterns: [a, whileRule] }, [], "a a", "a x"],
    [
      "in a top-level repository rule no include reaches",
      { scopeName: "source.probe", patterns: [a], repository: { never: whileRule } },
      [],
      "a x",
      null,
    ],
    [
      "in a scoped rule's patterns",
      { scopeName: "source.probe", patterns: [a, block([whileRule])] },
      [],
      "a {a} x",
      "a {x}",
    ],
    [
      "as a capture, whose begin vscode-textmate ignores",
      { scopeName: "source.probe", patterns: [a, { match: "b(x)", captures: { "1": whileRule } }] },
      [],
      "a bx",
      null,
    ],
    [
      "in an embedded grammar's root patterns",
      { scopeName: "source.host", patterns: [{ include: "source.guest" }] },
      [{ scopeName: "source.guest", patterns: [a, whileRule] }],
      "a a",
      "a x",
    ],
  ])("%s loads, parses text that does not begin it and fails the parse that does", (_, grammar, others, quiet, reaching) => {
    const parser = new TextmateGrammarParser(
      others.length ? new GrammarRegistry([grammar, ...others] as any) : (grammar as any),
    );
    expect(() => parser.parse(quiet)).not.toThrow();
    if (reaching) {
      expect(() => parser.parse(reaching)).toThrow(/^while rules are not currently supported/);
    }
  });
});
