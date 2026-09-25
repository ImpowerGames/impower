// @vitest-environment node
//
// The game runs only in the player's worker (#684). The page shows it through
// an application that reaches it by messages, so nothing the page loads may
// load the engine's `Game`: a page that can build one grows a second host for
// the engine, and every change to the player then has to work in both.
//
// The rule follows imports as the bundlers do, across the repository's
// packages: every import, re-export and dynamic `import()` that brings in code
// at run time, by relative path or by `@impower/` package name. An import of
// only types brings in nothing. A worker entry (`*.worker.ts`) is built into a
// worker of its own, so importing one loads none of its code into the page.
// The page is this package's source outside what its worker entries alone
// reach, and the web and VS Code pages that load it.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const SRC = join(REPO, "packages", "spark-web-player", "src");
const GAME = join(REPO, "packages", "spark-engine", "src", "game", "core", "classes", "Game.ts");
const PAGE_ENTRIES = [
  join(REPO, "sparkdown-player-app", "src", "main.ts"),
  join(REPO, "vscode-sparkdown", "webviews", "game-webview", "game-webview.ts"),
];

const rel = (file: string) => relative(REPO, file).split(sep).join("/");

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

const isTest = (file: string) =>
  relative(SRC, file).split(sep)[0] === "tests" || /\.(test|spec)\.tsx?$/.test(file);

const isWorkerEntry = (file: string) => /\.worker\.(ts|js)$/.test(file);

/** Each `@impower/` package's folder, by its name. */
const PACKAGES = new Map(
  readdirSync(join(REPO, "packages")).flatMap((dir) => {
    const manifest = join(REPO, "packages", dir, "package.json");
    return existsSync(manifest)
      ? [[JSON.parse(readFileSync(manifest, "utf8")).name as string, join(REPO, "packages", dir)]]
      : [];
  }),
);

/** What `text` imports at run time, as written: each import, re-export,
 *  side-effect import and dynamic `import()`, leaving out imports of types
 *  only. */
const runtimeSpecifiers = (text: string): string[] => {
  const found: string[] = [];
  const fromClauses =
    /(?:^|[;}\n])\s*(import|export)\s+(type\s+)?([^;'"`]*?)\s*from\s*["']([^"']+)["']/g;
  for (const [, , typeOnly, clause, spec] of text.matchAll(fromClauses)) {
    if (typeOnly) {
      continue;
    }
    // `import { type A, type B }` brings in nothing either.
    const braces = /^\{([^}]*)\}$/.exec(clause!.trim());
    if (braces) {
      const names = braces[1]!
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      if (names.length > 0 && names.every((name) => name.startsWith("type "))) {
        continue;
      }
    }
    found.push(spec!);
  }
  for (const [, spec] of text.matchAll(/(?:^|[;}\n])\s*import\s*["']([^"']+)["']/g)) {
    found.push(spec!);
  }
  const dynamic = /\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']([^"']+)["']/g;
  for (const [, spec] of text.matchAll(dynamic)) {
    found.push(spec!);
  }
  return found;
};

/** The repository file `spec`, imported from `from`, names; none for a
 *  module from outside the repository. */
const resolveImport = (spec: string, from: string): string | undefined => {
  let base: string | undefined;
  if (spec.startsWith(".")) {
    base = resolve(dirname(from), spec);
  } else {
    const name = spec.split("/").slice(0, 2).join("/");
    const dir = PACKAGES.get(name);
    if (dir) {
      base = join(dir, spec.slice(name.length));
    }
  }
  if (!base) {
    return undefined;
  }
  const stem = base.replace(/\.js$/, "");
  return [base, `${stem}.ts`, `${stem}.tsx`, join(base, "index.ts")].find(
    (candidate) => /\.tsx?$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile(),
  );
};

/** Every file `roots` load at run time, with the file that first imported
 *  each; a worker entry that is not a root is built on its own and not
 *  entered. */
const reach = (roots: string[]): Map<string, string | undefined> => {
  const reached = new Map<string, string | undefined>();
  const next: [string, string | undefined][] = roots.map((root) => [root, undefined]);
  while (next.length > 0) {
    const [file, parent] = next.shift()!;
    if (reached.has(file)) {
      continue;
    }
    reached.set(file, parent);
    for (const spec of runtimeSpecifiers(readFileSync(file, "utf8"))) {
      const imported = resolveImport(spec, file);
      if (imported && !isWorkerEntry(imported)) {
        next.push([imported, file]);
      }
    }
  }
  return reached;
};

/** How `file` was reached, from its root. */
const chain = (reached: Map<string, string | undefined>, file: string) => {
  const path: string[] = [];
  for (let at: string | undefined = file; at; at = reached.get(at)) {
    path.unshift(rel(at));
  }
  return path.join(" -> ");
};

describe("the page holds no game", () => {
  test("the walk reads each way a file loads code at run time", () => {
    expect(runtimeSpecifiers(`import { Game } from "./Game";`)).toEqual(["./Game"]);
    expect(runtimeSpecifiers(`import Game, { type G } from "./Game";`)).toEqual(["./Game"]);
    expect(runtimeSpecifiers(`export { Game } from "./Game";`)).toEqual(["./Game"]);
    expect(runtimeSpecifiers(`import "./setup";`)).toEqual(["./setup"]);
    expect(runtimeSpecifiers(`void import("./late");`)).toEqual(["./late"]);
    expect(
      runtimeSpecifiers(`void import(/* webpackChunkName: "w" */ "@impower/spark-engine/src/x");`),
    ).toEqual(["@impower/spark-engine/src/x"]);
    expect(runtimeSpecifiers(`import type { Game } from "./Game";`)).toEqual([]);
    expect(runtimeSpecifiers(`import { type Game } from "./Game";`)).toEqual([]);
    expect(runtimeSpecifiers(`export type { Game } from "./Game";`)).toEqual([]);
    expect(
      resolveImport("@impower/spark-engine/src/game/core/classes/Game", join(SRC, "x.ts")),
    ).toBe(GAME);
  });

  const sources = sourceFiles(SRC).filter((file) => !isTest(file));
  const worker = reach(sources.filter(isWorkerEntry));
  const page = reach([...sources.filter((file) => !worker.has(file)), ...PAGE_ENTRIES]);

  test("the walk reaches the game from the worker, and the page's own files", () => {
    // The walk crosses packages and finds the game where it runs, so the
    // page's result below is about what the page loads.
    expect(worker.has(GAME)).toBe(true);
    const names = [...page.keys()].map(rel);
    expect(names).toContain("packages/spark-web-player/src/GamePlayerController.ts");
    expect(names).toContain("packages/spark-web-player/src/app/Application.ts");
    expect(names).toContain("packages/spark-web-player/src/main/workers/installWorkspaceWorker.ts");
    expect(names).toContain("packages/spark-web-player/src/main/workers/messages/ProgramHeldMessage.ts");
    for (const entry of PAGE_ENTRIES) {
      expect(names).toContain(rel(entry));
    }
  });

  test("nothing the page loads loads the game", () => {
    expect(page.has(GAME) ? chain(page, GAME) : "").toBe("");
  });
});
