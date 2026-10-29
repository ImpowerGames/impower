// A pure-Luau body or bracket never closes before its closer, a bail-out its
// own end has (a body's beat) or the end of the input (#1905, slice S1 of
// #1904). A token none of its patterns
// reads is taken by `LuauUnreadToken`, the converter reads it as Luau's lexer
// does, and every error of its statement is reported as Luau reports it,
// with Luau's cascade. So the function keeps its own `end`, the story line
// after it plays, and the errors are the official parser's.
import { describe, expect, it, vi } from "vitest";
import type { SyntaxNode } from "@lezer/common";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { functionSpans } from "../programListing";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { checkLuau, describeDiagnostic } from "../luau-conformance/typecheckTestHarness";
import { loadOfficialLuau } from "./officialLuau";
import { officialSyntaxErrors } from "./officialSyntax";
import { checkerTextUnits } from "./luauCheckerText";

const URI = "inmemory:///main.sd";

// The pin of the type-checker port, which the converter follows (it reads
// `export` inside a function as Luau does since that pin).
const official = await loadOfficialLuau("typecheck");

const withStart = (text: string) => (/^scene start\b/m.test(text) ? text : `${text}\nscene start\nend\n`);

function compiler(text: string) {
  const c = new SparkdownCompiler();
  c.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text: withStart(text), version: 1, languageId: "sparkdown" }],
  } as never);
  return c;
}

const errorsOf = (program: any): string[] =>
  (program.diagnostics?.[URI] ?? [])
    .filter((d: any) => d.severity === DiagnosticSeverity.Error)
    .map((d: any) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      return `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${message}`;
    })
    .sort();

/** The official parser's errors for some Luau, on the lines it stands on in the script. */
const officialErrors = (luau: string, line = 0): string[] =>
  official(luau)
    .diagnostics.map(
      (e) => `${e.location.begin.line + line}:${e.location.begin.column}-${e.location.end.line + line}:${e.location.end.column} ${e.message}`,
    )
    .sort();

function errorNodes(tree: { topNode: SyntaxNode }): string[] {
  const found: string[] = [];
  const cursor = tree.topNode.cursor();
  do if (cursor.type.isError) found.push(`${cursor.name}@${cursor.from}`);
  while (cursor.next());
  return found;
}

interface Reading {
  errors: string[];
  functions: { path: string; lines: [number, number, number] }[];
  output: string;
  warnings: string[];
  tree: { topNode: SyntaxNode };
}

function read(text: string): Reading {
  const warnings: string[] = [];
  const warn = vi.spyOn(console, "warn").mockImplementation((...args) => {
    warnings.push(args.map(String).join(" "));
  });
  try {
    const c = compiler(text);
    const program = c.compile({ textDocument: { uri: URI } } as never).program as any;
    const output = makeRuntimeStoryFromSource(withStart(text)).story.ContinueMaximally();
    return { errors: errorsOf(program), functions: functionSpans(program), output, warnings, tree: c.documents.tree(URI)! };
  } finally {
    warn.mockRestore();
  }
}

interface Case {
  /** The script: a function, then the scene `start` that shows the story line it is called from. */
  text: string;
  /** The function's name and its first and last lines (its `end`). */
  fn: [string, number, number];
  output: string;
  /** Its Luau, given to the official parser. */
  luau: string;
}

