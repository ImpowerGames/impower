import { describe, expect, it } from "vitest";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";

describe("smoke", () => {
  it("can parse a tiny sparkdown script", () => {
    const parser = new ScreenplayParser();
    const tokens = parser.parse(`
Bunny enters the room.

BUNNY:
  Hello, world.
`);
    expect(tokens.some((t) => t.tag === "dialogue_character")).toBe(true);
    expect(tokens.some((t) => t.tag === "action")).toBe(true);
  });
});
