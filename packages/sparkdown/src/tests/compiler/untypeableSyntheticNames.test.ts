// Every name the compiler generates holds a `$`, which the identifier rule
// (`LUAU_IDENTIFIER`, `[a-zA-Z_][a-zA-Z0-9_]*`) excludes, so no name an
// author writes can equal one (#1729). An author's name of any shape is an
// ordinary name: it is neither reported nor renamed.
import { describe, expect, it } from "vitest";
import { File } from "../../compiler/types/File";
import { testCompiler, testStory } from "../engineUnderTest";
import { programListing, rootOf } from "../programListing";

const MAIN_URI = "file://proj/main.sd";

const file = (text: string): File => ({
  uri: MAIN_URI,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

function quiet<T>(fn: () => T): T {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

function compileWith(text: string): { program: any; compiler: any } {
  return quiet(() => {
    const compiler = testCompiler();
    compiler.configure({ files: [file(text)] });
    return { program: compiler.compile({ textDocument: { uri: MAIN_URI } }).program, compiler };
  });
}

const compile = (text: string): any => compileWith(text).program;

function errors(program: any): string[] {
  return Object.values(program.diagnostics ?? {}).flatMap((list: any) =>
    list
      .filter((d: any) => d.severity === 1)
      .map((d: any) => (typeof d.message === "string" ? d.message : (d.message?.value ?? ""))),
  );
}

// The names the stdlib, the runtime and closures define for themselves,
// which the program calls or reads by name but no lowering generates.
const RUNTIME_NAMES = new Set([
  "__new",
  "__unjoined",
  "__closure_fn",
  "__closure_upvals",
  "__closure_user_arity",
  "__index",
  "__def",
  "__adjust_iter",
  // The local a vararg function binds its `...` to. It is not among the
  // families #1729 names, and its name reaches saves and diagnostics, so
  // it keeps its name here.
  "__varargs__",
  // The builtins script's own name, which its uri holds.
  "__builtins__",
]);

// Each `__`-prefixed name the program's symbol and string tables, its
// listing and its layouts hold, with the `$` and the characters after it
// that a generated name carries.
function underscoredNames(program: any): string[] {
  const root = rootOf(program.chunks);
  const text = [
    ...root.table.symbols,
    ...root.table.strings,
    ...programListing(root),
    JSON.stringify(program.sparkle ?? {}),
  ].join("\n");
  return [...new Set(text.match(/__[A-Za-z][A-Za-z0-9_$]*/g) ?? [])].sort();
}

const EVERY_FAMILY = [
  "store f = function() return 1 end",
  "store obj = { n = 0, add = function(self, k) self.n += k return self end }",
  "store t = { p = { q = 1 } }",
  "store u = { a = 0, b = 0 }",
  "store total = 0",
  "",
  "define hero as character with",
  '  name = "Bob"',
  "  function greet()",
  "    return 1",
  "  end",
  "end",
  "",
  "function outer()",
  'function inner(...) return "first" end',
  "local a = inner()",
  "function inner(a, b, ...) return 2 end",
  "return inner()",
  "end",
  "",
  "function loops()",
  "  for i = 1, 2 do total += i end",
  "  for k, v in pairs(u) do total += v end",
  "  while total < 10 do total += 1 end",
  "  repeat total += 1 until total > 12",
  "end",
  "",
  "layout hud with",
  '  text "{total}"',
  "end",
  "",
  "scene start",
  "  & obj:add(1)",
  "  & t.p.q += 1",
  "  & u.a, u.b = 1, 2",
  "  & for i = 1, 2 do total += i end",
  "  & for k, v in pairs(u) do total += v end",
  "  & while total < 10 do total += 1 end",
  "  & repeat total += 1 until total > 12",
  "HERO: A glued line ..",
  ".. carried on > and broken.",
  "end",
  "",
].join("\n");

describe("names the compiler generates", () => {
  it("hold a character no identifier can contain", () => {
    const { program, compiler } = compileWith(EVERY_FAMILY);
    expect(errors(program)).toEqual([]);
    // The names the compile numbers by document order: those of a function
    // a statement writes, a `define`'s method, a redefined function, and
    // the temporaries and labels of a method call, a property assignment, a
    // multiple assignment and each kind of loop. The program names none of
    // them (a function by its anonymous symbol, a temporary by the chunk's
    // own name), so they are read from the compile.
    const numbered = [
      ...(compiler._syntheticNamesLastRun as Map<string, string>).values(),
    ];
    const lowered = [...(compiler._syntheticNamesLastRun as Map<string, string>).keys()];
    for (const family of [
      "__anon_fn_",
      "__define_fn_",
      "__mcall_",
      "__pa_base_",
      "__pa_key_",
      "__mt_",
      "__forIdx_",
      "__for_",
      "__forIn_",
      "__while_",
      "__repeat_",
      "inner__redef_",
    ]) {
      expect(
        lowered.some((name) => name.startsWith(family) && name.includes("$")),
        `a name of the ${family} family in ${lowered.join(", ")}`,
      ).toBe(true);
    }
    expect(numbered.filter((name) => !/^__synth\$\d+$/.test(name))).toEqual([]);
    const names = underscoredNames(program);
    // Each family the program keeps a name of: a continuation's group, a
    // binding's evaluator, and a chunk's own name for a temporary.
    for (const family of ["__group$", "__binding$", "__t$"]) {
      expect(
        names.some((name) => name.startsWith(family)),
        `a name of the ${family} family in ${names.join(", ")}`,
      ).toBe(true);
    }
    const typeable = names.filter((name) => !name.includes("$") && !RUNTIME_NAMES.has(name));
    expect(typeable).toEqual([]);
  });

  it("run a loop, a continuation and an anonymous function as written", () => {
    const program = compile(
      [
        "store total = 0",
        "store double = function(n) return n * 2 end",
        "",
        "for i = 1, 3 do total = total + double(i) end",
        "while total < 20 do total = total + 1 end",
        "HERO: The loop counted {total} ..",
        ".. and carried on > to the end.",
        "Done at {total}.",
        "",
      ].join("\n"),
    );
    expect(errors(program)).toEqual([]);
    const story = testStory(program.chunks);
    const text = quiet(() => story.ContinueMaximally());
    expect(story.variablesState.$("total")).toBe(20);
    expect(text).toContain("Done at 20.");
  });

  // A binding's evaluator is defined under its generated name, which its
  // frame shows in a readable form, as a function a statement writes does.
  it("show a binding's evaluator as anonymous in its frame", () => {
    const program = compile(
      ["layout hud with", '  text "{debug.info(1, \'n\')}"', "end", ""].join("\n"),
    );
    expect(errors(program)).toEqual([]);
    const exprId = JSON.stringify(program.sparkle?.layouts?.["hud"]).match(
      /__binding\$\w+/,
    )?.[0];
    expect(exprId).toBeDefined();
    const story = testStory(program.chunks);
    expect(story.HasFunction(exprId!)).toBe(true);
    expect(quiet(() => story.EvaluateFunction(exprId!))).toBe("<anonymous>");
  });

  // The canonical form of an earlier compiler is an ordinary name now.
  it("leave an author's name of the old canonical shape as it is", () => {
    const main = [
      "store f = function() return 1 end",
      "store __synth_0 = 9",
      "store __group_0 = 3",
      "store __binding_0 = 4",
      "function __synth_4()",
      "  return 2",
      "end",
      "",
      "-> __synth_1",
      "",
      "scene __synth_1",
      "  Hello.",
      "  -> __synth_1.__synth_2",
      "",
      "branch __synth_2",
      "  label __synth_3",
      "  Bye.",
      "end",
      "end",
      "",
    ].join("\n");
    const program = compile(main);
    expect(errors(program)).toEqual([]);
    const listing = programListing(program.chunks);
    // The store writes the name as the author wrote it, never a name of
    // the chunk's own.
    expect(listing.filter((line) => line.includes("__synth_0"))).not.toEqual([]);
    expect(listing.filter((line) => line.includes("__t$"))).toEqual([]);
    const story = testStory(program.chunks);
    quiet(() => story.ContinueMaximally());
    expect(story.variablesState.$("__synth_0")).toBe(9);
    expect(story.variablesState.$("__group_0")).toBe(3);
    expect(story.variablesState.$("__binding_0")).toBe(4);
    expect(story.HasFunction("__synth_4")).toBe(true);
    expect(quiet(() => story.EvaluateFunction("__synth_4"))).toBe(2);
    expect(rootOf(program.chunks).table.symbols).toEqual(
      expect.arrayContaining(["__synth_1", "__synth_1.__synth_2", "__synth_1.__synth_2.__synth_3"]),
    );
  });
});
