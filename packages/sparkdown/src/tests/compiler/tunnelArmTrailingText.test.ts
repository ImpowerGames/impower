import { describe, expect, test } from "vitest";
import { parseSource } from "./grammarSnapshot";
import {
  compareEnginesFull,
  formatDivergences,
  treeScopeStackAt,
  vscodeScopeStacksPerChar,
} from "./scopeEquality";

const LINES = [
  "-> a -> b > After",
  "A -> a -> b > c",
  "-> a -> > After",
  "-> a -> b // note",
  "-> a -> b(1, 2) > After",
  "-> a -> b",
  "-> a -> b ->",
  "-> a -> b ->->",
  "x .. queue|-> A > y|b .. z",
  "x .. queue|-> a -> b > y|c .. z",
  "x .. queue|-> a -> b|c .. z",
  "x .. queue|-> A|b .. z",
  "queue | -> A > y | b end",
  "queue | -> a -> b > y | c end",
  "queue | -> a -> b | c end",
  "x .. queue|-> A > y z|b .. z",
  "queue | -> A > blend x | b end",
  "queue | -> A > y end",
  "queue | -> A >end",
  "queue | -> a -> b >end",
  "x .. queue|-> A > {y}|b .. z",
  "x .. queue|-> A > #y|b .. z",
  "HERO: Go -> a -> b > After",
  "+ [Go] -> a -> b > After",
  "queue\n  | -> a -> b > y\n  | c\nend",
  "x .. queue|-> A >end z|b .. z",
];

const STRAY: [string, string][] = [
  ["-> a -> b > After", "> After"],
  ["A -> a -> b > c", "> c"],
  ["HERO: Go -> a -> b > After", "> After"],
  ["+ [Go] -> a -> b > After", "> After"],
  ["-> a -> > After", "> After"],
  ["x .. queue|-> A > y|b .. z", "> y"],
  ["x .. queue|-> A > y z|b .. z", "> y z"],
  ["x .. queue|-> a -> b > y|c .. z", "> y"],
  ["queue | -> A > y | b end", "> y"],
  ["queue | -> a -> b > y | c end", "> y"],
  ["queue | -> A > blend x | b end", "> blend x"],
  ["queue | -> A > y end", "> y"],
  ["queue | -> A >end", ">"],
  ["queue | -> a -> b >end", ">"],
  ["x .. queue|-> A > {y}|b .. z", "> {y}"],
  ["x .. queue|-> A > #y|b .. z", "> #y"],
  ["queue\n  | -> a -> b > y\n  | c\nend", "> y"],
  ["x .. queue|-> A >end z|b .. z", ">"],
];

const CASES = LINES.flatMap((line) =>
  ["\n", "\r\n"].map((eol) => ({
    line,
    eol,
    source: `${line.replace(/\n/g, eol)}${eol}`,
  })),
);

describe("text after a tunnel chain or an arm divert", () => {
  test.each(LINES)("%j scopes the same in both engines", async (line) => {
    const result = await compareEnginesFull(`${line}\n`);
    expect(
      result.divergences,
      formatDivergences(result.source, result.divergences),
    ).toEqual([]);
  });

  test.each(CASES)("$line (eol $eol) parses without error nodes", ({ source }) => {
    const errors: string[] = [];
    parseSource(source).iterate({
      enter: (node) => {
        if (node.type.isError || node.name.startsWith("ERROR")) {
          errors.push(`${node.name} @ ${node.from}`);
        }
      },
    });
    expect(errors).toEqual([]);
  });

  test.each(STRAY)("%j scopes %j as stray text and nothing else", async (line, stray) => {
    const source = `${line}\n`;
    const vscode = await vscodeScopeStacksPerChar(source);
    const tree = parseSource(source);
    const from = line.lastIndexOf(stray);
    const to = from + stray.length;
    for (let offset = 0; offset < line.length; offset++) {
      const at = `${JSON.stringify(source[offset])} @ ${offset}`;
      const inStray = offset >= from && offset < to;
      for (const [engine, scopes] of [
        ["vscode", vscode[offset]!],
        ["tree", treeScopeStackAt(tree, offset)],
      ] as const) {
        expect(
          scopes.includes("invalid.illegal.unknown-statement.sd"),
          `${engine} ${at}: ${scopes.join(" / ")}`,
        ).toBe(inStray);
      }
    }
  });
});
