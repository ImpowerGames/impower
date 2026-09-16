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
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

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

  test("an inline property with nothing beneath it is a one-entry object", () => {
    // `- key: value` has text after its colon, so it is not an object header
    // and stays the value it always was.
    const collapsed = ctxOf(
      `style list with
  items:
    - weight = bold
    - key: value
end
`,
      "style",
      "list",
    );
    expect(collapsed.items).toEqual([{ weight: "bold" }, "key: value"]);
    expect(collapsed).toEqual(
      ctxOf(
        `style list with
  items:
    -
      weight = bold
    - key: value
end
`,
        "style",
        "list",
      ),
    );
  });

  test("a layout item whose inline header carries attributes matches the expanded form", () => {
    // Layout bodies share this reader, which excises inline `#prop=` and
    // `@event=` attributes from header keys.
    const collapsed = ctxOf(
      `layout hud with
  items:
    - column #gap=16:
        text = "a"
      row:
        text = "b"
end
`,
      "layout",
      "hud",
    );
    expect(collapsed.items).toEqual([
      { column: { text: "a" }, row: { text: "b" } },
    ]);
    expect(collapsed).toEqual(
      ctxOf(
        `layout hud with
  items:
    -
      column #gap=16:
        text = "a"
      row:
        text = "b"
end
`,
        "layout",
        "hud",
      ),
    );
  });
});

describe("collapsed structural list items (references)", () => {
  function propertyPaths(source: string): string[] {
    const registry = new SparkdownDocumentRegistry(["references"]);
    const uri = "file:///collapsed.sd";
    registry.set({
      textDocument: { uri, text: source, version: 1, languageId: "sparkdown" },
    });
    const annotations = registry.annotations(uri);
    if (!annotations) throw new Error("no annotations");
    const paths: string[] = [];
    const cursor = annotations.references.iter();
    while (cursor.value) {
      const reference = (cursor.value as any).type ?? {};
      if (reference.declaration === "property") {
        paths.push(
          `${source.slice(cursor.from, cursor.to)} ${reference.symbolIds.join("|")}`,
        );
      }
      cursor.next();
    }
    return paths;
  }

  test("inline keys resolve to the same property paths as the expanded form", () => {
    const collapsed = propertyPaths(`animation blink with
  keyframes:
    - eyes:
        option = open
      offset = 0
    - offset = 0.4
      eyes:
        option = closed
end
`);
    expect(collapsed).toEqual([
      "keyframes animation.blink.keyframes",
      "eyes animation.blink.keyframes.0.eyes",
      "option animation.blink.keyframes.0.eyes.option",
      "offset animation.blink.keyframes.0.offset",
      "offset animation.blink.keyframes.1.offset",
      "eyes animation.blink.keyframes.1.eyes",
      "option animation.blink.keyframes.1.eyes.option",
    ]);
    expect(collapsed).toEqual(
      propertyPaths(`animation blink with
  keyframes:
    -
      eyes:
        option = open
      offset = 0
    -
      offset = 0.4
      eyes:
        option = closed
end
`),
    );
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

  test("the untyped style reader reports the same contradiction", () => {
    const reported = diagnosticsFor(`style list with
  items:
    - some stray text
      weight = bold
end
`).filter((d) => d.message.includes("list item already has a value"));
    expect(reported).toHaveLength(1);
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
