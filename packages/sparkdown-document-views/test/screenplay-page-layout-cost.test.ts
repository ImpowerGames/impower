import { TreeCursor } from "@lezer/common";
import { describe, expect, it } from "vitest";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { screenplayPageLayout } from "../../sparkdown-screenplay/src/utils/screenplayPageLayout";
import { LARGE_SCREENPLAY } from "./fixtures/largeScreenplay";

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

const nodeReads = (run: () => void) => {
  const getter = Object.getOwnPropertyDescriptor(TreeCursor.prototype, "node")!;
  let reads = 0;
  Object.defineProperty(TreeCursor.prototype, "node", {
    ...getter,
    get() {
      reads++;
      return getter.get!.call(this);
    },
  });
  try {
    run();
  } finally {
    Object.defineProperty(TreeCursor.prototype, "node", getter);
  }
  return reads;
};

describe("the page layout's cost", () => {
  it("reads a syntax node only for the tree nodes it prints from", () => {
    const tree = new ScreenplayParser().buildTree(LARGE_SCREENPLAY);
    let visited = 0;
    tree.iterate({
      enter: () => {
        visited++;
      },
    });
    const reads = nodeReads(() => screenplayPageLayout(tree, LARGE_SCREENPLAY, {}));
    expect(reads, `the layout read ${reads} syntax nodes while walking ${visited} tree nodes`).toBeLessThan(visited / 4);
  });

  it("grows with the script, not with the square of a block's length", () => {
    fastest(manyBlocks);
    const many = fastest(manyBlocks);
    const one = fastest(oneBlock);
    expect(one, `one ${LINES}-line block took ${one.toFixed(1)} ms; the same lines in blocks of ten took ${many.toFixed(1)} ms`).toBeLessThan(many * 4);
  });
});
