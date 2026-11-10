import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("formatting a `/* */` story block comment", () => {
  test("leaves the lines inside a block comment as written", () => {
    const source = [
      "scene start",
      "  Before.",
      "  /*   first   line",
      "",
      "no indent    here",
      "        deep   indent",
      "   */",
      "  After.",
      "end",
      "",
    ].join("\n");
    const formatted = formatSource(source);
    const inside = (text: string) =>
      text.slice(text.indexOf("/*"), text.indexOf("*/") + 2);
    expect(inside(formatted)).toBe(inside(source));
  });

  test("leaves an inline block comment's text as written", () => {
    const source = "scene start\n  Hello /*   spaced    note  */ there\nend\n";
    expect(formatSource(source)).toContain("/*   spaced    note  */");
  });

  test("leaves the rest of an unclosed block comment as written", () => {
    const source = [
      "scene start",
      "  /* never closed",
      "      scene   other",
      "end",
      "",
    ].join("\n");
    expect(formatSource(source)).toBe(source);
  });
});
