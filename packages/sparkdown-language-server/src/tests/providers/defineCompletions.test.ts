import { describe, expect, test } from "vitest";
import { complete, labelsAt } from "./completionHarness";

// Smoke + behavior coverage for the de-staled define/struct completion paths.
// These lock the verifiable pieces: it must not throw on representative
// define/struct/access sources, and
// it must offer engine type names after `as` (the inverted-model type slot).

const program = {
  context: {
    character: { $default: {} },
    animation: { $default: {} },
    image: { hero: { $type: "image", $name: "hero" } },
  },
} as any;

describe("provider · define completions (D2)", () => {
  test("offers engine type names after `as`", () => {
    const labels = labelsAt(`define foo as @0\n`, { program });
    expect(labels).toContain("character");
    expect(labels).toContain("animation");
  });

  test("does not throw inside a structural struct body", () => {
    const source = `layout s with
  stage {
    backdrop {
      @0
    }
  }
end
`;
    expect(() =>
      complete(source, { program }),
    ).not.toThrow();
  });

  test("does not throw on a struct scalar value", () => {
    const source = `style b with
  background-color = @0
end
`;
    expect(() =>
      complete(source, { program }),
    ).not.toThrow();
  });
});
