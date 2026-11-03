import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

const deep = "f(f(f(f(f(f(f({ a = 1 })))))))";

describe("formatting a line whose parentheses nest past the head's scan", () => {
  test("lines with deep calls and values are left as written", () => {
    const source = [
      "layout first {",
      `  row { card(${deep}) "Over"; text "after" }`,
      `  row { button @click=${deep} "Over"; text "after" }`,
      `  row { text #x=${deep} .wide "Over"; text "after" }`,
      '  text "tail"',
      "}",
      "",
      "layout second {",
      '  text "x"',
      "}",
      "",
    ].join("\n");
    expect(formatSource(source)).toBe(source);
  });

  test("the lines after a deep line are indented by the struct's braces", () => {
    const messy = [
      "layout first {",
      `  row { button @click=${deep} "Over"; text "after" }`,
      '      text "tail"',
      "}",
      "",
      "layout second {",
      'text "x"',
      "}",
      "",
    ].join("\n");
    expect(formatSource(messy)).toBe(
      [
        "layout first {",
        `  row { button @click=${deep} "Over"; text "after" }`,
        '  text "tail"',
        "}",
        "",
        "layout second {",
        '  text "x"',
        "}",
        "",
      ].join("\n"),
    );
  });
});
