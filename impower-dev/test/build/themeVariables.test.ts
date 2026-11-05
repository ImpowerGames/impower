import { compile, optimize } from "@tailwindcss/node";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { themeColor } from "../../src/build/themeColor";

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
];

const declarations = (block: string) =>
  new Map(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1]!,
      m[2]!.trim(),
    ]),
  );

const midnightBlock = () => {
  const match = THEME_CSS.match(
    /:root\s*,\s*\[data-theme="midnight"\]\s*\{([^}]*)\}/,
  );
  expect(match, "theme.css declares :root, [data-theme=midnight]").toBeTruthy();
  return declarations(match![1]!);
};

const semanticTokens = (heading: string) => {
  const section = TOKENS_MD.split(`#### ${heading}`)[1]!.split(/\n##+ /)[0]!;
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

const midnightTokens = () => semanticTokens("Midnight");

const FOLIO_THEMES = ["charcoal", "chalk"] as const;

const TOKEN_HEADINGS = { charcoal: "Charcoal", chalk: "Chalk" } as const;

const ruleBlocks = () =>
  [...THEME_CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selectors: m[1]!.split(",").map((s) => s.trim()),
    body: m[2]!,
  }));

const themeDeclarations = (theme: string) => {
  const declared = new Map<string, string>();
  for (const { selectors, body } of ruleBlocks()) {
    if (selectors.includes(`[data-theme="${theme}"]`)) {
      for (const [name, value] of declarations(body)) {
        declared.set(name, value);
      }
    }
  }
  return declared;
};

const colorScheme = (theme: string) =>
  ruleBlocks()
    .filter(({ selectors }) => selectors.includes(`[data-theme="${theme}"]`))
    .map(({ body }) => body.match(/(?:^|[;\s])color-scheme:\s*([^;]+);/)?.[1])
    .filter(Boolean);

const tokensSection = (heading: string) =>
  TOKENS_MD.split(`### ${heading}`)[1]!.split(/\n##+ /)[0]!;

const sharedFolioTokens = () =>
  new Map(
    [
      ...tokensSection(
        "Charcoal and Chalk component and code editor variables",
      ).matchAll(/^\| `(--[\w-]+)` \| `([^`]+)` \|/gm),
    ].map((row) => [row[1]!, row[2]!]),
  );

const folioSyntaxTokens = () =>
  [
    ...tokensSection("Charcoal and Chalk syntax variables").matchAll(
      /^\| `(--[\w-]+)` \| `(--[\w-]+)` \| `([^`]+)` \| `([^`]+)` \|/gm,
    ),
  ].map((row) => ({
    name: row[1]!,
    role: row[2]!,
    charcoal: row[3]!,
    chalk: row[4]!,
  }));

const paletteRoles = () => {
  const section = tokensSection("Syntax colours");
  return new Map(
    [
      ...section.matchAll(
        /^\| `(--[\w-]+)` \| `[^`]+` \| `[^`]+` \| `[^`]+` \| `([^`]+)` \| `[^`]+` \| `([^`]+)` \|/gm,
      ),
    ].map((row) => [row[1]!, { charcoal: row[2]!, chalk: row[3]! }]),
  );
};

const editorBlock = () => {
  const blocks = [
    ...THEME_CSS.matchAll(
      /:root\s*,\s*\[data-theme="midnight"\]\s*\{([^}]*)\}/g,
    ),
  ];
  expect(blocks.length, "theme.css declares a second Midnight block").toBe(2);
  return declarations(blocks[1]![1]!);
};

const editorTokens = () => {
  const section = TOKENS_MD.split("### Code editor variables")[1]!.split(
    /\n##+ /,
  )[0]!;
  return new Map(
    [...section.matchAll(/^\| `(--[\w-]+)` \| [^|]+ \| `([^`]+)` \|/gm)].map(
      (row) => [row[1]!, row[2]!],
    ),
  );
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

