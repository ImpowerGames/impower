import { describe, expect, test } from "vitest";
import { DEFAULT_OPTIONAL_DEFINITIONS } from "../../game/modules/DEFAULT_OPTIONAL_DEFINITIONS";

describe("the editor's style property list offers `animation` (#2790)", () => {
  const properties = Object.keys(DEFAULT_OPTIONAL_DEFINITIONS.style.$optional);

  test("`animation` is a style property that names an animation", () => {
    expect(DEFAULT_OPTIONAL_DEFINITIONS.style.$optional.animation).toEqual({
      $type: "animation",
    });
  });

  test("`animation` is listed before its longhands", () => {
    const animationProperties = properties.filter((p) => p.startsWith("animation"));
    expect(animationProperties[0]).toBe("animation");
    expect(animationProperties).toContain("animation_name");
    expect(animationProperties).toContain("animation_duration");
  });
});
