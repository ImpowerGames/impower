// Text written after a tunnel chain (`-> a -> b > After`) or after a divert
// inside an alternator arm (`x .. queue|-> A > y|b .. z`) is stray text, as it
// is after a single-target divert. Both grammar engines must scope every
// character of such a line the same way, and the tree must close neither the
// nested `Tunnel` nor the `ArmDivert` incomplete at the first character its
// body cannot match (GRAMMAR.md §17).

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
];

// Each line with the stray text it holds, which runs from its first character
// to the arm's boundary or the line's end.
const STRAY: [string, string][] = [
  ["-> a -> b > After", "> After"],
  ["A -> a -> b > c", "> c"],
  ["-> a -> > After", "> After"],
  ["x .. queue|-> A > y|b .. z", "> y"],
  ["x .. queue|-> A > y z|b .. z", "> y z"],
  ["x .. queue|-> a -> b > y|c .. z", "> y"],
  ["queue | -> A > y | b end", "> y"],
  ["queue | -> a -> b > y | c end", "> y"],
  ["queue | -> A > blend x | b end", "> blend x"],
  ["queue | -> A > y end", "> y"],
];

describe("text after a tunnel chain or an arm divert", () => {
  test.each(LINES)("%j scopes the same in both engines", async (line) => {
    const result = await compareEnginesFull(`${line}\n`);
    expect(
      result.divergences,
      formatDivergences(result.source, result.divergences),
    ).toEqual([]);
  });

  test.each(LINES)("%j parses without error nodes", (line) => {
    const errors: string[] = [];
    parseSource(`${line}\n`).iterate({
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
    const from = line.indexOf(stray);
    const to = from + stray.length;
    for (let offset = 0; offset < line.length; offset++) {
      const at = `${JSON.stringify(source[offset])} @ ${offset}`;
      const inStray = offset >= from && offset < to;
      for (const [engine, scopes] of [
        ["vscode", vscode[offset]],
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
