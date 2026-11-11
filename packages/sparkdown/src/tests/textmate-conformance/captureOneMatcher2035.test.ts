import { MatchRule } from "@impower/textmate-grammar-tree/src/grammar/classes/rules/MatchRule";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { TreeFragment } from "@lezer/common";
import { describe, expect, test } from "vitest";
import SPARKDOWN_GRAMMAR from "../../../language/sparkdown.language-grammar.json";
import { createSparkdownParser } from "../../compiler/utils/createSparkdownParser";
import { treeScopes, vscodeScopes } from "./engineScopes";

const grammar = (
  repository: Record<string, unknown>,
  patterns: unknown[] = [{ include: "#Block" }, { include: "#Word" }, { match: ".|\\n" }],
) => ({
  name: "probe",
  scopeName: "source.probe",
  patterns,
  repository: { Word: { name: "word.probe", match: "[A-Za-z]+" }, ...repository },
});

const captured = (g: any, name = "cap.probe") => ({
  ...g,
  patterns: [
    {
      match: "^-(.+)([;])(.+)$",
      captures: {
        "1": { name, patterns: g.patterns },
        "2": { name: "separator.probe" },
        "3": { name: "tail.probe", patterns: [{ include: "#Word" }, { match: "." }] },
      },
    },
    ...g.patterns,
  ],
});

const cases: [string, any, string][] = [];

for (const throughGroup of [false, true]) {
  for (const last of [false, true]) {
    for (const leaf of [false, true]) {
      const g = grammar(
        {
          Wrapper: { patterns: [{ include: "#Block" }] },
          Block: {
            name: "block.probe",
            begin: leaf ? "<" : "(?=<)",
            end: ">",
            applyEndPatternLast: last,
            patterns: leaf
              ? [{ match: "(?=a)", name: "empty.probe" }, { include: "#Word" }, { match: "." }]
              : [{ include: throughGroup ? "#Wrapper" : "#Block" }, { include: "#Word" }, { match: "." }],
          },
        },
        [{ include: throughGroup ? "#Wrapper" : "#Block" }, { include: "#Word" }, { match: ".|\\n" }],
      );
      cases.push([`stop group=${throughGroup} last=${last} leaf=${leaf}`, g, "<abc> d\nef> g\n"]);
      cases.push([`capture group=${throughGroup} last=${last} leaf=${leaf}`, captured(g), "-<abc> d;tail\n"]);
    }
  }
}

for (const last of [false, true]) {
  const g = grammar({
    Block: {
      name: "block.probe",
      begin: "<",
      end: ">",
      applyEndPatternLast: last,
      patterns: [{ include: "#Inner" }, { include: "#Word" }, { match: "." }],
    },
    Inner: { name: "inner.probe", begin: "\\[", end: "\\]", patterns: [{ include: "#Deep" }, { match: "." }] },
    Deep: { name: "deep.probe", begin: "[{]", end: "[}]", patterns: [{ match: "(?=a)" }, { match: "." }] },
  });
  cases.push([`deep leaf last=${last}`, g, "<x [{abc}] y> z\nw> tail\n"]);
  cases.push([`deep capture leaf last=${last}`, captured(g), "-<x [{abc}] y> z;tail\n"]);
}

const anchor = grammar({
  Block: {
    name: "block.probe",
    begin: "(?:\\G<|(?=<))",
    end: ">",
    patterns: [{ include: "#Block" }, { include: "#Word" }, { match: "." }],
  },
});
cases.push(["anchor changes repeated begin to consuming", anchor, "x<abc> d\n"]);
cases.push(["capture anchor changes repeated begin to consuming", captured(anchor), "-x<abc> d;tail\n"]);

const rootStop = grammar({}, [{ match: "(?=a)", name: "empty.probe" }, { include: "#Word" }, { match: ".|\\n" }]);
cases.push(["capture root non-advancing match ends the capture", captured(rootStop), "-x a b;tail\n"]);
cases.push(["capture whose first match does not advance ends empty", captured(rootStop), "-a;tail\n"]);

