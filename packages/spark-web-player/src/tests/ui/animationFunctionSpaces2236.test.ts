import { describe, expect, it } from "vitest";
import { getCssEquivalent } from "../../../../sparkle-style-transformer/src/utils/getCssEquivalent";

const theme = new Set(["--theme-animation-bounce", "--theme-animation-shake"]);
const valueOf = (value: string) => (getCssEquivalent("animation", value, theme) as [[string, string]])[0][1];

describe("an animation value beside a theme animation name", () => {
  it("keeps a function holding spaces whole and replaces only the theme name", () => {
    expect(valueOf("1s steps(4, end) bounce")).toBe("1s steps(4, end) var(--theme-animation-bounce)");
  });

  it("keeps a nested function whole", () => {
    expect(valueOf("bounce 2s cubic-bezier(0.1, calc(0.2 + 0.1), 0.3, 1) infinite")).toBe(
      "var(--theme-animation-bounce) 2s cubic-bezier(0.1, calc(0.2 + 0.1), 0.3, 1) infinite",
    );
  });

  it("leaves a value with no theme name as it was", () => {
    expect(valueOf("1s steps(4, end) linear")).toBe("1s steps(4, end) linear");
  });

  it("lists several theme names as several animations", () => {
    expect(valueOf("bounce shake")).toBe("var(--theme-animation-bounce), var(--theme-animation-shake)");
  });
});
