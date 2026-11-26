import { describe, expect, it } from "vitest";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { renderPreview } from "./helpers/renderPreview";

const PAIR = `RAFFLES [left]:\n  You mean--\n\nBUNNY [right]:\n  Seriously???\n`;

const SHOUT = `BUNNY [shout]:\n  I'm busy!\n\nRAFFLES [l]:\n  Fine.\n`;

const GRID = /<div style="[^"]*display: grid[^"]*">/g;

const positions = (source: string) =>
  new ScreenplayParser()
    .parse(source)
    .filter((token: any) => token.tag === "dialogue_character")
    .map((token: any) => [token.text, token.position]);

describe("the screenplay prints [left] and [right] as two columns and any other variant as ordinary dialogue (#2741)", () => {
  it("the export places [left] and [right] in the two columns by name", () => {
    expect(positions(PAIR)).toEqual([
      ["RAFFLES", "l"],
      ["BUNNY", "r"],
    ]);
  });

  it("the export prints [shout] and [l] as ordinary dialogue", () => {
    expect(positions(SHOUT)).toEqual([
      ["BUNNY", undefined],
      ["RAFFLES", undefined],
    ]);
  });

  it("the preview draws [left] and [right] as a two-column grid and [shout] as ordinary dialogue", () => {
    expect(renderPreview(PAIR).contentHTML.match(GRID)?.length ?? 0).toBeGreaterThanOrEqual(1);
    const shouted = renderPreview(SHOUT);
    expect(shouted.contentHTML.match(GRID)).toBeNull();
    expect(shouted.contentHTML).toContain("I'm busy!");
  });
});
