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

const SOURCE_ROOTS = ["impower-dev/src", "packages"];

const SOURCE_EXTENSIONS = /\.(css|html|tsx?|mjs|js)$/;

const sources = (): Map<string, string> => {
  const listed = execFileSync("git", ["ls-files", "--", ...SOURCE_ROOTS], {
    cwd: REPO,
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => SOURCE_EXTENSIONS.test(file) && !/(^|\/)(test|tests)\/|\.test\.tsx?$/.test(file));
  return new Map(listed.map((file) => [file, fs.readFileSync(path.join(REPO, file), "utf8")]));
};

const declaredProperties = (css: string): string[] =>
  [...css.matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)].map((match) => match[1]!);

const readsProperty = (text: string, name: string, declaringFile: boolean): boolean => {
  const escaped = name.replace(/[-]/g, "\\-");
  if (declaringFile) {
    return new RegExp(`var\\(\\s*${escaped}(?![\\w-])`).test(text);
  }
  return new RegExp(`${escaped}(?![\\w-])`).test(text);
};

describe("the editor page's own stylesheets", () => {
  const all = sources();

  it.each(PAGE_FILES)("declare only custom properties something reads: %s", (file) => {
    const declared = [...new Set(declaredProperties(all.get(file)!))];
    const unread = declared.filter(
      (name) => ![...all].some(([other, text]) => readsProperty(text, name, other === file)),
    );
    expect(unread).toEqual([]);
  });
});
