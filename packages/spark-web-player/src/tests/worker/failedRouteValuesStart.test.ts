import {
  visitsKey,
  type StartingValues,
} from "@impower/sparkdown/src/program/startingValueLiterals";
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle, writtenText } from "./playerHarness";

const ENTERED = `scene start
  -> outer
end

scene outer
  branch b
    Top {count.visits(-> outer.b)}.
    done
    Below {count.visits(-> outer.b)}.
  end
end
`;

const BELOW = 8;

const previewAt = async (line: number, values?: StartingValues) => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: ENTERED }],
    startFrom: { file: MAIN_URI, line },
  });
  h.refs.routeButton = h.overlay.ownerDocument.createElement("div");
  await h.compile();
  if (values) {
    await (h.controller as any).applyStartingValues(values);
  }
  await h.select(line);
  await settle(40);
  return h;
};

describe("a line no route reaches, in a branch its scene enters", () => {
  it("shows the starting values the jumped display applies", async () => {
    const shownFor = await previewAt(BELOW);
    let start: string | undefined;
    try {
      expect((shownFor.controller as any)._routeState.failure).toBeDefined();
      start = (shownFor.controller as any).valuesStart();
    } finally {
      shownFor.dispose();
    }
    const h = await previewAt(BELOW, {
      [start!]: { [visitsKey("outer.b")]: "4" },
    });
    try {
      expect(writtenText(h.toRouter)).toContain("Below 5.");
    } finally {
      h.dispose();
    }
    expect(start).toBe("outer.b");
  }, 120_000);
});
