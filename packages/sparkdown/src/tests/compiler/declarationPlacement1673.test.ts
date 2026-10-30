// Where a declaration can be written (I-1673): a `local` binding belongs to a
// scene, a branch, a choice's body or a function, and a hoisted declaration
// (`store`, `const`, `define` and the definitions written like one,
// `function`, `type`, `external`) to a script's top level. Each misplaced
// one is an error on the line it starts.

import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { File } from "../../compiler/types/File";

const MAIN = "file://proj/main.sd";
const OTHER = "file://proj/scripts/other.sd";
const NEWLINE = String.fromCharCode(10);
const lines = (...text: string[]) => text.join(NEWLINE) + NEWLINE;

const LOCAL =
  "local declaration must be inside a scene, branch or function; use store or const at the top level";
const STORE =
  "store declaration must be at the top level; assign it here with & name = value instead";
const OUTSIDE_SCENE =
  "statement must be inside a scene or branch; the top level holds declarations only";

const file = (uri: string, text: string): File => ({
  uri,
  type: "script",
  name: uri.split("/").at(-1)!.split(".")[0]!,
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

/** The diagnostics of `uri` once main and the other script compile, each as
 *  its message and the text of its range. */
const diagnose = (
  main: string,
  other = "",
  uri = MAIN,
): { message: string; text: string }[] => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [file(MAIN, main), ...(other ? [file(OTHER, other)] : [])],
  });
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  let program;
  try {
    program = compiler.compile({ textDocument: { uri: MAIN } }).program;
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
  const text = (uri === MAIN ? main : other).split(NEWLINE);
  return (program.diagnostics?.[uri] ?? []).map((d) => {
    const message = typeof d.message === "string" ? d.message : d.message.value;
    const { start, end } = d.range;
    return {
      message,
      text:
        start.line === end.line
          ? text[start.line]!.slice(start.character, end.character)
          : "",
    };
  });
};

const placementErrors = (
  main: string,
  other = "",
  uri = MAIN,
): { message: string; text: string }[] =>
  diagnose(main, other, uri).filter(
    (d) => d.message.includes("must be at the top level") || d.message === LOCAL,
  );

describe("a local outside a flow", () => {
  it.each([
    ["a local statement", "local x = 1"],
    ["a local function", "local function f() end"],
    ["a marked local", "& local x = 1"],
  ])("refuses %s at main's top level", (_, line) => {
    expect(placementErrors(lines(line, "Hello."))).toEqual([
      { message: LOCAL, text: line },
    ]);
  });

  it.each([
    ["a local statement", "local x = 1"],
    ["a local function", "local function f() end"],
    ["a marked local", "& local x = 1"],
  ])("refuses %s at another script's top level, in place of the outside-scene message", (_, line) => {
    const found = diagnose(lines("Hello."), lines(line), OTHER);
    expect(found).toEqual([{ message: LOCAL, text: line }]);
    expect(found.map((d) => d.message)).not.toContain(OUTSIDE_SCENE);
  });

  it("refuses a local inside a top-level if of main", () => {
    expect(
      placementErrors(lines("if true then", "  local x = 1", "end", "Hello.")),
    ).toEqual([{ message: LOCAL, text: "local x = 1" }]);
  });

  it("refuses a local in a choose block's then clause at the top level", () => {
    expect(
      placementErrors(
        lines("choose", "  * Go", "    Went.", "then", "  local x = 1", "end"),
      ),
    ).toEqual([{ message: LOCAL, text: "local x = 1" }]);
  });

  it("refuses a local Luau reads after a top-level store on its line, past a block comment", () => {
    expect(placementErrors(lines("store x = 1 --[[c]] local y = 2", "Hello."))).toEqual([
      { message: LOCAL, text: "local y = 2" },
    ]);
  });

  it("keeps the misplaced line's own syntax errors beside it", () => {
    expect(diagnose(lines("local a = {1 ? 2}", "scene start", "end"))).toEqual([
      { message: LOCAL, text: "local a = {1 ? 2}" },
      { message: "Expected '}' (to close '{' at column 11), got '?'", text: "?" },
      { message: "Expected identifier when parsing expression, got '2'", text: "2" },
      { message: "Expected identifier when parsing expression, got '}'", text: "}" },
    ]);
  });

  it("reports the outside-scene message for another script's other top-level lines", () => {
    expect(
      diagnose(lines("Hello."), lines("Hello there."), OTHER).map((d) => d.message),
    ).toEqual([OUTSIDE_SCENE]);
  });
});

