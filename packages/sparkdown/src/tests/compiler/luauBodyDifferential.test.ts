// A function body is Luau (#1158). This compares Sparkdown's reading of
// generated function bodies with the pinned official C++ parser:
//
//  - a body Luau reads without an error gets no Sparkdown error, and the
//    story after the function plays;
//  - a body Luau rejects gets Sparkdown's first error at Luau's first error,
//    with Luau's wording;
//  - after edits inside the body, an incremental compile reports what a cold
//    compile of the same text reports, errors and warnings with their ranges.
//
// The bodies mix ordinary Luau statements (values on later lines, calls with
// later-line arguments, long strings and comments that run on) with lines
// Luau cannot read as statements, inside every kind of Luau block, in
// functions and type functions. Shapes
// whose divergence is filed separately are left out: a `(` line after a
// callable line, which Luau calls ambiguous (#1288); `repeat` blocks (#1195,
// #1209); and `...` in a function that takes none (#1289).
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { officialSyntaxErrors } from "./officialSyntax";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

const URI = "inmemory:///main.sd";

function compiler(text: string) {
  const c = new SparkdownCompiler();
  c.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return c;
}

const compile = (c: SparkdownCompiler) =>
  (c.compile({ textDocument: { uri: URI } } as never) as any).program;

interface Found {
  line: number;
  character: number;
  message: string;
}

// Sparkdown's own convention, kept here: an access path ends with its line,
// so a `.` that no name follows on its line is reported there, where Luau
// reads the next line's first name as its member.
const NAME_ON_LATER_LINE = /on the same line/;

function errors(program: any): Found[] {
  const found: Found[] = [];
  for (const list of Object.values(program.diagnostics ?? {}) as any[]) {
    for (const d of list) {
      if (d.severity !== 1) continue;
      found.push({
        line: d.range.start.line,
        character: d.range.start.character,
        message: typeof d.message === "string" ? d.message : d.message?.value,
      });
    }
  }
  return found.sort((a, b) => a.line - b.line || a.character - b.character || a.message.localeCompare(b.message));
}

// Every diagnostic, errors and warnings, with its whole range.
function diagnostics(program: any): string[] {
  const found: string[] = [];
  for (const list of Object.values(program.diagnostics ?? {}) as any[]) {
    for (const d of list) {
      const { start, end } = d.range;
      const message = typeof d.message === "string" ? d.message : d.message?.value;
      found.push(`${d.severity} ${start.line}:${start.character}-${end.line}:${end.character} ${message}`);
    }
  }
  return found.sort();
}

function played(program: any): string[] {
  const story = new RuntimeStory(program.compiled as Record<string, any>);
  const lines: string[] = [];
  while (story.canContinue) {
    const text = story.Continue();
    if (text) lines.push(text);
  }
  return lines;
}

// One statement each, one or more lines, without indentation.
const LUAU: string[][] = [
  ["local x = 1"],
  ["x = 2"],
  ['print("a")'],
  ['print "a"'],
  ["print { 1 }"],
  ["t:m(1)"],
  ["local y =", "  2"],
  ["local z = f", '  "a"'],
  ["f", '  "a"'],
  ["f", "  { 1 }"],
  ["local s = [[", "end", "]]"],
  ["--[[", "end", "]]"],
  ["-- end"],
  [""],
  ['local q = "a\\', 'end"'],
  ["do", "  local w = 1", "end"],
  ["if x then", "  print(x)", "end"],
  ["for i = 1, 2 do", "  print(i)", "end"],
  ["local a, b = 1,", "  2"],
  ["print(1); print(2)"],
  ["local v = t.a", "  .b"],
  ["local n = f(1)", "  :g()"],
  ["local m = 1 +", "  2"],
  ["local l = x", "  and 1", "  or 2"],
  ["while false do", "  x = 1", "end"],
  ['local k = maker "A"', '  "B"'],
  ["local p = [=[--]=]"],
  ['local e = "x" -- end'],
  ["t.a = 1"],
  ["t[1] = 2"],
  ["local g = function() end"],
  ["x += 1"],
  ["local o = { a = 1,", "  b = 2 }"],
  ["if x then print(1) else print(2) end"],
  ["local function h()", "  return 1", "end"],
  ["t", "  :m(1)"],
  ["x = x", "  + 1"],
  ["local d = x; local d2 = 2"],
  ["local w: typeof({ k = 1 })"],
  ["local w2: number", "w2 = 1"],
  ["local w3: typeof({ k = 1 }) =", "  { k = 2 }"],
  ["local neg =", "  -2"],
  ["local pick = if x then f else f", '  "a"'],
];

