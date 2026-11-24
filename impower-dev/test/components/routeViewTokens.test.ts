import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const HOST_TOKENS = read(
  "src/modules/spark-editor/components/preview-route/route-view.css",
);
const PLAYER = "../packages/spark-web-player/src";
const VIEW_SOURCES = ["route", "saves"].flatMap((dir) =>
  readdirSync(join(PLAYER, dir))
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => join(PLAYER, dir, name)),
);
const VIEWS = VIEW_SOURCES.map(read).join("\n");
const VALUES_VIEW = read(`${PLAYER}/route/StartingValuesViews.tsx`);
const SAVES_VIEW = read(`${PLAYER}/saves/SavesViews.tsx`);
const ROUTE_VIEWS = read(`${PLAYER}/route/RouteViews.tsx`);

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === "out" || name === "dist") return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(css|tsx?|html|mjs)$/.test(name) ? [path] : [];
  });

const rules = (css: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector!.trim(),
    body: body!,
  }));

const declared = (css: string, selector: string, token: string) =>
  rules(css)
    .find((rule) => rule.selector === selector)
    ?.body.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1]
    ?.trim();

const TOOLBAR_ONLY = new Set([
  "--swp-toolbar-button-active-color",
  "--swp-toolbar-button-hover-color",
]);

describe("the hosted route list's tokens", () => {
  it("leave the player's retired route and Saves stylesheets and their size variables behind", () => {
    expect(existsSync(`${PLAYER}/route/route-list.css`)).toBe(false);
    expect(existsSync(`${PLAYER}/saves/saves.css`)).toBe(false);
    const readers = [
      "src",
      "test",
      "../packages/spark-web-player/src",
      "../packages/impower-ui/src",
      "../vscode-sparkdown/src",
      "../sparkdown-player-app/src",
    ]
      .flatMap(sourceFiles)
      .filter((file) => !file.endsWith("routeViewTokens.test.ts"))
      .filter((file) => /--swp-route-(row-height|control-size)|(route-list|saves)\.css\?inline/.test(read(file)));
    expect(readers).toEqual([]);
  });

  it("are all set by the editor where the views only read them", () => {
    const read = new Set([...VIEWS.matchAll(/--swp-[\w-]+/g)].map((match) => match[0]));
    const set = new Set([...HOST_TOKENS.matchAll(/(--swp-[\w-]+)\s*:/g)].map((match) => match[1]!));
    expect([...read].filter((token) => !set.has(token) && !TOOLBAR_ONLY.has(token))).toEqual([]);
  });

  it("size a value row 24px and its clear slot 22px under a fine pointer, and both 44px under a coarse one", () => {
    expect(declared(HOST_TOKENS, ":root swp-route-view .route-list", "--control-size")).toBe("22px");
    expect(declared(HOST_TOKENS, ":root swp-route-view .sv-tab", "--list-row-compact-height")).toBe("24px");
    const coarse = ':root[data-pointer="coarse"] swp-route-view .sv-tab';
    expect(declared(HOST_TOKENS, coarse, "--list-row-compact-height")).toBe("44px");
    expect(declared(HOST_TOKENS, coarse, "--control-size")).toBe("44px");
    expect(VALUES_VIEW).toMatch(/"sv-clear-slot [^"]*\bw-\(--control-size\)/);
    expect(SAVES_VIEW).toMatch(/"sv-row saves-value-row [^"]*\bh-\(--list-row-compact-height\)/);
  });

  it("cap the top bar's Saves menu at the popup's available height, over the player's own default", () => {
    const token = "--swp-saves-menu-max-height";
    expect(declared(HOST_TOKENS, ":root swp-route-view", token)).toMatch(
      /^var\(\s*--radix-popover-content-available-height,/,
    );
    expect(SAVES_VIEW).toMatch(/"saves-menu [^"]*\bmax-h-\[var\(--swp-saves-menu-max-height,calc\(100cqh-12px\)\)\]/);
  });

  it("keep the pinned tab head above the positioned rows that scroll under it, and the field popups above the head", () => {
    const headClasses = (
      ROUTE_VIEWS.match(/<PanelHead[^>]*?class="([^"]*)"/)?.[1] ?? ""
    ).split(/\s+/);
    expect(headClasses).toContain("sticky");
    const zOf = (classes: string) => Number(classes.match(/\bz-(\d+)\b/)?.[1] ?? 0);
    const headZ = zOf(headClasses.join(" "));
    expect(headZ).toBeGreaterThan(0);
    const valueRows = [...VIEWS.matchAll(/"sv-row[^"]*"/g)].map((match) => match[0]);
    expect(valueRows.length).toBeGreaterThan(0);
    for (const row of valueRows) {
      expect(row).toMatch(/\brelative\b/);
      expect(zOf(row)).toBe(0);
    }
    const popup = SAVES_VIEW.match(/"sv-popup [^"]*"/)?.[0] ?? "";
    expect(zOf(popup)).toBeGreaterThan(headZ);
  });
});
