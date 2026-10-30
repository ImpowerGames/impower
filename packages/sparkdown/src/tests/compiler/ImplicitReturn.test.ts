import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { diagnoseDetailed } from "../luau-conformance/diagnosticTestHarness";

const implicit = (source: string) => diagnoseDetailed(source).filter((d) => d.code === "ImplicitReturn");
const messages = (found: { message: string }[]) => found.map((d) => d.message);
const syntaxErrors = (source: string) => diagnoseDetailed(source).filter((d) => d.severity === 1);
const falls = (name: string, line: number) => `Function${name ? ` '${name}'` : ""} can implicitly return no values even though there's an explicit return at line ${line}; add explicit return to silence`;

describe("ImplicitReturn", () => {
  test("warns at the closing end and names the first value return", () => {
    expect(implicit("function f(a)\n if a then\n  return 1\n end\n if a then\n  return 2\n end\nend\n")).toEqual([
      {
        file: "main.sd",
        code: "ImplicitReturn",
        severity: 2,
        message: falls("f", 3),
        range: { start: { line: 6, character: 1 }, end: { line: 6, character: 4 } },
      },
    ]);
  });

  test("warns on a final ordinary statement whole", () => {
    expect(implicit("function f(a)\n if a then return 1 end\n print(a)\nend\n").map((d) => d.range)).toEqual([
      { start: { line: 2, character: 1 }, end: { line: 2, character: 9 } },
    ]);
  });

  test.each([
    ["no value return", "if a then return end"],
    ["a final empty return", "if a then return 1 end\nreturn"],
    ["every arm returning", "if a then return 1 else return end"],
    ["a final error", "if a then return 1 end\nerror('stop')"],
    ["a final assert(false)", "if a then return 1 end\nassert(false)"],
    ["a repeat whose body returns", "repeat return 1 until a"],
    ["a while true without a break", "while true do\nwhile a do break end\nif a then return 1 end\nend"],
    ["a repeat until false without a break", "repeat\nif a then return 1 end\nuntil false"],
  ])("is silent for %s", (_label, body) => {
    expect(messages(implicit(`function f(a)\n${body}\nend\n`))).toEqual([]);
  });

  test("a nested function's return is its own", () => {
    expect(messages(implicit("function f(a)\n local function g() return 1 end\n g()\nend\n"))).toEqual([]);
    expect(messages(implicit("function f()\n local function g(a)\n  if a then return 1 end\n end\n g(false)\nend\n"))).toEqual([falls("g", 3)]);
  });

  test("a break leaves only its own loop", () => {
    expect(messages(implicit("function f(a)\n while true do\n  if a then return 1 end\n  if a then break end\n end\nend\n"))).toEqual([falls("f", 3)]);
  });

  test.each(["1", "0", '""', '"x"'])("a while %s without a break cannot fall through", (guard) => {
    const source = (exit: string) => `function f(a)\n while ${guard} do\n  if a then return 1 end${exit}\n end\nend\n`;
    expect(messages(implicit(source("")))).toEqual([]);
    expect(messages(implicit(source("\n  break")))).toEqual([falls("f", 3)]);
  });

  test.each(["nil", "false", "a"])("a while %s can fall through", (guard) => {
    expect(messages(implicit(`function f(a)\n while ${guard} do\n  if a then return 1 end\n end\nend\n`))).toEqual([falls("f", 3)]);
  });

  test("narrative control flow outside a function is not read", () => {
    expect(messages(implicit("if true\n & return 1\nend\nHello.\n"))).toEqual([]);
  });

  test.each(["until true", "until false", "until a"])("a repeat that breaks before its final return, %s, is silent as in Luau", (until) => {
    expect(messages(implicit(`function f(a)\n repeat\n  if a then break end\n  return 1\n ${until}\nend\n`))).toEqual([]);
  });

  test("a function in a Sparkle handler is read", () => {
    expect(messages(implicit("layout main with\n  button @click={ local g = function(a) if a then return 1 end end; g() }\nend\n"))).toEqual([falls("", 2)]);
  });
});

describe("a function holding a syntax error", () => {
  test("does not report ImplicitReturn when then is missing", () => {
    const source = "function reward(flag)\n  if flag\n    return 1\n  end\nend\n\nHello!\n";
    expect(syntaxErrors(source).length).toBeGreaterThan(0);
    expect(messages(implicit(source))).toEqual([]);
  });

  test.each([
    ["a while missing its do", "while a\n  if a then return 1 end\n end"],
    ["an elseif missing its then", "if a then\n  print(a)\n elseif a\n  return 1\n end"],
    ["a malformed expression", "if a then return 1 end\n print(+)"],
    ["a stray token", "if a then return 1 end\n x x"],
  ])("is left alone for %s", (_label, body) => {
    const source = `function f(a)\n ${body}\nend\n`;
    expect(syntaxErrors(source).length).toBeGreaterThan(0);
    expect(messages(implicit(source))).toEqual([]);
  });

  test.each([
    ["a function missing its end", "function f(a)\n if a then return 1 end\n"],
    ["an if missing its end", "function f(a)\n if a then return 1\nend\n"],
  ])("is left alone for %s", (_label, source) => {
    expect(messages(implicit(source))).toEqual([]);
  });

  test("a valid function beside it still warns", () => {
    const source = "function reward(flag)\n  if flag\n    return 1\n  end\nend\n\nfunction other(a)\n  if a then return 1 end\nend\n";
    expect(syntaxErrors(source).length).toBeGreaterThan(0);
    expect(messages(implicit(source))).toEqual([falls("other", 8)]);
  });
});

describe("the type checker's return paths", () => {
  const URI = "inmemory:///main.sd";
  const codepaths = (loop: string) => {
    const text = `---\ntitle: Paths\ntypecheck: strict\n---\n\nfunction f(a: boolean): number\n ${loop}\nend\n`;
    const compiler = new SparkdownCompiler();
    compiler.configure({ files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] });
    const { program } = compiler.compile({ textDocument: { uri: URI } });
    return (program.diagnostics?.[URI] ?? []).filter((d) => d.code === "FunctionExitsWithoutReturning").length;
  };

  test.each([
    ["an if without else", "if a then return 1 end", 1],
    ["a while true without a break", "while true do\n  if a then return 1 end\n end", 0],
    ["a while 1 without a break", "while 1 do\n  if a then return 1 end\n end", 1],
    ["a final error", "if a then return 1 end\n error('stop')", 0],
  ])("%s", (_label, body, expected) => {
    expect(codepaths(body)).toBe(expected);
  });
});

describe("a function inside a type", () => {
  test.each([
    ["a type alias in a function", "function f()\n type T = typeof(function(a) if a then return 1 end end)\nend\n"],
    ["a local's annotation", "function f()\n local t: typeof(function(a) if a then return 1 end end) = nil\n return t\nend\n"],
    ["a top-level type alias", "type T = typeof(function(a) if a then return 1 end end)\n"],
  ])("is not checked in %s", (_label, source) => {
    expect(syntaxErrors(source)).toEqual([]);
    expect(messages(implicit(source))).toEqual([]);
  });
});
