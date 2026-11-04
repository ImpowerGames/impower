import { describe, expect, test, vi } from "vitest";
import AnimationPlayer from "../../../../spark-dom/src/classes/AnimationPlayer";
import { getAnimationContent } from "../../../../spark-dom/src/utils/getAnimationContent";
import { getStyleContent } from "../../../../spark-dom/src/utils/getStyleContent";
import breakpoints from "../../../../spark-engine/src/game/modules/ui/builtinBreakpoints.json";
import {
  getComponents,
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
import { getThemeVariables } from "../../../../sparkle-style-transformer/src/utils/getThemeVariables";
import { getScreenTheme } from "../../../../sparkle-screen-preview/src/utils/getScreenTheme";

const ALIASES: Record<string, string> = { ...STYLE_ALIASES, ...CSS_ALIASES };

const theme: ReadonlySet<string> = new Set([
  "--theme-color-sky_60",
  "--theme-color-red_60",
  "--theme-size-gutter",
  "--theme-filter-dim",
  "--theme-ease-bounce",
  "--theme-gradient-sunset",
  "--theme-image-hero",
  "--theme-mask-fade",
  "--theme-ratio-golden",
  "--theme-z-index-dialog",
  "--theme-animation-pulse",
  "--theme-text-leading-loose",
  "--theme-font-display",
]);

const noTheme: ReadonlySet<string> = new Set();

const SAMPLE_VALUES = ["sky_60", "10", "md", "none", "ease-in", "2s", ""];

describe("every alias resolves through the table that owns its value", () => {
  for (const [alias, target] of Object.entries(ALIASES)) {
    test(`${alias} -> ${target}`, () => {
      expect(CSS_UTILITIES).toHaveProperty([target]);
      for (const value of SAMPLE_VALUES) {
        expect(getCssEquivalent(alias, value, theme)).toEqual(
          getCssEquivalent(target, value, theme),
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
    expect(getCssEquivalent(key, value, theme)).toEqual(expected);
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
        expect(getCssEquivalent(key, keyword, theme)).toEqual(expected);
      });

      test.each(Object.keys(STYLE_TRANSFORMERS))(
        "the %s transformer returns it as written",
        (name) => {
          const transform = (
            STYLE_TRANSFORMERS as Record<
              string,
              (v: string, t: ReadonlySet<string>) => string
            >
          )[name]!;
          expect(transform(keyword, theme)).toBe(keyword);
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
    expect(getCssEquivalent(key, value, theme)).toEqual(expected);
  });

  test.each([
    ["filter", "inherit"],
    ["backdrop-filter", "revert"],
    ["bg-color", "initial"],
  ])(
    "a sparkle attribute %s = %s keeps its CSS-wide keyword",
    (prop, keyword) => {
      const { styles } = generateSparkleAttributesAndStyles(
        { [prop]: keyword },
        { theme },
      );
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
    expect(getCssEquivalent(key, value, theme)).toEqual(expected);
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
    expect(getCssEquivalent(key, value, theme)).toEqual(expected);
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
      expect(getCssEquivalent(key, value, theme)).toEqual(expected);
    },
  );

  test("an unrecognized name is dropped when unrecognized names are excluded", () => {
    expect(getCssEquivalent("data-foo", "1", theme, false)).toEqual([]);
  });
});

describe("a bare word becomes a theme variable only when the theme defines it", () => {
  test.each([
    ["width", "auto", "auto"],
    ["border-width", "gutter", "var(--theme-size-gutter)"],
    ["color", "canvastext", "canvastext"],
    ["color", "sky_60", "var(--theme-color-sky_60)"],
    ["color", "sky_60/50", "rgb(from var(--theme-color-sky_60) r g b / 50)"],
    ["color", "rebeccapurple/50", "rgb(from rebeccapurple r g b / 50)"],
    ["transition-easing", "linear", "linear"],
    ["easing", "bounce", "var(--theme-ease-bounce)"],
    ["filter", "none", "none"],
    ["filter", "dim", "var(--theme-filter-dim)"],
  ])("%s = %s stays native unless the theme names it", (key, value, css) => {
    const [[, resolved]] = getCssEquivalent(key, value, theme) as [
      [string, string],
    ];
    expect(resolved).toBe(css);
  });

  test.each([
    ["width", "min-content"],
    ["height", "fit-content"],
    ["outline-width", "thin"],
    ["margin", "auto"],
    ["color", "transparent"],
    ["color", "currentColor"],
    ["color", "canvastext"],
    ["color", "sky_60"],
    ["easing", "ease-in-out"],
    ["easing", "step-start"],
    ["easing", "bounce"],
    ["filter", "none"],
    ["filter", "dim"],
    ["backdrop-filter", "none"],
    ["background-image", "none"],
    ["background-image", "hero"],
    ["mask", "fade"],
    ["aspect", "golden"],
    ["z", "dialog"],
    ["animation", "pulse"],
    ["text-leading", "loose"],
    ["text-font", "display"],
  ])("with no theme, %s = %s passes through as written", (key, value) => {
    expect(getCssEquivalent(key, value, noTheme)).toEqual([
      [expect.any(String), value],
    ]);
  });

  test.each([
    ["background-image", "hero", "var(--theme-image-hero)"],
    ["background-image", "sunset", "sunset"],
    ["mask", "fade", "var(--theme-mask-fade)"],
    ["aspect", "golden", "var(--theme-ratio-golden)"],
    ["z", "dialog", "var(--theme-z-index-dialog)"],
    ["animation", "pulse", "var(--theme-animation-pulse)"],
    ["animation", "0.5s infinite bounce", "0.5s infinite bounce"],
    [
      "animation",
      "pulse pulse",
      "var(--theme-animation-pulse), var(--theme-animation-pulse)",
    ],
    ["text-leading", "loose", "var(--theme-text-leading-loose)"],
    ["text-font", "display", "var(--theme-font-display)"],
    [
      "background-image",
      "linear-gradient(to left, sky_60, canvastext)",
      "linear-gradient(to left, var(--theme-color-sky_60), canvastext)",
    ],
  ])("%s = %s resolves only a defined token", (key, value, css) => {
    const [[, resolved]] = getCssEquivalent(key, value, theme) as [
      [string, string],
    ];
    expect(resolved).toBe(css);
  });

  const gradientWordTheme: ReadonlySet<string> = new Set(
    [
      "to",
      "left",
      "in",
      "oklch",
      "from",
      "at",
      "center",
      "circle",
      "closest-side",
      "images",
      "sky_60",
      "srgb",
      "r",
      "g",
      "b",
    ].map((name) => `--theme-color-${name}`),
  );

  test.each([
    [
      "linear-gradient(to left, #000, sky_60)",
      "linear-gradient(to left, #000, var(--theme-color-sky_60))",
    ],
    [
      "linear-gradient(in oklch, sky_60, #fff)",
      "linear-gradient(in oklch, var(--theme-color-sky_60), #fff)",
    ],
    [
      "radial-gradient(circle closest-side at center, sky_60 10%, #fff)",
      "radial-gradient(circle closest-side at center, var(--theme-color-sky_60) 10%, #fff)",
    ],
    [
      "conic-gradient(from 90deg at center, sky_60, #fff)",
      "conic-gradient(from 90deg at center, var(--theme-color-sky_60), #fff)",
    ],
    [
      "linear-gradient(45deg, sky_60, left)",
      "linear-gradient(45deg, var(--theme-color-sky_60), var(--theme-color-left))",
    ],
    [
      "linear-gradient(sky_60, #fff)",
      "linear-gradient(var(--theme-color-sky_60), #fff)",
    ],
    ["url(images/sky_60.png)", "url(images/sky_60.png)"],
    [
      "linear-gradient(/* direction */ to left, sky_60, #fff)",
      "linear-gradient(/* direction */ to left, var(--theme-color-sky_60), #fff)",
    ],
    [
      "linear-gradient(to left /* a, b ( */, sky_60, #fff)",
      "linear-gradient(to left /* a, b ( */, var(--theme-color-sky_60), #fff)",
    ],
    [
      "linear-gradient(color-mix(in srgb, sky_60, #fff), #000)",
      "linear-gradient(color-mix(in srgb, var(--theme-color-sky_60), #fff), #000)",
    ],
    [
      "linear-gradient(rgb(from sky_60 r g b / 50%), #fff)",
      "linear-gradient(rgb(from var(--theme-color-sky_60) r g b / 50%), #fff)",
    ],
  ])(
    "a gradient's setup and a url keep their grammar when the theme names their words: %s",
    (value, css) => {
      expect(
        getCssEquivalent("background-image", value, gradientWordTheme),
      ).toEqual([["background-image", css]]);
    },
  );
});

describe("the screen preview's theme is its shared sheets and theme blocks", () => {
  test("a style rule's or text's --theme-* is not a theme token", () => {
    const parsed = parseSparkle(
      [
        "theme dark",
        "  color-brand = red",
        "style card",
        "  --theme-color-rule = red",
        "screen main",
        '  text "--theme-color-text: red;"',
      ].join("\n"),
    );
    const screenTheme = getScreenTheme(
      parsed,
      getComponents(parsed),
      {},
      {
        shared: ":root { --theme-color-shared: red; }",
      },
    );
    expect([...screenTheme].sort()).toEqual([
      "--theme-color-brand",
      "--theme-color-shared",
    ]);
  });
});

describe("the CSS grammar decides which words are theme colours", () => {
  const grammarTheme: ReadonlySet<string> = new Set(
    [
      "sky_60",
      "café",
      "to",
      "left",
      "in",
      "srgb",
      "display-p3",
      "from",
      "r",
      "g",
      "b",
      "infinity",
      "x",
      "at",
      "center",
      "circle",
      "brand(blue",
    ].map((name) => `--theme-color-${name}`),
  );

  test.each([
    [
      "background-image",
      "linear-gradient(sky_60/**/, #fff)",
      "linear-gradient(var(--theme-color-sky_60)/**/, #fff)",
    ],
    [
      "background-image",
      "linear-gradient(other\\(blue, #fff)",
      "linear-gradient(other\\(blue, #fff)",
    ],
    [
      "background-image",
      "linear-gradient(\\73 ky_60, #fff)",
      "linear-gradient(var(--theme-color-sky_60), #fff)",
    ],
    [
      "background-image",
      "linear-gradient(calc(45deg) in srgb, sky_60, #fff)",
      "linear-gradient(calc(45deg) in srgb, var(--theme-color-sky_60), #fff)",
    ],
    [
      "background-image",
      "radial-gradient(calc(50px) at center, sky_60, #fff)",
      "radial-gradient(calc(50px) at center, var(--theme-color-sky_60), #fff)",
    ],
    [
      "filter",
      "blur(calc(var(--factor, infinity) * 1px))",
      "blur(calc(var(--factor, infinity) * 1px))",
    ],
    [
      "background-image",
      "linear-gradient(var(--direction, to left), red, blue)",
      "linear-gradient(var(--direction, to left), red, blue)",
    ],
    [
      "background-image",
      "linear-gradient(circle, red)",
      "linear-gradient(circle, red)",
    ],
    [
      "background-image",
      "radial-gradient(circle, sky_60)",
      "radial-gradient(circle, var(--theme-color-sky_60))",
    ],
    [
      "background-image",
      "conic-gradient(from 90deg, sky_60, circle)",
      "conic-gradient(from 90deg, var(--theme-color-sky_60), var(--theme-color-circle))",
    ],
    [
      "background-image",
      "linear-gradient(var(--shade, sky_60) 20%, #fff)",
      "linear-gradient(var(--shade, var(--theme-color-sky_60)) 20%, #fff)",
    ],
    [
      "background-image",
      "repeating-linear-gradient(var(--shade, sky_60) 20%, #fff 40%)",
      "repeating-linear-gradient(var(--shade, var(--theme-color-sky_60)) 20%, #fff 40%)",
    ],
    [
      "background-image",
      "conic-gradient(var(--shade, sky_60) 10deg, #fff)",
      "conic-gradient(var(--shade, var(--theme-color-sky_60)) 10deg, #fff)",
    ],
    [
      "background-image",
      "radial-gradient(var(--size, x) 20%, sky_60)",
      "radial-gradient(var(--size, var(--theme-color-x)) 20%, var(--theme-color-sky_60))",
    ],
    [
      "background-image",
      "linear-gradient(var(--shade, sky_60) 20% var(--end, 40%), #fff)",
      "linear-gradient(var(--shade, var(--theme-color-sky_60)) 20% var(--end, 40%), #fff)",
    ],
    [
      "background-image",
      "repeating-linear-gradient(var(--shade, sky_60) 20% var(--end, 40%), #fff 60%)",
      "repeating-linear-gradient(var(--shade, var(--theme-color-sky_60)) 20% var(--end, 40%), #fff 60%)",
    ],
    [
      "background-image",
      "conic-gradient(var(--shade, sky_60) 10deg var(--end, 40deg), #fff)",
      "conic-gradient(var(--shade, var(--theme-color-sky_60)) 10deg var(--end, 40deg), #fff)",
    ],
    [
      "background-image",
      "linear-gradient(to 20%, #fff)",
      "linear-gradient(to 20%, #fff)",
    ],
    [
      "background-image",
      "linear-gradient(in 20%, #fff)",
      "linear-gradient(in 20%, #fff)",
    ],
    [
      "background-image",
      "linear-gradient(0 in srgb, sky_60, #fff)",
      "linear-gradient(0 in srgb, var(--theme-color-sky_60), #fff)",
    ],
    ["color", "brand\\(blue", "var(--theme-color-brand\\(blue)"],
    ["color", "rebeccapurple/**/", "rebeccapurple/**/"],
    ["color", "\\73 ky_60", "var(--theme-color-sky_60)"],
    ["color", "sky_60/50", "rgb(from var(--theme-color-sky_60) r g b / 50)"],
    ["color", "#ff0000", "#ff0000"],
    ["color", "current", "currentColor"],
    ["filter", "var(--f, x)", "var(--f, x)"],
    ["background-image", "var(--img, sky_60)", "var(--img, sky_60)"],
    [
      "filter",
      "drop-shadow(0 0 2px var(--shade, sky_60))",
      "drop-shadow(0 0 2px var(--shade, var(--theme-color-sky_60)))",
    ],
    [
      "background-image",
      "linear-gradient(/* to left */ to left /* sky_60 */, sky_60, 'left')",
      "linear-gradient(/* to left */ to left /* sky_60 */, var(--theme-color-sky_60), 'left')",
    ],
    [
      "background-image",
      "linear-gradient(to /* c */ left, sky_60 /* , */, #fff)",
      "linear-gradient(to /* c */ left, var(--theme-color-sky_60) /* , */, #fff)",
    ],
    [
      "background-image",
      "linear-gradient(café, #fff)",
      "linear-gradient(var(--theme-color-café), #fff)",
    ],
    [
      "background-image",
      "url(left.png), url( 'sky_60.png' )",
      "url(left.png), url( 'sky_60.png' )",
    ],
    [
      "background-image",
      'image-set("sky_60.png" 1x, linear-gradient(sky_60, #fff) 2x)',
      'image-set("sky_60.png" 1x, linear-gradient(var(--theme-color-sky_60), #fff) 2x)',
    ],
    [
      "background-image",
      "linear-gradient(color(srgb 1 0 0), color(display-p3 0 1 0))",
      "linear-gradient(color(srgb 1 0 0), color(display-p3 0 1 0))",
    ],
    [
      "background-image",
      "linear-gradient(in srgb, color(from sky_60 srgb r g b), #fff)",
      "linear-gradient(in srgb, color(from var(--theme-color-sky_60) srgb r g b), #fff)",
    ],
    [
      "color",
      "color-mix(in srgb, sky_60, white 20%)",
      "color-mix(in srgb, var(--theme-color-sky_60), white 20%)",
    ],
    [
      "background-color",
      "rgb(from sky_60 r g b / 50%)",
      "rgb(from var(--theme-color-sky_60) r g b / 50%)",
    ],
    [
      "border-color",
      "light-dark(sky_60, #000)",
      "light-dark(var(--theme-color-sky_60), #000)",
    ],
    [
      "filter",
      "drop-shadow(0 0 calc(infinity * 1px) sky_60)",
      "drop-shadow(0 0 calc(infinity * 1px) var(--theme-color-sky_60))",
    ],
    ["filter", "blur(calc(infinity * 1px))", "blur(calc(infinity * 1px))"],
    ["color", "var(--x, sky_60)", "var(--x, var(--theme-color-sky_60))"],
  ])("%s = %s", (key, value, css) => {
    const [[, resolved]] = getCssEquivalent(key, value, grammarTheme) as [
      [string, string],
    ];
    expect(resolved).toBe(css);
  });

  test.each([
    ["width", "gu\\tter", "var(--theme-size-gutter)"],
    ["easing", "\\62 ounce", "var(--theme-ease-bounce)"],
    ["filter", "\\64 im", "var(--theme-filter-dim)"],
    ["width", "gu\\tters", "gu\\tters"],
  ])(
    "an escaped %s name %s resolves by its decoded name",
    (key, value, css) => {
      const escapedTheme: ReadonlySet<string> = new Set([
        "--theme-size-gutter",
        "--theme-ease-bounce",
        "--theme-filter-dim",
      ]);
      const [[, resolved]] = getCssEquivalent(key, value, escapedTheme) as [
        [string, string],
      ];
      expect(resolved).toBe(css);
    },
  );

  test.each([
    [
      "an escaped name",
      ":root { --theme-color-brand\\(blue: red; }",
      ["--theme-color-brand(blue"],
    ],
    [
      "a custom property's block value",
      ":root { --payload: { --theme-color-rebeccapurple: red; }; --theme-color-sky_60: blue; }",
      ["--theme-color-sky_60"],
    ],
    [
      "a nested rule whose selector holds a colon",
      ".a { a:hover { --theme-color-nested: red } }",
      ["--theme-color-nested"],
    ],
    [
      "a declaration after a nested rule",
      ".a { .b { color: red } --theme-color-after: red }",
      ["--theme-color-after"],
    ],
    [
      "an unquoted url() holding declaration text",
      ".a { background: url(a;--theme-color-url:b) }",
      [],
    ],
    [
      "an @media block",
      "@media (width > 1px) { :root { --theme-color-media: red } }",
      ["--theme-color-media"],
    ],
    [
      "an @supports prelude and its block",
      "@supports (--theme-color-query: red) { :root { --theme-color-supported: red } }",
      ["--theme-color-supported"],
    ],
    [
      "an @container style() prelude",
      "@container style(--theme-color-container: red) { .a { color: red } }",
      [],
    ],
    [
      "an @property rule",
      '@property --theme-color-registered { syntax: "<color>"; inherits: true; initial-value: red }',
      [],
    ],
    [
      "a comment between name and colon",
      ":root { --theme-color-commented /* note */ : red }",
      ["--theme-color-commented"],
    ],
  ])("%s", (_name, css, expected) => {
    expect([...getThemeVariables(css)]).toEqual(expected);
  });
});

describe("a gradient's first argument is read like its stops, gradient keywords aside", () => {
  const keywordTheme: ReadonlySet<string> = new Set(
    [
      "sky_60",
      "to",
      "left",
      "right",
      "top",
      "in",
      "oklch",
      "longer",
      "hue",
      "circle",
      "ellipse",
      "farthest-corner",
      "at",
      "center",
      "from",
    ].map((name) => `--theme-color-${name}`),
  );

  test.each([
    [
      "linear-gradient(to right, sky_60, #fff)",
      "linear-gradient(to right, var(--theme-color-sky_60), #fff)",
    ],
    [
      "linear-gradient(45deg, sky_60, #fff)",
      "linear-gradient(45deg, var(--theme-color-sky_60), #fff)",
    ],
    [
      "linear-gradient(sky_60 10%, #fff)",
      "linear-gradient(var(--theme-color-sky_60) 10%, #fff)",
    ],
    [
      "linear-gradient(in oklch longer hue, sky_60, #fff)",
      "linear-gradient(in oklch longer hue, var(--theme-color-sky_60), #fff)",
    ],
    [
      "radial-gradient(ellipse, sky_60, #fff)",
      "radial-gradient(ellipse, var(--theme-color-sky_60), #fff)",
    ],
    [
      "radial-gradient(farthest-corner, sky_60, #fff)",
      "radial-gradient(farthest-corner, var(--theme-color-sky_60), #fff)",
    ],
    [
      "radial-gradient(at left top, sky_60, #fff)",
      "radial-gradient(at left top, var(--theme-color-sky_60), #fff)",
    ],
    [
      "radial-gradient(sky_60 10%, #fff)",
      "radial-gradient(var(--theme-color-sky_60) 10%, #fff)",
    ],
    [
      "conic-gradient(from 45deg, sky_60, #fff)",
      "conic-gradient(from 45deg, var(--theme-color-sky_60), #fff)",
    ],
    [
      "conic-gradient(at center, sky_60, #fff)",
      "conic-gradient(at center, var(--theme-color-sky_60), #fff)",
    ],
    [
      "linear-gradient(var(--a), sky_60)",
      "linear-gradient(var(--a), var(--theme-color-sky_60))",
    ],
    [
      "linear-gradient(var(--a, sky_60), #fff)",
      "linear-gradient(var(--a, var(--theme-color-sky_60)), #fff)",
    ],
    [
      "linear-gradient(var(--dir, to left), sky_60)",
      "linear-gradient(var(--dir, to left), var(--theme-color-sky_60))",
    ],
    [
      "linear-gradient(left 10%, left 90%)",
      "linear-gradient(left 10%, var(--theme-color-left) 90%)",
    ],
    [
      "radial-gradient(circle, circle)",
      "radial-gradient(circle, var(--theme-color-circle))",
    ],
  ])("background-image = %s", (value, css) => {
    expect(getCssEquivalent("background-image", value, keywordTheme)).toEqual([
      ["background-image", css],
    ]);
  });
});

describe("theme variables come only from declarations", () => {
  test("comments and quoted text do not define a token", () => {
    expect([
      ...getThemeVariables(
        `/* --theme-color-commented: red; */
:root {
  --theme-color-declared: red;
  --theme-size-gap:4px;
}
div::before { content: "--theme-color-quoted: red"; }
div::after { content: '--theme-color-single: red'; }`,
      ),
    ]).toEqual(["--theme-color-declared", "--theme-size-gap"]);
  });

  test("a feature query's property is not a declaration", () => {
    expect([
      ...getThemeVariables(
        `@supports ( --theme-color-queried: red ) {
  .card { color: rebeccapurple; --theme-color-declared: red; }
}
@supports not (--theme-color-negated:red) { .x { color: red } }`,
      ),
    ]).toEqual(["--theme-color-declared"]);
  });

  test("an inline style's declarations count from its first character", () => {
    expect([
      ...getThemeVariables("--theme-size-gap:4px; --theme-color-brand: red"),
    ]).toEqual(["--theme-size-gap", "--theme-color-brand"]);
  });

  test("a reference to a theme variable does not define it", () => {
    expect([
      ...getThemeVariables(":root { color: var(--theme-color-used); }"),
    ]).toEqual([]);
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
      new AnimationPlayer(theme).add({
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
        getAnimationContent(
          { a: { keyframes: [keyframe], timing: {} } as any },
          theme,
        ),
      ).toContain(`to { ${css} }`);
      const [k, v] = Object.entries(keyframe)[0]!;
      expect(
        getStyleContent({ s: { [k]: v } }, { breakpoints, theme }),
      ).toContain(css.replace("; ", ";\n  "));
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
      renderHtmlVDOM(parsed, {
        components: {},
        state: {},
        options: { breakpoints, theme },
      }),
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
          options: { breakpoints, theme },
        },
      ),
    );
    expect(css).toContain("animation-duration:2s;");
    expect(css).toContain("animation-timing-function:ease-in;");
  });
});

describe("style content resolves tokens through the same table", () => {
  test("a spinner-color token becomes a theme var", () => {
    const css = getStyleContent(
      { busy: { spinner_color: { $type: "color", $name: "sky_60" } } },
      { breakpoints, theme },
    );
    expect(css).toContain("--spinner-color: var(--theme-color-sky_60);");
  });

  test("an animation duration number gains its unit", () => {
    const css = getStyleContent(
      { fade: { duration: 2, delay: 0.5 } },
      { breakpoints, theme },
    );
    expect(css).toContain("animation-duration: 2s;");
    expect(css).toContain("animation-delay: 0.5s;");
  });
});
