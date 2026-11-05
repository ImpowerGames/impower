import { compile, optimize } from "@tailwindcss/node";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { themeColors } from "../../src/build/themeColor";
import {
  THEMES,
  type Theme,
} from "../../src/modules/spark-editor/workspace/settings/applyTheme";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const read = (relative: string) =>
  fs.readFileSync(path.resolve(HERE, relative), "utf-8");

const IMPOWER_UI_SRC = path.resolve(HERE, "../../../packages/impower-ui/src");
const STYLE_CSS = read("../../../packages/impower-ui/src/style.css");
const THEME_CSS = read("../../../packages/impower-ui/src/theme.css");
const TOKENS_MD = read("../../docs/design/tokens.md");

const COMPONENT_VARIABLES = [
  "--popup",
  "--surface",
  "--tab-ink",
  "--tab-muted",
  "--placeholder",
  "--primary",
  "--focus-ring",
  "--button-ink",
  "--error-strong",
  "--warning-strong",
  "--scrim",
];

const TOKEN_HEADINGS: Record<Theme, string> = {
  charcoal: "Charcoal",
  chalk: "Chalk",
  ink: "Ink",
  paper: "Sepia",
  graphite: "Graphite",
  warm: "Warm Folio",
  midnight: "Midnight",
  dusk: "Dusk",
};

const FOLIO_THEMES = [
  "charcoal",
  "chalk",
  "ink",
  "paper",
  "graphite",
  "warm",
] as const;

const PRESET_SYNTAX_COLUMNS = {
  charcoal: "Charcoal",
  chalk: "Chalk",
  ink: "Ink",
  paper: "Sepia",
} as const;

const LIGHT_THEMES: readonly Theme[] = ["chalk", "paper"];

interface State {
  theme: string;
  surfaces?: string;
  syntax?: string;
}

const declarations = (block: string) =>
  new Map(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1]!,
      m[2]!.trim(),
    ]),
  );

const ruleBlocks = () =>
  [...THEME_CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selectors: m[1]!.split(",").map((s) => s.trim()),
    body: m[2]!,
  }));

