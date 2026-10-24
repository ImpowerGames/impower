// FormatString (I-613). The upstream cases are in
// `luau-conformance/LintCandidatesStdlib.test.ts` (FormatStringFormat to
// FormatStringDate); these are the controls around them: where the rule reads
// a call in Sparkdown's text, the calls it leaves alone, and a sweep holding
// each validator to the runtime function that runs the literal, which must
// reject every literal the rule warns about.

import { describe, expect, test } from "vitest";
import { diagnoseDetailed, lintInFunction } from "../luau-conformance/diagnosticTestHarness";
import { STDLIB } from "../../runtime/StdLib";

const lints = (source: string) => diagnoseDetailed(source).filter((d) => d.code === "FormatString");
const inFunction = (body: string) => lints(`& run()\nfunction run(s, f, p)\n${body}\nend\n`).map((d) => d.message);
/** Each warning's line and the text its range covers. */
const covered = (source: string) => {
  const lines = source.split("\n");
  return lints(source).map((d) => `${d.range!.start.line}: ${lines[d.range!.start.line]!.slice(d.range!.start.character, d.range!.end.character)}`);
};

describe("FormatString in Sparkdown", () => {
  test("warns at the literal", () => {
    expect(covered('& run()\nfunction run(s)\n  print(string.format("%d %", 1))\n  print(("%"):format())\n  print(string.gsub(s, "(a)", "%x"))\nend\n')).toEqual([
      '2: "%d %"',
      '3: "%"',
      '4: "%x"',
    ]);
  });

  test.each([
    ["an interpolation", 'Hi {string.format("%")}.\n', ['0: "%"']],
    ["a method on a literal in an interpolation", 'Hi {("%"):format()}.\n', ['0: "%"']],
    ["a call shorthand", 'Hi {{print(os.date("%"))}}.\n', ['0: "%"']],
    ["an interpolation in a scene", 'scene s\n  Hi {string.pack("?")}.\nend\n', ['1: "?"']],
    ["a narrative if's condition", 'if string.find("x", "[") then\n  Hi.\nend\n', ['0: "["']],
    ["a define's property", 'define hero as character with\n  v = string.match("x", "%")\nend\nHi.\n', ['1: "%"']],
    ["a Sparkle handler", 'layout main with\n  button @click=print(string.gsub("x", "", "%"))\nend\n', ['1: "%"']],
  ])("%s", (_name, source, expected) => {
    expect(covered(source)).toEqual(expected);
  });

  test("reads the literal's escapes and long strings", () => {
    expect(inFunction(' print(string.format("\\37"))\n print(string.format([[%]]))')).toEqual([
      "Invalid format string: unfinished format specifier",
      "Invalid format string: unfinished format specifier",
    ]);
  });

  test.each([
    ["a method on a value of unknown type", ' print(s:format("%"), s:match("%"))'],
    ["a literal in two pairs of parentheses", ' print((("%")):format())'],
    ["a format in parentheses", ' print(string.format(("%")), string.match(s, ("%")))'],
    ["a format that is not a literal", ' print(string.format(f), os.date(f), string.match(s, p))'],
    ["an interpolated format", " print(string.format(`%{s}`))"],
    ["a local named string", ' local string = { format = print }\n string.format("%")'],
    ["a plain-text find", ' print(string.find(s, "%", 1, true), string.find(s, "%", 1, f))'],
    ["a replacement for a pattern that is not a literal", ' print(string.gsub(s, p, "%9"))'],
    ["a call holding a syntax error", ' print(string.format("%",))'],
    ["a function written in a type", ' type T = typeof(function() return string.format("%") end)\n local _x: T'],
  ])("%s is left alone", (_name, body) => {
    expect(inFunction(body)).toEqual([]);
  });

  test.each([
    ["an escape of a character that is not a class", ' print(string.match(s, "%q"), string.match(s, "[%;]"))'],
    ["a class before a range's dash", ' print(string.match(s, "[%a-z]"))'],
    ["%1 for a pattern with no capture", ' print(string.gsub(s, "a", "%1"))'],
    ["a string option that only aligns in string.packsize", ' print(string.packsize("Xs"), string.packsize("Xs4"))'],
    ["os.date's %h", ' print(os.date("%h"), os.date("!%h", 0))'],
    ["a NUL byte in os.date's text", ' print(os.date("a\\0b"))'],
  ])("%s, which the runtime runs, is not reported", (_name, body) => {
    expect(inFunction(body)).toEqual([]);
  });

  test("a NUL byte that ends an os.date conversion is reported", () => {
    expect(inFunction(' print(os.date("%\\0"))')).toEqual(["Invalid date format: date format can not contain null characters"]);
  });

  // After `\z` the runtime keeps a space outside ASCII, as Luau does (I-1396),
  // so the two readings agree and the literal is reported.
  const NBSP = String.fromCharCode(0xa0);
  test.each([
    ["string.format", ` print(string.format("%\\z${NBSP}d", 7))`, "Invalid format string: invalid format specifier: must be a string format specifier or %"],
    ["string.pack", ` print(string.packsize("i\\z${NBSP}4"))`, "Invalid pack format: unexpected character; must be a pack specifier or space"],
    ["os.date", ` print(os.date("%\\z${NBSP}c"))`, "Invalid date format: unexpected replacement character; must be a date format specifier or %"],
    ["a gsub replacement", ` print(string.gsub(s, "(a)", "%\\z${NBSP}1"))`, "Invalid match replacement: unexpected replacement character; must be a digit or %"],
  ])("%s with a space outside ASCII after an escape is reported", (_name, body, message) => {
    expect(inFunction(body)).toEqual([message]);
  });

  // The runtime runs `%` before a character that is not a class as that
  // character, so the pattern is not reported. Since I-1398 a letter after
  // `%` also means the letter; this space is not a letter and keeps its
  // escape, so the reading is unchanged.
  test("a match pattern with a space outside ASCII after an escape is not reported", () => {
    expect(inFunction(` print(string.match(s, "%\\z${NBSP}d"))`)).toEqual([]);
  });

  test("a literal both readings find malformed is reported with Luau's message", () => {
    expect(inFunction(` print(string.format("%\\z${NBSP}"))`)).toEqual(["Invalid format string: invalid format specifier: must be a string format specifier or %"]);
  });

  test.each([
    ["a script's local", 'local string = { format = tostring }\nValue: {string.format("%")}\n'],
    ["a scene's local", 'scene s\n  local os = {}\n  Hi {os.date("%")}.\nend\n'],
  ])("a library %s names is left alone in an interpolation, which is read without its locals", (_name, source) => {
    expect(covered(source)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The runtime

class Rejected extends Error {}
const story = {
  Error(message: string): never {
    throw new Rejected(message);
  },
};

/** Whether the runtime's library function `name` rejects its arguments with an error matching `rejection`. */
function rejects(name: string, args: unknown[], rejection: RegExp): boolean {
  try {
    (STDLIB[name]!.fn as (story: unknown, args: unknown[]) => unknown)(story, args);
    return false;
  } catch (e) {
    if (!(e instanceof Rejected)) throw e;
    return rejection.test(e.message);
  }
}

const BACKSLASH = String.fromCharCode(92);
/** A Luau string literal holding `text`, each character a decimal escape. */
const literal = (text: string) => `"${[...text].map((c) => BACKSLASH + String(c.charCodeAt(0)).padStart(3, "0")).join("")}"`;
const ASCII = Array.from({ length: 128 }, (_, code) => String.fromCharCode(code));

/** The literals among `cases` that the rule warns about, each case written as a statement by `call`. */
function warned<T>(cases: T[], call: (c: T) => string): T[] {
  const lines = lintInFunction(`\n${cases.map(call).join("\n")}`, "FormatString").map((l) => l.line);
  return lines.map((line) => cases[line - 1]!);
}

describe("FormatString against the runtime", () => {
  test("string.format", () => {
    const formats = ["%", "%-", "%12.", ...ASCII.flatMap((c) => [`%${c}`, `%-${c}`, `%12${c}`, `%.34${c}`, `%123${c}`, `%1.234${c}`, `%%${c}`])];
    const found = warned(formats, (f) => `string.format(${literal(f)})`);
    expect(found.length).toBeGreaterThan(0);
    const args = Array.from({ length: 8 }, () => 1);
    expect(found.filter((f) => !rejects("string.format", [f, ...args], /^string\.format: (invalid |'%\*' does not take a form)/))).toEqual([]);
  });

  test("string.pack, string.unpack and string.packsize", () => {
    const printable = ASCII.slice(32, 127).concat(String.fromCharCode(0));
    const formats = printable.flatMap((c) => [c, `${c}0`, `${c}16`, `${c}17`, `${c}99999999999`, `X${c}`, `${c} `]);
    const data = String.fromCharCode(0).repeat(4096);
    const unpacked = warned(formats, (f) => `string.unpack(${literal(f)}, "")`);
    expect(unpacked.length).toBeGreaterThan(0);
    expect(unpacked.filter((f) => !rejects("string.unpack", [f, data], /^string\.pack: /))).toEqual([]);
    const sized = warned(formats, (f) => `string.packsize(${literal(f)})`);
    expect(sized.length).toBeGreaterThan(unpacked.length);
    expect(sized.filter((f) => !rejects("string.packsize", [f], /^string\.pack(size)?: /))).toEqual([]);
  });

  test("match patterns", () => {
    const structural = ["[", "[]", "[^]", "(", ")", "(()", "%b", "%bx", "%f", "%fx", "%f[", "[%a-b]", "[a-%b]", "(%1)", "()%1", "%0", "(a)%2", "[%1]", "[%b]", "[%f]", "%"];
    const patterns = [...structural, ...ASCII.flatMap((c) => [`%${c}`, `[%${c}]`, `[%${c}-z]`, `[a-%${c}]`, `(%${c}`, `[${c}`, `(${c})`])];
    const found = warned(patterns, (p) => `string.find("x", ${literal(p)})`);
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter((p) => !rejects("string.find", ["x", p], /^string\.find: /))).toEqual([]);
  });

  test("string.gsub replacements", () => {
    const patterns: [pattern: string, subject: string][] = [["", "a"], ["(a)", "a"], ["(a)(a)", "aa"]];
    const cases = patterns.flatMap(([pattern, subject]) => ["%", ...ASCII.flatMap((c) => [`%${c}`, `%1%${c}`])].map((replacement) => ({ pattern, subject, replacement })));
    const found = warned(cases, ({ pattern, replacement }) => `string.gsub("x", ${literal(pattern)}, ${literal(replacement)})`);
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter(({ pattern, subject, replacement }) => !rejects("string.gsub", [subject, pattern, replacement], /^string\.gsub: invalid (capture index|escape)/))).toEqual([]);
  });

  test("os.date", () => {
    const formats = ["%", "!%", ...ASCII.flatMap((c) => [`%${c}`, c, `!%${c}`, `%${c}%`])];
    const found = warned(formats, (f) => `os.date(${literal(f)})`);
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter((f) => !rejects("os.date", [f, 0], /^os\.date: invalid conversion specifier/))).toEqual([]);
  });
});
