import { MatchRule } from "@impower/textmate-grammar-tree/src/grammar/classes/rules/MatchRule";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { describe, expect, test } from "vitest";
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

describe("capture patterns run through the line tokenizer", () => {
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
        .filter((node: any) => node?.props?.name === "empty.probe")
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