const selectorParts = (selector: string) => {
  const parts = [...selector.matchAll(/\[data-(\w+)="([^"]+)"\]/g)];
  return parts.map((m) => m[0]).join("") === selector
    ? parts.map((m) => [m[1]!, m[2]!] as const)
    : null;
};

const specificityOf = (selectors: string[], state: State) => {
  let best = -1;
  for (const selector of selectors) {
    const parts = selectorParts(selector);
    if (
      parts &&
      parts.every(([key, value]) => state[key as keyof State] === value)
    ) {
      best = Math.max(best, parts.length);
    }
  }
  return best;
};

const themeDeclarations = (state: State) => {
  const matching = ruleBlocks()
    .map((block, order) => ({
      ...block,
      order,
      specificity: specificityOf(block.selectors, state),
    }))
    .filter((block) => block.specificity > 0)
    .sort((a, b) => a.specificity - b.specificity || a.order - b.order);
  const declared = new Map<string, string>();
  for (const { body } of matching) {
    for (const [name, value] of declarations(body)) {
      declared.set(name, value);
    }
  }
  return declared;
};

const colorScheme = (theme: string) =>
  ruleBlocks()
    .filter(({ selectors }) => selectors.includes(`[data-theme="${theme}"]`))
    .map(({ body }) => body.match(/(?:^|[;\s])color-scheme:\s*([^;]+);/)?.[1])
    .filter(Boolean);

const semanticTokens = (theme: Theme) => {
  const section = TOKENS_MD.split(`#### ${TOKEN_HEADINGS[theme]}`)[1]!.split(
    /\n##+ /,
  )[0]!;
  const rows = [
    ...section.matchAll(/^\| `(--[\w-]+)` \| [^|]+ \| ([^|]+) \|/gm),
  ];
  return new Map(
    rows.map((row) => {
      const cell = row[2]!.trim();
      const from = cell.match(/\(from `(var\(--[\w-]+\))`\)/);
      return [row[1]!, from ? from[1]! : cell.match(/^`([^`]+)`/)![1]!];
    }),
  );
};

const tokensSection = (heading: string) =>
  TOKENS_MD.split(`### ${heading}`)[1]!.split(/\n##+ /)[0]!;

const editorTokens = () =>
  new Map(
    [
      ...tokensSection("Code editor variables").matchAll(
        /^\| `(--[\w-]+)` \| [^|]+ \| `([^`]+)` \|/gm,
      ),
    ].map((row) => [row[1]!, row[2]!]),
  );

const sharedFolioTokens = () =>
  new Map(
    [
      ...tokensSection(
        "Folio component and code editor variables",
      ).matchAll(/^\| `(--[\w-]+)` \| `([^`]+)` \|/gm),
    ].map((row) => [row[1]!, row[2]!]),
  );

const folioSyntaxTokens = () =>
  [
    ...tokensSection("Folio syntax variables").matchAll(
      /^\| `(--[\w-]+)` \| `(--[\w-]+)` \| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \|/gm,
    ),
  ].map((row) => ({
    name: row[1]!,
    role: row[2]!,
    Charcoal: row[3]!,
    Chalk: row[4]!,
    Ink: row[5]!,
    Sepia: row[6]!,
    Softened: row[7]!,
  }));

const paletteRoles = () =>
  new Map(
    [
      ...tokensSection("Syntax colours").matchAll(
        /^\| `(--[\w-]+)` \| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \|/gm,
      ),
    ].map((row) => [
      row[1]!,
      { Ink: row[4]!, Charcoal: row[5]!, Sepia: row[6]!, Chalk: row[7]! },
    ]),
  );

const midnight = () => themeDeclarations({ theme: "midnight" });

const editorNames = (declared: Map<string, string>) =>
  [...declared.keys()].filter(
    (n) =>
      n.startsWith("--editor-") ||
      (n.startsWith("--syntax-") && n !== "--syntax-active"),
  );

const DERIVED_THEME_NAMES: Record<string, Theme> = {
  Charcoal: "charcoal",
  Chalk: "chalk",
  Ink: "ink",
  Sepia: "paper",
  Graphite: "graphite",
  "Warm Folio": "warm",
  Midnight: "midnight",
  Dusk: "dusk",
};

const derivedSyntaxTokens = () =>
  [
    ...tokensSection("Folio syntax variables").matchAll(
      /^\| `(--[\w-]+)` \| `([^`]+)` \| ([A-Z][^|]+) \|/gm,
    ),
  ].map((row) => ({
    name: row[1]!,
    value: row[2]!,
    themes: [...row[3]!.matchAll(/Warm Folio|[A-Z][a-z]+/g)]
      .map((m) => DERIVED_THEME_NAMES[m[0]])
      .filter((theme): theme is Theme => Boolean(theme)),
  }));

const derivedSyntaxNames = () =>
  new Set(derivedSyntaxTokens().map((row) => row.name));

const syntaxNames = () =>
  editorNames(midnight()).filter(
    (n) => n.startsWith("--syntax-") && !derivedSyntaxNames().has(n),
  );

const srgbToLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

const oklch = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) =>
    srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255),
  ) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, A, B, C: Math.hypot(A, B) };
};

const inlineThemeColors = () => {
  const block = STYLE_CSS.match(/@theme inline\s*\{([^}]*)\}/);
  expect(block, "style.css has an @theme inline block").toBeTruthy();
  return declarations(block![1]!);
};

const compiledUtilities = async (candidates: string[]) => {
  const compiler = await compile(STYLE_CSS, {
    base: IMPOWER_UI_SRC,
    onDependency: () => {},
  });
  return optimize(compiler.build(candidates), { minify: false }).code;
};

const semanticNames = () => {
  const editor = new Set(editorNames(midnight()));
  return [...midnight().keys()].filter((n) => !editor.has(n));
};

describe("Midnight colour set", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    delete document.documentElement.dataset["theme"];
  });

  it("declares only tokens.md's names plus the listed component tokens", () => {
    const allowed = new Set([
      ...semanticTokens("midnight").keys(),
      ...COMPONENT_VARIABLES,
    ]);
    expect(semanticNames().filter((n) => !allowed.has(n))).toEqual([]);
    for (const name of COMPONENT_VARIABLES) {
      expect(midnight().has(name), name).toBe(true);
    }
  });

  it("gives every semantic and component variable a Tailwind colour that aliases it", () => {
    const colors = inlineThemeColors();
    for (const name of semanticNames()) {
      expect(colors.get(`--color-${name.slice(2)}`), name).toBe(`var(${name})`);
    }
  });

  it("resolves each colour utility to its semantic variable", async () => {
    const names = semanticNames().map((n) => n.slice(2));
    const css = await compiledUtilities(names.map((n) => `bg-${n}`));
    for (const name of names) {
      const rule = css.match(
        new RegExp(`\\.bg-${name}\\s*\\{\\s*background-color:\\s*([^;]+);`),
      );
      expect(rule?.[1], `bg-${name}`).toBe(`var(--${name})`);
    }
  });

  it("declares exactly the code editor variables tokens.md lists, with their values", () => {
    const tokens = editorTokens();
    expect(tokens.size).toBeGreaterThan(60);
    const declared = midnight();
    expect(
      Object.fromEntries(editorNames(declared).map((n) => [n, declared.get(n)])),
    ).toEqual(Object.fromEntries(tokens));
  });

  it("keeps Midnight's values on :root when no theme or an unknown one is set", async () => {
    const style = document.createElement("style");
    style.textContent = `${await compiledUtilities([])}
[data-theme="other"] { --bg: #ffffff; }`;
    document.head.append(style);
    const root = document.documentElement;
    const bg = () => getComputedStyle(root).getPropertyValue("--bg").trim();
    const color = themeColors(THEME_CSS).midnight;

    expect(bg()).toBe(color);
    root.dataset["theme"] = "other";
    expect(bg()).toBe("#ffffff");
    root.dataset["theme"] = "no-such-theme";
    expect(bg()).toBe(color);
  });
});

describe.each(THEMES)("%s colour set", (theme) => {
  afterEach(() => {
    document.head.innerHTML = "";
    delete document.documentElement.dataset["theme"];
  });

  it("declares every semantic variable tokens.md lists for the theme, with its value", () => {
    const tokens = semanticTokens(theme);
    expect(tokens.size).toBeGreaterThanOrEqual(20);
    const declared = themeDeclarations({ theme });
    for (const [name, value] of tokens) {
      expect(declared.get(name), name).toBe(value);
    }
  });

  it("declares every variable Midnight declares, so no other theme's colours show through", () => {
    const declared = themeDeclarations({ theme });
    expect([...midnight().keys()].filter((n) => !declared.has(n))).toEqual([]);
  });

  it("sets the colour scheme form controls and scrollbars follow", () => {
    expect(colorScheme(theme)).toEqual([
      LIGHT_THEMES.includes(theme) ? "light" : "dark",
    ]);
  });

  it("switches the page's colours when data-theme names it", async () => {
    const style = document.createElement("style");
    style.textContent = await compiledUtilities([]);
    document.head.append(style);
    const root = document.documentElement;
    const bg = () => getComputedStyle(root).getPropertyValue("--bg").trim();

    root.dataset["theme"] = theme;
    expect(bg()).toBe(themeColors(THEME_CSS)[theme]);
  });
});

describe.each(FOLIO_THEMES)("%s component and editor variables", (theme) => {
  it("gives them the values tokens.md records for the Folio themes", () => {
    const tokens = sharedFolioTokens();
    expect(tokens.size).toBeGreaterThan(50);
    const declared = themeDeclarations({ theme });
    for (const [name, value] of tokens) {
      expect(declared.get(name), name).toBe(value);
    }
  });
});

describe("Dusk component and editor variables", () => {
  it("are Midnight's", () => {
    const dusk = themeDeclarations({ theme: "dusk" });
    const declared = midnight();
    for (const name of [...COMPONENT_VARIABLES, ...editorNames(declared)]) {
      expect(dusk.get(name), name).toBe(declared.get(name));
    }
  });
});

describe("syntax variables", () => {
  const rows = folioSyntaxTokens();

  it("lists every syntax variable the editor reads", () => {
    expect(rows.map((row) => row.name).sort()).toEqual(syntaxNames().sort());
  });

  it.each(Object.entries(PRESET_SYNTAX_COLUMNS))(
    "gives %s each variable its role's colour from the theme's palette",
    (theme, column) => {
      const roles = paletteRoles();
      const declared = themeDeclarations({ theme });
      for (const row of rows) {
        expect(roles.get(row.role)?.[column], `${row.name} -> ${row.role}`).toBe(
          row[column],
        );
        expect(declared.get(row.name), row.name).toBe(row[column]);
      }
    },
  );

  it.each(["graphite", "warm"])(
    "gives %s Softened by default and Midnight's colours under Original",
    (theme) => {
      const original = midnight();
      for (const syntax of [undefined, "softened"]) {
        const declared = themeDeclarations({ theme, syntax });
        for (const row of rows) {
          expect(declared.get(row.name), `${syntax} ${row.name}`).toBe(
            row.Softened,
          );
        }
      }
      const declared = themeDeclarations({ theme, syntax: "original" });
      for (const name of syntaxNames()) {
        expect(declared.get(name), name).toBe(original.get(name));
      }
    },
  );

  it("softens Original by reducing OKLab chroma by 20% at the same lightness and hue", () => {
    const original = midnight();
    for (const row of rows) {
      const from = oklch(original.get(row.name)!);
      const to = oklch(row.Softened);
      expect(to.L, `${row.name} lightness`).toBeCloseTo(from.L, 2);
      expect(to.C, `${row.name} chroma`).toBeCloseTo(from.C * 0.8, 2);
      expect(to.A, `${row.name} hue (a)`).toBeCloseTo(from.A * 0.8, 2);
      expect(to.B, `${row.name} hue (b)`).toBeCloseTo(from.B * 0.8, 2);
    }
  });

  it("gives each derived syntax variable the value tokens.md records for each theme", () => {
    const derived = derivedSyntaxTokens();
    expect(derived.length).toBeGreaterThan(0);
    const covered = new Map<string, Set<Theme>>();
    for (const { name, value, themes } of derived) {
      expect(themes.length, name).toBeGreaterThan(0);
      for (const theme of themes) {
        for (const syntax of [undefined, "original", "softened"]) {
          expect(
            themeDeclarations({ theme, syntax }).get(name),
            `${theme} ${syntax} ${name}`,
          ).toBe(value);
        }
        covered.set(name, (covered.get(name) ?? new Set()).add(theme));
      }
    }
    for (const [name, themes] of covered) {
      expect([...themes].sort(), name).toEqual([...THEMES].sort());
    }
  });

  it("gives Dusk Midnight's colours", () => {
    const dusk = themeDeclarations({ theme: "dusk" });
    for (const name of syntaxNames()) {
      expect(dusk.get(name), name).toBe(midnight().get(name));
    }
  });

  it("ignores Original on a theme that does not offer it", () => {
    for (const theme of ["charcoal", "ink"]) {
      expect(
        Object.fromEntries(themeDeclarations({ theme, syntax: "original" })),
      ).toEqual(Object.fromEntries(themeDeclarations({ theme })));
    }
  });
});

describe("Lighter navigation", () => {
  it.each(["graphite", "warm"])(
    "draws %s's writing pane in the deeper colour under layered and the page colour under unified",
    (theme) => {
      expect(
        themeDeclarations({ theme, surfaces: "layered" }).get("--workspace"),
      ).toBe("var(--workspace-deep)");
      expect(
        themeDeclarations({ theme, surfaces: "unified" }).get("--workspace"),
      ).toBe("var(--bg)");
      expect(semanticTokens(theme as Theme).get("--workspace-deep")).not.toBe(
        semanticTokens(theme as Theme).get("--bg"),
      );
    },
  );

  it("leaves every other theme's writing pane alone", () => {
    for (const theme of THEMES.filter((t) => t !== "graphite" && t !== "warm")) {
      expect(
        themeDeclarations({ theme, surfaces: "layered" }).get("--workspace"),
        theme,
      ).toBe(themeDeclarations({ theme }).get("--workspace"));
    }
  });
});