const enclosing = {
  name: "probe",
  scopeName: "source.probe",
  patterns: [{ include: "#Block" }, { match: ".|\\n" }],
  repository: {
    Block: {
      name: "block.probe",
      begin: "(?=<)",
      end: ">",
      patterns: [
        { match: "(<)", captures: { "1": { name: "cap.probe", patterns: [{ include: "#Block" }, { match: ".|\\n" }] } } },
        { match: ".|\\n" },
      ],
    },
  },
};
cases.push(["capture sees a rule its enclosing rule opened at the same position", enclosing, "<abc>\n"]);

const depth = (inCapture: boolean) => {
  const repository: Record<string, unknown> = {};
  for (let i = 0; i < 110; i++) {
    repository[`D${i}`] = {
      name: `depth${i}.probe`,
      begin: "(?=a)",
      end: "(?=;)",
      patterns: i === 109 ? [{ match: "a", name: "letter.probe" }] : [{ include: `#D${i + 1}` }],
    };
  }
  return {
    name: "probe",
    scopeName: "source.probe",
    repository,
    patterns: inCapture
      ? [
          { match: "^-(a)(;)$", captures: { "1": { name: "cap.probe", patterns: [{ include: "#D0" }] }, "2": { name: "separator.probe" } } },
          { match: ".|\\n" },
        ]
      : [{ include: "#D0" }, { match: ".|\\n" }],
  };
};
cases.push(["110 nested zero-width scopes", depth(false), "a;\n"]);
cases.push(["110 nested zero-width scopes in a capture", depth(true), "-a;\n"]);

for (const begin of ["<", "(?=<)", "(?:\\G<|(?=<))"]) {
  for (const end of [">", "(?=>)", "(?=<)", "$"]) {
    for (const applyEndPatternLast of [false, true]) {
      const block = { name: "block.probe", begin, end, applyEndPatternLast, patterns: [{ match: ".", name: "inner.probe" }] };
      const label = `begin ${begin} end ${end} last=${applyEndPatternLast}`;
      const inCapture = {
        name: "probe",
        scopeName: "source.probe",
        patterns: [
          {
            match: "^-(.+)(;)(.+)$",
            captures: {
              "1": { name: "cap.probe", patterns: [{ include: "#Block" }, { match: ".", name: "letter.probe" }] },
              "2": { name: "separator.probe" },
              "3": { name: "tail.probe" },
            },
          },
          { match: ".|\\n" },
        ],
        repository: { Block: block },
      };
      cases.push([`capture: ${label}`, inCapture, "-<abc> x;tail\n"]);
      cases.push([`capture on a later line: ${label}`, inCapture, "prefix\n-<abc> x;tail\n"]);
    }
  }
}

cases.push([
  "capture that takes a line break keeps a rule it opened",
  {
    name: "probe",
    scopeName: "source.probe",
    patterns: [
      {
        match: "^(.+\\n)",
        captures: {
          "1": {
            name: "cap.probe",
            patterns: [{ begin: "<", end: ">", name: "block.probe", patterns: [{ match: ".|\\n" }] }, { match: ".|\\n" }],
          },
        },
      },
      { match: ".|\\n" },
    ],
  },
  "<abc\nxyz>\n",
]);

const reuse: any = {
  name: "probe",
  scopeName: "source.probe",
  patterns: [
    {
      match: "^-(.+)(;)(.+)$",
      captures: {
        "1": {
          name: "cap.probe",
          patterns: [
            { match: "\\Gz", name: "anchored.probe" },
            { include: "#Block" },
            { match: "[A-Za-z]+", name: "word.probe" },
            { match: "[0-9]+", name: "num.probe" },
            { match: "." },
          ],
        },
        "2": { name: "separator.probe" },
        "3": { name: "tail.probe", patterns: [{ match: "[A-Za-z]+", name: "word.probe" }, { match: "." }] },
      },
    },
    { match: ".|\\n" },
  ],
  repository: {
    Block: { name: "block.probe", begin: "<", end: ">", patterns: [{ include: "#Block" }, { match: "[A-Za-z]+", name: "word.probe" }, { match: "." }] },
  },
};
const reuseText = "-a1;t\n-1a;t\n-z<a;t\n-az<;t\n-<<b;tail\n-12;t\n-<a>z;t\n";

