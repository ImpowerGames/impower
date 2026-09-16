import { describe, expect, test } from "vitest";
import { compileSource } from "./compileSnapshot";

function structOf(source: string, type: string, name: string): any {
  const entries = compileSource(source);
  const e = entries.find((x) => x.block?.context?.[type]?.[name]);
  return e?.block?.context?.[type]?.[name];
}

describe("trailing comments in animation and theme blocks", () => {
  test("a comment after a container header does not become part of the key", () => {
    const withComment = structOf(
      `animation fade with
  timing: -- how it plays
    duration = 1
end
`,
      "animation",
      "fade",
    );
    const withoutComment = structOf(
      `animation fade with
  timing:
    duration = 1
end
`,
      "animation",
      "fade",
    );
    expect(withComment).toEqual(withoutComment);
    expect(withComment.timing).toEqual({ duration: 1 });
  });

  test("a comment after an empty container header does not become part of the key", () => {
    const struct = structOf(
      `theme dusk with
  spacing: // nothing yet
end
`,
      "theme",
      "dusk",
    );
    expect(Object.keys(struct)).toContain("spacing");
    expect(struct.spacing).toEqual({});
  });

  test("numbers and booleans followed by a comment keep their type at every depth", () => {
    const struct = structOf(
      `theme dusk with
  enabled = false -- off for now
  radius = 8 -- corner size
  scale = -0.5 // shrink
  spacing:
    gap = 4 -- between items
    wrap = true -- allow wrapping
end
`,
      "theme",
      "dusk",
    );
    expect(struct.enabled).toBe(false);
    expect(struct.radius).toBe(8);
    expect(struct.scale).toBe(-0.5);
    expect(struct.spacing).toEqual({ gap: 4, wrap: true });
  });

  test("a commented value lowers the same as the uncommented one", () => {
    const withComment = structOf(
      `animation fade with
  timing:
    duration = 1 -- a second
    iterations = 2 -- twice
end
`,
      "animation",
      "fade",
    );
    const withoutComment = structOf(
      `animation fade with
  timing:
    duration = 1
    iterations = 2
end
`,
      "animation",
      "fade",
    );
    expect(withComment).toEqual(withoutComment);
  });

  test("a commented list item keeps its number", () => {
    const struct = structOf(
      `animation fade with
  steps:
    - 3 -- first
    - 4
end
`,
      "animation",
      "fade",
    );
    expect(struct.steps).toEqual([3, 4]);
  });

  test("unit values and CSS keywords stay strings with a comment", () => {
    const struct = structOf(
      `animation fade with
  timing:
    easing = ease-in -- smooth
  keyframes:
    -
      offset = 0
      width = 8px -- start narrow
end
`,
      "animation",
      "fade",
    );
    expect(struct.timing.easing).toBe("ease-in");
    expect(struct.keyframes[0]).toEqual({ offset: 0, width: "8px" });
  });

  test("a comment written directly after a literal is still a comment", () => {
    const struct = structOf(
      `theme dusk with
  radius = 1-- note
  enabled = false-- note
  label = "one"-- note
end
`,
      "theme",
      "dusk",
    );
    expect(struct.radius).toBe(1);
    expect(struct.enabled).toBe(false);
    expect(struct.label).toBe("one");
  });

  test("Infinity, NaN, escaped quotes and references lower the same with or without a comment", () => {
    const body = [
      "far = Infinity",
      "odd = NaN",
      'quote = "say \\"hi\\""',
      "target = layer.self",
    ];
    const withComment = structOf(
      `animation fade with\n${body.map((l) => `  ${l} -- note`).join("\n")}\nend\n`,
      "animation",
      "fade",
    );
    const withoutComment = structOf(
      `animation fade with\n${body.map((l) => `  ${l}`).join("\n")}\nend\n`,
      "animation",
      "fade",
    );
    expect(withComment).toEqual(withoutComment);
    expect(withComment.far).toBe(Infinity);
    expect(withComment.quote).toBe('say "hi"');
    expect(withComment.target).toEqual({ $type: "layer", $name: "self" });
  });

  test("a CSS custom property keeps its dashes", () => {
    const struct = structOf(
      `animation fade with
  keyframes:
    -
      offset = 0
      color = var(--accent)
      width = var(--size) -- from the theme
end
`,
      "animation",
      "fade",
    );
    expect(struct.keyframes[0]).toEqual({
      offset: 0,
      color: "var(--accent)",
      width: "var(--size)",
    });
  });

  test("quoted values followed by a comment lose their quotes, not their type", () => {
    const struct = structOf(
      `animation fade with
  keyframes:
    -
      offset = 0
      opacity = "1" -- quoted
      flag = "true" // quoted
      label = "a -- b" -- dashes inside the quotes
end
`,
      "animation",
      "fade",
    );
    expect(struct.keyframes[0]).toEqual({
      offset: 0,
      opacity: "1",
      flag: "true",
      label: "a -- b",
    });
  });
});
