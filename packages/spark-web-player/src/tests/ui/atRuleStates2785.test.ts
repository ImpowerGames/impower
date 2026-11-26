import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { getStyleContent } from "@impower/spark-dom/src/utils/getStyleContent";
import {
  GAME_WIDE_STATES,
  isAtRuleState,
  selectorStateArguments,
  WRITTEN_SELECTOR_STATES,
  writeSparkleSelectorChecked,
} from "../../../../sparkle-style-transformer/src/utils/sparkleSelector";
import {
  anchorSelfTargeted as anchorBase,
  writeSparkleSelectorChecked as writeBase,
} from "./sparkleSelectorBase2785.fixture";
import { AT_RULE_CASES } from "./selectorWriterCases2502";
import { getComponents, parseSparkle, renderCssVDOM } from "../../../../sparkle-screen-renderer/src";
import { createScreenRenderContext } from "../../../../sparkle-screen-preview/src/utils/createScreenRenderContext";

const BREAKPOINTS = { sm: 640 };

const playerCss = (style: Record<string, unknown>) =>
  getStyleContent({ card: style }, { breakpoints: BREAKPOINTS, theme: {} as never });

const vnodeText = (node: unknown): string =>
  typeof node === "string"
    ? node
    : ((node as { children?: unknown[] })?.children ?? []).map(vnodeText).join("");

const previewCss = (lines: string[]) => {
  const parsed = parseSparkle(["style card", ...lines.map((line) => `  ${line}`)].join("\n"));
  return vnodeText(
    renderCssVDOM(parsed, createScreenRenderContext(getComponents(parsed), {}, {} as never, BREAKPOINTS)),
  );
};

const basePrelude = (key: string, colorScheme: "attribute" | "media", afterCombinator = false) => {
  const written = writeBase(key, { breakpoints: BREAKPOINTS, colorScheme, afterCombinator });
  expect(written.refusals, key).toEqual([]);
  return { prelude: anchorBase(written.css), afterCombinator: written.afterCombinator };
};

const OUTER = "icon > badge";

const stateKeys = (name: string): string[] => {
  const takes = selectorStateArguments(name);
  return takes === "none" ? [`@${name}`] : takes === "required" ? [`@${name}(card)`] : [`@${name}`, `@${name}(card)`];
};

const STATES = [...WRITTEN_SELECTOR_STATES];

const SELECTOR_ONLY = STATES.filter((name) => !isAtRuleState(name) && !GAME_WIDE_STATES.has(name))
  .flatMap(stateKeys)
  .flatMap((state) => [state, `card ${state}`, `icon > ${state}`, `>> ${state}`, `${state} @hovered`, `icon, ${state}`]);

const PRELUDES = [
  "",
  " (min-width: 1px)",
  " (min-width: sm)",
  " screen and (min-width: 1px)",
  " (min-width: 1px), print",
  " (min-width: 1px), not screen",
  " (min-width: 1px), speech",
  "(100px>width)",
  " sidebar (width > 1px)",
];

const AT_RULE_ONLY = [
  ...STATES.filter((name) => isAtRuleState(name) && name !== "theme").flatMap((name) =>
    selectorStateArguments(name) === "required"
      ? ["(sm)", "( sm )", "(12px)", "(md)"].map((size) => `@${name}${size}`)
      : PRELUDES.map((prelude) => `@${name}${prelude}`),
  ),
  ...AT_RULE_CASES.map(([source]) => source),
  "@container card (min-width: 1px), sidebar (min-width: 2px)",
  '@container style(--mode: dark), style(--mode: "@night")',
  "@container style(--mode: dark), style(--mode: '@night')",
  "@container (min-width: 1px), style(--x: fn(@y))",
  '@container style(--mode: dark), style(--label: ")@night")',
  "@container style(--mode: dark), style(--label: ')@night')",
  "@media screen and (min-resolution: 1.5dppx), print",
];

const THEMED = SELECTOR_ONLY.flatMap((key) => [`@theme(dark) ${key}`, `${key} @theme(light)`, `@theme(dark), ${key}`]);