describe("Midnight semantic colour set", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    delete document.documentElement.dataset["theme"];
  });

  it("declares every variable tokens.md lists for Midnight, with its value", () => {
    const tokens = midnightTokens();
    expect(tokens.size).toBeGreaterThan(20);
    const declared = midnightBlock();
    for (const [name, value] of tokens) {
      expect(declared.get(name), name).toBe(value);
    }
  });

  it("declares only tokens.md's names plus the listed component tokens", () => {
    const allowed = new Set([...midnightTokens().keys(), ...COMPONENT_VARIABLES]);
    expect([...midnightBlock().keys()].filter((n) => !allowed.has(n))).toEqual(
      [],
    );
    for (const name of COMPONENT_VARIABLES) {
      expect(midnightBlock().has(name), name).toBe(true);
    }
  });

  it("gives every semantic and component variable a Tailwind colour that aliases it", () => {
    const colors = inlineThemeColors();
    for (const name of midnightBlock().keys()) {
      expect(colors.get(`--color-${name.slice(2)}`), name).toBe(`var(${name})`);
    }
  });

  it("resolves each colour utility to its semantic variable", async () => {
    const names = [...midnightBlock().keys()].map((n) => n.slice(2));
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
    expect(Object.fromEntries(editorBlock())).toEqual(
      Object.fromEntries(tokens),
    );
  });

  it("keeps the code editor variables out of the semantic block", () => {
    const semantic = midnightBlock();
    for (const name of editorBlock().keys()) {
      expect(semantic.has(name), name).toBe(false);
    }
  });

  it("switches with data-theme and keeps Midnight for none or an unknown one", async () => {
    const style = document.createElement("style");
    style.textContent = `${await compiledUtilities([])}
[data-theme="other"] { --bg: #ffffff; }`;
    document.head.append(style);
    const root = document.documentElement;
    const bg = () => getComputedStyle(root).getPropertyValue("--bg").trim();
    const midnight = themeColor(THEME_CSS);

    expect(bg()).toBe(midnight);
    root.dataset["theme"] = "other";
    expect(bg()).toBe("#ffffff");
    root.dataset["theme"] = "no-such-theme";
    expect(bg()).toBe(midnight);
    root.dataset["theme"] = "midnight";
    expect(bg()).toBe(midnight);
  });
});

describe.each(FOLIO_THEMES)("%s colour set", (theme) => {
  afterEach(() => {
    document.head.innerHTML = "";
    delete document.documentElement.dataset["theme"];
  });

  it("declares every semantic variable tokens.md lists for the theme, with its value", () => {
    const tokens = semanticTokens(TOKEN_HEADINGS[theme]);
    expect(tokens.size).toBeGreaterThan(20);
    const declared = themeDeclarations(theme);
    for (const [name, value] of tokens) {
      expect(declared.get(name), name).toBe(value);
    }
  });

  it("overrides every variable Midnight declares, so none of Midnight's colours shows through", () => {
    const declared = themeDeclarations(theme);
    const midnight = [...midnightBlock().keys(), ...editorBlock().keys()];
    expect(midnight.filter((name) => !declared.has(name))).toEqual([]);
  });

  it("gives the component and code editor variables the values tokens.md records", () => {
    const tokens = sharedFolioTokens();
    expect(tokens.size).toBeGreaterThan(50);
    const declared = themeDeclarations(theme);
    for (const [name, value] of tokens) {
      expect(declared.get(name), name).toBe(value);
    }
  });

  it("gives each syntax variable its role's colour from the theme's palette", () => {
    const rows = folioSyntaxTokens();
    const roles = paletteRoles();
    const declared = themeDeclarations(theme);
    expect(rows.map((row) => row.name).sort()).toEqual(
      [...editorBlock().keys()].filter((n) => n.startsWith("--syntax-")).sort(),
    );
    for (const row of rows) {
      expect(roles.get(row.role)?.[theme], `${row.name} -> ${row.role}`).toBe(
        row[theme],
      );
      expect(declared.get(row.name), row.name).toBe(row[theme]);
    }
  });

  it("sets the colour scheme form controls and scrollbars follow", () => {
    expect(colorScheme(theme)).toEqual([theme === "chalk" ? "light" : "dark"]);
  });

  it("switches the page's colours when data-theme names it", async () => {
    const style = document.createElement("style");
    style.textContent = await compiledUtilities([]);
    document.head.append(style);
    const root = document.documentElement;
    const bg = () => getComputedStyle(root).getPropertyValue("--bg").trim();

    root.dataset["theme"] = theme;
    expect(bg()).toBe(semanticTokens(TOKEN_HEADINGS[theme]).get("--bg"));
    root.dataset["theme"] = "midnight";
    expect(bg()).toBe(themeColor(THEME_CSS));
  });
});

describe("Midnight colour scheme", () => {
  it("is dark", () => {
    expect(colorScheme("midnight")).toEqual(["dark"]);
  });
});
