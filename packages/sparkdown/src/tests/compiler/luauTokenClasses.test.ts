// The grammar's Luau token classes agree with Luau's lexer (#1906, slice S2
// of #1904): `end`, `else`, `elseif` and `until` are read only as the closers
// of their blocks, a reserved word is never a name, a structural word
// (`style`, `match`, `queue`, `continue` and the rest) opens its construct
// only in its shape and is a name elsewhere, a name ends where both engines
// agree, `require` is the global function it is, and an `=` that ends its
// line in Luau code reads its value from the next line.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, test, vi } from "vitest";
import onig from "vscode-oniguruma";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { compileSource } from "./compileSnapshot";
import { dumpTree, stripAnsi } from "./grammarSnapshot";
import { loadOfficialLuau } from "./officialLuau";

type Rule = { begin?: string; match?: string; patterns?: { include?: string }[] };
const repository = GRAMMAR_DEFINITION.repository as unknown as Record<string, Rule>;

const URI = "inmemory:///main.sd";

/** Every error a full compile reports, with its range. */
const errorsOf = (text: string): string[] => {
  const c = new SparkdownCompiler();
  c.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  const program = c.compile({ textDocument: { uri: URI } } as never).program as any;
  return (program.diagnostics?.[URI] ?? [])
    .filter((d: any) => d.severity === DiagnosticSeverity.Error)
    .map((d: any) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      return `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${message}`;
    })
    .sort();
};

const run = (text: string) => {
  const ctx = makeRuntimeStoryFromSource(text);
  return { errors: ctx.errorMessages, warnings: ctx.warningMessages, output: ctx.story.ContinueMaximally() };
};

/** The parser's empty-match warnings while it reads `text`. */
const parserWarnings = (text: string): string[] => {
  const warnings: string[] = [];
  const warn = vi.spyOn(console, "warn").mockImplementation((...args) => {
    warnings.push(args.map(String).join(" "));
  });
  try {
    dumpTree(text);
  } finally {
    warn.mockRestore();
  }
  return warnings;
};

