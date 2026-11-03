import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { migrateMarkdownStructBraces, migrateStructBraces } from "../../../../../scripts/migrate-struct-braces/migrateStructBraces";
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
  test("each keyword's brace form compiles to the same context as its with form, without its errors", { timeout: 60_000 }, () => {
    const input = readFileSync(join(FIXTURES, "input/keywords.sd"), "utf8");
    const before = contextOf(input);
    const after = contextOf(migrateStructBraces(input).text);
    expect(after.errors).toEqual([]);
    expect(before.errors.map((d: any) => [d.range.start.line, d.message.value ?? d.message])).toEqual(
      [
        [2, "style"],
        [8, "animation"],
        [14, "theme"],
        [18, "morph"],
        [26, "layout"],
        [37, "component"],
        [41, "screen"],
        [43, "screen"],
      ].map(([line, keyword]) => [
        line,
        `${keyword === "animation" ? "An" : "A"} ${keyword} body goes in braces: \`${keyword} NAME { … }\`.`,
      ]),
    );
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
    const input = "layout main with\nif a then\ntext \"a\"\nend\nfor i = 1, 2 do\ntext \"b\"\nend\nend\n";
    expect(migrateStructBraces(input, { keepIndent: true }).text).toBe(
      "layout main {\nif a then\ntext \"a\"\nend\nfor i = 1, 2 do\ntext \"b\"\nend\n}\n",
    );
  });

  test("a block whose body would not close at its own end in the brace form is left unchanged", () => {
    const input = "animation broken with\n  keyframes {\n    to { opacity = 1\n  }\nend\n\nstyle after with\n  corner = 8px\nend\n";
    const result = migrateStructBraces(input);
    expect(result.skipped).toEqual([
      { line: 1, keyword: "animation", reason: "its body would not close at its own end in the brace form" },
    ]);
    expect(result.text).toBe(input.replace("style after with\n  corner = 8px\nend", "style after {\n  corner = 8px\n}"));
  });

  test("a block whose body a stray `}` would close early is left unchanged", () => {
    const input = "style broken with\n  }\nend\n";
    expect(migrateStructBraces(input)).toEqual({
      text: input,
      migrated: 0,
      skipped: [{ line: 1, keyword: "style", reason: "its body would not close at its own end in the brace form" }],
    });
  });

  test("an empty block written without `with` is migrated", () => {
    expect(migrateStructBraces("screen menu\nend\n").text).toBe("screen menu {\n}\n");
    expect(migrateStructBraces("screen menu -- note\nend\n").text).toBe("screen menu { -- note\n}\n");
    expect(migrateStructBraces("screen menu end\n").text).toBe("screen menu {}\n");
  });

  test("a header with no closing end is reported", () => {
    expect(migrateStructBraces("screen menu\n")).toEqual({
      text: "screen menu\n",
      migrated: 0,
      skipped: [{ line: 1, keyword: "screen", reason: "the block has no closing end" }],
    });
  });

  test("each line keeps its own line ending", () => {
    expect(migrateStructBraces("style s with\r\n  corner = 8px\r\nend\r\n").text).toBe("style s {\r\n  corner = 8px\r\n}\r\n");
    expect(migrateStructBraces("style s with\r\n  corner = 8px\nend\r\n").text).toBe("style s {\r\n  corner = 8px\n}\r\n");
  });
});

describe("migrateMarkdownStructBraces", () => {
  test("a document with nothing to migrate is returned byte for byte", () => {
    const input = "# Title\r\n\nPlain prose.\n";
    expect(migrateMarkdownStructBraces(input)).toEqual({ text: input, migrated: 0, skipped: [] });
  });

  test("an indented fence keeps every line's indentation and line ending", () => {
    expect(
      migrateMarkdownStructBraces("- item\n\n  ~~~sd\n  style a with\n  \n    corner = 1px\n  end\n  ~~~\n", { keepIndent: true }).text,
    ).toBe("- item\n\n  ~~~sd\n  style a {\n  \n    corner = 1px\n  }\n  ~~~\n");
    expect(migrateMarkdownStructBraces("Intro\r\n\r\n```sparkdown\r\nstyle a with\r\n  corner = 1px\r\nend\r\n```\r\n").text).toBe(
      "Intro\r\n\r\n```sparkdown\r\nstyle a {\r\n  corner = 1px\r\n}\r\n```\r\n",
    );
  });
});
