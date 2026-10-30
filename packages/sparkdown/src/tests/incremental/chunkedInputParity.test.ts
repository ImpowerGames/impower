import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { describe, expect, it } from "vitest";
import { getParser } from "../compiler/grammarSnapshot";

function fixedChunkInput(text: string, size: number) {
  return {
    length: text.length,
    lineChunks: false,
    chunk(from: number) {
      return text.slice(from, Math.min(from + size, text.length));
    },
    read(from: number, to: number) {
      return text.slice(from, to);
    },
  };
}

const LINES = [
  "INT. HOUSE - DAY",
  "",
  "Some action line that is long enough to need many chunks.",
  "",
  "@ Name",
  "(parenthetical)",
  "Dialogue line here.",
  "",
];

describe("a parse from an Input that serves a line in several chunks (#1638)", () => {
  const TEXT = LINES.join("\n");

  it.each([3, 5, 7])("builds the string parse's tree from %i-character chunks", (size) => {
    const viaString = printTree(getParser().parse(TEXT), TEXT);
    const viaChunks = printTree(getParser().parse(fixedChunkInput(TEXT, size) as never), TEXT);
    expect(viaChunks).toBe(viaString);
  });

  it.each(["\r\n", "\r"])("builds the string parse's tree with %j line breaks, wherever a chunk ends", (lineBreak) => {
    const text = LINES.join(lineBreak);
    const viaString = printTree(getParser().parse(text), text);
    const differing: number[] = [];
    for (let size = 1; size <= 16; size++) {
      if (printTree(getParser().parse(fixedChunkInput(text, size) as never), text) !== viaString) {
        differing.push(size);
      }
    }
    expect(differing).toEqual([]);
  });
});
