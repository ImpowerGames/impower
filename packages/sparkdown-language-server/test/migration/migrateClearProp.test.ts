import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, test } from "vitest";
import {
  migrateClearProp,
  migrateMarkdownClearProp,
  migrateScriptClearProp,
} from "../../../../scripts/migrate-clear-prop/migrateClearProp";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import BUILTINS from "@impower/sparkdown/src/compiler/builtins/builtins.sd?raw";

const ROOT = resolve(__dirname, "../../../..");
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

function elementKeysOutsideStreams(layout: Record<string, any>): { keys: Set<string>; emptied: Set<string> } {
  const keys = new Set<string>();
  const emptied = new Set<string>();
  const walk = (node: Record<string, any>, path: string[]) => {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("$")) continue;
      const here = [...path, key];
      const words = key.split(" ");
      if (words[0] === "stream") continue;
      if (value && typeof value === "object") keys.add(key);
      const isContent = ["text", "stroke", "image", "mask"].some((w) => words.includes(w));
      if (isContent && value && typeof value === "object" && Object.keys(value).length === 0) {
        const parent = here.at(-2);
        if (parent) emptied.add(parent);
      }
      if (value && typeof value === "object") walk(value, here);
    }
  };
  walk(layout, []);
  return { keys, emptied };
}

function unwrittenRuleTargetsOutsideStreams(program: any, kind: string, name: string): string[] {
  const emptied = new Set<string>();
  for (const bodyKind of ["layout", "screen"]) {
    for (const [bodyName, body] of Object.entries<any>(program.context?.[bodyKind] ?? {})) {
      if (!bodyName.startsWith("$") && body) {
        for (const key of elementKeysOutsideStreams(body).emptied) emptied.add(key);
      }
    }
  }
  const { keys } = elementKeysOutsideStreams(program.context?.[kind]?.[name] ?? {});
  return [...keys].filter((key) => emptied.has(key)).sort();
}

function clearMarkTargets(layout: Record<string, any>): string[] {
  const targets = new Set<string>();
  const walk = (node: Record<string, any>) => {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("$") || !value || typeof value !== "object") continue;
      if (value["$clear"] === true) targets.add(key);
      walk(value);
    }
  };
  walk(layout);
  return [...targets].sort();
}

