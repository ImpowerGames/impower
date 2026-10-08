// How strictly the compiler type checks Luau (#599). Luau's non-strict mode
// is the default; the project sets its mode with `define typecheck as config
// with mode = "..." end`, a `.sd` file with a `typecheck:` front matter
// field, and a `.luau` file with Luau's own `--!strict`, `--!nonstrict` or
// `--!nocheck` first line; the more specific setting wins, and a mode
// Sparkdown does not know is warned about.
//
// The Luau checked here tells the modes apart: an unknown global is reported
// in both non-strict and strict mode, an annotation mismatch only in strict
// mode, and nothing in no-check mode.

import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { TYPE_ERROR_KINDS } from "../../compiler/typecheck/Error";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { programContent } from "../programListing";

const MAIN = "inmemory:///main.sd";
const HELPER = "inmemory:///helper.luau";

const LUAU = `local x: string = 1\nmissing()\n`;
const NONSTRICT = ["UnknownSymbol"];
const STRICT = ["TypeMismatch", "UnknownSymbol"];
const NOCHECK: string[] = [];

interface Project {
  /** The value of the main file's `typecheck:` front matter field. */
  frontMatter?: string;
  /** The `mode` of a `define typecheck as config` in the main file. */
  config?: string;
  /** A `.luau` file the main file runs; the main file then holds no Luau of its own. */
  luau?: string;
}

function compile(project: Project): SparkProgram {
  const lines: string[] = [];
  if (project.frontMatter !== undefined) lines.push("---", "title: Modes", `typecheck: ${project.frontMatter}`, "---", "");
  if (project.config !== undefined) lines.push("define typecheck as config with", `  mode = "${project.config}"`, "end", "");
  if (project.luau !== undefined) lines.push('run "helper"');
  else lines.push("local x: string = 1", "& missing()");
  const files = [
    { uri: MAIN, type: "script", name: "main", ext: "sd", text: lines.join("\n") + "\n", version: 1, languageId: "sparkdown" },
  ];
  if (project.luau !== undefined) {
    files.push({ uri: HELPER, type: "script", name: "helper", ext: "luau", text: project.luau, version: 1, languageId: "sparkdown" });
  }
  const compiler = new SparkdownCompiler();
  compiler.configure({ files });
  return compiler.compile({ textDocument: { uri: MAIN } }).program;
}

/** The kinds of the type warnings a document got, in source order. */
function typeWarnings(program: SparkProgram, uri: string): string[] {
  return (program.diagnostics?.[uri] ?? []).filter((d) => TYPE_ERROR_KINDS.has(String(d.code))).map((d) => String(d.code));
}

function modeWarnings(program: SparkProgram): { at: string; message: string }[] {
  return Object.entries(program.diagnostics ?? {}).flatMap(([uri, diagnostics]) =>
    diagnostics
      .filter((d) => d.code === "UnknownTypecheckMode")
      .map((d) => ({
        at: `${uri}:${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character}`,
        message: typeof d.message === "string" ? d.message : d.message.value,
      })),
  );
}