describe("keys with only selector states, only at-rule states, or the player's @theme are written as on main (#2785)", () => {
  const playerCorpus = [...SELECTOR_ONLY, ...AT_RULE_ONLY, ...THEMED];
  const previewCorpus = [...SELECTOR_ONLY, ...AT_RULE_ONLY, "@theme(dark)", "@theme( light )"];

  test(`the player writes each of ${playerCorpus.length} keys, alone and nested, byte for byte as main`, () => {
    const outer = basePrelude(OUTER, "attribute");
    for (const key of playerCorpus) {
      const { prelude } = basePrelude(key, "attribute");
      expect(playerCss({ [key]: { opacity: "0.5" } }), key).toBe(`.card {\n  ${prelude} {\n    opacity: 0.5;\n  }\n}`);
      const inner = basePrelude(key, "attribute", outer.afterCombinator).prelude;
      expect(playerCss({ [OUTER]: { [key]: { opacity: "0.5" } } }), `${OUTER} / ${key}`).toBe(
        `.card {\n  ${outer.prelude} {\n    ${inner} {\n      opacity: 0.5;\n    }\n  }\n}`,
      );
    }
  });

  test(`the screen preview writes each of ${previewCorpus.length} keys, alone and nested, byte for byte as main`, () => {
    const outer = basePrelude(OUTER, "media");
    for (const key of previewCorpus) {
      const { prelude } = basePrelude(key, "media");
      expect(previewCss([key, "  opacity = 0.5"]), key).toBe(`.style.card { ${prelude} { opacity:0.5; } }`);
      const inner = basePrelude(key, "media", outer.afterCombinator).prelude;
      expect(previewCss([OUTER, `  ${key}`, "    opacity = 0.5"]), `${OUTER} / ${key}`).toBe(
        `.style.card { ${outer.prelude} { ${inner} { opacity:0.5; } } }`,
      );
    }
  });
});

interface Scene {
  viewport: number;
  container: number;
  scheme: "light" | "dark";
  root: Record<string, string>;
  card: Record<string, string>;
}

type Renderer = "player" | "preview";

interface Condition {
  name: string;
  apply: (scene: Scene, on: boolean, renderer: Renderer) => void;
}

const BUSY: Condition = {
  name: "busy",
  apply: (scene, on) => {
    if (on) scene.card["aria-busy"] = "true";
  },
};
const SHOWING: Condition = {
  name: "showing",
  apply: (scene, on) => {
    if (on) scene.root["data-showing"] = "x";
  },
};
const WIDE: Condition = {
  name: "min-width 600px",
  apply: (scene, on) => {
    scene.viewport = on ? 800 : 400;
  },
};
const NARROW_CONTAINER: Condition = {
  name: "container at most 640px",
  apply: (scene, on) => {
    scene.container = on ? 300 : 700;
  },
};
const DARK: Condition = {
  name: "dark",
  apply: (scene, on, renderer) => {
    if (renderer === "player") {
      scene.root["data-color-scheme"] = on ? "dark" : "light";
    } else {
      scene.scheme = on ? "dark" : "light";
    }
  },
};

const COMBINED: [keys: string[], conditions: Condition[]][] = [
  [["@busy @media (min-width: 600px)"], [BUSY, WIDE]],
  [["@media (min-width: 600px) @busy"], [BUSY, WIDE]],
  [["@busy @container-size(sm)"], [BUSY, NARROW_CONTAINER]],
  [["@screen-size(sm) @busy"], [BUSY, NARROW_CONTAINER]],
  [["@busy @theme(dark)"], [BUSY, DARK]],
  [["@theme(dark) @busy"], [BUSY, DARK]],
  [["@showing(x) @media (min-width: 600px)"], [SHOWING, WIDE]],
  [["@media (min-width: 600px) @showing(x) @busy"], [SHOWING, BUSY, WIDE]],
  [["@busy @supports (display: grid) @media (min-width: 600px)"], [BUSY, WIDE]],
  [["@media (min-width: 600px)", "@busy @container-size(sm)"], [BUSY, WIDE, NARROW_CONTAINER]],
  [["@busy", "@media (min-width: 600px) @theme(dark)"], [BUSY, WIDE, DARK]],
];

const nestedStyle = (keys: string[]): Record<string, unknown> =>
  keys.reduceRight<Record<string, unknown>>((inner, key) => ({ [key]: inner }), { opacity: "0.5" });

const stylesheet = (renderer: Renderer, keys: string[]) =>
  renderer === "player"
    ? playerCss({ opacity: "1", ...nestedStyle(keys) })
    : previewCss(["opacity = 1", ...keys.map((key, depth) => `${"  ".repeat(depth)}${key}`), `${"  ".repeat(keys.length)}opacity = 0.5`]);

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});