const CASES: Record<string, Case> = {
  "#921 a function marked with an attribute list": {
    text: "function g()\n  @[deprecated]\n  local function f()\n    return 1\n  end\n  return f()\nend\nscene start\n  Value {g()}.\nend\n",
    fn: ["g", 0, 6],
    output: "Value 1.\n",
    luau: "function g()\n  @[deprecated]\n  local function f()\n    return 1\n  end\n  return f()\nend\n",
  },
  "#921 an attribute list with an argument": {
    text: 'function g()\n  @[deprecated{ reason = "x" }]\n  local function f()\n    return 1\n  end\n  return f()\nend\nscene start\n  Value {g()}.\nend\n',
    fn: ["g", 0, 6],
    output: "Value 1.\n",
    luau: 'function g()\n  @[deprecated{ reason = "x" }]\n  local function f()\n    return 1\n  end\n  return f()\nend\n',
  },
  "#1258 a semicolon inside a call's parentheses": {
    text: "function f(t)\n  print(1;)\nend\nscene start\n  After.\nend\n",
    fn: ["f", 0, 2],
    output: "After.\n",
    luau: "function f(t)\n  print(1;)\nend\n",
  },
  "#1261 a table type field written as an assignment": {
    text: "function f(t)\n  local x: {\n    bar\n    baz = 1 +\n  } = {}\n  2\nend\nscene start\n  After.\nend\n",
    fn: ["f", 0, 6],
    output: "After.\n",
    luau: "function f(t)\n  local x: {\n    bar\n    baz = 1 +\n  } = {}\n  2\nend\n",
  },
  "#1290 a stray closing parenthesis": {
    text: "function f()\n  local a = 1\n  )\n  return 5\nend\nscene start\n  Value {f()}.\nend\n",
    fn: ["f", 0, 4],
    output: "Value 5.\n",
    luau: "function f()\n  local a = 1\n  )\n  return 5\nend\n",
  },
  "#1290 a stray closing bracket": {
    text: "function f()\n  local a = 1\n  ]\n  return 5\nend\nscene start\n  Value {f()}.\nend\n",
    fn: ["f", 0, 4],
    output: "Value 5.\n",
    luau: "function f()\n  local a = 1\n  ]\n  return 5\nend\n",
  },
  "#1290 a stray closing brace": {
    text: "function f()\n  local a = 1\n  }\n  return 5\nend\nscene start\n  Value {f()}.\nend\n",
    fn: ["f", 0, 4],
    output: "Value 5.\n",
    luau: "function f()\n  local a = 1\n  }\n  return 5\nend\n",
  },
  "#1290 a closing parenthesis after a semicolon": {
    text: "function f()\n  local a = 1; )\n  return 5\nend\nscene start\n  Value {f()}.\nend\n",
    fn: ["f", 0, 3],
    output: "Value 5.\n",
    luau: "function f()\n  local a = 1; )\n  return 5\nend\n",
  },
  "#1318 export inside a function": {
    text: "function f()\n  export local a = 1\n  return a\nend\nscene start\n  : {f()}\nend\n",
    fn: ["f", 0, 3],
    output: "1\n",
    luau: "function f()\n  export local a = 1\n  return a\nend\n",
  },
  "#1318 another language's operators": {
    text: "function f(a, b)\n  local x = a && b\n  local y = a != b\n  return x\nend\nscene start\n  : {f(true, false)}\nend\n",
    fn: ["f", 0, 4],
    output: "false\n",
    luau: "function f(a, b)\n  local x = a && b\n  local y = a != b\n  return x\nend\n",
  },
  // The forms of #1199, #1329 and #1376 this slice fixes; their other forms
  // stay open (the story form of #1199, a top-level or `store` attributed
  // function, an intersection inside `<< >>`).
  "#1199 an if condition ending in a method colon, in a function": {
    text: "function f()\n  local flag = true\n  if flag:\n    print(1)\n  end\nend\nscene start\n  After.\nend\n",
    fn: ["f", 0, 5],
    output: "After.\n",
    luau: "function f()\n  local flag = true\n  if flag:\n    print(1)\n  end\nend\n",
  },
  "#1329 an attribute list on a function value in a function": {
    text: "function run()\nlocal f = @[native] function() return 7 end\nreturn f()\nend\nscene start\n  Value {run()}.\nend\n",
    fn: ["run", 0, 3],
    output: "Value 7.\n",
    luau: "function run()\nlocal f = @[native] function() return 7 end\nreturn f()\nend\n",
  },
  "#1376 a union inside explicit instantiation": {
    text: "function g<T>() end\nfunction f()\n  g<<number | string>>()\n  return 1\nend\nscene start\n  Value {f()}.\nend\n",
    fn: ["f", 1, 4],
    output: "Value 1.\n",
    luau: "function g<T>() end\nfunction f()\n  g<<number | string>>()\n  return 1\nend\n",
  },
  "#1370 a generic alias as an array element": {
    text: "type Box<T> = {value: T}\nfunction f()\n  local x: {Box<number>} = {}\n  return 1\nend\nscene start\n  Value {f()}.\nend\n",
    fn: ["f", 1, 4],
    output: "Value 1.\n",
    luau: "type Box<T> = {value: T}\nfunction f()\n  local x: {Box<number>} = {}\n  return 1\nend\n",
  },
  "#1382 a line break inside typeof": {
    text: "function f()\n  type T = typeof(1\n  )\n  return 1\nend\nscene start\n  Value {f()}.\nend\n",
    fn: ["f", 0, 4],
    output: "Value 1.\n",
    luau: "function f()\n  type T = typeof(1\n  )\n  return 1\nend\n",
  },
  "#1596 a then on its own line": {
    text: "function f(c)\nthen\nend\nscene start\n  After.\nend\n",
    fn: ["f", 0, 2],
    output: "After.\n",
    luau: "function f(c)\nthen\nend\n",
  },
  "#1596 a then after an if expression's arm line": {
    text: "function f(c)\nx = if c then 1 else 2\nthen 1\nend\nscene start\n  After.\nend\n",
    fn: ["f", 0, 3],
    output: "After.\n",
    luau: "function f(c)\nx = if c then 1 else 2\nthen 1\nend\n",
  },
  "#1596 a then glued after a closing parenthesis": {
    text: "function f(c)\nx = (if c)then\nprint(x)\nend\nscene start\n  After.\nend\n",
    fn: ["f", 0, 3],
    output: "After.\n",
    luau: "function f(c)\nx = (if c)then\nprint(x)\nend\n",
  },
  "#1647 a multiline if expression after a block comment": {
    text: "function f(c)\n  local x = --[[ c ]] if c then\n    1\n  else 2\n  return x\nend\nscene start\n  Value {f(true)}.\nend\n",
    fn: ["f", 0, 5],
    output: "Value 1.\n",
    luau: "function f(c)\n  local x = --[[ c ]] if c then\n    1\n  else 2\n  return x\nend\n",
  },
  "#1647 the same after return": {
    text: "function f(c)\n  return --[[ c ]] if c then\n    1\n  else 2\nend\nscene start\n  Value {f(true)}.\nend\n",
    fn: ["f", 0, 4],
    output: "Value 1.\n",
    luau: "function f(c)\n  return --[[ c ]] if c then\n    1\n  else 2\nend\n",
  },
  "#1647 the same inside parentheses": {
    text: "function f(c)\n  local x = (--[[ c ]] if c then\n    1\n  else 2)\n  return x\nend\nscene start\n  Value {f(true)}.\nend\n",
    fn: ["f", 0, 5],
    output: "Value 1.\n",
    luau: "function f(c)\n  local x = (--[[ c ]] if c then\n    1\n  else 2)\n  return x\nend\n",
  },
  "#1647 the same after an operator": {
    text: "function f(c)\n  local x = 1 + --[[ c ]] if c then\n    1\n  else 2\n  return x\nend\nscene start\n  Value {f(true)}.\nend\n",
    fn: ["f", 0, 5],
    output: "Value 2.\n",
    luau: "function f(c)\n  local x = 1 + --[[ c ]] if c then\n    1\n  else 2\n  return x\nend\n",
  },
};