function bodyNames(text: string): ["layout" | "screen", string][] {
  const names = [...text.matchAll(/^(layout|screen) ([A-Za-z_][A-Za-z0-9_]*)/gm)].map(
    (m) => [m[1] as "layout" | "screen", m[2]!] as ["layout" | "screen", string],
  );
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

  test("each codemod leaves its own output unchanged", { timeout: 120_000 }, () => {
    const sd = readFileSync(join(FIXTURES, "expected/layouts.sd"), "utf8");
    const md = readFileSync(join(FIXTURES, "expected/nested/guide.md"), "utf8");
    const script = readFileSync(join(FIXTURES, "expected/embedded.ts"), "utf8");
    expect(migrateClearProp(sd)).toEqual({ text: sd, migrated: 0 });
    expect(migrateMarkdownClearProp(md)).toEqual({ text: md, migrated: 0 });
    expect(migrateScriptClearProp(script, ts)).toEqual({ text: script, migrated: 0 });
  });

  test("the built-in layouts are the migration of themselves without #clear", { timeout: 120_000 }, () => {
    const unmigrated = BUILTINS.replace(/ #clear\b/g, "");
    expect(unmigrated).not.toBe(BUILTINS);
    expect(migrateClearProp(unmigrated).text).toBe(BUILTINS);
  });

  test.each([
    ["the fixture layouts and screens", readFileSync(join(FIXTURES, "input/layouts.sd"), "utf8")],
    ["the built-in layouts", BUILTINS.replace(/ #clear\b/g, "")],
  ])("adds #clear exactly where the unwritten rule empties outside streams, in %s", { timeout: 300_000 }, (_, source) => {
    const before = compile(source);
    const migrated = migrateClearProp(source);
    expect(migrated.migrated).toBeGreaterThan(0);
    const after = compile(migrated.text);
    let compared = 0;
    for (const [kind, name] of bodyNames(source)) {
      const alreadyClear = clearMarkTargets(before.context?.[kind]?.[name] ?? {});
      const added = clearMarkTargets(after.context?.[kind]?.[name] ?? {}).filter(
        (t) => !alreadyClear.includes(t),
      );
      const emptied = unwrittenRuleTargetsOutsideStreams(before, kind, name).filter(
        (t) => !alreadyClear.includes(t),
      );
      expect(added, name).toEqual(emptied);
      compared += emptied.length;
    }
    expect(compared).toBe(migrated.migrated);
  });

  test("leaves an element inside a component definition as written, since the unwritten rule never emptied one there", () => {
    const source = readFileSync(join(FIXTURES, "input/layouts.sd"), "utf8");
    const component = source.slice(source.indexOf("component card"), source.indexOf("screen menu"));
    expect(component).toContain("heading {\n    text\n  }");
    expect(migrateClearProp(source).text).toContain(component);
    const lone = `${component}\nlayout box {\n  card("A")\n}\n`;
    expect(migrateClearProp(lone)).toMatchObject({ text: lone, migrated: 0 });
  });

  test("leaves a stream's templates as written while marking the elements beside it", () => {
    const source = readFileSync(join(FIXTURES, "input/layouts.sd"), "utf8");
    const chat = source.slice(source.indexOf("layout chat"), source.lastIndexOf("scene start"));
    const migrated = migrateClearProp(chat);
    expect(migrated.text).toContain("heading #clear { text }");
    expect(migrated.text).toContain("caption #clear { text }");
    expect(migrated.text).toContain("dialogue.bubble { text }");
    expect(migrated.text).toContain("character_name { text }");
    expect(migrated.text).toContain("dialogue { text }");
    expect(migrated.text).toContain("action.narrated { text }");
    expect(migrated.migrated).toBe(2);
  });

  test("marks every element that shares a name the unwritten rule emptied, whatever its children", () => {
    const source = [
      "layout main {",
      "  textbox {",
      "    dialogue {",
      "      text",
      "    }",
      "    action {",
      "      text",
      "    }",
      "  }",
      "  textbox {",
      "    dialogue {",
      "      dialogue_background",
      "    }",
      "    action {",
      "      action_background {",
      '        image "linear-gradient(black, transparent)"',
      "      }",
      "    }",
      "  }",
      "}",
      "",
    ].join("\n");
    const migrated = migrateClearProp(source);
    expect(migrated.text).toBe(
      source
        .replace(/dialogue \{/g, "dialogue #clear {")
        .replace(/action \{/g, "action #clear {"),
    );
    expect(migrated.migrated).toBe(4);
  });

  test("marks a leaf of an emptied name, and leaves an element whose name only begins with one", () => {
    const source = [
      "layout main {",
      "  box {",
      "    caption { text }",
      "  }",
      "  shade {",
      "    caption",
      "    title.big { title_background }",
      "  }",
      "}",
      "",
      "layout other {",
      "  title { text }",
      "  thread {",
      "    stream {",
      "      caption { caption_background }",
      "    }",
      "  }",
      "}",
      "",
    ].join("\n");
    const migrated = migrateClearProp(source);
    expect(migrated.text).toContain("    caption #clear\n");
    expect(migrated.text).toContain("title.big { title_background }");
    expect(migrated.text).toContain("      caption { caption_background }");
    expect(migrated.migrated).toBe(3);
  });

  test("marks an element in one project file by a name emptied in another", { timeout: 120_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "migrate-clear-prop-test-"));
    scratch.push(dir);
    writeFileSync(join(dir, "main.sd"), "layout main {\n  dialogue { text }\n}\n");
    writeFileSync(join(dir, "frame.sd"), "layout frame {\n  dialogue { dialogue_background }\n}\n");
    const result = run(dir);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(dir, "frame.sd"), "utf8")).toBe(
      "layout frame {\n  dialogue #clear { dialogue_background }\n}\n",
    );
    expect(readFileSync(join(dir, "main.sd"), "utf8")).toBe("layout main {\n  dialogue #clear { text }\n}\n");
  });

  test("marks an element by a name the built-in layouts empty, and keeps each target's names to itself", { timeout: 120_000 }, () => {
    const first = mkdtempSync(join(tmpdir(), "migrate-clear-prop-test-"));
    const second = mkdtempSync(join(tmpdir(), "migrate-clear-prop-test-"));
    scratch.push(first, second);
    writeFileSync(join(first, "ui.sd"), "layout main {\n  title { title_background }\n  badge { text }\n}\n");
    writeFileSync(join(second, "ui.sd"), "layout main {\n  badge { badge_background }\n}\n");
    const result = run(first, second);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(first, "ui.sd"), "utf8")).toBe(
      "layout main {\n  title #clear { title_background }\n  badge #clear { text }\n}\n",
    );
    expect(readFileSync(join(second, "ui.sd"), "utf8")).toBe("layout main {\n  badge { badge_background }\n}\n");
  });
});
