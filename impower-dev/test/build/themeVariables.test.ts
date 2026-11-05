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

const midnightTokens = () => {
  const section = TOKENS_MD.split("#### Midnight")[1]!.split("\n#### ")[0]!;
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
    "\n## ",
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
