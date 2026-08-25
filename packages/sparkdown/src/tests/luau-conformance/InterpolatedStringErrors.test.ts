// Ported from Luau's own parser tests for interpolated strings
// (`luau/tests/Parser.test.cpp`, the `parse_interpolated_string_*` cases), so
// "we match Luau here" is an executable claim rather than an assertion.
//
// Sparkdown extends interpolation to `"..."` as well as backticks (see
// DIVERGENCES.md), so where a case is meaningful for both, both are checked.
// `'...'` and `[[...]]` are literal and are therefore expected NOT to raise
// any of these.
//
// Cases sparkdown deliberately does not (yet) match are kept here as
// `test.skip` with the reason, rather than deleted — they are the todo list
// for full parity, and a silent omission would read as "covered".

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function diagnose(source: string): string[] {
  const compiler = new SparkdownCompiler();
  const uri = "inmemory:///main.sd";
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri } });
  const out: string[] = [];
  for (const ds of Object.values(result.program.diagnostics ?? {})) {
    for (const d of ds as any[]) {
      out.push(
        typeof d?.message === "string" ? d.message : (d?.message?.value ?? ""),
      );
    }
  }
  return out;
}

const MISSING_BRACE = "Malformed interpolated string; did you forget to add a";

// Luau: parse_interpolated_string_without_end_brace
describe("interpolated string without end brace", () => {
  test.each([
    ["backtick, single char", "store a = `{a`\n"],
    ["backtick, longer", "store a = `{abcdefg`\n"],
    ["backtick, text before", "store a = `x {abc`\n"],
    ["double quote, single char", 'store a = "{a"\n'],
    ["double quote, text before", 'store a = "x {abc"\n'],
  ])("%s", (_label, source) => {
    const msgs = diagnose(source);
    expect(
      msgs.some((m) => m.includes(MISSING_BRACE)),
      `expected a missing-brace diagnostic, got ${JSON.stringify(msgs)}`,
    ).toBe(true);
  });

  // Luau: parse_interpolated_string_mid_without_end_brace_in_table.
  // Luau also emits a cascading "Expected '}' (to close '{' ...)" for the
  // enclosing table; only the interpolation message is asserted here, since
  // the recovery cascade is parser-specific.
  test("a closed interpolation followed by an unclosed one", () => {
    const msgs = diagnose('store a = `x {"y"} {z`\n');
    expect(msgs.some((m) => m.includes(MISSING_BRACE))).toBe(true);
  });

  test("an unterminated `{` does not swallow the following lines", () => {
    // Before the string-bounded interpolation rules, the scope ran past the
    // closing quote and consumed the rest of the FILE, which turned one typo
    // into a cascade of unrelated errors.
    const msgs = diagnose("store a = `{x`\nstore after = 1\n");
    expect(msgs.some((m) => m.includes(MISSING_BRACE))).toBe(true);
    expect(msgs.some((m) => m.includes("closing `end`"))).toBe(false);
  });
});

describe("well-formed interpolations are not flagged", () => {
  test.each([
    ["backtick", "store b = 1\nstore a = `x {b} y`\n"],
    ["double quote", 'store b = 1\nstore a = "x {b} y"\n'],
    ["two interpolations", "store b = 1\nstore a = `{b} and {b}`\n"],
    ["escaped brace", 'store a = "x \\{y} z"\n'],
    ["single quotes are literal", "store a = '{a'\n"],
    ["multiline strings are literal", "store a = [[{a]]\n"],
  ])("%s", (_label, source) => {
    expect(diagnose(source)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Not yet matching Luau. Each is a real divergence with a stated reason.
// ---------------------------------------------------------------------------

// Luau: parse_interpolated_string_without_expression
// "Malformed interpolated string, expected expression inside '{}'"
//
// Before this was an error, `{}` lowered to nothing and silently DELETED
// itself from the string, so `` `a={}; x=3` `` became `a=; x=3`. A string that
// should hold literal braces uses `'...'` or `[[...]]`.
describe("empty interpolation", () => {
  // Identical for every interpolating quote form — `"..."` is not a weaker
  // dialect of `` `...` ``.
  test.each([
    ["backtick", "store a = `{}`\n"],
    ["backtick, mid", "store a = `{}{1}`\n"],
    ["backtick, inner space", "store a = `{ }`\n"],
    ["double quote", 'store a = "{}"\n'],
    ["double quote, mid", 'store a = "{}{1}"\n'],
    ["double quote, inner space", 'store a = "{ }"\n'],
  ])("%s", (_label, source) => {
    expect(
      diagnose(source).some((m) => m.includes("expected expression inside")),
      "expected an empty-interpolation diagnostic",
    ).toBe(true);
  });

  // `'...'` and `[[...]]` are the literal forms, so a string that genuinely
  // holds braces — a Lua pattern like `%b{}`, or JSON — is written with those.
  test.each([
    ["single quotes stay literal", "store a = '{}'\n"],
    ["a Lua pattern in single quotes", "store a = '%b{}'\n"],
    ["multiline strings stay literal", "store a = [[{}]]\n"],
  ])("%s", (_label, source) => {
    expect(diagnose(source)).toEqual([]);
  });
});

// Luau: parse_interpolated_string_double_brace_begin / _mid
// "Double braces are not permitted within interpolated strings; did you mean '\{'?"
//
// DELIBERATE divergence (issue #223): in sparkdown `{{name}}` is the
// function-call shorthand — `{{oops}}` means "call oops() and interpolate its
// return value" in every interpolation context, including Luau interpolated
// strings — so Luau's flat-out rejection of `{{` will never be adopted. (It
// used to diverge for a different reason: `{{` was Sparkle's literal-brace
// escape per spec decision D3, since superseded; the literal escape is now
// `\{` — same as Luau's own suggestion.)
describe.skip("double braces (diverges: `{{fn}}` is the call shorthand)", () => {
  test.each([
    ["begin", "store a = `{{oops}}`\n"],
    ["mid", "store a = `{nice} {{oops}}`\n"],
  ])("%s", (_label, source) => {
    expect(
      diagnose(source).some((m) => m.includes("Double braces")),
    ).toBe(true);
  });
});

// Luau: parse_interpolated_string_malformed_escape
// "Interpolated string literal contains malformed escape sequence"
// Sparkdown does not validate escape sequences anywhere yet.
describe.skip("malformed escape (diverges: escapes are not validated)", () => {
  test("`\\xQQ`", () => {
    expect(
      diagnose("store a = `???\\xQQ {1}`\n").some((m) =>
        m.includes("malformed escape sequence"),
      ),
    ).toBe(true);
  });
});

// Luau: parse_interpolated_string_as_type_fail
// "Interpolated string literals cannot be used as types"
// Sparkdown parses type annotations but ignores them (see DIVERGENCES.md),
// so there is no type position to reject one in.
describe.skip("as a type (N/A: type annotations are parsed but ignored)", () => {
  test("in a type annotation", () => {
    expect(
      diagnose("store a: `what` = `???`\n").some((m) =>
        m.includes("cannot be used as types"),
      ),
    ).toBe(true);
  });
});
