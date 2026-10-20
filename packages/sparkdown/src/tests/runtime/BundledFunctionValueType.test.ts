// A function value keeps its type when the runtime is bundled (I-1128).
//
// The running game executes a worker that esbuild bundles. esbuild writes a
// class that names itself in its own body (`SymbolValue.Copy` builds a new
// `SymbolValue`) as `var SymbolValue = class _SymbolValue`, so in the game the
// class's `constructor.name` is `_SymbolValue`, while vitest, which transforms
// file by file, keeps `SymbolValue`. The stdlib told function values apart by
// that name, so in the game `type(f)` of a named function was "table" and
// `table.sort(t, f)` refused it as a table. This file runs the runtime harness
// from an esbuild bundle of itself, the form the game runs.

import { build, type Plugin } from "esbuild";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

type Harness = typeof import("./runtimeTestHarness");

const here = dirname(fileURLToPath(import.meta.url));

// Vite's `?raw` import, as the worker build honours it.
const rawPlugin: Plugin = {
  name: "raw",
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -4)),
      namespace: "raw-loader",
    }));
    b.onLoad({ filter: /.*/, namespace: "raw-loader" }, (args) => ({
      contents: readFileSync(args.path, "utf8"),
      loader: "text",
    }));
  },
};

let bundleDir = "";
let bundleText = "";
let harness: Harness;

beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: 'export * from "./runtimeTestHarness";',
      resolveDir: here,
      loader: "ts",
      sourcefile: "entry.ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    plugins: [rawPlugin],
  });
  bundleText = result.outputFiles[0]!.text;
  bundleDir = mkdtempSync(join(tmpdir(), "bundled-function-value-"));
  const file = join(bundleDir, "harness.mjs");
  writeFileSync(file, bundleText);
  harness = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Harness;
}, 120_000);

afterAll(() => {
  if (bundleDir) rmSync(bundleDir, { recursive: true, force: true });
});

const run = (lines: string[]) => {
  const { story, errorMessages } = harness.makeRuntimeStoryFromSource(
    [...lines, ""].join("\n"),
  );
  expect(errorMessages).toEqual([]);
  const errors: string[] = [];
  story.onError = (m: string) => errors.push(m);
  const text = story.ContinueMaximally().trim();
  return { text, errors };
};

describe("a function value in the bundled runtime", () => {
  test("the bundle renames the function value class, as the game's does", () => {
    expect(bundleText).toMatch(/class _SymbolValue\b/);
  });

  test("table.sort calls a named comparator, which reports its own error", () => {
    const { errors } = run([
      "store items = {3, 1, 2}",
      "function compare(a, b)",
      '  error("bad compare")',
      "end",
      "function sort_items()",
      "  table.sort(items, compare)",
      "end",
      "{sort_items()}",
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("table.sort: comparator threw: bad compare");
    expect(errors[0]).not.toContain("function expected");
  });

  test("table.sort orders by a named comparator", () => {
    const { text, errors } = run([
      "store items = {3, 1, 2}",
      "function greater(a, b)",
      "  return a > b",
      "end",
      "function sorted()",
      "  table.sort(items, greater)",
      '  return table.concat(items, ",")',
      "end",
      "{sorted()}",
    ]);
    expect(errors).toEqual([]);
    expect(text).toBe("3,2,1");
  });

  test("type and tostring report a named function as a function", () => {
    const { text, errors } = run([
      "function f()",
      "  return 1",
      "end",
      "function describe()",
      "  local g = f",
      '  return type(f) .. " " .. type(g) .. " " .. tostring(f)',
      "end",
      "{describe()}",
    ]);
    expect(errors).toEqual([]);
    expect(text).toBe("function function function: f");
  });

  test("string.gsub takes a named function as its replacement", () => {
    const { text, errors } = run([
      "function shout(s)",
      "  return string.upper(s)",
      "end",
      "function replaced()",
      '  return (string.gsub("abc", "b", shout))',
      "end",
      "{replaced()}",
    ]);
    expect(errors).toEqual([]);
    expect(text).toBe("aBc");
  });
});