describe("a function holding Luau the grammar has no rule for keeps its own end", () => {
  for (const [name, c] of Object.entries(CASES)) {
    it(name, () => {
      const reading = read(c.text);
      const [path, first, last] = c.fn;
      expect(reading.functions.filter((f) => f.path === path)).toEqual([{ path, lines: [0, first, last] }]);
      expect(reading.output).toBe(c.output);
      expect(reading.errors).toEqual(officialErrors(c.luau));
      expect(reading.warnings.filter((w) => w.includes("empty matches"))).toEqual([]);
    });
  }
});

describe("the errors are Luau's, in Luau's words at Luau's ranges", () => {
  it("#1258 reports the missing parenthesis at the semicolon", () => {
    expect(read(CASES["#1258 a semicolon inside a call's parentheses"]!.text).errors).toEqual([
      "1:9-1:10 Expected ')' (to close '(' at column 8), got ';'",
    ]);
  });

  it("#1261 reports the table type's error and Luau's cascade after it", () => {
    expect(read(CASES["#1261 a table type field written as an assignment"]!.text).errors).toEqual([
      "3:4-3:7 Expected '}' (to close '{' at line 2), got 'baz'",
      "4:2-4:3 Expected identifier when parsing expression, got '}'",
      "4:4-4:5 Expected identifier when parsing expression, got '='",
      "5:2-5:3 Expected identifier when parsing expression, got '2'",
    ]);
  });

  it("#1318 reports the export and the other language's operators", () => {
    expect(read(CASES["#1318 export inside a function"]!.text).errors).toEqual([
      "1:2-1:8 'export' may only be applied to top-level statements",
    ]);
    expect(read(CASES["#1318 another language's operators"]!.text).errors).toEqual([
      "1:14-1:16 Unexpected '&&'; did you mean 'and'?",
      "2:14-2:16 Unexpected '!='; did you mean '~='?",
    ]);
  });

  it("#1596 reports a then no if owns once, and the statement Luau's recovery reads after it", () => {
    expect(read(CASES["#1596 a then after an if expression's arm line"]!.text).errors).toEqual([
      "2:0-2:4 Expected identifier when parsing expression, got 'then'",
      "2:5-2:6 Expected identifier when parsing expression, got '1'",
    ]);
    expect(read(CASES["#1596 a then glued after a closing parenthesis"]!.text).errors).toEqual([
      "1:9-1:10 Expected 'then' when parsing if then else expression, got ')'",
      "3:0-3:3 Expected 'else' when parsing if then else expression, got 'end'",
    ]);
  });

  it("a line in a function that is not Luau reports what Luau reports for it", () => {
    const text = "function greet(n)\n  Hello there, friend.\n  return n\nend\nscene start\n  Value {greet(1)}.\nend\n";
    const reading = read(text);
    expect(reading.errors).toEqual(officialErrors("function greet(n)\n  Hello there, friend.\n  return n\nend\n"));
    expect(reading.errors).toEqual([
      "1:2-1:7 Incomplete statement: expected assignment or a function call",
      "2:2-2:8 Expected identifier, got 'return'",
    ]);
    expect(reading.functions).toEqual([{ path: "greet", lines: [0, 0, 3] }]);
    expect(reading.output).toBe("Value 1.\n");
  });

  // The type checker reads neither body, so their lowerers report what it
  // reports in a function's body, once each.
  it("a define's method and a sparkle handler's closure report Luau's errors as a function's body does", () => {
    const attribute = (line: number, at: number) => [
      `${line}:${at}-${line}:${at + 1} Attribute name is missing`,
      `${line}:${at + 1}-${line}:${at + 2} Attribute name is missing`,
      `${line}:${at + 3}-${line}:${at + 4} Expected 'function', 'local function', 'const function', 'declare function' or a function type declaration after attribute, but got '2' instead`,
    ];
    expect(read("function f()\n  x = 1 @@ 2\nend\n").errors).toEqual(attribute(1, 8).sort());
    expect(read("define X with\n  greet()\n    x = 1 @@ 2\n    Hello\n  end\nend\n").errors).toEqual([
      ...attribute(2, 10),
      "3:4-3:9 Incomplete statement: expected assignment or a function call",
    ].sort());
    expect(read("layout main with\n  button @click={ x = 1 @@ 2 }\nend\n").errors).toEqual(attribute(1, 24).sort());
  });

  it("a method's errors are those of the function it stands for, its end included", () => {
    // Luau reads the value after `then` up to the method's `end`.
    const body = "(c)\n    x = (if c)then\n  end\n";
    const asFunction = officialErrors(`function greet${body}`, 1);
    expect(asFunction).toContain("3:2-3:5 Expected identifier when parsing expression, got 'end'");
    expect(read(`define X with\n  greet${body}end\n`).errors).toEqual(asFunction);
    expect(read(`define X with\n  function greet${body}end\n`).errors).toEqual(asFunction);
  });

  it("a token no rule of a define's body reads is reported", () => {
    // As in a function's body, at the same place.
    expect(read("define X with\n  !\nend\nscene start\n  After.\nend\n").errors).toEqual(
      read("function X()\n  !\nend\nscene start\n  After.\nend\n").errors,
    );
    expect(read("define X with\n  a = 1 !\n  b = 2\nend\n").errors).toEqual(read("function X()\n  a = 1 !\n  b = 2\nend\n").errors);
  });
});