afterAll(async () => {
  await browser?.close();
});

const attributes = (values: Record<string, string>) =>
  Object.entries(values)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join("");

const opacityIn = async (css: string, scene: Scene) => {
  await page.setViewportSize({ width: scene.viewport, height: 400 });
  await page.emulateMedia({ colorScheme: scene.scheme });
  await page.setContent(
    `<style>${css}</style><div${attributes(scene.root)}><div style="container: screen / inline-size; width: ${scene.container}px"><div class="style card"${attributes(scene.card)}></div></div></div>`,
  );
  return page.evaluate(() => getComputedStyle(document.querySelector(".card")!).opacity);
};

describe("a key that holds a selector state and an at-rule state applies under both, in Chromium (#2785)", () => {
  for (const renderer of ["player", "preview"] as const) {
    test.each(COMBINED.map(([keys, conditions]) => [keys.join(" / "), keys, conditions] as const))(
      `${renderer}: %s`,
      async (_label, keys, conditions) => {
        const css = stylesheet(renderer, keys);
        const seen: string[] = [];
        for (let mask = 0; mask < 1 << conditions.length; mask++) {
          const scene: Scene = { viewport: 800, container: 700, scheme: "light", root: {}, card: {} };
          conditions.forEach((condition, i) => condition.apply(scene, Boolean(mask & (1 << i)), renderer));
          const all = mask === (1 << conditions.length) - 1;
          const opacity = await opacityIn(css, scene);
          const on = conditions.filter((_, i) => mask & (1 << i)).map(({ name }) => name);
          seen.push(`${on.join(" + ") || "none"}: ${opacity}`);
          expect(opacity, `${css}\n${seen.join("\n")}`).toBe(all ? "0.5" : "1");
        }
      },
      30_000,
    );
  }
});

const RAW_QUERY_LISTS = [
  "@media (min-width: 600px), print",
  "@media (min-width: 600px), speech",
  "@media (min-width: 600px), text",
  "@media (min-width: 600px), (min-width: 700px)",
  "@media screen and (min-resolution: 1.5dppx), print",
  "@container (min-width: 1px), card",
  "@container card (min-width: 1px), sidebar (min-width: 2px)",
  '@container style(--mode: dark), style(--mode: "@night")',
  '@container style(--mode: dark), style(--label: ")@night")',
  "@container style(--mode: dark), style(--label: ')@night')",
  "@container (min-width: 1px), style(--x: fn(@y))",
  "@layer base, theme",
  "@layer base, theme.dark",
  "@media (min-width: 1px), (foo: url(x\\)\\)@hovered))",
  "@container (min-width: 1px), style(--x: url(a\\(b))",
  "@media (min-width: 1px), print \\@hovered",
  '@media (min-width: 1px), custom\\"type',
];

const BEFORE_QUERY_LIST = [
  "@busy",
  "@hovered",
  "card",
  "card @focused",
  "#selected",
  "[selected]",
  ":focus",
  ".big",
  "text.headline",
  "card .big",
  "card :is(:not(.absent))",
  "card :is(@focused)",
  "@showing(action)",
  "@theme(dark)",
];

const AFTER_QUERY_LIST = [
  "@busy",
  "@focused",
  "@is(@focused)",
  "card @focused",
  "@focused @media (min-width: 600px)",
  "#selected @focused",
  "@showing(action)",
  "@theme(dark)",
];

const EARLIER_COUNTEREXAMPLES = [
  "@media (min-width: 600px), @busy",
  "@busy @media (min-width: 600px), @focused",
  "@busy @media (min-width: 600px), @focused @media (min-width: 600px)",
  "@busy @media (min-width: 600px), @focused @media (min-width: 700px)",
  "@busy @media (min-width: 600px), card @focused",
  "@busy @media (min-width: 600px), card :is(:not(.absent)) @focused",
  "@busy @media (min-width: 600px), card :is(:not(.absent)) @focused @media (min-width: 600px)",
  "@busy @media (min-width: 600px), card :is(@focused)",
  "@busy @media (min-width: 600px), #selected",
  "@busy @media (min-width: 600px), :focus",
  "@busy @media (min-width: 600px), [selected]",
  "@busy @media (min-width: 600px), .big",
  "@busy @media (min-width: 600px), text.headline",
  "@busy @media (min-width: 600px), card .big",
  "@busy @container (min-width: 1px), card @focused",
  "@busy @container (min-width: 1px), card",
  "@hovered @media (min-width: 1px), text @focused",
  "@media (min-width: 1px), (b) @hovered",
  "@media (min-width: 600px), @busy @media (min-width: 600px)",
  "@hovered @media (min-width: 1px), @focused @media (min-width: 2px)",
  "@media (min-width: 1px), (foo: url(foo\\(bar)) @hovered",
  "@hovered @media (foo: url(foo\\(bar)), print",
  "@hovered @media (foo: url(foo\\)bar)), print",
  "@media (min-width: 1px), print @variant(shout)",
  "@media (min-width: 1px), print @speaker(bunny)",
  '@hovered @media (min-width: 1px), custom\\"type',
];

