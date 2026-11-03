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
    expect(labelsAt("style panel with\n  |\nend\n")).not.toContain("{");
  });
});

describe("provider · completion inside a struct keyword brace body", () => {
  const CASES: [string, string, string][] = [
    [
      "an animation's root property",
      "animation fade with\n  tim|\nend\n",
      "animation fade {\n  tim|\n}\n",
    ],
    [
      "an animation's nested timing property",
      "animation fade with\n  timing { dur| }\nend\n",
      "animation fade {\n  timing { dur| }\n}\n",
    ],
    [
      "a property on the brace's own line",
      "animation fade with\n  tim|\nend\n",
      "animation fade { tim| }\n",
    ],
  ];
  for (const [label, withForm, braceForm] of CASES) {
    test(`${label} offers what the \`with … end\` body offers`, () => {
      const expected = labelsAt(withForm);
      expect(expected.length).toBeGreaterThan(0);
      expect(labelsAt(braceForm).sort()).toEqual([...expected].sort());
    });
  }
});
