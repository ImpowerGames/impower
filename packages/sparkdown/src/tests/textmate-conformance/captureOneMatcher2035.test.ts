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

describe("capture patterns run through the line tokenizer", () => {
  test.each(cases)("%s", async (_label, g, text) => {
    const expected = await vscodeScopes(structuredClone(g), text);
    expect(treeScopes(g, text)).toEqual(expected);
  });
});
