// @vitest-environment node
//
// The game runs only in the player's worker (#684). The page shows it through
// an application that reaches it by messages, so no code the page loads may
// build a `Game` or reach one as a value: a page that can build one grows a
// second host for the engine, and every change to the player then has to work
// in both.
//
// The rule covers the package's own source, which is what the page and the
// worker are built from. `main/workers/` is the worker's; tests build engine
// games of their own to drive the page's managers directly, which ships
// nowhere.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

const isPageSource = (file: string) => {
  const rel = relative(SRC, file).split(sep).join("/");
  return !(
    rel.startsWith("main/workers/") ||
    rel.startsWith("tests/") ||
    /\.(test|spec)\.tsx?$/.test(rel)
  );
};

/** What `text` does with the engine's `Game` as a value: each import that
 *  brings it in other than as a type, and each construction. */
const gameValueUses = (text: string): string[] => {
  const uses: string[] = [];
  const imports =
    /import\s+(type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*["']([^"']*\/classes\/Game)["']/g;
  for (const match of text.matchAll(imports)) {
    const [statement, typeOnly, defaultName, named] = match;
    if (typeOnly) {
      continue;
    }
    const valueNames = (named ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name && !name.startsWith("type "))
      .map((name) => name.split(/\s+as\s+/)[0]);
    if (defaultName || valueNames.includes("Game")) {
      uses.push(statement.replace(/\s+/g, " "));
    }
  }
  for (const match of text.matchAll(/new\s+Game\s*\(/g)) {
    uses.push(match[0]);
  }
  for (const match of text.matchAll(/import\(\s*["'][^"']*\/classes\/Game["']\s*\)/g)) {
    uses.push(match[0]);
  }
  return uses;
};

describe("the page holds no game", () => {
  test("the rule reads each way a file can reach Game", () => {
    const from = '"@impower/spark-engine/src/game/core/classes/Game"';
    expect(gameValueUses(`import { Game } from ${from};`)).toHaveLength(1);
    expect(gameValueUses(`import { Other, Game } from ${from};`)).toHaveLength(1);
    expect(gameValueUses(`import { Game as G } from ${from};`)).toHaveLength(1);
    expect(gameValueUses(`const g = new Game({});`)).toHaveLength(1);
    expect(gameValueUses(`await import(${from});`)).toHaveLength(1);
    expect(gameValueUses(`import type { Game } from ${from};`)).toEqual([]);
    expect(gameValueUses(`import { type Game } from ${from};`)).toEqual([]);
    expect(
      gameValueUses(`import { Game } from "./classes/GameStep";`),
    ).toEqual([]);
  });

  test("no page source outside the worker reaches Game as a value", () => {
    const files = sourceFiles(SRC).filter(isPageSource);
    // The walk found the controller and the application, so an empty result
    // below is about their contents rather than a walk that saw nothing.
    const names = files.map((file) => relative(SRC, file).split(sep).join("/"));
    expect(names).toContain("GamePlayerController.ts");
    expect(names).toContain("app/Application.ts");
    const offenders = files.flatMap((file) =>
      gameValueUses(readFileSync(file, "utf8")).map(
        (use) => `${relative(SRC, file).split(sep).join("/")}: ${use}`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});
