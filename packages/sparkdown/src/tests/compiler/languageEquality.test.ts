import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { describe, expect, test } from "vitest";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import {
  compareLanguages,
  formatLanguageDivergences,
  loadGrammarCorpus,
  treeLanguagesPerPosition,
} from "./languageEquality";

const FIXTURES = loadGrammarCorpus();

const LUAU = "sparkdown-luau";
const STORY = "sparkdown";

const AT_DOCUMENT_END: Record<string, string> = {
  "function f()\n  return 1": LUAU,
  "function f()\n": LUAU,
  "store x = {\n  a = 1": LUAU,
  "store x = 1": LUAU,
  "function f()\n  return 1\nend": LUAU,
  "function f()\n  return 1\nend\n": STORY,
  "Hello.\n": STORY,
  "": STORY,
};

const UNREADABLE: Record<string, string> = {
  "store x = !1\n": "!1",
  "local x = !1\n": "!1",
  "x = !1\n": "!1",
  "if x! then\n  Hello\nend\n": "!",
  "while x$ do\n  Hello\nend\n": "$",
  "repeat\n  Hello\nuntil x?\n": "?",
  "store x = name名 + 1\n": "名",
  "local x名 = 1\n": "名 = 1",
  "& x = @@1\n": "@@1",
  "function f()\n  local x = 1 + y名\nend\n": "名",
  "store x = ~1\n": "~1",
  "Hello {|1}\n": "|1",
};

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

describe("language at every cursor position: vscode-textmate and the tree reader agree", () => {
  describe("at the end of a line and of the document", () => {
    for (const [source, language] of Object.entries(AT_DOCUMENT_END)) {
      test(JSON.stringify(source), async () => {
        const { divergences } = await compareLanguages(source);
        expect(divergences, formatLanguageDivergences(source, divergences)).toEqual([]);
        expect(treeLanguagesPerPosition(source)[source.length]).toBe(language);
      });
    }
  });

  describe("known differences, each tracked by its ticket", () => {
    test("I-2038: a declaration or reassignment followed by an `&` statement on its line", async () => {
      const { divergences } = await compareLanguages(
        "scene main\n  local a = 0 & a = 2\n  store b = 0 & b = 2\n  a = 0 & a = 2\nend\n",
      );
      expect(divergences.map((d) => d.lineCol)).toEqual(["2:14", "2:16", "3:14", "3:16", "4:8", "4:10"]);
    });

    test.each([
      ["an unclosed `[` in a declaration", "store x = [1\nHello\n", ["1:10", "1:11", "1:12"]],
      ["a `,` in an interpolation", "Hello {x,1}\nAfter\n", ["1:8", "1:9"]],
      ["a `;` in a narrative condition", "if x; then\nHello\nend\n", ["1:4"]],
      ["a define header without `with`", "define Person\n\nend\nHello\n", ["4:0", "4:1", "4:2", "4:3", "4:4", "4:5", "5:0"]],
    ])("I-2043: %s closes the rule incomplete only in the tree", async (_name, source, positions) => {
      const { divergences } = await compareLanguages(source);
      expect(divergences.map((d) => d.lineCol)).toEqual(positions);
    });

    test("I-2037: a keyword glued to a non-ASCII letter opens a Luau rule only in the tree", async () => {
      const { divergences } = await compareLanguages("function名 text\nHello\n");
      expect(divergences).toHaveLength(14);
      expect(divergences.every((d) => d.vscode === STORY && d.tree === LUAU)).toBe(true);
    });
  });

  test("a cursor before a CRLF line break reads the line as before an LF one", () => {
    const lf = "function f()\n  return 1\nend\nHello\n";
    const crlf = lf.replace(/\n/g, "\r\n");
    const ends = (source: string) => [...source.matchAll(/\r?\n/g)].map((m) => m.index!);
    const lfLanguages = treeLanguagesPerPosition(lf);
    const crlfLanguages = treeLanguagesPerPosition(crlf);
    expect(ends(lf).map((p) => lfLanguages[p])).toEqual([LUAU, LUAU, LUAU, STORY]);
    expect(ends(crlf).map((p) => crlfLanguages[p])).toEqual(ends(lf).map((p) => lfLanguages[p]));
  });

  describe("past a character Luau never reads, inside a Luau region", () => {
    for (const [source, rest] of Object.entries(UNREADABLE)) {
      test(JSON.stringify(source), async () => {
        const { divergences } = await compareLanguages(source);
        expect(divergences, formatLanguageDivergences(source, divergences)).toEqual([]);
        const from = source.indexOf(rest);
        const languages = treeLanguagesPerPosition(source).slice(from, from + rest.length);
        expect(languages).toEqual([...rest].map(() => LUAU));
      });
    }
  });

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
