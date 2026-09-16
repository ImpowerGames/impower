import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("formatting a `keyframes:` block written with position keys", () => {
  test("well-formed source round-trips unchanged", () => {
    const source = `animation fade with
  keyframes:
    from:
      opacity = "0"
    40%:
      opacity = "1"
    to:
      opacity = "0"
  timing:
    duration = 0.4
end
`;
    expect(formatSource(source)).toBe(source);
  });

  test("mis-indented position keys are normalized to the block's body indent", () => {
    const source = `animation fade with
      keyframes:
          from:
                opacity = "0"
          to:
                opacity = "1"
end
`;
    expect(formatSource(source)).toBe(`animation fade with
  keyframes:
    from:
      opacity = "0"
    to:
      opacity = "1"
end
`);
  });
});