const MIXED_QUERY_LISTS = [
  ...RAW_QUERY_LISTS.flatMap((list) => BEFORE_QUERY_LIST.map((part) => `${part} ${list}`)),
  ...RAW_QUERY_LISTS.flatMap((list) => AFTER_QUERY_LIST.map((part) => `${list} ${part}`)),
  ...EARLIER_COUNTEREXAMPLES,
];

describe("a raw at-rule that lists queries with a comma beside a selector or state writes no rule (#2785)", () => {
  test(`each of ${MIXED_QUERY_LISTS.length} keys is refused at its query list in both colour-scheme modes and written by neither renderer`, () => {
    for (const key of MIXED_QUERY_LISTS) {
      for (const colorScheme of ["attribute", "media"] as const) {
        const { refusals } = writeSparkleSelectorChecked(key, { breakpoints: BREAKPOINTS, colorScheme });
        const lists = refusals.filter(({ kind }) => kind === "query-list");
        expect(lists.length, `${colorScheme} ${key}`).toBeGreaterThan(0);
        for (const { from, to } of lists) {
          expect(key.slice(from, to), `${colorScheme} ${key}`).toMatch(/^@(media|container|layer) .*,/);
        }
      }
      for (const css of [
        playerCss({ opacity: "1", [key]: { opacity: "0.5" } }),
        previewCss(["opacity = 1", key, "  opacity = 0.5"]),
      ]) {
        expect(css, key).toContain("opacity");
        expect(css, key).not.toContain("0.5");
      }
    }
  });

  test(`each of ${RAW_QUERY_LISTS.length} keys made only of an at-rule with a query list is written by both renderers as on main`, () => {
    for (const key of RAW_QUERY_LISTS) {
      expect(writeSparkleSelectorChecked(key, { breakpoints: BREAKPOINTS, colorScheme: "attribute" }).refusals).toEqual([]);
      expect(playerCss({ [key]: { opacity: "0.5" } }), key).toBe(
        `.card {\n  ${basePrelude(key, "attribute").prelude} {\n    opacity: 0.5;\n  }\n}`,
      );
      expect(previewCss([key, "  opacity = 0.5"]), key).toBe(
        `.style.card { ${basePrelude(key, "media").prelude} { opacity:0.5; } }`,
      );
    }
  });

  test("a comma after a shorthand condition starts another selector", () => {
    for (const colorScheme of ["attribute", "media"] as const) {
      const written = writeSparkleSelectorChecked("@busy @screen-size(sm), @focused @screen-size(sm)", {
        breakpoints: BREAKPOINTS,
        colorScheme,
      });
      expect(written.refusals).toEqual([]);
      expect(written.atRules).toEqual(["@container screen (max-width:640px)"]);
      expect(written.css).toBe('[aria-busy="true"], :focus');
    }
  });
});