describe("type checking modes", () => {
  test("non-strict is the default, for a .sd file and for a .luau file", () => {
    const program = compile({});
    expect(typeWarnings(program, MAIN)).toEqual(NONSTRICT);
    expect(typeWarnings(compile({ luau: LUAU }), HELPER)).toEqual(NONSTRICT);
    expect(modeWarnings(program)).toEqual([]);
  });

  test("every type warning is a plain-text warning with its Luau error kind as its code, at the exact range", () => {
    const [mismatch, unknown] = (compile({ frontMatter: "strict" }).diagnostics?.[MAIN] ?? []).filter((d) =>
      TYPE_ERROR_KINDS.has(String(d.code)),
    );
    expect(mismatch).toMatchObject({
      code: "TypeMismatch",
      severity: 2,
      range: { start: { line: 5, character: 18 }, end: { line: 5, character: 19 } },
      message: "Expected this to be 'string', but got 'number'",
    });
    expect(unknown).toMatchObject({
      code: "UnknownSymbol",
      severity: 2,
      range: { start: { line: 6, character: 2 }, end: { line: 6, character: 9 } },
      message: "Unknown global 'missing'; consider assigning to it first",
    });
  });

  test("type checking leaves the compiled program as it would be without it", () => {
    const source = "---\ntypecheck: strict\n---\n\nlocal x: string = 1\nlocal y = (x :: any) + 2\n\nscene start\n  & x = y\n  The end.\nend\n";
    const compiled = (skipValidation: boolean) => {
      const compiler = new SparkdownCompiler();
      compiler.configure({
        skipValidation,
        files: [{ uri: MAIN, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" }],
      });
      const program = compiler.compile({ textDocument: { uri: MAIN } }).program;
      return { program, compiled: programContent(program.chunks) };
    };
    const checked = compiled(false);
    expect(typeWarnings(checked.program, MAIN).length).toBeGreaterThan(0);
    expect(checked.compiled).toEqual(compiled(true).compiled);
  });

  test("the project's config selects strict and no-check", () => {
    expect(typeWarnings(compile({ config: "strict" }), MAIN)).toEqual(STRICT);
    expect(typeWarnings(compile({ config: "nocheck" }), MAIN)).toEqual(NOCHECK);
    expect(typeWarnings(compile({ config: "nonstrict" }), MAIN)).toEqual(NONSTRICT);
    expect(typeWarnings(compile({ config: "strict", luau: LUAU }), HELPER)).toEqual(STRICT);
  });

  test("a .sd file's front matter selects strict and no-check", () => {
    expect(typeWarnings(compile({ frontMatter: "strict" }), MAIN)).toEqual(STRICT);
    expect(typeWarnings(compile({ frontMatter: "nocheck" }), MAIN)).toEqual(NOCHECK);
    expect(typeWarnings(compile({ frontMatter: "nonstrict" }), MAIN)).toEqual(NONSTRICT);
  });

  test("a .luau file's first line selects strict and no-check", () => {
    expect(typeWarnings(compile({ luau: `--!strict\n${LUAU}` }), HELPER)).toEqual(STRICT);
    expect(typeWarnings(compile({ luau: `--!nocheck\n${LUAU}` }), HELPER)).toEqual(NOCHECK);
    expect(typeWarnings(compile({ luau: `--!nonstrict\n${LUAU}` }), HELPER)).toEqual(NONSTRICT);
  });

  test("the more specific setting wins", () => {
    expect(typeWarnings(compile({ config: "strict", frontMatter: "nocheck" }), MAIN)).toEqual(NOCHECK);
    expect(typeWarnings(compile({ config: "nocheck", frontMatter: "strict" }), MAIN)).toEqual(STRICT);
    expect(typeWarnings(compile({ config: "strict", luau: `--!nonstrict\n${LUAU}` }), HELPER)).toEqual(NONSTRICT);
    expect(typeWarnings(compile({ config: "nocheck", luau: `--!strict\n${LUAU}` }), HELPER)).toEqual(STRICT);
    // A .sd file's front matter is its own: a .luau file it runs keeps the project's mode.
    expect(typeWarnings(compile({ frontMatter: "strict", luau: LUAU }), HELPER)).toEqual(NONSTRICT);
  });

  test("an unknown mode warns where it is written, and the next setting applies", () => {
    const configured = compile({ config: "strictt" });
    expect(modeWarnings(configured)).toEqual([
      {
        at: `${MAIN}:1:9-1:18`,
        message: 'Unknown type checking mode "strictt"; the modes are "nonstrict", "strict", "nocheck"',
      },
    ]);
    expect(typeWarnings(configured, MAIN)).toEqual(NONSTRICT);

    const fronted = compile({ config: "strict", frontMatter: "loose" });
    expect(modeWarnings(fronted)).toEqual([
      { at: `${MAIN}:2:11-2:16`, message: 'Unknown type checking mode "loose"; the modes are "nonstrict", "strict", "nocheck"' },
    ]);
    expect(typeWarnings(fronted, MAIN)).toEqual(STRICT);
  });

  test("a .luau file's directive Luau would not read is warned about as Luau's linter warns, and the project's mode applies", () => {
    const directives = (program: SparkProgram) =>
      (program.diagnostics?.[HELPER] ?? [])
        .filter((d) => d.code === "CommentDirective")
        .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${d.message}`);

    const misspelt = compile({ config: "nocheck", luau: `--!strictt\n${LUAU}` });
    expect(directives(misspelt)).toEqual(["0:0-0:10 Unknown comment directive 'strictt'; did you mean 'strict'?"]);
    expect(typeWarnings(misspelt, HELPER)).toEqual(NOCHECK);

    // The directive is quoted as written, though Luau matches it byte by byte.
    const accented = compile({ luau: `--!stríct\n${LUAU}` });
    expect(directives(accented)).toEqual(["0:0-0:9 Unknown comment directive 'stríct'; did you mean 'strict'?"]);
    expect(typeWarnings(accented, HELPER)).toEqual(NONSTRICT);

    const late = compile({ luau: `--!strict\n--!nocheck\n${LUAU}--!nocheck\n` });
    expect(directives(late)).toEqual([
      "1:0-1:10 Comment directive with the type checking mode has already been used",
      "4:0-4:10 Comment directive is ignored because it is placed after the first non-comment token",
    ]);
    expect(typeWarnings(late, HELPER)).toEqual(STRICT);

    const extra = compile({ luau: `--!strict please\n${LUAU}` });
    expect(directives(extra)).toEqual(["0:0-0:16 Comment directive with the type checking mode has extra symbols at the end of the line"]);
    expect(typeWarnings(extra, HELPER)).toEqual(NONSTRICT);
  });
});