// The validator leaves to Luau's reading exactly the statements whose errors
// the converter marks as Luau's to report (`markUnreadErrors`), so each error
// is reported once, by one of them.
describe("each error has one reader", () => {
  it("an unread token in a nested block leaves the statement around it to the validator", () => {
    const outer = "2:12-2:14 Expected type, got '='";
    const nested = (code: string) => read(`define X with\n  greet()\n    local x: = function()\n${code}    end\n  end\nend\n`).errors;
    expect(nested("")).toEqual([outer]);
    expect(nested("      @\n")).toContain(outer);
    expect(read("function g()\n  local x: = function()\n    @\n  end\nend\n").errors).toContain("1:10-1:12 Expected type, got '='");
    expect(read("layout main with\n  button @click={ local x: = function() @ end }\nend\n").errors).toContain(
      "1:26-1:28 Expected type, got '='",
    );
  });

  it("an alternator's arm holding a token no rule reads has the errors of its reading as an expression", () => {
    // The type checker reads an alternator as a value of any type, not its
    // arms; before, this line reported only a malformed interpolation.
    expect(read('scene start\n  Value {cycle "a" | ! | "b" end}.\nend\n').errors).toContain("1:21-1:22 Unexpected '!'; did you mean 'not'?");
    // Inside a bracket of the arm too.
    for (const arm of ["(!true)", "{!true}", "tostring(!true)"]) {
      const line = `  Value {cycle "a" | ${arm} | "b" end}.`;
      const at = line.indexOf("!");
      expect(read(`scene start\n${line}\nend\n`).errors).toContain(`1:${at}-1:${at + 1} Unexpected '!'; did you mean 'not'?`);
    }
  });

  it("a sparkle closure's body and an alternator's arm are each one reading, recovery and nested functions included", () => {
    // Luau's errors for `@ x = (if c)`, written as a function value's body.
    const luau = (at: number) => [
      `${0}:${at}-${0}:${at + 1} Attribute name is missing`,
      `${0}:${at + 2}-${0}:${at + 3} Expected 'function', 'local function', 'const function', 'declare function' or a function type declaration after attribute, but got 'x' instead`,
      `${0}:${at + 11}-${0}:${at + 12} Expected 'then' when parsing if then else expression, got ')'`,
    ];
    expect(officialErrors("local f = function() @ x = (if c) end\n")).toEqual(luau(21).sort());
    const shifted = (line: number, at: number) => luau(at).map((e) => e.replace(/^0:(\d+)-0:/, `${line}:$1-${line}:`)).sort();
    expect(read("layout main with\n  button @click={ @ x = (if c) }\nend\n").errors).toEqual(shifted(1, 18));
    expect(read('scene start\n  Value {cycle | function() @ x = (if c) end | "b" end}.\nend\n').errors).toEqual(shifted(1, 28));
  });

  it("a sparkle closure's body is read as a function's body", () => {
    // `export` and `...` are errors in a function's body, not a chunk's. The
    // closure's `end` is implied where its body ends, so only where each
    // error begins is compared.
    const starts = (errors: string[]) => errors.map((e) => e.replace(/-\d+:\d+ /, " "));
    for (const [statement, luau] of [
      ["export local x = 1", "local f = function() export local x = 1 end\n"],
      ["local x = ... @", "local f = function() local x = ... @ end\n"],
    ] as const) {
      const shift = "  button @click={ ".length - "local f = function() ".length;
      const expected = officialErrors(luau).map((e) => e.replace(/^0:(\d+)-0:\d+/, (_, from) => `1:${Number(from) + shift}`));
      expect(expected.length).toBeGreaterThan(0);
      expect(starts(read(`layout main with\n  button @click={ ${statement} }\nend\n`).errors)).toEqual(expected);
    }
  });

  it("an unread attribute is read as Luau's lexer reads it, in a type and in a parameter list", () => {
    for (const luau of [
      "function f()\n  local x: @ = 1\nend\n",
      "function f(@) end\n",
      "function f()\n  b = @5\nend\n",
      "function f()\n  local a, b = 1, @5\nend\n",
    ]) {
      expect(read(luau).errors).toEqual(officialErrors(luau));
    }
    // In a define's method, in either spelling, as in a function's body.
    for (const header of ["f()", "function f()"]) {
      for (const line of ["local x = @5", "local a, b = 1, @5"]) {
        const errors = read(`define X with\n  ${header}\n    ${line}\n  end\nend\n`).errors;
        const inFunction = read(`function f()\n    ${line}\nend\n`).errors;
        expect(inFunction).toHaveLength(2);
        expect(errors).toEqual(inFunction.map((e) => e.replace(/^1:/, "2:").replace(/-1:/, "-2:")));
      }
    }
    // Inside an interpolation too, which the parser reads from tokens of its own.
    const interpolated = read("function f()\n  local s = `{function(@) end}`\nend\n").errors;
    expect(interpolated).toEqual(["1:23-1:24 Expected identifier when parsing variable name, got ''"]);
    // The `end` a closure's reading writes after its body is no name written
    // after a `@` right before the closure's `}`.
    const closure = (body: string) => read(`layout main with\n  button @click={ ${body}}\nend\n`).errors;
    expect(closure("local x = @")).toEqual(closure("local x = @ "));
    expect(closure("local x = @").join("\n")).not.toContain("@end");
    // The grammar reads `@native` and `@[native]` as attributes
    // (`LuauAttribute`, `LuauAttributeList`, #1924), so neither is an unread
    // token; the type is still missing there, as Luau reports it.
    expect(read("function f()\n  local x: @native = 1\nend\n").errors).toContain(
      "1:11-1:18 attributes are not allowed in declaration context",
    );
    expect(read("function f()\n  local x: @[native] = 1\nend\n").errors).toContain(
      "1:11-1:13 attributes are not allowed in declaration context",
    );
  });

  it("a statement after Luau's recovery has ended keeps its own errors", () => {
    // Luau's recovery from the attribute ends with `x = 1`, which it reads
    // with no error, so the declaration after it reports what it reports
    // written alone.
    const alone = read("function f(c)\n         local y = (if c)\nend\n").errors;
    expect(alone).toHaveLength(1);
    for (const before of ["@ x = 1; ", "@ x = 1  "]) {
      const errors = read(`function f(c)\n${before}local y = (if c)\nend\nscene start\n  After.\nend\n`).errors;
      expect(errors).toContain(alone[0]);
      expect(errors.filter((e) => e.includes("Attribute name is missing"))).toEqual(["1:0-1:1 Attribute name is missing"]);
    }
    // In a define's method too.
    const method = (line: string) => read(`define X with\n  greet(c)\n    ${line}\n  end\nend\n`).errors;
    const typeError = method("         local y: = 2");
    expect(typeError).toEqual(["2:21-2:23 Expected type, got '='"]);
    expect(method("@ x = 1; local y: = 2")).toContain(typeError[0]);
  });

  it("a comment before the unread token that follows a statement, and a statement read in recovery, are Luau's", () => {
    for (const luau of [
      "function f(c)\nx = (if c) --[[ note ]] then\nprint(x)\nend\n",
      "function f(c)\n@ x = (if c)\nprint(x)\nend\n",
    ]) {
      expect(read(`${luau}scene start\n  After.\nend\n`).errors).toEqual(officialErrors(luau));
    }
  });
});

