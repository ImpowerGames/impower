import { describe, expect, it } from "vitest";
import { evaluatableExpressionRange } from "../src/debugger/evaluatableExpressionRange";

const LINE = "  & local look = image.mia@night.src";
const at = (text: string, offset = 0) => LINE.indexOf(text) + offset;

describe("the debugger evaluates a whole @ name (#2109)", () => {
  it.each([
    ["image", 2, at("image") + "image".length],
    ["mia@night", 1, at(".src")],
    ["mia@night", 6, at(".src")],
    ["src", 1, LINE.length],
  ])("hovering %s evaluates the path up to the end of that name", (part, offset, end) => {
    expect(evaluatableExpressionRange(LINE, at(part, offset))).toEqual({ start: at("image"), end });
  });

  it("evaluates a reserved word before an @ as part of the name", () => {
    const text = "return end@x";
    expect(evaluatableExpressionRange(text, text.indexOf("x"))).toEqual({ start: text.indexOf("end"), end: text.length });
  });
});
