import { describe, expect, it } from "vitest";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { screenplayPageLayout } from "../../sparkdown-screenplay/src/utils/screenplayPageLayout";

const LINE = "    The author reads another quiet line in the hall.";

const LINES = 10000;

const oneBlock = ["scene s", "  :", ...Array.from({ length: LINES }, () => LINE), "end", ""].join("\n");

const manyBlocks = [
  "scene s",
  ...Array.from({ length: LINES / 10 }, () => ["  :", ...Array.from({ length: 10 }, () => LINE), ""]).flat(),
  "end",
  "",
].join("\n");

const fastest = (script: string) => {
  const parser = new ScreenplayParser();
  const tree = parser.buildTree(script);
  let best = Infinity;
  for (let round = 0; round < 3; round++) {
    const start = performance.now();
    screenplayPageLayout(tree, script, {});
    best = Math.min(best, performance.now() - start);
  }
  return best;
};

describe("the page layout's cost", () => {
  it("grows with the script, not with the square of a block's length", () => {
    fastest(manyBlocks);
    const many = fastest(manyBlocks);
    const one = fastest(oneBlock);
    expect(one, `one ${LINES}-line block took ${one.toFixed(1)} ms; the same lines in blocks of ten took ${many.toFixed(1)} ms`).toBeLessThan(many * 4);
  });
});
