// @vitest-environment node
//
// The game runs only in the player's worker (#684). The page shows it through
// an application that reaches it by messages, so no code the page loads may
// build a `Game` or reach one as a value: a page that can build one grows a
// second host for the engine, and every change to the player then has to work
// in both.
//
// The rule covers the package's own source, which is what the page and the
// worker are built from. The page's code is every file that the files outside
// the worker reach by import, short of a worker entry (`*.worker.ts`), which
// the bundler builds into a worker of its own; what only the worker entries
// reach is the worker's, and may build games. Tests build engine games of
// their own to drive the page's managers directly, which ships nowhere.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
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

const rel = (file: string) => relative(SRC, file).split(sep).join("/");

const isTest = (file: string) =>
  rel(file).startsWith("tests/") || /\.(test|spec)\.tsx?$/.test(file);

const isWorkerEntry = (file: string) => /\.worker\.ts$/.test(file);

/** The package's own files `file` imports by relative path. */
const relativeImports = (file: string): string[] =>
  [...readFileSync(file, "utf8").matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']*)["']/g)]
    .map(([, spec]) => resolve(dirname(file), spec!))
    .flatMap((base) =>
      [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].filter(existsSync).slice(0, 1),
    );

/** Every file `roots` reach by import, entering no worker entry but a root. */
const reach = (roots: string[]): Set<string> => {
  const reached = new Set<string>();
  const next = [...roots];
  while (next.length > 0) {
    const file = next.pop()!;
    if (!reached.has(file)) {
      reached.add(file);
      next.push(...relativeImports(file).filter((imported) => !isWorkerEntry(imported)));
    }
  }
  return reached;
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

  const sources = sourceFiles(SRC).filter((file) => !isTest(file));
  const worker = reach(sources.filter(isWorkerEntry));
  const page = [...reach(sources.filter((file) => !worker.has(file)))];

  test("the walk tells the worker's files from the page's", () => {
    // Both sides were found, so an empty result below is about their
    // contents rather than a walk that saw nothing.
    const names = (files: Iterable<string>) => [...files].map(rel);
    expect(names(worker)).toContain("main/workers/installPlayerWorker.ts");
    expect(names(page)).not.toContain("main/workers/installPlayerWorker.ts");
    expect(names(page)).toContain("GamePlayerController.ts");
    expect(names(page)).toContain("app/Application.ts");
    // The page's side of the worker connection, and the messages both sides
    // speak, are the page's too.
    expect(names(page)).toContain("main/workers/installWorkspaceWorker.ts");
    expect(names(page)).toContain("main/workers/WorkerGameLink.ts");
    expect(names(page)).toContain("main/workers/messages/ProgramHeldMessage.ts");
  });

  test("no page source reaches Game as a value", () => {
    const offenders = page.flatMap((file) =>
      gameValueUses(readFileSync(file, "utf8")).map((use) => `${rel(file)}: ${use}`),
    );
    expect(offenders).toEqual([]);
  });
});