describe("a comma list whose selectors hold different at-rule states writes no rule (#2785)", () => {
  test.each([
    ["@busy, @media (min-width: 600px)", "@media"],
    ["@busy, @container-size(sm)", "@container-size"],
    ["@busy @container-size(sm), card", "@container-size"],
    ["@busy @screen-size(sm), @focused", "@screen-size"],
  ])("%s", (key, state) => {
    for (const colorScheme of ["attribute", "media"] as const) {
      const { refusals } = writeSparkleSelectorChecked(key, { breakpoints: BREAKPOINTS, colorScheme });
      expect(refusals.length).toBeGreaterThan(0);
      for (const refusal of refusals) {
        expect(key.slice(refusal.from, refusal.to).startsWith(state)).toBe(true);
      }
    }
    for (const css of [playerCss({ opacity: "1", [key]: { opacity: "0.5" } }), previewCss(["opacity = 1", key, "  opacity = 0.5"])]) {
      expect(css).toContain("opacity");
      expect(css).not.toContain("0.5");
    }
  });

  test("the screen preview refuses a list whose selectors hold different @theme states, which the player writes", () => {
    const key = "@theme(dark), @busy";
    expect(writeSparkleSelectorChecked(key, { breakpoints: BREAKPOINTS, colorScheme: "attribute" }).refusals).toEqual([]);
    expect(
      writeSparkleSelectorChecked(key, { breakpoints: BREAKPOINTS, colorScheme: "media" }).refusals.map(({ from, to }) =>
        key.slice(from, to),
      ),
    ).toEqual(["@theme(dark)"]);
    expect(playerCss({ [key]: { opacity: "0.5" } })).toContain("0.5");
    expect(previewCss([key, "  opacity = 0.5"])).not.toContain("0.5");
  });
});

describe("scopes keep the order they are written in (#2785)", () => {
  const key = "item @busy @scope (.z) @scope (.a)";
  const nested = { "@scope (.z)": { "@scope (.a)": { "item @busy": { opacity: "0.5" } } } };
  const nestedLines = ["@scope (.z)", "  @scope (.a)", "    item @busy", "      opacity = 0.5"];
  const opacityOfItem = async (css: string, outer: string, inner: string) => {
    await page.setViewportSize({ width: 800, height: 400 });
    await page.setContent(
      `<style>${css}</style><div class="style card"><div class="${outer}"><div class="${inner}"><div class="item" aria-busy="true"></div></div></div></div>`,
    );
    return page.evaluate(() => getComputedStyle(document.querySelector(".item")!).opacity);
  };

  for (const renderer of ["player", "preview"] as const) {
    test(`${renderer}: a key with two scopes matches the same elements as the scopes written as nested keys`, async () => {
      const combined =
        renderer === "player"
          ? playerCss({ opacity: "1", [key]: { opacity: "0.5" } })
          : previewCss(["opacity = 1", key, "  opacity = 0.5"]);
      const reference =
        renderer === "player" ? playerCss({ opacity: "1", ...nested }) : previewCss(["opacity = 1", ...nestedLines]);
      expect(await opacityOfItem(reference, "z", "a")).toBe("0.5");
      for (const [outer, inner] of [
        ["z", "a"],
        ["a", "z"],
      ] as const) {
        expect(await opacityOfItem(combined, outer, inner), `${combined}\n${outer} > ${inner}`).toBe(
          await opacityOfItem(reference, outer, inner),
        );
      }
    }, 30_000);
  }
});

describe("a comma list whose selectors share their at-rule states writes one rule for all of them (#2785)", () => {
  test("a breakpoint name and its width are the same condition", () => {
    const written = writeSparkleSelectorChecked("@busy @container-size(sm), @focused @container-size(640px)", {
      breakpoints: BREAKPOINTS,
      colorScheme: "media",
    });
    expect(written.refusals).toEqual([]);
    expect(written.atRules).toEqual(["@container(max-width:640px)"]);
  });

  test("a condition written twice is the same condition", () => {
    const written = writeSparkleSelectorChecked("@busy @screen-size(sm) @screen-size(sm), @focused @screen-size(sm)", {
      breakpoints: BREAKPOINTS,
      colorScheme: "media",
    });
    expect(written.refusals).toEqual([]);
    expect(written.atRules).toEqual(["@container screen (max-width:640px)"]);
  });

  for (const renderer of ["player", "preview"] as const) {
    test(`${renderer}: a selector that holds only the shared condition still styles the element itself`, async () => {
      const css = stylesheet(renderer, ["@container-size(sm), @busy @container-size(sm)"]);
      const cases: [container: number, busy: boolean, opacity: string][] = [
        [300, false, "0.5"],
        [300, true, "0.5"],
        [700, false, "1"],
        [700, true, "1"],
      ];
      for (const [container, busy, opacity] of cases) {
        const scene: Scene = {
          viewport: 800,
          container,
          scheme: "light",
          root: {},
          card: busy ? { "aria-busy": "true" } : {},
        };
        expect(await opacityIn(css, scene), `${css}\n${container} busy=${busy}`).toBe(opacity);
      }
    }, 30_000);
  }
});