describe("a hoisted declaration inside a flow", () => {
  const cases: [string, string[], string, string][] = [
    ["store", ["store x = 1"], STORE, "store x = 1"],
    ["const", ["const x = 1"], "const declaration must be at the top level", "const x = 1"],
    ["define", ["define D with", "  k = 1", "end"], "define must be at the top level", "define D with"],
    ["style", ["style S with", "  color = 1", "end"], "style must be at the top level", "style S with"],
    ["layout", ["layout L with", "end"], "layout must be at the top level", "layout L with"],
    ["screen", ["screen Sc with", "end"], "screen must be at the top level", "screen Sc with"],
    ["component", ["component C() with", "end"], "component must be at the top level", "component C() with"],
    ["animation", ["animation A with", "end"], "animation must be at the top level", "animation A with"],
    ["theme", ["theme T with", "end"], "theme must be at the top level", "theme T with"],
    ["morph", ["morph M with", "end"], "morph must be at the top level", "morph M with"],
    ["function", ["function f()", "  return 1", "end"], "function declaration must be at the top level", "function f()"],
    ["type", ["type T = number"], "type declaration must be at the top level", "type T = number"],
    ["external", ["external f(x)"], "external declaration must be at the top level", "external f(x)"],
  ];
  const indent = (body: string[], by: string) => body.map((l) => by + l);

  it.each(cases)("refuses a %s inside a scene", (_, body, message, text) => {
    expect(
      placementErrors(lines("", "scene start", ...indent(body, "  "), "  Hi.", "end")),
    ).toEqual([{ message, text }]);
  });

  it.each(cases)("refuses a %s inside a branch", (_, body, message, text) => {
    expect(
      placementErrors(
        lines("", "scene start", "  -> b", "  branch b", ...indent(body, "    "), "    Hi.", "  end", "end"),
      ),
    ).toEqual([{ message, text }]);
  });

  it("refuses a store at any depth of a scene's body", () => {
    expect(
      placementErrors(
        lines(
          "",
          "scene start",
          "  if true then",
          "    store a = 1",
          "  end",
          "  & if true then store b = 1 end",
          "  choose",
          "    * Go",
          "      store c = 1",
          "  end",
          "end",
        ),
      ),
    ).toEqual([
      { message: STORE, text: "store a = 1" },
      { message: STORE, text: "store b = 1" },
      { message: STORE, text: "store c = 1" },
    ]);
  });

  it("refuses a function Luau reads after a scene's local on its line, past a block comment", () => {
    expect(
      placementErrors(
        lines("", "scene start", "  local x = 1 --[[c]] function f() return x end", "  Value {x}.", "end"),
      ),
    ).toEqual([
      {
        message: "function declaration must be at the top level",
        text: "function f() return x end",
      },
    ]);
  });

  it("refuses a function written with a scope inside a scene, and a marked store", () => {
    expect(
      placementErrors(
        lines("", "scene start", "  store function g() end", "  & store x = 1", "end"),
      ),
    ).toEqual([
      { message: "function declaration must be at the top level", text: "store function g() end" },
      { message: STORE, text: "store x = 1" },
    ]);
  });
});

describe("the placements that stay allowed", () => {
  it("compiles an assignment to a store, a local in a scene and in a choice's body, and a const or define in a function", () => {
    expect(
      placementErrors(
        lines(
          "store hp = 10",
          "function heal()",
          "  const MAX = 10",
          "  define Potion with",
          "    heal = 3",
          "  end",
          "  local n = 1",
          "  hp = math.min(hp + n, MAX)",
          "end",
          "",
          "scene start",
          "  local greeting = \"Hello\"",
          "  & hp = hp - 1",
          "  local function twice(x) return x * 2 end",
          "  choose",
          "    * Go",
          "      local picked = 1",
          "      {greeting} {picked}",
          "  end",
          "  branch b",
          "    local inner = 1",
          "    & hp = inner",
          "  end",
          "end",
          "choose",
          "  * Top",
          "    local chosen = 1",
          "    {chosen}",
          "end",
        ),
      ),
    ).toEqual([]);
  });

  it.each([
    ["an if", "if true then"],
    ["a do block", "do"],
    ["a for loop", "for i = 1, 1 do"],
  ])("compiles a local in the body of a choice written in %s inside a top-level choose", (_, opener) => {
    expect(
      placementErrors(
        lines("choose", `  ${opener}`, "    * Go", "      local x = 1", "      Value {x}.", "  end", "end"),
      ),
    ).toEqual([]);
  });

  it("compiles a local inside a top-level type function's body", () => {
    expect(
      placementErrors(
        lines("type function Identity(t)", "  local same = t", "  return same", "end", "Hello."),
      ),
    ).toEqual([]);
  });

  it("compiles an anonymous function written inside a scene", () => {
    expect(
      placementErrors(
        lines("", "scene start", "  local f = function() return 1 end", "  {f()}", "end"),
      ),
    ).toEqual([]);
  });
});
