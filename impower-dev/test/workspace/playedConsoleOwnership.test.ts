// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, it } from "vitest";

const srcDir = resolve(__dirname, "../../src");

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx|mts|js|mjs)$/.test(name) ? [path] : [];
  });

it("imports the Played console model from consoleEntries and never the unrendered PlayerConsole component", () => {
  const componentImports = sourceFiles(srcDir)
    .filter((path) =>
      /from\s+["'][^"']*PlayerConsole\/PlayerConsole["']/.test(readFileSync(path, "utf8")),
    )
    .map((path) => relative(srcDir, path).replace(/\\/g, "/"));
  expect(componentImports).toEqual([]);

  const store = readFileSync(join(srcDir, "modules/spark-editor/workspace/problems/ProblemsStore.ts"), "utf8");
  expect(store).toMatch(
    /import\s*\{\s*CLIPBOARD_UNAVAILABLE\s*\}\s*from\s*"@impower\/spark-web-player\/src\/components\/PlayerConsole\/consoleEntries"/,
  );
});
