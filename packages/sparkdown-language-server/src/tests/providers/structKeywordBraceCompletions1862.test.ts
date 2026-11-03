import { describe, expect, test } from "vitest";
import { InsertTextFormat } from "vscode-languageserver";
import { completeAt } from "./braceCompletionHarness";

const program = {
  context: {
    style: { base: { $type: "style", $name: "base" } },
    animation: {
      $default: {
        $type: "animation",
        $name: "$default",
        target: { $type: "layer", $name: "self" },
        keyframes: [],
        timing: { delay: 0, duration: 0, easing: "ease" },
      },
    },
  },
} as any;

const labelsAt = (source: string) =>
  completeAt(source, program).map((item) => String(item.label));

describe("provider · `{` completion on struct keyword headers", () => {
  const HEADERS = [
    "style panel |",
    "style panel as base |",
    "animation flip |",
    "theme dusk as base |",
    "morph blink |",
    "layout title in menu |",
    "layout title in menu as base |",
    "component card(title) |",
    "component card(title) as box |",
    "screen menu |",
  ];
  for (const header of HEADERS) {
    test(`\`${header.replace("|", "")}\` offers \`{\``, () => {
      const item = completeAt(`${header}\n`, program).find((i) => i.label === "{");
      expect(item).toBeDefined();
      expect(item!.insertText).toBe("{\n\t$0\n}");
      expect(item!.insertTextFormat).toBe(InsertTextFormat.Snippet);
    });
  }

  test("the parent after `as` is still offered rather than `{`", () => {
    const labels = labelsAt("style panel as |\n");
    expect(labels).not.toContain("{");
  });

  test("a body line does not offer `{`", () => {
    expect(labelsAt("style panel {\n  |\n}\n")).not.toContain("{");
  });
});

describe("provider · completion inside a struct keyword brace body", () => {
  test("an animation's root property", () => {
    expect(labelsAt("animation fade {\n  tim|\n}\n")).toContain("timing");
  });

  test("an animation's nested timing property", () => {
    expect(labelsAt("animation fade {\n  timing { dur| }\n}\n")).toContain("duration");
  });

  test("a property on the brace's own line offers what a body line offers", () => {
    const expected = labelsAt("animation fade {\n  tim|\n}\n");
    expect(labelsAt("animation fade { tim| }\n").sort()).toEqual([...expected].sort());
  });
});
