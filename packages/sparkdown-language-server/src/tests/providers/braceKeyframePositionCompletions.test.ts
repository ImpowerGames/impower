import { describe, expect, test } from "vitest";
import {
  accept,
  bracesBalanced,
  completeAt,
  insertedText,
  insideBraces,
} from "./braceCompletionHarness";

// The cases of `keyframePositionCompletions.test.ts`, written in brace bodies
// (#1228): whether the cursor is directly inside `keyframes` is read from the
// blocks around it, and a position inserts `from { }` with the cursor inside.

const program = {
  context: {
    animation: { $default: {} },
  },
} as any;

const labelsAt = (source: string) =>
  completeAt(source, program).map((i) => String(i.label));

describe("provider · keyframe position completions in brace bodies", () => {
  test("offers `from` and `to` on a line inside a `keyframes` block", () => {
    const labels = labelsAt(`animation fade with
  keyframes {
    |
  }
end
`);
    expect(labels).toContain("from");
    expect(labels).toContain("to");
  });

  test("offers them inside a one-line `keyframes` block and after a `;`", () => {
    expect(labelsAt(`animation fade with
  keyframes { | }
end
`)).toEqual(expect.arrayContaining(["from", "to"]));
    expect(labelsAt(`animation fade with
  keyframes { from { opacity = 0 }; | }
end
`)).toEqual(expect.arrayContaining(["from", "to"]));
  });

  test("offers them after a partly typed position", () => {
    const labels = labelsAt(`animation fade with
  keyframes {
    fr|
  }
end
`);
    expect(labels).toContain("from");
  });

  test("inserts the position as a balanced block with the cursor inside", () => {
    for (const source of [
      `animation fade with
  keyframes {
    |
  }
end
`,
      `animation fade with
  keyframes {
    fr|
  }
end
`,
      `animation fade with
  keyframes { | }
end
`,
    ]) {
      const items = completeAt(source, program);
      for (const position of ["from", "to"]) {
        const item = items.find((i) => i.label === position);
        if (position === "to" && source.includes("fr|")) continue;
        expect(item, `${position} in ${source}`).toBeDefined();
        expect(insertedText(item!)).toBe(`${position} {  }`);
        const { text, cursor } = accept(source, item!);
        expect(bracesBalanced(text), text).toBe(true);
        expect(insideBraces(text, cursor), text).toBe(true);
      }
    }
  });

  test("offers them on the line after an existing keyframe block", () => {
    const labels = labelsAt(`animation fade with
  keyframes {
    from {
      opacity = 0
    }
    |
  }
end
`);
    expect(labels).toContain("from");
    expect(labels).toContain("to");
  });

  test("does not offer them inside a sibling block", () => {
    const labels = labelsAt(`animation fade with
  timing {
    |
  }
end
`);
    expect(labels).not.toContain("from");
    expect(labels).not.toContain("to");
  });

  test("does not offer them one level deeper, among a keyframe's properties", () => {
    for (const source of [
      `animation fade with
  keyframes {
    from {
      |
    }
  }
end
`,
      `animation fade with
  keyframes { from { | } }
end
`,
    ]) {
      expect(labelsAt(source)).not.toContain("from");
    }
  });

  test("does not offer them after the `keyframes` block closes", () => {
    const labels = labelsAt(`animation fade with
  keyframes { from { opacity = 0 } }
  |
end
`);
    expect(labels).not.toContain("from");
  });
});
