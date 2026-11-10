import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { describe, expect, test } from "vitest";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import {
  compareLanguages,
  formatLanguageDivergences,
  loadGrammarCorpus,
} from "./languageEquality";

const FIXTURES = loadGrammarCorpus();

function withoutLuauMarks(ruleName: string) {
  const grammar = structuredClone(GRAMMAR_DEFINITION) as any;
  const unmark = (node: any) => {
    for (const field of ["name", "contentName"]) {
      if (typeof node[field] === "string" && node[field].includes("meta.embedded.")) {
        delete node[field];
      }
    }
  };
  const rule = grammar.repository[ruleName];
  unmark(rule);
  for (const capture of Object.values(rule.endCaptures ?? {})) unmark(capture);
  return grammar;
}

describe("language at every character: vscode-textmate and the tree reader agree", () => {
  for (const luauFile of [false, true]) {
    describe(luauFile ? ".luau root" : ".sd root", () => {
      for (const fixture of FIXTURES) {
        test(fixture.name, async () => {
          const { source, divergences } = await compareLanguages(fixture.source, { luauFile });
          expect(divergences, formatLanguageDivergences(source, divergences)).toEqual([]);
        });
      }
    });
  }

  test("a reader whose grammar lost the function body mark disagrees with vscode-textmate", async () => {
    const parser = new TextmateGrammarParser(withoutLuauMarks("LuauFunctionDefinition"));
    const { divergences } = await compareLanguages(
      "function f()\n  return 1\nend\n",
      {},
      parser,
    );
    expect(divergences.map((d) => d.lineCol)).toContain("2:0");
    expect(divergences.every((d) => d.vscode === "sparkdown-luau" && d.tree === "sparkdown")).toBe(true);
  });
});
