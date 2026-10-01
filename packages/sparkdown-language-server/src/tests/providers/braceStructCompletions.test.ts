import { describe, expect, test } from "vitest";
import {
  accept,
  bracesBalanced,
  completeAt,
  insertedText,
  insideBraces,
} from "./braceCompletionHarness";

// Struct property completion in an animation written with brace blocks
// (#1228): a container property opens a balanced block with the cursor
// inside, a scalar property is followed by ` = `, and inside a block the
// properties offered are the block's own.

// The fields of the engine's `default_animation`.
const program = {
  context: {
    animation: {
      $default: {
        $type: "animation",
        $name: "$default",
        target: { $type: "layer", $name: "self" },
        keyframes: [],
        timing: {
          delay: 0,
          duration: 0,
          easing: "ease",
          iterations: 1,
          fill: "both",
          direction: "normal",
        },
      },
    },
  },
} as any;

const itemAt = (source: string, label: string) => {
  const items = completeAt(source, program);
  const item = items.find((i) => i.label === label);
  expect(item, `${label} in ${items.map((i) => i.label)}`).toBeDefined();
  return item!;
};

describe("provider · animation property completion in brace bodies", () => {
  const ROOT = `animation fade with
  target = layer.self
  keyframes { from { opacity = 0 } }
  tim|
end
`;

  test("a container property inserts a balanced block with the cursor inside", () => {
    for (const label of ["timing", "keyframes"]) {
      const item = itemAt(ROOT, label);
      expect(insertedText(item)).toBe(`${label} {  }`);
      const { text, cursor } = accept(ROOT, item);
      expect(bracesBalanced(text), text).toBe(true);
      expect(insideBraces(text, cursor), text).toBe(true);
      expect(text).toContain(`\n  ${label} {  }\nend`);
    }
  });

  test("a scalar property inserts ` = `", () => {
    const item = itemAt(ROOT, "target");
    expect(insertedText(item)).toBe("target = ");
    const { text } = accept(ROOT, item);
    expect(bracesBalanced(text)).toBe(true);
    expect(text).toContain("\n  target = \nend");
  });

  test("inside a block, the block's own properties complete", () => {
    for (const source of [
      `animation fade with
  timing {
    dur|
  }
end
`,
      `animation fade with
  timing { delay = 1; dur| }
end
`,
    ]) {
      const labels = completeAt(source, program).map((i) => String(i.label));
      expect(labels).toEqual(
        expect.arrayContaining(["duration", "delay", "easing", "iterations"]),
      );
      expect(labels).not.toContain("keyframes");
      const item = itemAt(source, "duration");
      expect(insertedText(item)).toBe("duration = ");
      const { text } = accept(source, item);
      expect(bracesBalanced(text), text).toBe(true);
    }
  });

  test("a value inside a block completes from the schema at the block's path", () => {
    const schemaProgram = {
      context: {
        animation: {
          ...program.context.animation,
          $schema: { timing: { easing: ["ease", "linear"] } },
        },
      },
    };
    const labels = completeAt(
      `animation fade with
  timing { easing = | }
end
`,
      schemaProgram,
    ).map((i) => String(i.label));
    // Outside a style a string option is offered as a quoted string.
    expect(labels).toEqual(expect.arrayContaining(['"ease"', '"linear"']));
  });

  test("a `;` or brace inside a quoted value starts no new entry", () => {
    for (const source of [
      `animation fade with
  timing { easing = "custom; dur|" }
end
`,
      `animation fade with
  timing { easing = "a { dur|" }
end
`,
    ]) {
      const labels = completeAt(source, program).map((i) => String(i.label));
      expect(labels, source).not.toContain("duration");
    }
  });

  test("an apostrophe in a value is text, so the entry after its `;` completes", () => {
    const labels = completeAt(
      `animation fade with
  timing { easing = don't; dur| }
end
`,
      program,
    ).map((i) => String(i.label));
    expect(labels).toContain("duration");
  });

  test("an indented body keeps inserting the indented forms", () => {
    const source = `animation fade with
  tim|
end
`;
    expect(insertedText(itemAt(source, "timing"))).toBe("timing:\n    ");
    expect(insertedText(itemAt(source, "keyframes"))).toBe("keyframes:\n    - ");
  });
});

describe("provider · element completion in layout and component brace blocks", () => {
  // A layout or component struct with two element fields.
  const elements = { text: { content: "" }, row: { gap: 0 } };
  const elementProgram = {
    context: {
      layout: { $default: { $type: "layout", $name: "$default", ...elements } },
      component: {
        $default: { $type: "component", $name: "$default", ...elements },
      },
    },
  } as any;
  const labelsIn = (source: string) =>
    completeAt(source, elementProgram).map((i) => String(i.label));

  test.each(["layout", "component"])(
    "a %s block offers what the indented element line offers",
    (keyword) => {
      expect(labelsIn(`${keyword} hud with\n  te|\nend\n`)).toContain("text");
      expect(labelsIn(`${keyword} hud with\n  row {\n    te|\n  }\nend\n`)).toContain(
        "text",
      );
      expect(labelsIn(`${keyword} hud with\n  row.item { te| }\nend\n`)).toContain(
        "text",
      );
    },
  );

  test("a `;` inside quoted element content starts no new element", () => {
    for (const source of [
      `layout hud with\n  row { text "a; te|" }\nend\n`,
      `layout hud with\n  row { text 'a; te|' }\nend\n`,
    ]) {
      expect(labelsIn(source), source).not.toContain("text");
    }
  });
});