const treeOf = (parser: TextmateGrammarParser, text: string) => {
  const nodes: string[] = [];
  parser.parse(text).iterate({
    enter(node) {
      nodes.push(`${node.name} ${node.from}-${node.to}`);
    },
  });
  return nodes;
};

describe("capture patterns in the Sparkdown grammar", () => {
  test("a front matter block line holds one string, with nothing empty after its line break", () => {
    const text = "---\ntitle:\n  **_RAFFLES_**\n  ~\n  Episode\ncredit: Written by\n---\n\nHello.\n";
    const strings: string[] = [];
    createSparkdownParser()
      .parse(text)
      .iterate({
        enter(node) {
          if (node.name === "FrontMatterString") strings.push(`${node.from}-${node.to}`);
        },
      });
    expect(strings).toEqual(["10-10", "13-27", "29-31", "33-41", "49-60"]);
  });

  test("text before a chain mark takes the chunk's scope, as in vscode-textmate", async () => {
    const text =
      "  His other hand flips through a familiar LEATHER POCKET NOTEBOOK\\:\n\n  \\    **_March 15th_**   \\\n  \\    **[X] Final edits**  \\\n  \\    **[X] Print pitch packet**   \\\n";
    const g: any = SPARKDOWN_GRAMMAR;
    expect(treeScopes(g, text)).toEqual(await vscodeScopes(structuredClone(g), text));
  });
});

