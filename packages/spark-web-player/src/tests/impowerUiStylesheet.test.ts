import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const ENTRY = resolve(__dirname, "../impower-ui.css");

const build = async () => {
  const compiler = await compile(readFileSync(ENTRY, "utf8"), {
    base: dirname(ENTRY),
    onDependency: () => {},
  });
  return compiler.build(new Scanner({ sources: compiler.sources }).scan());
};

const escapeClass = (name: string) =>
  name.replace(/[[\]():.,/]/g, (c) => `\\${c}`);

const topLevelRule = (css: string, name: string) => {
  const selector = `.${escapeClass(name)} {`;
  const at = css.indexOf(selector);
  if (at < 0) return null;
  let depth = 0;
  for (let i = 0; i < at; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") depth--;
  }
  return depth;
};

describe("the player's impower-ui stylesheet for the VS Code Game Preview", () => {
  test("generates the route list's head, tab, row and close classes outside any cascade layer", async () => {
    const css = await build();
    for (const name of [
      "sticky",
      "flex-row",
      "h-[var(--panel-head-height)]",
      "min-h-[var(--tab-height)]",
      "min-h-[var(--list-row-compact-height)]",
      "size-[var(--control-size)]",
      "absolute",
    ]) {
      expect(topLevelRule(css, name), name).toBe(0);
    }
    expect(css).not.toMatch(/@layer utilities/);
  }, 60_000);

  test("leaves out Tailwind's preflight and Folio's theme values", async () => {
    const css = await build();
    expect(css).not.toMatch(/@layer base/);
    expect(css).not.toMatch(/--panel:\s*(#|rgb|hsl)/);
  }, 60_000);

  test("leaves the token values to the Game Preview webview and lets impower-ui parts lay out from initial values", async () => {
    const css = await build();
    expect(css).not.toMatch(
      /--(tab-height|panel-head-height|list-row-compact-height|control-size|control-radius|accent|panel|edge|ink):/,
    );
    const reset = css.match(
      /body spark-web-player :where\(\[data-panel-head\], \[data-impower-ui\]\)[^{]*\{([^}]*)\}/,
    )?.[1];
    expect(reset).toMatch(/flex-direction:\s*row/);
    expect(reset).toMatch(/position:\s*static/);
  }, 60_000);
});
