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

  test.each(["1 + 2", "x and y", "a .. b", "obj:method(1)", "{ a = 1, b = 2 }", "function(a, b) return a, b end"])(
    "a deep call or event holding `%s` formats as its shallow form does",
    (inner) => {
      const at = (depth: number) =>
        [
          "layout first {",
          `  row { card(${"f(".repeat(depth)}${inner}${")".repeat(depth)}) "Over"; text "after" }`,
          `  row { button @click=${"f(".repeat(depth)}${inner}${")".repeat(depth)} "Over"; text "after" }`,
          "}",
          "",
        ].join("\n");
      const deep = formatSource(at(7))
        .split("f(".repeat(7))
        .join("f(")
        .split(")".repeat(7))
        .join(")");
      expect(deep).toBe(formatSource(at(1)));
    },
  );

  test.each([
    ["text #x=", ",red .wide"],
    ["text #x=", ",#ffffff .wide"],
    ["text #x=", ",var(--accent) .wide"],
    ["button @click=", ",g .wide"],
  ])("a deep `%s…%s` formats as its shallow form does", (head, suffix) => {
    const at = (depth: number) =>
      [
        "layout first {",
        `  row { ${head}${"f(".repeat(depth)}1${")".repeat(depth)}${suffix} "Over"; text "after" }`,
        "}",
        "",
      ].join("\n");
    const deep = formatSource(at(7))
      .split("f(".repeat(7))
      .join("f(")
      .split(")".repeat(7))
      .join(")");
    expect(deep).toBe(formatSource(at(1)));
    if (head.startsWith("text")) expect(formatSource(at(7))).toBe(at(7));
  });

  test.each(["1 + 2", "1 ", '"a b"', '"a )}" 2', "{a = 1}", "1 g(2) 3"])(
    "a deep prop holding `%s` formats as its shallow form does",
    (inner) => {
      const at = (depth: number) =>
        [
          "layout first {",
          `  row { text #x=${"f(".repeat(depth)}${inner}${")".repeat(depth)} .wide "Over"; text "after" }`,
          '  text "tail"',
          "}",
          "",
        ].join("\n");
      const deep = formatSource(at(7))
        .split("f(".repeat(7))
        .join("f(")
        .split(")".repeat(7))
        .join(")");
      expect(deep).toBe(formatSource(at(1)));
    },
  );

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