describe("capture patterns run through the line tokenizer", () => {
  test("captures that reuse a tokenizer read only their own line", async () => {
    expect(treeScopes(reuse, reuseText)).toEqual(await vscodeScopes(structuredClone(reuse), reuseText));
  });

  test("a parse after other captures equals a cold parse", () => {
    const cold = treeOf(new TextmateGrammarParser(structuredClone(reuse)), reuseText);
    const warm = new TextmateGrammarParser(structuredClone(reuse));
    treeOf(warm, "-<<<a;tail\n-zzzz9;x\n");
    treeOf(new TextmateGrammarParser(structuredClone(captured(rootStop))), "-a;tail\n-x a b;tail\n");
    expect(treeOf(warm, reuseText)).toEqual(cold);
  });

  test("a parse after a capture abandoned inside an open rule equals a cold parse", () => {
    const text = "-1z;t\n" + reuseText;
    const cold = treeOf(new TextmateGrammarParser(structuredClone(reuse)), text);
    const matchGroups = MatchRule.prototype.matchGroups;
    MatchRule.prototype.matchGroups = function (this: MatchRule, ...args: Parameters<typeof matchGroups>) {
      if (args[0].stack.length > 1 && this.id.endsWith("_end")) {
        throw new Error("abandon the capture");
      }
      return matchGroups.apply(this, args);
    };
    try {
      expect(() => new TextmateGrammarParser(structuredClone(reuse)).parse("-<a;t\n")).toThrow("abandon the capture");
    } finally {
      MatchRule.prototype.matchGroups = matchGroups;
    }
    expect(treeOf(new TextmateGrammarParser(structuredClone(reuse)), text)).toEqual(cold);
  });

  test("a capture abandoned after a begin that took its line break leaves no scope behind", () => {
    const lineCapture: any = {
      name: "probe",
      scopeName: "source.probe",
      patterns: [
        {
          match: "^(.*\\n)",
          captures: {
            "1": {
              name: "cap.probe",
              patterns: [
                { name: "q.probe", begin: "<\\n", end: ">", patterns: [{ match: "." }] },
                { match: "\\Gz", name: "anchored.probe" },
                { match: "[A-Za-z]+", name: "word.probe" },
                { match: ".|\\n" },
              ],
            },
          },
        },
      ],
    };
    const text = "z\nzz\n";
    const cold = treeOf(new TextmateGrammarParser(structuredClone(lineCapture)), text);
    const matchGroups = MatchRule.prototype.matchGroups;
    MatchRule.prototype.matchGroups = function (this: MatchRule, ...args: Parameters<typeof matchGroups>) {
      if (args[0].stack.length > 1 && this.id.endsWith("_end")) {
        throw new Error("abandon the capture");
      }
      return matchGroups.apply(this, args);
    };
    try {
      expect(() => new TextmateGrammarParser(structuredClone(lineCapture)).parse("<\n>\n")).toThrow("abandon the capture");
    } finally {
      MatchRule.prototype.matchGroups = matchGroups;
    }
    expect(treeOf(new TextmateGrammarParser(structuredClone(lineCapture)), text)).toEqual(cold);
  });

  test("an incremental parse through captures equals a cold parse", () => {
    const base = "-a1;t\n".repeat(40) + reuseText.repeat(20);
    const at = base.indexOf("-z<a;t") + 3;
    const edited = base.slice(0, at) + "<q" + base.slice(at);
    const parser = new TextmateGrammarParser(structuredClone(reuse));
    const before = parser.parse(base);
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(before), [{ fromA: at, toA: at, fromB: at, toB: at + 2 }]);
    const nodes = (tree: ReturnType<typeof parser.parse>) => {
      const out: string[] = [];
      tree.iterate({
        enter(node) {
          out.push(`${node.name} ${node.from}-${node.to}`);
        },
      });
      return out;
    };
    const warm = nodes(parser.parse(edited, fragments));
    expect(warm).toEqual(nodes(new TextmateGrammarParser(structuredClone(reuse)).parse(edited)));
  });

  test.each(cases)("%s", async (_label, g, text) => {
    const expected = await vscodeScopes(structuredClone(g), text);
    expect(treeScopes(g, text)).toEqual(expected);
  });

  test("a capture matches each end once however deeply end captures nest", async () => {
    const levels = 8;
    const repository: Record<string, unknown> = {};
    for (let i = 0; i < levels; i++) {
      repository[`D${i}`] = {
        name: `level${i}.probe`,
        begin: "(?=a)",
        end: "(a)",
        endCaptures: {
          "1": i + 1 < levels ? { name: `end${i}.probe`, patterns: [{ include: `#D${i + 1}` }] } : { name: `end${i}.probe` },
        },
        patterns: [{ match: "." }],
      };
    }
    const g = {
      name: "probe",
      scopeName: "source.probe",
      repository,
      patterns: [
        { match: "^-(a)", captures: { "1": { name: "cap.probe", patterns: [{ include: "#D0" }] } } },
        { match: ".|\\n" },
      ],
    };
    const expected = await vscodeScopes(structuredClone(g), "-a\n");
    let endMatches = 0;
    const matchGroups = MatchRule.prototype.matchGroups;
    MatchRule.prototype.matchGroups = function (this: MatchRule, ...args: Parameters<typeof matchGroups>) {
      if (this.id.endsWith("_end")) endMatches++;
      return matchGroups.apply(this, args);
    };
    try {
      expect(treeScopes(g, "-a\n")).toEqual(expected);
    } finally {
      MatchRule.prototype.matchGroups = matchGroups;
    }
    expect(endMatches).toBeLessThanOrEqual(2 * levels);
  });

  test.each([
    ["-x a b;tail\n"],
    ["-a;tail\n"],
  ])("a capture stopped by a match that does not advance holds no empty match nodes: %j", (text) => {
    const parser = new TextmateGrammarParser(structuredClone(captured(rootStop)));
    const emptyIds = new Set(
      (parser as any).grammar.nodes
        .filter((node: any) => node?.props?.name === "empty.probe") // not a node name
        .map((node: any) => node.typeIndex),
    );
    let count = 0;
    parser.parse(text).iterate({
      enter(node) {
        if (emptyIds.has(node.type.id)) count++;
      },
    });
    expect(count).toBe(0);
  });
});
