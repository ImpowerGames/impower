import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");

const PAGE_FILES = [
  "impower-dev/src/public/document.css",
  "impower-dev/src/modules/spark-editor/styles/theme/theme.css",
];

const SOURCE_EXTENSIONS = /\.(css|scss|html|[cm]?[jt]sx?)$/;

const TEST_SOURCE = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

const sources = (): Map<string, string> => {
  const listed = execFileSync("git", ["ls-files"], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter((file) => SOURCE_EXTENSIONS.test(file) && !TEST_SOURCE.test(file));
  return new Map(listed.map((file) => [file, fs.readFileSync(path.join(REPO, file), "utf8")]));
};

const declaredProperties = (css: string): string[] =>
  [...css.matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)].map((match) => match[1]!);

const readsProperty = (text: string, name: string): boolean => {
  const escaped = name.replace(/[-]/g, "\\-");
  const end = "(?![\\w-])";
  return [
    new RegExp(`var\\(\\s*${escaped}${end}`),
    new RegExp(`\\(\\s*${escaped}\\s*\\)`),
    new RegExp(`getPropertyValue\\(\\s*["'\`]${escaped}["'\`]`),
  ].some((pattern) => pattern.test(text));
};

describe("the editor page's own stylesheets", () => {
  const all = sources();

  it.each(PAGE_FILES)("declare only custom properties something reads: %s", (file) => {
    const declared = [...new Set(declaredProperties(all.get(file)!))];
    const unread = declared.filter((name) => ![...all.values()].some((text) => readsProperty(text, name)));
    expect(unread).toEqual([]);
  });

  it("counts a read, not another declaration or a mention, as a reader", () => {
    expect(readsProperty(":root { --a: 1px; }", "--a")).toBe(false);
    expect(readsProperty("Set --a to change the gap.", "--a")).toBe(false);
    expect(readsProperty('el.style.setProperty("--a", "1px");', "--a")).toBe(false);
    expect(readsProperty(".x { gap: var(--a); }", "--a")).toBe(true);
    expect(readsProperty(".x { gap: var( --a, 2px); }", "--a")).toBe(true);
    expect(readsProperty('<div class="gap-(--a)">', "--a")).toBe(true);
    expect(readsProperty('getComputedStyle(el).getPropertyValue("--a")', "--a")).toBe(true);
    expect(readsProperty(".x { gap: var(--ab); }", "--a")).toBe(false);
  });
});
