import { describe, expect, test, vi } from "vitest";
import AnimationPlayer from "../../../../spark-dom/src/classes/AnimationPlayer";
import { getStyleContent } from "../../../../spark-dom/src/utils/getStyleContent";
import {
  parseSparkle,
  renderHtmlVDOM,
} from "../../../../sparkle-screen-renderer/src";
import { CSS_ALIASES } from "../../../../sparkle-style-transformer/src/constants/CSS_ALIASES";
import { CSS_UTILITIES } from "../../../../sparkle-style-transformer/src/constants/CSS_UTILITIES";
import { STYLE_ALIASES } from "../../../../sparkle-style-transformer/src/constants/STYLE_ALIASES";
import { getCssEquivalent } from "../../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { getCssPropertyNames } from "../../../../sparkle-style-transformer/src/utils/getCssPropertyNames";

const ALIASES: Record<string, string> = { ...STYLE_ALIASES, ...CSS_ALIASES };

const SAMPLE_VALUES = ["sky_60", "10", "md", "none", "ease-in", "2s", ""];

describe("every alias resolves through the table that owns its value", () => {
  for (const [alias, target] of Object.entries(ALIASES)) {
    test(`${alias} -> ${target}`, () => {
      expect(CSS_UTILITIES).toHaveProperty([target]);
      for (const value of SAMPLE_VALUES) {
        expect(getCssEquivalent(alias, value)).toEqual(
          getCssEquivalent(target, value),
        );
      }
      expect(getCssPropertyNames(alias)).toEqual(getCssPropertyNames(target));
    });
  }
});

describe("one resolver owns each name and its value", () => {
  test.each([
    ["spinner-color", "sky_60", [["--spinner-color", "var(--theme-color-sky_60)"]]],
    ["spinner_color", "sky_60", [["--spinner-color", "var(--theme-color-sky_60)"]]],
    ["spinnerColor", "sky_60/50", [["--spinner-color", "rgb(from var(--theme-color-sky_60) r g b / 50)"]]],
    ["background_color", "sky_60", [["background-color", "var(--theme-color-sky_60)"]]],
    ["duration", 2, [["animation-duration", "2s"]]],
    ["duration", "250ms", [["animation-duration", "250ms"]]],
    ["animation_duration", 2, [["animation-duration", "2s"]]],
    ["delay", 0.5, [["animation-delay", "0.5s"]]],
    ["easing", "ease-in", [["animation-timing-function", "ease-in"]]],
    ["iterations", "infinite", [["animation-iteration-count", "infinite"]]],
    ["width", 10, [["width", "10px"]]],
    ["padding", [4, 8], [["padding", "4px 8px"]]],
    ["border_radius", 4, [["border-radius", "4px"]]],
    ["top", 0, [["top", "0px"]]],
    ["line_height", 1.5, [["line-height", "1.5"]]],
    ["scroll_margin_top", 12, [["scroll-margin-top", "12px"]]],
    ["opacity", 0.5, [["opacity", "0.5"]]],
    ["--spinner-color", "red", [["--spinner-color", "red"]]],
    ["webkitTextFillColor", "red", [["-webkit-text-fill-color", "red"]]],
  ] as const)("%s = %j", (key, value, expected) => {
    expect(getCssEquivalent(key, value)).toEqual(expected);
  });

  test.each([
    ["duration", ["animation-duration"]],
    ["delay", ["animation-delay"]],
    ["easing", ["animation-timing-function"]],
    ["iterations", ["animation-iteration-count"]],
    ["spinner_color", ["--spinner-color"]],
    ["background_color", ["background-color"]],
    ["scroll_margin_top", ["scroll-margin-top"]],
  ])("clearing %s removes %j", (key, expected) => {
    expect(getCssPropertyNames(key)).toEqual(expected);
  });

  test("an unrecognized name is dropped when unrecognized names are excluded", () => {
    expect(getCssEquivalent("data-foo", "1", false)).toEqual([]);
  });
});

describe("an animation player keyframe resolves through the same table", () => {
  const playKeyframe = (keyframe: Record<string, unknown>) => {
    const captured: Keyframe[][] = [];
    vi.stubGlobal(
      "KeyframeEffect",
      class {
        constructor(_target: Element, keyframes: Keyframe[]) {
          captured.push(keyframes);
        }
      },
    );
    vi.stubGlobal("Animation", class {});
    try {
      new AnimationPlayer().add({
        element: document.createElement("div"),
        animations: [{ keyframes: [keyframe], timing: {} } as any],
      });
    } finally {
      vi.unstubAllGlobals();
    }
    return captured[0]?.[0];
  };

  test("a theme color token becomes a theme var", () => {
    expect(playKeyframe({ color: "sky_60" })).toEqual({
      color: "var(--theme-color-sky_60)",
    });
  });

  test("a size alias resolves its name and its size", () => {
    expect(playKeyframe({ w: "md" })).toEqual({ width: "8px" });
  });
});

describe("a screen element attribute resolves through the same table", () => {
  const renderStyle = (attributes: string) => {
    const parsed = parseSparkle(`screen main\n  box ${attributes}`);
    const html = JSON.stringify(
      renderHtmlVDOM(parsed, { components: {}, state: {} }),
    );
    return /"style":"([^"]*)"/.exec(html)?.[1] ?? "";
  };

  test("a camelCase name", () => {
    expect(renderStyle("backgroundColor=sky_60")).toContain(
      "background-color:var(--theme-color-sky_60);",
    );
  });

  test("an animation name", () => {
    expect(renderStyle("duration=2")).toContain("animation-duration:2s;");
  });
});

describe("style content resolves tokens through the same table", () => {
  test("a spinner-color token becomes a theme var", () => {
    const css = getStyleContent({
      busy: { spinner_color: { $type: "color", $name: "sky_60" } },
    });
    expect(css).toContain("--spinner-color: var(--theme-color-sky_60);");
  });

  test("an animation duration number gains its unit", () => {
    const css = getStyleContent({ fade: { duration: 2, delay: 0.5 } });
    expect(css).toContain("animation-duration: 2s;");
    expect(css).toContain("animation-delay: 0.5s;");
  });
});