let official: Awaited<ReturnType<typeof loadOfficialLuau>>;
beforeAll(async () => {
  official = await loadOfficialLuau("typecheck");
  const require = createRequire(import.meta.url);
  await onig.loadWASM(readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm")));
});

/** The official parser's errors for some Luau, ranged as the compile ranges its own. */
const officialErrors = (luau: string): string[] =>
  official(luau)
    .diagnostics.map((e) => `${e.location.begin.line}:${e.location.begin.column}-${e.location.end.line}:${e.location.end.column} ${e.message}`)
    .sort();

describe("closers close blocks and nothing else", () => {
  test("no expression or statement rule of a Luau body begins at `end`, `else`, `elseif` or `until`", () => {
    // The rules a Luau body or expression tries at a token: those reached
    // through rules that only list others, never those inside a rule that
    // opened. Each is tried where the tree engine tries it, sticky at the
    // closer.
    const tried = new Set<string>();
    const visit = (name: string) => {
      const rule = repository[name];
      if (!rule || tried.has(name)) return;
      tried.add(name);
      if (rule.begin === undefined && rule.match === undefined) {
        for (const p of rule.patterns ?? []) if (p.include?.startsWith("#")) visit(p.include.slice(1));
      }
    };
    for (const root of ["LuauBlockBody", "LuauExpression", "LuauSparkdownExplicitBlockBody", "LuauSparkdownExplicitExpression"]) visit(root);
    const readers: string[] = [];
    for (const name of tried) {
      const regex = repository[name]!.begin ?? repository[name]!.match;
      if (regex === undefined) continue;
      const sticky = new RegExp(regex, "muy");
      for (const closer of ["end", "end\n", "else x", "elseif x then", "until x"]) {
        sticky.lastIndex = 0;
        if (sticky.test(closer)) readers.push(`${name} reads ${JSON.stringify(closer)}`);
      }
    }
    expect(tried.size).toBeGreaterThan(50);
    expect(readers).toEqual([]);
  });

  test("the declarations hold no until statement", () => {
    const includes = (name: string) => (repository[name]!.patterns ?? []).map((p) => p.include);
    expect(includes("LuauDeclarations")).not.toContain("#LuauUntilStatement");
    expect(repository["LuauUntilStatement"]).toBeUndefined();
  });

  test("#1195 a repeat nested directly in another takes the first until", () => {
    const loops = "function f()\n  local n = 0\n  repeat\n    repeat n = n + 1 until true\n  until true\n  return n\nend\nResult {f()}.\n";
    expect(run(loops)).toEqual({ errors: [], warnings: [], output: "Result 1.\n" });
    const oneLine = "function f()\n  local n = 0\n  repeat repeat n = n + 1 until true until true\n  return n\nend\nResult {f()}.\n";
    expect(run(oneLine)).toEqual({ errors: [], warnings: [], output: "Result 1.\n" });
    const story = "store n = 0\nrepeat\n  repeat n = n + 1 until true\nuntil n >= 1\nCount {n}.\n";
    expect(run(story)).toEqual({ errors: [], warnings: [], output: "Count 1.\n" });
  });

  test("#922 an until glued to an operand closes its repeat", () => {
    const source = "Value {f()}.\nfunction f()\n  local n = 0\n  repeat n = (n + 1)until n > 2\n  return n\nend\n";
    expect(run(source)).toEqual({ errors: [], warnings: [], output: "Value 3.\n" });
  });

  test("#922 a keyword glued to an operand ends the operation, with no unfinished node", () => {
    for (const line of [
      "if a == (1)then end",
      "if not t[1]then end",
      "if a or (a)then end",
      'if type(a) == "t"then end',
      "if a == 1 and (b == 2)then end",
      "if a == t[1]then end",
      "if a == tostring(1)then end",
      'if a .. "x"then end',
      "if not (a)then end",
      "if a then elseif a == (1)then end",
      "while a == (1)do end",
      "for i = 1, a + (2)do end",
      "local y = if a == (1)then 1 else 2",
      "local y = if (a)then 1 else 2",
      "if a then x = (1)end",
      "if a then x = (1)else x = 2 end",
      "repeat x = (1)until a",
      "do x = (1)end",
      "do local y = (1)end",
    ]) {
      const source = `function f(a, b, t, x)\n  ${line}\n  return 1\nend\n`;
      expect(stripAnsi(dumpTree(source)), line).not.toContain("ERROR_INCOMPLETE");
      expect(officialErrors(source), line).toEqual([]);
    }
  });

  test("#1209 an if left open before a repeat's until is Luau's error at the until", () => {
    const source = "function f()\n  repeat\n    if true then\n      local y = 1\n  until true\nend\n";
    expect(officialErrors(source)).toEqual(["4:2-4:7 Expected 'end' (to close 'then' at line 3), got 'until'"]);
    expect(errorsOf(source)).toEqual(officialErrors(source));
  });

  test("a stray closer closes the block or bracket it stands in, and Luau's error is at it", () => {
    for (const source of [
      "function f(a)\n  if a then\n    while a do x() else y() end\nend\n",
      "function f()\n  repeat\n    local y = 1\n  end\n",
      "function f(a)\n  if a then x() else y() else z() end\nend\n",
      "function f()\n  print(1 end\n",
      "function f()\n  local t = { a = 1 end\n",
    ]) {
      expect(officialErrors(source), source).toHaveLength(1);
      expect(errorsOf(source), source).toEqual(officialErrors(source));
    }
  });

  // A function body takes its own `end` and no other closer, so one it does
  // not own stays in it instead of closing the outermost function.
  test("a closer no block of a function owns is Luau's error, and the function keeps its end", () => {
    for (const source of [
      "function f()\n  until true\nend\n",
      "function f()\n  else\nend\n",
      "function f()\n  local g = function()\n    until true\n  end\nend\n",
    ]) {
      expect(officialErrors(source), source).toHaveLength(1);
      expect(errorsOf(source), source).toEqual(officialErrors(source));
    }
  });

  // A block closes before the closer it does not own, so the `end` written
  // for the block is the function's, and the function's own `end` closes
  // nothing: Sparkdown reports it (#774), past the first error, where Luau's
  // parser has stopped.
  test("a closer in a block leaves the function's own `end` at the top level", () => {
    for (const source of [
      "function f()\n  do\n    until true\n  end\nend\n",
      "function f(a)\n  while a do\n    else\n  end\nend\n",
      "function f(a)\n  if a then\n    until true\n  end\nend\n",
    ]) {
      expect(officialErrors(source), source).toHaveLength(1);
      expect([...errorsOf(source)].sort(), source).toEqual([...officialErrors(source), "4:0-4:3 Expected <eof>, got 'end'"].sort());
    }
  });
});

describe("a reserved word is never a name", () => {
  // Luau's reserved words. `continue` is not one: Luau reads it as a keyword
  // only where a statement begins.
  const RESERVED = ["and", "break", "do", "else", "elseif", "end", "false", "for", "function", "if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while"];
  // The identifier class, as the grammar spells it in a rule that is only it.
  const identifier = repository["LuauAlternatorAssignmentName"]!.match!;

  /** The length of the identifier at the start of `text` in each engine, or null. */
  const read = (text: string) => {
    const sticky = new RegExp(identifier, "muy");
    const tree = sticky.exec(text)?.[0].length ?? null;
    const match = new onig.OnigScanner([identifier]).findNextMatchSync(text, 0);
    const vscode = match && match.captureIndices[0]!.start === 0 ? match.captureIndices[0]!.length : null;
    return { tree, vscode };
  };

  test.each(RESERVED)("`%s` is refused in both engines", (word) => {
    for (const after of ["", " ", "(", ".", "\n"]) expect(read(word + after), JSON.stringify(word + after)).toEqual({ tree: null, vscode: null });
  });

  test.each(["ends", "end_", "_end", "endx", "notify", "iffy", "untilNow", "continue", "type", "export", "require", "match", "style", "queue"])(
    "`%s` is a whole name in both engines",
    (name) => {
      expect(read(`${name} = 1`)).toEqual({ tree: name.length, vscode: name.length });
    },
  );

  test("a name ends before a non-ASCII letter alike in both engines", () => {
    expect(read("x名 = 1")).toEqual({ tree: 1, vscode: 1 });
    expect(read("end名")).toEqual({ tree: null, vscode: null });
  });

  test("#922 `do local y = (1)end` keeps the function's end", () => {
    const source = "Value {f()}.\nfunction f()\n  do local y = (1)end\n  return 2\nend\nAfter.\n";
    expect(run(source).output).toBe("Value 2.\nAfter.\n");
    expect(stripAnsi(dumpTree(source))).not.toMatch(/LuauVariableName \[\d+\.\.\d+\]: "end"/);
  });

  test("#924 `local x = if a then 2 else 3 end` keeps its block's end", () => {
    const source = "Value {g()}.\nfunction g()\n  local function foo(a) local x = if a then 2 else 3 end\n  return 1\nend\n";
    expect(run(source).output).toBe("Value 1.\n");
    expect(stripAnsi(dumpTree(source))).not.toMatch(/LuauVariableName \[\d+\.\.\d+\]: "end"/);
  });

  test.each([
    ["if", "1:8-1:10"],
    ["repeat", "1:8-1:14"],
    ["nil", "1:8-1:11"],
    ["end", "1:8-1:11"],
  ])("a `local` before `%s` is Luau's error at the word", (word, at) => {
    const source = `function f()\n  local ${word} = 3\nend\n`;
    const error = `${at} Expected identifier when parsing variable name, got '${word}'`;
    expect(officialErrors(source)).toContain(error);
    expect(errorsOf(source)).toContain(error);
  });

  test("a `local` with spaces before a reserved word is Luau's error too, never a define's key", () => {
    const source = "function f()\n  local  nil = 3\nend\n";
    expect(errorsOf(source)).toEqual(officialErrors(source));
    expect(stripAnsi(dumpTree(source))).not.toMatch(/LuauDefineKeywordKey/);
  });

  // Luau reads a reserved word written right after a `.` as the member's
  // name, in error, so a closer there closes nothing.
  test.each(["function f(t)\n  local x = t.end\nend\n", "function f(t)\n  return t.until\nend\n"])(
    "a reserved word right after a `.` is the member, with Luau's error: %j",
    (source) => {
      expect(officialErrors(source)).toHaveLength(1);
      expect(errorsOf(source)).toEqual(officialErrors(source));
    },
  );

  test.each([
    ["nil", "a", "1:11-1:14"],
    ["true", "a", "1:11-1:15"],
    ["nil", "a: number", "1:19-1:22"],
  ])("a reserved word after a `local`'s comma is Luau's error at the word: %s after %s", (word, first, at) => {
    const source = `function f()\n  local ${first}, ${word} = 1, 2\nend\n`;
    const error = `${at} Expected identifier when parsing variable name, got '${word}'`;
    expect(officialErrors(source)).toContain(error);
    expect(errorsOf(source)).toContain(error);
  });

  test.each([
    ["the next line", "function f()\n  local a,\n    nil = 1, 2\nend\n", "2:4-2:7 Expected identifier when parsing variable name, got 'nil'"],
    ["a line after a blank one", "function f()\n  local a,\n\n    nil = 1, 2\nend\n", "3:4-3:7 Expected identifier when parsing variable name, got 'nil'"],
    ["a line after a comment", "function f()\n  local a, -- c\n    true = 1, 2\nend\n", "2:4-2:8 Expected identifier when parsing variable name, got 'true'"],
    ["a third line of names", "function f()\n  local a,\n    b,\n    nil = 1, 2, 3\nend\n", "3:4-3:7 Expected identifier when parsing variable name, got 'nil'"],
    ["`function`", "function f()\n  local a, function = 1, 2\nend\n", "1:11-1:19 Expected identifier when parsing variable name, got 'function'"],
  ])("a reserved word after a `local`'s comma on %s is Luau's error at the word", (_name, source, error) => {
    expect(officialErrors(source)).toContain(error);
    expect(errorsOf(source)).toContain(error);
  });

  test("a define's key may be a modifier, and a reserved word's value may hold assignments (#1081)", () => {
    const source =
      "define cfg with\n  repeat = function() local inner = 7; return inner end\n  local = 3\n  store = 4\n  read = 5\n  local x = 8\n  store y = 9\nend\nValue {cfg['repeat']()} {cfg['local']} {cfg.store} {cfg.read} {cfg.x} {cfg.y}.\n";
    expect(run(source)).toEqual({ errors: [], warnings: [], output: "Value 7 3 4 5 8 9.\n" });
  });

  test("a define's key may be a reserved word (#1081)", () => {
    const source = "define cfg with\n  repeat = 3\n  if = 4\n  x = 5\nend\nValue {cfg['repeat']} {cfg['if']} {cfg.x}.\n";
    expect(run(source)).toEqual({ errors: [], warnings: [], output: "Value 3 4 5.\n" });
  });
});

describe("a structural word is a name outside its shape (#984)", () => {
  const WORDS = ["style", "layout", "screen", "component", "animation", "theme", "morph", "match", "plural", "queue", "cycle", "chain", "shuffle", "continue"];

  test.each(["hp", ...WORDS])("a local named %s is read inside a function", (word) => {
    const source = `Value {f()}.\nfunction f()\n  local ${word} = 7\n  local y = ${word}\n  return y\nend\n`;
    expect(run(source)).toMatchObject({ errors: [], output: "Value 7.\n" });
  });

  // `store style` and the other builtin type roots are #453.
  test.each(["hp", "match", "plural", "queue", "cycle", "chain", "shuffle", "continue", "layout"])("a store named %s is read in interpolation", (word) => {
    expect(run(`store ${word} = 1\n\nYou have {${word}} left.\n`)).toMatchObject({ errors: [], output: "You have 1 left.\n" });
  });

  test.each(["hp", ...WORDS])("return %s leaves the function's end to the function", (word) => {
    const source = `Value {f()}.\nfunction f()\n  local ${word} = 7\n  return ${word}\nend\n\nAfter.\n`;
    expect(run(source)).toMatchObject({ errors: [], output: "Value 7.\nAfter.\n" });
  });

  test("a local named continue is assigned, and continue is a statement where one begins", () => {
    const source = "Value {f()} {g()}.\nfunction f()\n  local continue = 1\n  continue = continue + 1\n  return continue\nend\nfunction g()\n  local n = 0\n  for i = 1, 3 do\n    if i == 2 then continue end\n    n = n + i\n  end\n  return n\nend\n";
    expect(run(source)).toMatchObject({ errors: [], output: "Value 2 4.\n" });
  });

  // An arm separator later on the line opens nothing when the word goes on
  // as a name: into an operator, a separator or a cast.
  test.each([
    ["queue", 'local s = queue .. "a|b"', "qa|b"],
    ["cycle", 'local s = tostring(cycle) .. "|"', "q|"],
    ["match", "local s = match :: number | string", "q"],
    ["queue", "local s = queue :: number | string", "q"],
    ["shuffle", 'local s, t = shuffle, "|"', "q"],
  ])("a %s with a later `|` on its line is a name: %s", (word, statement, value) => {
    const source = `Value {f()}.\nfunction f()\n  local ${word} = "q"\n  ${statement}\n  return s\nend\n`;
    expect(run(source)).toEqual({ errors: [], warnings: expect.any(Array), output: `Value ${value}.\n` });
    expect(stripAnsi(dumpTree(source))).not.toMatch(/AlternatorBlock \[/);
  });

  // A `|` inside a string is not an arm's.
  test.each([
    ['queue("a|b")', "a|b"],
    ['queue "a|b"', "a|b"],
    ['queue {"a|b"}', "table"],
    ["queue([[a|b]])", "a|b"],
    ["queue [==[a|b]==]", "a|b"],
    ["queue([====[a|b]====])", "a|b"],
    ["queue([==========[a|b]==========])", "a|b"],
  ])("a call %s with a `|` in its string is a call", (call, value) => {
    const source = `Value {f()}.\nfunction f()\n  local queue = function(s) return if type(s) == "table" then "table" else s end\n  local s = ${call}\n  return s\nend\n`;
    expect(run(source)).toEqual({ errors: [], warnings: [], output: `Value ${value}.\n` });
    // The word's rule holds no arms, so it names a value (I-1310).
    expect(stripAnsi(dumpTree(source))).not.toMatch(/AlternatorArms \[/);
  });

  // The long string is the alternator's head, an error that runs as no head (I-1446).
  test.each(['{cycle [===[a]===] | "b" end}', '{cycle [====[a]====] | "b" end}'])("an inline alternator whose head is a long string still alternates: %s", (alternator) => {
    expect(run(`Value ${alternator}.\n`)).toEqual({
      errors: ["A `cycle` takes no value before its first `|`; write its arms as `| ...`"],
      warnings: [],
      output: "Value b.\n",
    });
  });

  test.each(["queue -- note", "shuffle cycle --[[ note ]]"])("a block-form head %j with a comment after it still opens its block", (head) => {
    const source = `function f()\n  ${head}\n    | print(1)\n    | print(2)\n  end\n  return 3\nend\nValue {f()}.\n`;
    // One arm's call runs, writing its number before the line (I-1397); a
    // shuffle may take either arm.
    expect(run(source)).toMatchObject({ errors: [], output: expect.stringMatching(/^Value [12]3\.\n$/) });
    expect(stripAnsi(dumpTree(source))).toMatch(/─ LuauSequentialAlternatorLineStart \[/);
    expect(stripAnsi(dumpTree(source))).toMatch(/─ LuauAlternatorArms \[/);
  });

  test("a value after a block comment on the `=`'s line stays on that line", () => {
    const source = "function f()\n  local x = --[====[ n ]====] 5\n  return x\nend\nValue {f()}.\n";
    expect(run(source)).toEqual({ errors: [], warnings: [], output: "Value 5.\n" });
  });

  // The operation holds the line break after an `=` with no value on its
  // line, so it decides nothing from the comment's text, and it ends at a
  // later line's first token wherever it stands. A narrative statement has
  // no such scope and ends at its line.
  test("the scope opened at an `=` ends at a later line's first token in define bodies, and narrative statements end at their line", () => {
    const tree = (source: string) => stripAnsi(dumpTree(source));
    // A narrative reassignment with no value leaves the next line to the story.
    expect(tree("scene A\n  y = -- note\n  Hello there.\nend\n")).toMatch(/─ ActionLineEnd \[/);
    // A define property whose value begins the next line keeps it.
    expect(run("define cfg with\n  sameLine = if true then 10 else 0\n  nextLine =\n    if true then 10 else 0\nend\nValues {cfg.sameLine} {cfg.nextLine}.\n")).toEqual({
      errors: [],
      warnings: [],
      output: "Values 10 10.\n",
    });
    // A define property with no value leaves the `end` to the define.
    expect(tree("define cfg with\n  name =\nend\n")).toMatch(/LuauDefine_end \[\d+\.\.\d+\]/);
    expect(tree("define cfg with\n  name =\nend\n")).not.toMatch(/ERROR_INCOMPLETE/);
  });

  test("continue is a value where one stands, as in Luau", () => {
    const source = "function f()\n  local a, b = 1, continue\n  return a, b\nend\n";
    expect(officialErrors(source)).toEqual([]);
    expect(errorsOf(source)).toEqual([]);
  });

  test("#1102 an if on a local named match or plural logs no empty match", () => {
    for (const word of ["match", "plural"]) {
      expect(parserWarnings(`local ${word} = true\nif ${word} then return 1 end\n`)).toEqual([]);
      expect(parserWarnings(`function run()\n  local ${word} = true\n  if ${word} then return 1 end\nend\n`)).toEqual([]);
    }
  });

  test("each construct still opens in its shape", () => {
    const tree = (source: string) => stripAnsi(dumpTree(source));
    expect(tree("style button with\n  color = red\nend\n")).toMatch(/─ LuauStyle \[/);
    expect(tree("theme dusk with\n  g = 1\nend\n")).toMatch(/─ LuauTheme \[/);
    expect(tree("Hi {match(x) | 1 = \"a\" | 2 = \"b\"}.\n")).toMatch(/─ LuauConditionalAlternatorBlock \[/);
    expect(tree("Hi {match x|1 = \"a\"|2 = \"b\"}.\n")).toMatch(/─ LuauConditionalAlternatorBlock \[/);
    expect(tree("Hi {cycle \"a\" | \"b\" end}.\n")).toMatch(/─ LuauSequentialAlternatorBlock \[/);
    expect(tree("function f()\n  queue\n    | print(1)\n    | print(2)\n  end\nend\n")).toMatch(/─ LuauSequentialAlternatorLineStart \[/);
    expect(tree("function f(n)\n  match n\n    | 1 = print(1)\n  end\nend\n")).toMatch(/─ LuauConditionalAlternatorLineStart \[/);
    // Each holds its arms, which make it an alternator (I-1310).
    for (const source of ["Hi {match x|1 = \"a\"|2 = \"b\"}.\n", "Hi {cycle \"a\" | \"b\" end}.\n", "function f(n)\n  match n\n    | 1 = print(1)\n  end\nend\n"]) {
      expect(tree(source)).toMatch(/─ LuauAlternatorArms \[/);
    }
  });
});

describe("a name's boundary", () => {
  test("#1266 a struct key with a non-ASCII letter is a property, as an ASCII one is", () => {
    const struct = (key: string) => {
      const source = `theme t with\n  g:\n    ${key} = 2\n    tail = 3\nend\n`;
      const theme = (e: { block?: { context?: any } }) => e.block?.context?.["theme"]?.["t"];
      const entry = compileSource(source).find(theme);
      return entry ? theme(entry) : undefined;
    };
    const { a, ...ascii } = struct("a");
    expect(a).toBe(2);
    expect(struct("名")).toEqual({ ...ascii, 名: 2 });
  });
});

describe("require is a call (#879)", () => {
  test("a function that calls require keeps its shape and reports nothing", () => {
    const source = "Value {f()}.\nfunction f()\n  if false then\n    local _m = require(1)\n  end\n  return 1\nend\n";
    expect(run(source)).toEqual({ errors: [], warnings: [], output: "Value 1.\n" });
    const tree = stripAnsi(dumpTree(source));
    expect(tree).toMatch(/LuauStdLibFunctions \[\d+\.\.\d+\]: "require"/);
    expect(tree).not.toMatch(/ERROR_INCOMPLETE|LuauUnread/);
  });
});

describe("an `=` that ends its line reads its value from the next line (#1247)", () => {
  test("an if expression there is the declared value", () => {
    const source = "function f(c)\n  local x =\n    if c then 1 else 2\n  return x\nend\n\n{f(true)} {f(false)}\n";
    expect(run(source)).toEqual({ errors: [], warnings: [], output: "1 2\n" });
  });

  test("and the reassigned one, unindented too, which Luau's linter warns about", () => {
    const source = "function f(c)\n  local x\n  x =\nif c then 1 else 2\n  return x\nend\n\n{f(true)} {f(false)}\n";
    expect(run(source)).toEqual({ errors: [], warnings: ["Statement spans multiple lines; use indentation to silence"], output: "1 2\n" });
  });

  test("an if statement after a complete assignment stays a statement", () => {
    const source = "function f(c)\n  local x = 0\n  if c then\n    x = 1\n  end\n  return x\nend\n\n{f(true)} {f(false)}\n";
    expect(run(source)).toEqual({ errors: [], warnings: [], output: "1 0\n" });
  });

  test("a statement on the next line is not a value", () => {
    for (const source of ["function f()\n  local x =\n  return 1\nend\n", "function f()\n  local x = -- c\n  return 1\nend\n"]) {
      expect(errorsOf(source), source).toEqual(officialErrors(source));
    }
  });

  test.each(["-- note =", "-- note +=", "--[[ a ]] -- note ="])("an `=` inside a comment after a complete declaration is not one: %s", (comment) => {
    const source = `function f(c)\n  local x = 0 ${comment}\nif c then\n  x = 1\nend\n  return x\nend\n\n{f(true)} {f(false)}\n`;
    expect(run(source)).toEqual({ errors: [], warnings: [], output: "1 0\n" });
  });

  // A comment that ends the `=`'s line leaves the value on the next line.
  test.each([
    ["a line comment", "local x = -- note\n    if c then 1 else 2"],
    ["a block comment", "local x = --[[ note ]]\n    if c then 1 else 2"],
    ["a reassignment's line comment", "local x\n  x = -- note\n    if c then 1 else 2"],
    ["a block comment and a line comment", "local x = --[[ note ]] -- choose the value\n    if c then 1 else 2"],
    ["two block comments", "local x = --[[ a ]] --[[ b ]]\n    if c then 1 else 2"],
    ["a block comment that spans lines", "local x = --[[ first\n  second ]]\n    if c then 1 else 2"],
    ["a block comment of a high level", "local x = --[====[ note ]====]\n    if c then 1 else 2"],
    ["a block comment whose closing line holds the value", "local x = --[[ a\n b ]] if c then 1\n  else 2"],
  ])("after %s", (_name, statement) => {
    const source = `function f(c)\n  ${statement}\n  return x\nend\n\n{f(true)} {f(false)}\n`;
    expect(run(source)).toEqual({ errors: [], warnings: [], output: "1 2\n" });
  });
});

// A narrative declaration or reassignment ends at its line, so an `=` that
// ends it is missing its value there, whatever the next lines hold; only
// Luau bodies read a value from a later line. A block comment carrying a
// narrative statement on is #1907's.
// The statement's Luau meets its end of input at the line's end, as an `&`
// line's does, so the value is missing there, at `<eof>` (#1907).
describe("a narrative `=` that ends its line has no value (#1906)", () => {
  test.each([
    ["declaration", "local q =", "0:9-1:0"],
    ["reassignment", "store q = 0\nq =", "1:3-2:0"],
  ])("a %s's value after a multi-line comment's close is not read", (_kind, statement, at) => {
    const source = `${statement}\n--[[ a\nb\n]] l\nAfter.\n`;
    expect(errorsOf(source)).toEqual([`${at} Expected identifier when parsing expression, got <eof>`]);
  });

  test.each([
    ["declaration", "local y =", "0:9-1:0"],
    ["reassignment", "store y = 0\ny =", "1:3-2:0"],
  ])("a %s before an if line ends at its line", (_kind, statement, at) => {
    const source = `${statement}\nif true then\n  Inside.\nend\nAfter.\n`;
    expect(errorsOf(source)).toEqual([`${at} Expected identifier when parsing expression, got <eof>`]);
    // The `if` line is a narrative if block, and no statement crosses into it.
    const ifAt = source.indexOf("\nif") + 1;
    const top = stripAnsi(dumpTree(source))
      .split("\n")
      .map((line) => /^ [├└]─ (\S+) \[(\d+)\.\.(\d+)\]/.exec(line))
      .filter((m) => m !== null)
      .map((m) => ({ name: m[1], from: Number(m[2]), to: Number(m[3]) }));
    expect(top.find((node) => node.from === ifAt)?.name).toBe("LuauSparkdownIfBlock");
    expect(top.filter((node) => node.from < ifAt && node.to > ifAt)).toEqual([]);
  });
});
