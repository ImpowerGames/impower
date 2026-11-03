import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { migrateStructBraces } from "../../../../../scripts/migrate-struct-braces/migrateStructBraces";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";

const ROOT = resolve(__dirname, "../../../../..");
const SCRIPT = join(ROOT, "scripts/migrate-struct-braces.mjs");
const FIXTURES = join(ROOT, "scripts/migrate-struct-braces/fixtures");

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function copyOf(dir: string): string {
  const target = mkdtempSync(join(tmpdir(), "migrate-struct-braces-test-"));
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

function contextOf(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
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
  const program: any = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } }).program;
  const errors = (program.diagnostics?.["inmemory:///main.sd"] ?? []).filter((d: any) => d.severity === 1);
  return { context: program.context, errors };
}

describe("scripts/migrate-struct-braces.mjs", () => {
  test("rewrites a fixture directory to the expected output", { timeout: 120_000 }, () => {
    const dir = copyOf(join(FIXTURES, "input"));
    const result = run(dir);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("nested/indent.sd:15: style left unchanged, the block has no closing end");
    const expected = join(FIXTURES, "expected");
    const names = filesUnder(expected).map((f) => relative(expected, f)).sort();
    expect(filesUnder(dir).map((f) => relative(dir, f)).sort()).toEqual(names);
    for (const name of names) {
      expect(readFileSync(join(dir, name), "utf8"), name).toBe(readFileSync(join(expected, name), "utf8"));
    }
  });

  test("--check reports what would change and writes nothing", { timeout: 120_000 }, () => {
    const dir = copyOf(join(FIXTURES, "input"));
    const before = readFileSync(join(dir, "keywords.sd"), "utf8");
    const pending = run(dir, "--check");
    expect(pending.status).toBe(1);
    expect(pending.stdout).toContain("would migrate 8 blocks in keywords.sd");
    expect(readFileSync(join(dir, "keywords.sd"), "utf8")).toBe(before);
    const done = run(copyOf(join(FIXTURES, "expected")), "--check");
    expect(done.status, done.stdout).toBe(0);
    expect(done.stdout).toContain("0 files to migrate");
  });

  test("refuses a missing directory", () => {
    const result = run(join(tmpdir(), "migrate-struct-braces-missing-dir"));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage:");
  });
});

describe("migrateStructBraces", () => {
  test("each keyword's brace form compiles to the same context as its with form", { timeout: 60_000 }, () => {
    const input = readFileSync(join(FIXTURES, "input/keywords.sd"), "utf8");
    const before = contextOf(input);
    const after = contextOf(migrateStructBraces(input).text);
    expect(after.errors).toEqual([]);
    expect(before.errors).toEqual([]);
    expect(after.context).toEqual(before.context);
  });

  test("keepIndent changes only the header and closing tokens", () => {
    const input = readFileSync(join(FIXTURES, "input/nested/indent.sd"), "utf8");
    const { text, migrated } = migrateStructBraces(input, { keepIndent: true });
    expect(migrated).toBe(2);
    expect(text.split("\n").slice(0, 9)).toEqual([
      "layout hud {",
      "      row {",
      '  text "a"',
      "          }",
      "}",
      "",
      "theme bare { -- a header without with",
      "  color = red",
      "}",
    ]);
  });

  test("a Luau end inside a layout is not taken for the block's closer", () => {
    const input = "layout main with\n  if a then\n    text \"a\"\n  end\nend\n";
    expect(migrateStructBraces(input).text).toBe("layout main {\n  if a then\n    text \"a\"\n  end\n}\n");
  });

  test("a block whose body would not close at its own end in the brace form is left unchanged", () => {
    const input = "animation broken with\n  keyframes {\n    to { opacity = 1\n  }\nend\n\nstyle after with\n  corner = 8px\nend\n";
    const result = migrateStructBraces(input);
    expect(result.skipped).toEqual([
      { line: 1, keyword: "animation", reason: "its body would not close at its own end in the brace form" },
    ]);
    expect(result.text).toBe(input.replace("style after with\n  corner = 8px\nend", "style after {\n  corner = 8px\n}"));
  });

  test("CRLF line endings are kept", () => {
    expect(migrateStructBraces("style s with\r\n  corner = 8px\r\nend\r\n").text).toBe("style s {\r\n  corner = 8px\r\n}\r\n");
  });
});
