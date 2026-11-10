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
