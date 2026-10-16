import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { describe, expect, it } from "vitest";
import { getParser } from "../compiler/grammarSnapshot";

// #1638: the parser reads an `Input` a chunk at a time up to the next line
// break. It advanced its read position by the length of everything read so
// far rather than by the chunk just read, so an `Input` that served a line
// in three or more chunks skipped text and built a different tree than the
// same text parsed as a string. The tree must not depend on how the `Input`
// splits the text.

/** An `Input` that serves `text` in chunks of `size` characters. */
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

const TEXT = [
  "INT. HOUSE - DAY",
  "",
  "Some action line that is long enough to need many chunks.",
  "",
  "@ Name",
  "(parenthetical)",
  "Dialogue line here.",
  "",
].join("\n");

describe("a parse from an Input that serves a line in several chunks (#1638)", () => {
  it.each([3, 5, 7])("builds the string parse's tree from %i-character chunks", (size) => {
    const viaString = printTree(getParser().parse(TEXT), TEXT);
    const viaChunks = printTree(getParser().parse(fixedChunkInput(TEXT, size) as never), TEXT);
    expect(viaChunks).toBe(viaString);
  });
});
