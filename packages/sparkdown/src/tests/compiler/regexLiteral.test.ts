// `/pattern/flags` regex literals.
//
// Regexes previously lived in double-quoted strings, which forced DOUBLED
// backslashes (`"\\p{L}"`) and collided with `{expr}` interpolation — a
// `{2,}` quantifier parsed as an interpolation and errored with
// "Cannot find variable named `L`".
//
// A literal lowers to the VERBATIM `/pattern/flags` string, which is exactly
// what the quoted form produced, so the runtime `Matcher` (which already splits
// `/source/flags`) is unchanged.
//
// The delicate part is DIVISION: `/` is also an operator. Two things contain it
// — the rule sits AFTER `LuauArithmeticOperation` in the expression
// alternation, and the char after the opening `/` may not be whitespace, `=`
// or `/`. The division cases below are the regression net (the Luau conformance
// fixtures use `a / 2`, `1 / 0`, `a / (`).

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function compile(text: string) {
  const c = new SparkdownCompiler();
  const uri = "inmemory:///main.sd";
  c.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const r = c.compile({ textDocument: { uri } });
  const diags: string[] = [];
  for (const ds of Object.values(r.program.diagnostics ?? {})) {
    for (const d of ds as any[]) {
      diags.push(
        typeof d?.message === "string" ? d.message : (d?.message?.value ?? ""),
      );
    }
  }
  return { program: r.program, diags };
}

const typewriter = (value: string) =>
  compile(`define t as typewriter with\n  voiced = ${value}\nend\n`);

describe("regex literals", () => {
  test("a literal lowers to the same string the quoted form produced", () => {
    const lit = typewriter(`/([\\p{L}\\p{N}']+)/u`);
    const quoted = typewriter(`"/([\\\\p{L}\\\\p{N}']+)/u"`);
    expect(lit.diags).toEqual([]);
    const got = (lit.program.context as any)?.typewriter?.t?.voiced;
    expect(got).toBe((quoted.program.context as any)?.typewriter?.t?.voiced);
    // Single backslashes in source; the value keeps them.
    expect(got).toBe("/([\\p{L}\\p{N}']+)/u");
  });

  test("`{n,m}` quantifiers are NOT read as interpolation", () => {
    const r = typewriter(`/^([\\p{Lu}]{2,}[^\\p{Ll}\\r\\n]*)$/u`);
    // The quoted form used to error with "Cannot find variable named `L`".
    expect(r.diags).toEqual([]);
    expect((r.program.context as any)?.typewriter?.t?.voiced).toBe(
      "/^([\\p{Lu}]{2,}[^\\p{Ll}\\r\\n]*)$/u",
    );
  });

  test("division still parses — spaced, unspaced, chained, and numeric", () => {
    for (const expr of [
      "a / 2",
      "a/2",
      "a / b / c",
      "a/b/c",
      "1341/381",
      "1 / 0",
      "a / (b + c)",
    ]) {
      const r = compile(
        `store a = 10\nstore b = 2\nstore c = 5\nstore out = ${expr}\n`,
      );
      expect(r.diags, `division \`${expr}\` should compile clean`).toEqual([]);
    }
  });

  test("`//` line comments are not swallowed as an empty regex", () => {
    const r = compile(`store a = 1 // a comment\n`);
    expect(r.diags).toEqual([]);
  });
});