const NOT_STATEMENTS: string[][] = [
  ["Hello there."],
  ["Hello!"],
  ["U.S."],
  ["Hi, Bob"],
  ["Hello"],
  ["1 + 2"],
  ['"str"'],
  ['He said "the end" today.'],
  ["Well, friend."],
  ["Yes?"],
  ["Hello there;"],
  ["Hello there --[[c]]"],
  ["salt and pepper."],
  ["I will return tomorrow."],
  ["{ 1 }"],
  ["Hello there [[", "end", "]]"],
  ['Hello there "a\\', 'end"'],
  ["Mr.Smith waves."],
  ["Hello 0xFF!"],
  ["a.b."],
  ["#t"],
  ["not x"],
  ["function() end"],
  ["(x)"],
  ["Hi -- the end"],
  ["Hello there. -- note"],
  ["!Hello"],
  ["?Who"],
  ["$5 a day"],
  ["~Hello"],
  ["U.S.", "  $5"],
  ["local y: number", '  "s"'],
];

// Lines with a block's `end` in them close the block there, as in Luau, so
// the lines after them are story; they are compared by their errors only.
const CLOSING: string[][] = [["The end."], ["Oh no, the end"], ["Hello there;end"]];

// [header lines, closing lines, indentation of the statements]
const BLOCKS: [string[], string[], string][] = [
  [[], [], "  "],
  [["  if x then"], ["  end"], "    "],
  [["  if x then", "    print(1)", "  else"], ["  end"], "    "],
  [["  if x then", "    print(1)", "  elseif x then"], ["  end"], "    "],
  [["  do"], ["  end"], "    "],
  [["  while false do"], ["  end"], "    "],
  [["  for i = 1, 2 do"], ["  end"], "    "],
  [["  for i = 1, 2 do", "    if x then"], ["    end", "  end"], "      "],
  [["  for k, v in pairs(t) do"], ["  end"], "    "],
];

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function generate(seed: number) {
  const random = rng(seed);
  const statements: string[][] = [];
  const count = 1 + Math.floor(random() * 4);
  for (let i = 0; i < count; i++) {
    const roll = random();
    const pool = roll < 0.3 ? NOT_STATEMENTS : roll < 0.35 ? CLOSING : LUAU;
    statements.push(pool[Math.floor(random() * pool.length)]!);
  }
  const [header, closing, indent] = BLOCKS[Math.floor(random() * BLOCKS.length)]!;
  const lines = statements.map((s) => s.map((l) => (l ? indent + l : l)).join("\n"));
  // A type function's body is Luau too, though it reaches no runtime code.
  const outer = random() < 0.2 ? "type function g(...)" : "function f(...)";
  const luau = [
    outer,
    "  local x, t, f, maker = 1, {}, print, print",
    ...header,
    ...lines,
    ...closing,
    "end",
    "",
  ].join("\n");
  return { luau, source: `${luau}After it.\n`, closesEarly: statements.some((s) => CLOSING.includes(s)), random };
}

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe("a function body read as Luau reads it (#1158)", () => {
  it.each(SEEDS)("agrees with Luau's parser on body %i", (seed) => {
    const { luau, source, closesEarly } = generate(seed);
    const expected = officialSyntaxErrors(luau);
    const program = compile(compiler(source));
    const found = errors(program).filter((e) => !NAME_ON_LATER_LINE.test(e.message));
    if (expected.length === 0) {
      expect(found, source).toEqual([]);
      if (!closesEarly && errors(program).length === 0) {
        expect(played(program), source).toEqual(["After it.\n"]);
      }
      return;
    }
    const first = errors(program)[0];
    expect(first, source).toBeDefined();
    if (NAME_ON_LATER_LINE.test(first!.message)) return;
    expect(first, source).toEqual({
      line: expected[0]!.location.begin.line,
      character: expected[0]!.location.begin.column,
      message: expected[0]!.message,
    });
    if (!closesEarly) {
      expect(played(program), source).toEqual(["After it.\n"]);
    }
  });

  it.each(SEEDS.filter((seed) => seed % 6 === 0))(
    "compiles edits inside body %i incrementally as a cold compile does",
    (seed) => {
      const { source, random } = generate(seed);
      const c = compiler(source);
      compile(c);
      let text = source;
      const start = text.indexOf("local x, t");
      const end = text.lastIndexOf("end\n");
      const position = (offset: number) => {
        const before = text.slice(0, offset).split("\n");
        return { line: before.length - 1, character: before[before.length - 1]!.length };
      };
      for (let edit = 0; edit < 3; edit++) {
        const offset = start + Math.floor(random() * (end - start));
        const roll = random();
        const [removed, inserted] = roll < 0.4 ? [0, "z"] : roll < 0.7 ? [0, "\n"] : [1, ""];
        c.updateDocument({
          textDocument: { uri: URI, version: edit + 2 },
          contentChanges: [{ range: { start: position(offset), end: position(offset + removed) }, text: inserted }],
        } as never);
        text = text.slice(0, offset) + inserted + text.slice(offset + removed);
        expect(diagnostics(compile(c)), text).toEqual(diagnostics(compile(compiler(text))));
      }
    },
  );
});
