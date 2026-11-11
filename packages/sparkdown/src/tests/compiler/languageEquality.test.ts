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

const AMPERSAND_AFTER_VALUE = [
  "scene main\n  local a = 0 & a = 2\n  store b = 0 & b = 2\n  a = 0 & a = 2\nend\n",
  "store x = a&b\nHello\n",
  "store x = a & b\nHello\n",
  "local x = a&b\nHello\n",
  "x = a&b\nHello\n",
  "scene s\n  local done = true\n  repeat\n    Hi.\n  until done & done = false\n  Value {done}.\nend\n",
  "repeat\n  Hi.\nuntil a&b\nHello\n",
];

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
  "store x = [1\nHello\n": "[1",
  "Hello {x,1}\nAfter\n": ",1",
  "if x; then\nHello\nend\n": ";",
  "Hello {{x,1}}\nAfter\n": ",1",
  "Hello {{x, 1}}\nAfter\n": ", 1",
  "Hello {x;1}\nAfter\n": ";1",
  "while x; do\nHello\nend\n": ";",
  "for x; do\nHello\nend\n": ";",
  "repeat\n  Hi.\nuntil a, b\nHello\n": ", b",
  "Hello {a&b}\nAfter\n": "&b",
  "Hello {{a & b}}\nAfter\n": "& b",
  "if a & b then\n  Hi.\nend\n": "& b",
  "if x == 1 @@then\n  Hi.\nend\n": "@@",
};

const INCOMPLETE_HEADERS: Record<string, string> = {
  "define Person\n\nend\nHello\n": "Hello",
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

  describe("after a header left incomplete while typing", () => {
    for (const [source, story] of Object.entries(INCOMPLETE_HEADERS)) {
      test(JSON.stringify(source), async () => {
        const { divergences } = await compareLanguages(source);
        expect(divergences, formatLanguageDivergences(source, divergences)).toEqual([]);
        const from = source.indexOf(story);
        expect(treeLanguagesPerPosition(source).slice(from, from + story.length)).toEqual([...story].map(() => STORY));
      });
    }
  });

  describe("an `&` after a value, and a structural word inside a marked rule (I-2038, I-2048)", () => {
    test.each([
      ...AMPERSAND_AFTER_VALUE,
      "Hello {x end}\nAfter\n",
      "Hello {x then}\nAfter\n",
      "Hello {x do}\nAfter\n",
      "Hello {x until}\nAfter\n",
      "Hello {x else}\nAfter\n",
      "Hello {x elseif}\nAfter\n",
      "Hello {{x end}}\nAfter\n",
      "Hello {{x then}}\nAfter\n",
      "Hello {{x do}}\nAfter\n",
      "Hello {{x until}}\nAfter\n",
      "Hello {{x else}}\nAfter\n",
      "Hello {{x elseif}}\nAfter\n",
      "if x do then\n  Hi.\nend\n",
      "if x until then\n  Hi.\nend\n",
      "if x else then\n  Hi.\nend\n",
      "if x elseif then\n  Hi.\nend\n",
      "while x then do\n  Hi.\nend\n",
      "while x until do\n  Hi.\nend\n",
      "while x else do\n  Hi.\nend\n",
      "while x elseif do\n  Hi.\nend\n",
      "for i = 1, x then do\n  Hi.\nend\n",
      "for i = 1, x until do\n  Hi.\nend\n",
      "for i = 1, x else do\n  Hi.\nend\n",
      "for i = 1, x elseif do\n  Hi.\nend\n",
    ])("%j", async (source) => {
      const { divergences } = await compareLanguages(source);
      expect(divergences, formatLanguageDivergences(source, divergences)).toEqual([]);
    });
  });

  describe("an `&` statement after a declaration's, reassignment's or `until` condition's value reads as story at its mark", () => {
    const values = ["0", "a", "1 + 2", "-1", "1 == 2", '"a" .. "b"', "not a", "a and b", "#t", "if a then 1 else 2", "f(1)"];
    const sources = [
      ...AMPERSAND_AFTER_VALUE,
      ...values.flatMap((value) => [
        `scene s\n  local x = ${value} & x = 2\nend\n`,
        `scene s\n  x = ${value} & x = 2\nend\n`,
        `scene s\n  repeat\n    Hi.\n  until ${value} & x = 2\nend\n`,
      ]),
    ];
    for (const source of sources) {
      test(JSON.stringify(source), async () => {
        const { divergences } = await compareLanguages(source);
        expect(divergences, formatLanguageDivergences(source, divergences)).toEqual([]);
        const mark = source.indexOf("&");
        expect(treeLanguagesPerPosition(source).slice(mark, mark + 2)).toEqual([STORY, STORY]);
      });
    }
  });

  test("a keyword glued to a non-ASCII letter stays story text in both", async () => {
    const source = "function名 text\nHello\n";
    const { divergences } = await compareLanguages(source);
    expect(divergences, formatLanguageDivergences(source, divergences)).toEqual([]);
  });

  test("a cursor before a CRLF line break reads the line as before an LF one", () => {
    const lf = "function f()\n  return 1\nend\nHello\n";
    const crlf = lf.replace(/\n/g, "\r\n");
    const ends = (source: string) => [...source.matchAll(/\r?\n/g)].map((m) => m.index!);
    const lfLanguages = treeLanguagesPerPosition(lf);
    const crlfLanguages = treeLanguagesPerPosition(crlf);
    expect(ends(lf).map((p) => lfLanguages[p])).toEqual([STORY, LUAU, LUAU, STORY]);
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
    const parser = new TextmateGrammarParser(withoutLuauMarks("LuauFunctionBody"));
    const { divergences } = await compareLanguages(
      "function f()\n  return 1\nend\n",
      {},
      parser,
    );
    expect(divergences.map((d) => d.lineCol)).toContain("2:0");
    expect(divergences.every((d) => d.vscode === "sparkdown-luau" && d.tree === "sparkdown")).toBe(true);
  });
});