describe("the syntax tree holds the whole function", () => {
  it("#921 reads the attribute list in the function's body, the `@` as an attribute's", () => {
    const { tree } = read(CASES["#921 a function marked with an attribute list"]!.text);
    const top: string[] = [];
    for (let node = tree.topNode.firstChild; node; node = node.nextSibling) top.push(node.name);
    expect(top.filter((n) => n !== "Newline")).toEqual(["LuauFunctionDefinition", "Scene", "ImplicitAction", "LuauEndKeyword"]);
    expect(errorNodes(tree)).toEqual([]);
    // The list's own rule reads it since #1924 (`LuauAttributeList`).
    const at = tree.topNode.resolveInner(CASES["#921 a function marked with an attribute list"]!.text.indexOf("@"), 1);
    expect(at.name).toBe("LuauAttributeOperator");
  });

  it("#1248 two calls on one line leave no unfinished node", () => {
    for (const line of ["print(1) print(2)", 'greet "x" greet "y"']) {
      const text = `function greet(x) end\nfunction f()\n  ${line}\nend\n`;
      const reading = read(text);
      expect(errorNodes(reading.tree), line).toEqual([]);
      expect(reading.errors, line).toEqual([]);
      expect(reading.functions.find((f) => f.path === "f"), line).toEqual({ path: "f", lines: [0, 1, 3] });
    }
  });

  it("#1370 and #1382 read a .luau file's types with no syntax error", () => {
    for (const source of [
      "type Box<T> = {value: T}\nlocal x: {Box<number>}\n",
      "type T = typeof(1\n)\n",
      "type T = typeof(\n1)\n",
      "type T = typeof(\n    1\n)\n",
    ]) {
      expect(checkLuau(source).syntaxDiagnostics.map(describeDiagnostic), source).toEqual([]);
      expect(official(source).diagnostics, source).toEqual([]);
    }
  });

  it("#1647 gives the type checker the whole if expression", () => {
    for (const name of Object.keys(CASES).filter((n) => n.startsWith("#1647"))) {
      const text = CASES[name]!.text;
      const c = compiler(text);
      c.compile({ textDocument: { uri: URI } } as never);
      const units = checkerTextUnits(c.documents.tree(URI)!, text);
      expect([units.prelude, ...units.flows].flatMap((u) => officialSyntaxErrors(u.text)), name).toEqual([]);
    }
  });
});

