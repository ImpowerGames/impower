import { describe, expect, test, vi } from "vitest";
import AnimationPlayer from "../../../../spark-dom/src/classes/AnimationPlayer";
import { getAnimationContent } from "../../../../spark-dom/src/utils/getAnimationContent";
import { getStyleContent } from "../../../../spark-dom/src/utils/getStyleContent";
import {
  parseSparkle,
  renderCssVDOM,
  renderHtmlVDOM,
} from "../../../../sparkle-screen-renderer/src";
import {
  CSS_ALIASES,
  SPARKLE_TO_CSS_NAME_MAP,
} from "../../../../sparkle-style-transformer/src/constants/CSS_ALIASES";
import { CSS_UTILITIES } from "../../../../sparkle-style-transformer/src/constants/CSS_UTILITIES";
import { STYLE_ALIASES } from "../../../../sparkle-style-transformer/src/constants/STYLE_ALIASES";
import { STYLE_TRANSFORMERS } from "../../../../sparkle-style-transformer/src/constants/STYLE_TRANSFORMERS";
import { generateSparkleAttributesAndStyles } from "../../../../sparkle-style-transformer/src/utils/generateSparkleAttributesAndStyles";
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
    [
      "spinner-color",
      "sky_60",
      [["--spinner-color", "var(--theme-color-sky_60)"]],
    ],
    [
      "spinner_color",
      "sky_60",
      [["--spinner-color", "var(--theme-color-sky_60)"]],
    ],
    [
      "spinnerColor",
      "sky_60/50",
      [["--spinner-color", "rgb(from var(--theme-color-sky_60) r g b / 50)"]],
    ],
    [
      "background_color",
      "sky_60",
      [["background-color", "var(--theme-color-sky_60)"]],
    ],
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

  describe.each(["initial", "inherit", "unset", "revert", "revert-layer"])(
    "the CSS-wide keyword %s passes through every table entry",
    (keyword) => {
      test.each(Object.keys(CSS_UTILITIES))("%s", (key) => {
        const entry = (
          CSS_UTILITIES as Record<
            string,
            Record<string, Record<string, string>>
          >
        )[key]!;
        const defaults = Object.entries(entry[""] ?? {});
        const expected = defaults.some(([, v]) => v === "")
          ? defaults.map(([prop, v]) => [prop, v === "" ? keyword : v])
          : [
              [
                (SPARKLE_TO_CSS_NAME_MAP as Record<string, string>)[key],
                keyword,
              ],
            ];
        expect(expected.length).toBeGreaterThan(0);
        expect(getCssEquivalent(key, keyword)).toEqual(expected);
      });

      test.each(Object.keys(STYLE_TRANSFORMERS))(
        "the %s transformer returns it as written",
        (name) => {
          const transform = (
            STYLE_TRANSFORMERS as Record<string, (v: string) => string>
          )[name]!;
          expect(transform(keyword)).toBe(keyword);
        },
      );
    },
  );

  test.each([
    ["color", "INITIAL", [["color", "initial"]]],
    ["color", " Inherit ", [["color", "inherit"]]],
    ["filter", "Revert-Layer", [["filter", "revert-layer"]]],
    ["flex-direction", "inherit", [["flex-direction", "inherit"]]],
    ["child-layout", "unset", [["flex-direction", "unset"]]],
  ])("%s = %j keeps its CSS-wide keyword", (key, value, expected) => {
    expect(getCssEquivalent(key, value)).toEqual(expected);
  });

  test.each([
    ["filter", "inherit"],
    ["backdrop-filter", "revert"],
    ["bg-color", "initial"],
  ])(
    "a sparkle attribute %s = %s keeps its CSS-wide keyword",
    (prop, keyword) => {
      const { styles } = generateSparkleAttributesAndStyles({
        [prop]: keyword,
      });
      expect(Object.values(styles)).toContain(keyword);
      expect(Object.values(styles).join(" ")).not.toContain("var(--theme-");
    },
  );

  test.each([
    ["margin", "auto 0", [["margin", "auto 0px"]]],
    ["margin", "0 auto", [["margin", "0px auto"]]],
    ["inset", "auto 0", [["inset", "auto 0px"]]],
    ["padding", "md lg", [["padding", "8px 16px"]]],
    ["padding", [4, 8], [["padding", "4px 8px"]]],
    ["corner", "10px / 20px", [["border-radius", "10px / 20px"]]],
    ["border_radius", "4 8 / 2", [["border-radius", "4px 8px / 2px"]]],
    ["border-radius", "md / lg", [["border-radius", "8px / 16px"]]],
    ["corner", "10px/20px", [["border-radius", "10px/20px"]]],
  ])("compound size %s = %j resolves each part", (key, value, expected) => {
    expect(getCssEquivalent(key, value)).toEqual(expected);
  });

  test.each([
    ["width", "max-content", [["width", "max-content"]]],
    ["min-width", "min-content", [["min-width", "min-content"]]],
    ["max-height", "fit-content", [["max-height", "fit-content"]]],
    ["max-width", "stretch", [["max-width", "stretch"]]],
    ["border-width", "thin", [["border-width", "thin"]]],
    ["border-top-width", "thick", [["border-top-width", "thick"]]],
    ["outline-width", "medium", [["outline-width", "medium"]]],
    ["width", "md", [["width", "8px"]]],
    ["border-width", "gutter", [["border-width", "var(--theme-size-gutter)"]]],
  ])("native size keyword %s = %s stays native", (key, value, expected) => {
    expect(getCssEquivalent(key, value)).toEqual(expected);
  });

  test.each([
    ["filter", "none", [["filter", "none"]]],
    ["backdrop-filter", "none", [["backdrop-filter", "none"]]],
    ["filter", "dim", [["filter", "var(--theme-filter-dim)"]]],
    ["margin", "auto", [["margin", "auto"]]],
    ["margin-left", "auto", [["margin-left", "auto"]]],
    ["top", "auto", [["top", "auto"]]],
    ["margin", "md", [["margin", "8px"]]],
    ["margin", "gutter", [["margin", "var(--theme-size-gutter)"]]],
  ])(
    "%s = %s keeps its native keyword or theme meaning",
    (key, value, expected) => {
      expect(getCssEquivalent(key, value)).toEqual(expected);
    },
  );

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

  test.each([
    [{ filter: "none" }, { filter: "none" }, "filter: none;"],
    [
      { clip: "rect(0px, 10px, 10px, 0px)" },
      { clipPath: "rect(0px, 10px, 10px, 0px)" },
      "clip-path: rect(0px, 10px, 10px, 0px);",
    ],
    [
      { pointer_events: "none" },
      { pointerEvents: "none", cursor: "default" },
      "pointer-events: none; cursor: default;",
    ],
  ])(
    "%j plays as its CSS keyframe and stylesheet do",
    (keyframe, played, css) => {
      expect(playKeyframe(keyframe)).toEqual(played);
      expect(
        getAnimationContent({
          a: { keyframes: [keyframe], timing: {} } as any,
        }),
      ).toContain(`to { ${css} }`);
      const [k, v] = Object.entries(keyframe)[0]!;
      expect(getStyleContent({ s: { [k]: v } })).toContain(
        css.replace("; ", ";\n  "),
      );
    },
  );

  test("a size alias resolves its name and its size", () => {
    expect(playKeyframe({ w: "md" })).toEqual({ width: "8px" });
  });

  test.each([
    [{ color: "initial" }, { color: "initial" }],
    [{ width: "inherit" }, { width: "inherit" }],
    [{ filter: "revert-layer" }, { filter: "revert-layer" }],
    [{ margin: "auto" }, { margin: "auto" }],
    [{ margin: "auto 0" }, { margin: "auto 0px" }],
    [{ width: "max-content" }, { width: "max-content" }],
    [{ min_width: "min-content" }, { minWidth: "min-content" }],
    [{ max_height: "fit-content" }, { maxHeight: "fit-content" }],
    [{ max_width: "stretch" }, { maxWidth: "stretch" }],
    [{ border_width: "thin" }, { borderWidth: "thin" }],
    [{ border_top_width: "thick" }, { borderTopWidth: "thick" }],
    [{ color: "INITIAL" }, { color: "initial" }],
    [{ flex_direction: "inherit" }, { flexDirection: "inherit" }],
  ])("the native keyword in %j plays unchanged", (keyframe, played) => {
    expect(playKeyframe(keyframe)).toEqual(played);
  });

  test.each([
    [
      { spinner_color: "sky_60" },
      { "--spinner-color": "var(--theme-color-sky_60)" },
    ],
    [
      { fill_color: "red_60" },
      { "--_fill-color": "var(--theme-color-red_60)" },
    ],
    [{ "--x": "1" }, { "--x": "1" }],
  ])("the custom property from %j keeps its name", (keyframe, played) => {
    expect(playKeyframe(keyframe)).toEqual(played);
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

  test("an animation name in a screen style", () => {
    const css = JSON.stringify(
      renderCssVDOM(
        parseSparkle("style fade\n  duration = 2\n  easing = ease-in"),
        {
          components: {},
          state: {},
        },
      ),
    );
    expect(css).toContain("animation-duration:2s;");
    expect(css).toContain("animation-timing-function:ease-in;");
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
