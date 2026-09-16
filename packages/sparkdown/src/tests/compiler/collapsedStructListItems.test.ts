// A structural list item may carry its first entry on the dash line, with the
// item's remaining entries at the hanging indent the inline entry establishes:
//
//   keyframes:
//     - eyes:
//         option = closed
//       offset = 0.4
//
// That is the expanded form (a bare `-` with everything indented beneath it)
// with the dash overlapping the first entry's indent column, and it lowers to
// exactly the same struct. Both struct-body readers support it: the typed one
// (`animation` / `theme`, numbers stay numbers) and the untyped one
// (`style` / `layout` / `screen` / `component`).
//
// A dash line whose inline text is a bare VALUE cannot also own children — a
// scalar and an object have nothing to merge — so that shape reports a warning
// on the dash line rather than dropping the authored text without a word.

import { describe, expect, test } from "vitest";
import { compileSource } from "./compileSnapshot";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function ctxOf(source: string, type: string, name: string): any {
  const entries = compileSource(source);
  const e = entries.find((x) => x.block?.context?.[type]?.[name]);
  return e?.block?.context?.[type]?.[name];
}

function diagnosticsFor(source: string): { message: string; line: number }[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const out: { message: string; line: number }[] = [];
  for (const docDiagnostics of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiagnostics) {
      const raw = (d as any).message;
      out.push({
        message: typeof raw === "string" ? raw : (raw?.value ?? ""),
        line: (d as any).range?.start?.line ?? -1,
      });
    }
  }
  return out;
}

// The same keyframe list written both ways. The collapsed item's entries sit at
// the column its inline entry opens (6), and that entry's own children one level
// deeper (8) — exactly where they sit in the expanded form.
const COLLAPSED_ANIMATION = `animation blink with
  keyframes:
    - eyes:
        option = open
      offset = 0
    - eyes:
        option = closed
      eyebrows:
        translate = 0 6%
      offset = 0.4
end
`;

const EXPANDED_ANIMATION = `animation blink with
  keyframes:
    -
      eyes:
        option = open
      offset = 0
    -
      eyes:
        option = closed
      eyebrows:
        translate = 0 6%
      offset = 0.4
end
`;

// An inline SCALAR PROPERTY rather than an inline object header, with the
// item's further entries at the same hanging indent.
const COLLAPSED_INLINE_PROPERTY = `animation blink with
  keyframes:
    - offset = 0.4
      eyes:
        option = closed
end
`;

const EXPANDED_INLINE_PROPERTY = `animation blink with
  keyframes:
    -
      offset = 0.4
      eyes:
        option = closed
end
`;

const COLLAPSED_STYLE = `style list with
  items:
    - label:
        text = "first"
      weight = bold
    - label:
        text = "second"
end
`;

const EXPANDED_STYLE = `style list with
  items:
    -
      label:
        text = "first"
      weight = bold
    -
      label:
        text = "second"
end
`;

describe("collapsed structural list items (typed animation/theme reader)", () => {
  test("an inline object header carries the item's first entry", () => {
    expect(ctxOf(COLLAPSED_ANIMATION, "animation", "blink").keyframes).toEqual([
      { eyes: { option: "open" }, offset: 0 },
      {
        eyes: { option: "closed" },
        eyebrows: { translate: "0 6%" },
        offset: 0.4,
      },
    ]);
  });

  test("the collapsed and expanded forms lower to identical structs", () => {
    expect(ctxOf(COLLAPSED_ANIMATION, "animation", "blink")).toEqual(
      ctxOf(EXPANDED_ANIMATION, "animation", "blink"),
    );
  });

  test("an inline scalar property carries the item's first entry", () => {
    expect(
      ctxOf(COLLAPSED_INLINE_PROPERTY, "animation", "blink").keyframes,
    ).toEqual([{ offset: 0.4, eyes: { option: "closed" } }]);
    expect(ctxOf(COLLAPSED_INLINE_PROPERTY, "animation", "blink")).toEqual(
      ctxOf(EXPANDED_INLINE_PROPERTY, "animation", "blink"),
    );
  });

  test("a bare `- scalar` item still lowers to that scalar", () => {
    expect(
      ctxOf(
        `animation blink with
  offsets:
    - 0
    - 0.5
    - 1
end
`,
        "animation",
        "blink",
      ).offsets,
    ).toEqual([0, 0.5, 1]);
  });
});

describe("collapsed structural list items (untyped style/layout reader)", () => {
  test("an inline object header carries the item's first entry", () => {
    expect(ctxOf(COLLAPSED_STYLE, "style", "list").items).toEqual([
      { label: { text: "first" }, weight: "bold" },
      { label: { text: "second" } },
    ]);
  });

  test("the collapsed and expanded forms lower to identical structs", () => {
    expect(ctxOf(COLLAPSED_STYLE, "style", "list")).toEqual(
      ctxOf(EXPANDED_STYLE, "style", "list"),
    );
  });

  test("a bare `- scalar` item still lowers to that scalar", () => {
    expect(
      ctxOf(
        `style list with
  items:
    - first
    - second
end
`,
        "style",
        "list",
      ).items,
    ).toEqual(["first", "second"]);
  });
});

describe("a dash line carrying a value cannot also own children", () => {
  const CONTRADICTORY = `animation blink with
  keyframes:
    - some stray text
      offset = 0.4
end
`;

  test("the contradiction is reported on the dash line", () => {
    const diagnostics = diagnosticsFor(CONTRADICTORY);
    const reported = diagnostics.filter((d) =>
      d.message.includes("list item already has a value"),
    );
    expect(reported).toHaveLength(1);
    // `- some stray text` is the third line (zero-based line 2).
    expect(reported[0]!.line).toBe(2);
  });

  test("a value-only item with no children is not reported", () => {
    expect(
      diagnosticsFor(
        `animation blink with
  offsets:
    - 0.5
end
`,
      ).filter((d) => d.message.includes("list item already has a value")),
    ).toHaveLength(0);
  });
});