describe("a body or bracket closes only at its closer, a bail-out of its own or the end of the input", () => {
  it("takes every token it cannot read, in every pure-Luau body and bracket", () => {
    const bodies = [
      "  if c then @ end",
      "  while c do $ break end",
      "  repeat ? until c",
      "  do ! end",
      "  local t = { 1 ? 2 }",
      "  local s = tostring(1 ? 2)",
      "  local v = t[1 ? 2]",
    ];
    for (const body of bodies) {
      const luau = `function f(c, t)\n${body}\n  return 1\nend\n`;
      const reading = read(`${luau}scene start\n  Value {f(true, {})}.\nend\n`);
      expect(reading.functions, body).toEqual([{ path: "f", lines: [0, 0, 3] }]);
      expect(reading.output, body).toBe("Value 1.\n");
      expect(reading.errors, body).toEqual(officialErrors(luau));
      expect(reading.errors.length, body).toBeGreaterThan(0);
    }
  });

  it("an end inside a bracket closes the bracket and the block the end belongs to", () => {
    const reading = read("function f()\n  print(1\nend\nscene start\n  After.\nend\n");
    expect(reading.functions).toEqual([{ path: "f", lines: [0, 0, 2] }]);
    expect(reading.output).toBe("After.\n");
  });
});

describe("an edit keeps the errors a cold compile reports", () => {
  it("a statement edited into Luau the grammar cannot read and back", () => {
    let text = "function f()\n  Well, friend.\n  -- a comment\nend\n\nfunction g()\n  Hello there\nend\n";
    const c = compiler(text);
    c.compile({ textDocument: { uri: URI } } as never);
    let version = 2;
    for (const [before, after] of [
      ["Well, friend.", "print(1)"],
      ["print(1)", "print(1;)"],
      ["print(1;)", "Well, friend."],
      ["-- a comment", "-- changed"],
      ["Hello there", "Hello @ there"],
    ] as const) {
      const offset = text.indexOf(before);
      const lines = text.slice(0, offset).split("\n");
      const start = { line: lines.length - 1, character: lines[lines.length - 1]!.length };
      const end = { line: start.line, character: start.character + before.length };
      c.updateDocument({ textDocument: { uri: URI, version: version++ }, contentChanges: [{ range: { start, end }, text: after }] } as never);
      text = text.slice(0, offset) + after + text.slice(offset + before.length);
      const incremental = errorsOf(c.compile({ textDocument: { uri: URI } } as never).program);
      const cold = errorsOf(compiler(text).compile({ textDocument: { uri: URI } } as never).program);
      expect(incremental, after).toEqual(cold);
    }
    // The last text: the unread `@` makes its line's errors Luau's cascade.
    expect(errorsOf(c.compile({ textDocument: { uri: URI } } as never).program)).toEqual(officialErrors(text));
  });
});
