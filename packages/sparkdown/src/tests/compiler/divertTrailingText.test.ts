// Text written after a divert on the same line (`A -> later > After`) belongs
// to the divert line, which the player ends at the divert. Both grammar engines
// must scope every character of that text the same way, and the tree must keep
// the `Divert` open to the end of the line instead of closing it incomplete at
// the first character its body cannot match (GRAMMAR.md §17).

import { describe, expect, test } from "vitest";
import { parseSource } from "./grammarSnapshot";
import {
  compareEnginesFull,
  formatDivergences,
  treeScopeStackAt,
  vscodeScopeStacksPerChar,
} from "./scopeEquality";

const LINES = [
  "-> later > After",
  "A -> later > After",
  "A -> later>After",
  "HERO: Go -> later > After",
  "+ [Go] -> later > After",
  "+ Go -> later > After",
  "A -> later ! After",
  "A -> later // note",
  "-> later // note",
  "HERO: Go -> later // note",
  "+ [Go] -> later // note",
  "A -> later(1, 2) > After",
  "-> load later > After",
  "->-> > After",
  "A -> later more words",
  "A -> later",
];

describe("text after a divert on the same line", () => {
  test.each(LINES)("%j scopes the same in both engines", async (line) => {
    const result = await compareEnginesFull(`${line}\n`);
    expect(
      result.divergences,
      formatDivergences(result.source, result.divergences),
    ).toEqual([]);
  });

  test.each(LINES)("%j keeps its divert open to the end of the line", (line) => {
    const tree = parseSource(`${line}\n`);
    const diverts: { from: number; to: number }[] = [];
    const errors: string[] = [];
    tree.iterate({
      enter: (node) => {
        if (node.name === "Divert") {
          diverts.push({ from: node.from, to: node.to });
        }
        if (node.type.isError || node.name.startsWith("ERROR")) {
          errors.push(`${node.name} @ ${node.from}`);
        }
      },
    });
    expect(errors).toEqual([]);
    expect(diverts).toEqual([
      { from: expect.any(Number), to: line.length },
    ]);
  });

  // A `//` comment after the targets is a comment, as it is after any other
  // display text, not stray text.
  test.each([
    "A -> later // note",
    "-> later // note",
    "HERO: Go -> later // note",
    "+ [Go] -> later // note",
  ])("%j scopes its `// note` as a comment", async (line) => {
    const source = `${line}\n`;
    const vscode = await vscodeScopeStacksPerChar(source);
    const tree = parseSource(source);
    for (let offset = line.indexOf("//"); offset < line.length; offset++) {
      const at = `${JSON.stringify(source[offset])} @ ${offset}`;
      expect(vscode[offset], `vscode ${at}`).toContain(
        "comment.line.double-slash.sd",
      );
      expect(treeScopeStackAt(tree, offset), `tree ${at}`).toContain(
        "comment.line.double-slash.sd",
      );
    }
  });
});
