import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("formatting a prop whose braces span lines or nest deeply", () => {
  test("a prop's braces indent the lines inside them", () => {
    const messy = [
      "layout first {",
      "  row {",
      "    text #items={",
      "  { a = 1 }",
      "        } \"Over\"",
      "  }",
      "}",
      "",
    ].join("\n");
    expect(formatSource(messy)).toBe(
      [
        "layout first {",
        "  row {",
        "    text #items={",
        "      { a = 1 }",
        "    } \"Over\"",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
  });

  test("a line with a prop nested past eight braces keeps the indentation of the lines after it", () => {
    const source = [
      "layout first {",
      "  row { text #items={ { a = { b = { c = { d = { e = { f = { g = { h = { i = 1 } } } } } } } } } } \"Over\"; text \"after\" }",
      "  text \"tail\"",
      "}",
      "",
      "layout second {",
      "  text \"x\"",
      "}",
      "",
    ].join("\n");
    expect(formatSource(source)).toBe(source);
  });
});
