import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { describe, expect, test } from "vitest";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import {
  compareLanguages,
  formatLanguageDivergences,
  loadGrammarCorpus,
  treeLanguagesPerPosition,
} from "./languageEquality";
import { expectLanguagePin } from "./languagePins";

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

  describe("known differences, each tracked by its ticket", () => {
    test("I-2038: a declaration or reassignment followed by an `&` statement on its line", async () => {
      await expectLanguagePin(
        2038,
        "scene main\n  local a = 0 & a = 2\n  store b = 0 & b = 2\n  a = 0 & a = 2\nend\n",
        ["2:14", "2:16", "3:14", "3:16", "4:8", "4:10"],
      );
    });

    test.each([
      ["store x = a&b\nHello\n", ["1:11", "1:12", "1:13"]],
      ["store x = a & b\nHello\n", ["1:12", "1:14", "1:15"]],
      ["local x = a&b\nHello\n", ["1:11", "1:12", "1:13"]],
      ["x = a&b\nHello\n", ["1:5", "1:6", "1:7"]],
      [
        "scene s\n  local done = true\n  repeat\n    Hi.\n  until done & done = false\n  Value {done}.\nend\n",
        ["5:13", "5:15", "5:16", "5:17", "5:18"],
      ],
      ["repeat\n  Hi.\nuntil a&b\nHello\n", ["3:7", "3:8", "3:9"]],
    ])("I-2038: an `&` after a declaration's, reassignment's or `until` condition's value, %j", async (source, positions) => {
      await expectLanguagePin(2038, source, positions);
    });

    const span = (line: number, from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) => `${line}:${from + i}`);

    test.each([
      ["Hello {x end}\nAfter\n", span(1, 9, 11)],
      ["Hello {x then}\nAfter\n", span(1, 9, 12)],
      ["Hello {x do}\nAfter\n", span(1, 9, 10)],
      ["Hello {x until}\nAfter\n", span(1, 9, 13)],
      ["Hello {x else}\nAfter\n", span(1, 9, 12)],
      ["Hello {x elseif}\nAfter\n", span(1, 9, 14)],
      ["Hello {{x end}}\nAfter\n", span(1, 10, 12)],
      ["Hello {{x then}}\nAfter\n", span(1, 10, 13)],
      ["Hello {{x do}}\nAfter\n", span(1, 10, 11)],
      ["Hello {{x until}}\nAfter\n", span(1, 10, 14)],
      ["Hello {{x else}}\nAfter\n", span(1, 10, 13)],
      ["Hello {{x elseif}}\nAfter\n", span(1, 10, 15)],
      ["if x do then\n  Hi.\nend\n", span(1, 5, 6)],
      ["if x until then\n  Hi.\nend\n", span(1, 5, 9)],
      ["if x else then\n  Hi.\nend\n", span(1, 5, 8)],
      ["if x elseif then\n  Hi.\nend\n", span(1, 5, 10)],
      ["while x then do\n  Hi.\nend\n", span(1, 8, 11)],
      ["while x until do\n  Hi.\nend\n", span(1, 8, 12)],
      ["while x else do\n  Hi.\nend\n", span(1, 8, 11)],
      ["while x elseif do\n  Hi.\nend\n", span(1, 8, 13)],
      ["for i = 1, x then do\n  Hi.\nend\n", span(1, 13, 16)],
      ["for i = 1, x until do\n  Hi.\nend\n", span(1, 13, 17)],
      ["for i = 1, x else do\n  Hi.\nend\n", span(1, 13, 16)],
      ["for i = 1, x elseif do\n  Hi.\nend\n", span(1, 13, 18)],
    ])("I-2048: a structural word inside a marked interpolation, shorthand or condition, %j", async (source, positions) => {
      await expectLanguagePin(2048, source, positions);
    });
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
