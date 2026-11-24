import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, test } from "vitest";
import {
  migrateClearProp,
  migrateMarkdownClearProp,
  migrateScriptClearProp,
} from "../../../../../scripts/migrate-clear-prop/migrateClearProp";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import BUILTINS from "@impower/sparkdown/src/compiler/builtins/builtins.sd?raw";

const ROOT = resolve(__dirname, "../../../../..");
const SCRIPT = join(ROOT, "scripts/migrate-clear-prop.mjs");
const FIXTURES = join(ROOT, "scripts/migrate-clear-prop/fixtures");

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function copyOf(dir: string): string {
  const target = mkdtempSync(join(tmpdir(), "migrate-clear-prop-test-"));
  scratch.push(target);
  cpSync(dir, target, { recursive: true });
  return target;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function run(...args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: "utf8" });
}

function compile(text: string): any {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: false,
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      } as any,
    ],
  });
  return compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } }).program;
}

function unwrittenRuleTargets(layout: Record<string, any>): string[] {
  const targets = new Set<string>();
  const walk = (node: Record<string, any>, path: string[]) => {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("$")) continue;
      const here = [...path, key];
      const words = key.split(" ");
      const isContent = ["text", "stroke", "image", "mask"].some((w) => words.includes(w));
      if (isContent && value && typeof value === "object" && Object.keys(value).length === 0) {
        const parent = here.at(-2);
        if (parent) targets.add(parent);
      }
      if (value && typeof value === "object") walk(value, here);
    }
  };
  walk(layout, []);
  return [...targets].sort();
}

function clearPropTargets(nodes: any[] | undefined): string[] {
  const targets = new Set<string>();
  const walk = (list: any[] | undefined) => {
    for (const node of list ?? []) {
      if (node.kind === "element" && node.props?.clear) {
        targets.add([node.tag, ...node.classes].join(" "));
      }
      walk(node.children);
      walk(node.else);
      for (const branch of [...(node.branches ?? []), ...(node.cases ?? [])]) {
        walk(branch.children);
      }
    }
  };
  walk(nodes);
  return [...targets].sort();
}

function layoutNames(text: string): string[] {
  const names = [...text.matchAll(/^layout ([A-Za-z_][A-Za-z0-9_]*)/gm)].map((m) => m[1]!);
  expect(names.length).toBeGreaterThan(0);
  return names;
}

describe("scripts/migrate-clear-prop.mjs", () => {
  test("rewrites a fixture directory to the expected output", { timeout: 120_000 }, () => {
    const dir = copyOf(join(FIXTURES, "input"));
    const result = run(dir);
    expect(result.status, result.stderr).toBe(0);
    const expected = join(FIXTURES, "expected");
    const names = filesUnder(expected).map((f) => relative(expected, f)).sort();
    expect(filesUnder(dir).map((f) => relative(dir, f)).sort()).toEqual(names);
    for (const name of names) {
      expect(readFileSync(join(dir, name), "utf8"), name).toBe(readFileSync(join(expected, name), "utf8"));
    }
  });

  test("a second run changes nothing", { timeout: 120_000 }, () => {
    const dir = copyOf(join(FIXTURES, "expected"));
    const result = run(dir, "--check");
    expect(result.status, result.stdout).toBe(0);
    expect(result.stdout).toContain("0 files to migrate, 0 errors");
  });

  test("each codemod leaves its own output unchanged", () => {
    const sd = readFileSync(join(FIXTURES, "expected/layouts.sd"), "utf8");
    const md = readFileSync(join(FIXTURES, "expected/nested/guide.md"), "utf8");
    const script = readFileSync(join(FIXTURES, "expected/embedded.ts"), "utf8");
    expect(migrateClearProp(sd)).toEqual({ text: sd, migrated: 0 });
    expect(migrateMarkdownClearProp(md)).toEqual({ text: md, migrated: 0 });
    expect(migrateScriptClearProp(script, ts)).toEqual({ text: script, migrated: 0 });
  });

  test("the built-in layouts are the migration of themselves without #clear", () => {
    const unmigrated = BUILTINS.replace(/ #clear\b/g, "");
    expect(unmigrated).not.toBe(BUILTINS);
    expect(migrateClearProp(unmigrated).text).toBe(BUILTINS);
  });

  test.each([
    ["the fixture layouts", readFileSync(join(FIXTURES, "input/layouts.sd"), "utf8")],
    ["the built-in layouts", BUILTINS.replace(/ #clear\b/g, "")],
  ])("adds #clear exactly where the unwritten rule empties, in %s", { timeout: 300_000 }, (_, source) => {
    const before = compile(source);
    const migrated = migrateClearProp(source);
    expect(migrated.migrated).toBeGreaterThan(0);
    const after = compile(migrated.text);
    let compared = 0;
    for (const name of layoutNames(source)) {
      const alreadyClear = clearPropTargets(before.sparkle?.layouts?.[name]?.children);
      const added = clearPropTargets(after.sparkle?.layouts?.[name]?.children).filter(
        (t) => !alreadyClear.includes(t),
      );
      const emptied = unwrittenRuleTargets(before.context?.layout?.[name] ?? {}).filter(
        (t) => !alreadyClear.includes(t),
      );
      expect(added, name).toEqual(emptied);
      compared += emptied.length;
    }
    expect(compared).toBe(migrated.migrated);
  });
});
