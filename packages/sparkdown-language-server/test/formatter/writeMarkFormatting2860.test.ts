import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("formatting the @ mark of a write line (#2860)", () => {
  test("leaves an inline write line tight after its @", () => {
    const src = `scene start
  @note: Buy milk
end
`;
    expect(formatSource(src)).toBe(src);
  });

  test("leaves a block write line tight after its @", () => {
    const src = `scene start
  @note:
    Buy milk
end
`;
    expect(formatSource(src)).toBe(src);
  });

  test("leaves a spaced write line as written", () => {
    const src = `scene start\n  @ note: Buy milk\nend\n`;
    expect(formatSource(src)).toBe(src);
  });
});
