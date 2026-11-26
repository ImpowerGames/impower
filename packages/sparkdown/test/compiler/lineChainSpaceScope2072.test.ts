import { describe, expect, test } from "vitest";
import { parseSource } from "./grammarSnapshot";
import {
  compareEnginesFull,
  formatDivergences,
  treeScopeStackAt,
} from "./scopeEquality";

const CHAINED = [
  "scene start\n  Hello. \\\nend\n",
  "scene start\n  Hello. \\\n  Next line.\nend\n",
  "scene start\n  Hello. \\",
  "scene start\n  HERO: Hi. \\\nend\n",
];

describe("the space before a line chain backslash", () => {
  test.each(CHAINED)("%j scopes the same in both engines", async (source) => {
    const result = await compareEnginesFull(source);
    expect(
      result.divergences,
      formatDivergences(result.source, result.divergences),
    ).toEqual([]);
  });

  test.each(CHAINED)("%j scopes the space as a text chunk", (source) => {
    const offset = source.indexOf(" \\");
    expect(treeScopeStackAt(parseSource(source), offset)).toContain(
      "string.display.text.chunk.sd",
    );
  });
});
