// A local function, a define's method or a closure reads and writes the
// local in scope where it is written, as Luau's upvalue does (I-1374): the
// newest `local` of the name declared above it in the scope of the scene or
// branch it is written in, each of which holds its own. Never a later
// `local` of the name in that scope, another scene's local, a running block's
// local or a local declared below it, where it reads the global, or the
// builtin of a stdlib name. A function or a define written at the top level
// has no local in scope, as a `local` at the top level is a compile error,
// and reads the global. A closure written after a `local` that shadows a
// store, a `const` or a top-level function of its name reads the local, and
// one written before it reads what the name names there (I-1365); a
// top-level `local` beside a `store` of its name is a compile error (#1177).

import { describe, expect, test } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { compileScript, errorsOf, programCompiler, programSession, storyBeats } from "../program/programHarness";
import { programListing } from "../programListing";

const LOCAL_PLACEMENT =
  "local declaration must be inside a scene, branch or function; use store or const at the top level";

const quiet = <T>(run: () => T): T => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

const shown = (root: ProgramRoot) => {
  const { beats, errors } = storyBeats(new ProgramStory(root));
  return { texts: beats.map((b) => b.text.trim()), errors };
};

// The root of a script that compiles with no error, so a case never runs
// what a compile reported.
const rootOf = (lines: string[]) =>
  quiet(() => {
    const { program } = compileScript([...lines, ""].join("\n"));
    expect(errorsOf(program)).toEqual([]);
    return program.chunks!;
  });

const run = (lines: string[]) => quiet(() => shown(rootOf(lines)));

const got = (...texts: string[]) => ({ texts, errors: [] });

// The lines of scene `start`, where the story starts.
const inScene = (lines: string[]) => ["scene start", ...lines.map((line) => `  ${line}`), "end"];

describe("a function written at the top level", () => {
  test("reads the global, not a scene's local of the name", () => {
    expect(
      run(["function g()", "  return a", "end", "scene start", "  local a = 5", "  Got {tostring(g())}.", "end"]),
    ).toEqual(got("Got nil."));
  });

  test("reads the global, not the variable of a loop that is running", () => {
    expect(
      run(["function g()", "  return i", "end", ...inScene(["for i = 1, 1 do", "  Got {tostring(g())}.", "end"])]),
    ).toEqual(got("Got nil."));
  });

  test("reads the global, not the local of an if that is running", () => {
    expect(
      run([
        "function g()",
        "  return a",
        "end",
        ...inScene(["if true then", "  local a = 5", "  Got {tostring(g())}.", "end"]),
      ]),
    ).toEqual(got("Got nil."));
  });

  test("reads the builtin, not a scene's local of a stdlib name", () => {
    expect(
      run([
        "function g()",
        "  return type(print)",
        "end",
        "scene start",
        "  local print = 3",
        "  Got {g()}.",
        "end",
      ]),
    ).toEqual(got("Got function."));
  });
});

describe("a local function written in a scene", () => {
  test("keeps the local it is written after when a later local of the name is declared", () => {
    expect(
      run(
        inScene([
          "local a = 1",
          "local c = function() return a end",
          "local function g()",
          "  return a",
          "end",
          "Before {g()} {c()}.",
          "local a = 2",
          "After {g()} {c()} {a}.",
        ]),
      ),
    ).toEqual(got("Before 1 1.", "After 1 1 2."));
  });

  test("writes the local it is written after, in the cell a closure over it shares", () => {
    expect(
      run(
        inScene([
          "local a = 1",
          "local c = function() return a end",
          "local function set(v)",
          "  a = v",
          "end",
          "local a = 2",
          "& set(5)",
          "Got {c()} {a}.",
        ]),
      ),
    ).toEqual(got("Got 5 2."));
  });

  // The converter reads a line's statements as one unit, so it binds the
  // function's read to the local written before it on the line.
  test("reads a local declared on its line after a comment", () => {
    expect(
      run(inScene(["local a = 1 --[[c]] local function g() return a end", "Got {tostring(g())}."])),
    ).toEqual(got("Got 1."));
  });

  test("reads the global for a local declared below it", () => {
    expect(
      run(inScene(["local function g()", "  return a", "end", "local a = 1", "Got {tostring(g())}."])),
    ).toEqual(got("Got nil."));
  });

  test("reads its scene's local, not another scene's local of the name", () => {
    expect(
      run([
        "scene start",
        "  local a = 1",
        "  local function g()",
        "    return a",
        "  end",
        "  -> T(g)",
        "end",
        "scene T(h)",
        "  local a = 5",
        "  Got {h()} {a}.",
        "end",
      ]),
    ).toEqual(got("Got 1 5."));
  });

  test("reads the scene's local, not the local of an if that shadows it", () => {
    expect(
      run(inScene(["local a = 1", "local function g()", "  return a", "end", "if true then", "  local a = 5", "  Got {g()} {a}.", "end"])),
    ).toEqual(got("Got 1 5."));
  });

  test("reads the builtin for a stdlib-named local declared below it", () => {
    expect(
      run(inScene(["local function g()", "  return type(print)", "end", "local print = 5", "Got {g()}."])),
    ).toEqual(got("Got function."));
  });

  test.each([
    [
      "scene",
      ["scene start", "  -> S(5)", "end", "scene S(x)", "  local function g()", "    return x", "  end", "  local x = 7", "  Got {g()} {x}.", "end"],
    ],
    [
      "branch",
      ["scene start", "  -> B(5)", "  branch B(x)", "    local function g()", "      return x", "    end", "    local x = 7", "    Got {g()} {x}.", "  end", "end"],
    ],
  ])("written in a %s, keeps its parameter when a later local of the name is declared", (_, lines) => {
    expect(run(lines)).toEqual(got("Got 5 7."));
  });

  test("keeps the scene's local where a choice's body declares the name", () => {
    const story = new ProgramStory(
      rootOf(
        inScene([
          "local x = 1",
          "local function g()",
          "  return x",
          "end",
          "choose",
          "  + Go",
          "    local x = 3",
          "    Got {g()} {x}.",
          "end",
        ]),
      ),
    );
    quiet(() => storyBeats(story));
    story.ChooseChoiceIndex(0);
    const { beats, errors } = quiet(() => storyBeats(story));
    expect({ texts: beats.map((b) => b.text.trim()), errors }).toEqual(got("Go", "Got 1 3."));
  });

  // Each scene binds its locals in a scope of its own, so a scene of another
  // script that declares the name binds its own (I-1455).
  test("keeps its scene's local where a scene of another script declares the name", () => {
    const { program } = quiet(() =>
      programCompiler({
        "inmemory:///main.sd": ["scene start", "  local x = 1", "  local function g()", "    return x", "  end", "  -> S(g)", "end", ""].join("\n"),
        "inmemory:///other.sd": ["scene S(g)", "  local x = 5", "  Got {g()} {x}.", "end", ""].join("\n"),
      }).compile(),
    );
    expect(errorsOf(program)).toEqual([]);
    expect(quiet(() => shown(program.chunks!))).toEqual(got("Got 1 5."));
  });

  test("reads the scene's parameter", () => {
    expect(
      run(["scene start", "  -> S(5)", "end", "scene S(x)", "  local function g()", "    return x", "  end", "  Got {tostring(g())}.", "end"]),
    ).toEqual(got("Got 5."));
  });

  test("reads the scene's local declared above it, not the store of its name", () => {
    expect(
      run(["store a = 1", ...inScene(["local a = 5", "local function g()", "  return a", "end", "Got {g()}."])]),
    ).toEqual(got("Got 5."));
  });
});

describe("a define's method written in a scene's local function", () => {
  // The function binds a local of the scene only its define's methods read,
  // as the scan of its syntax node finds them (I-1373), at the declaration
  // in scope where the function is written.
  test("reads the scene's local the function is written after", () => {
    expect(
      run(
        inScene([
          "local x = 3",
          "local function install()",
          "  define thing with",
          "    function get()",
          "      return x",
          "    end",
          "  end",
          "end",
          "local x = 4",
          "& install()",
          "Got {tostring(thing.get())} {x}.",
        ]),
      ),
    ).toEqual(got("Got 3 4."));
  });
});

describe("a define's method written at the top level", () => {
  test("reads the global, not a scene's local of the name", () => {
    expect(
      run([
        "define thing with",
        "  function get()",
        "    return a",
        "  end",
        "end",
        ...inScene(["local a = 1", "Got {tostring(thing.get())}."]),
      ]),
    ).toEqual(got("Got nil."));
  });
});

describe("a closure written in the root frame", () => {
  test("reads the store where another scene declared a local of the name before it was built", () => {
    expect(
      run([
        "store a = 1",
        "scene start",
        "  local a = 5",
        "  -> T",
        "end",
        "scene T",
        "  local f = function() return a end",
        "  Got {f()} {a}.",
        "end",
      ]),
    ).toEqual(got("Got 1 1."));
  });

  test("reads the global, not a local another scene left in the scope", () => {
    expect(
      run([
        "scene start",
        "  local a = 5",
        "  -> T",
        "end",
        "scene T",
        "  local f = function() return a end",
        "  Got {tostring(f())}.",
        "end",
      ]),
    ).toEqual(got("Got nil."));
  });

  test("reads a local of the choose block's preamble from a choice's body", () => {
    const story = new ProgramStory(
      rootOf([
        "scene start",
        "  choose",
        "    local x = 3",
        "    + Go",
        "      local f = function() return x end",
        "      Got {tostring(f())} {x}.",
        "  end",
        "end",
      ]),
    );
    quiet(() => storyBeats(story));
    story.ChooseChoiceIndex(0);
    const { beats, errors } = quiet(() => storyBeats(story));
    expect({ texts: beats.map((b) => b.text.trim()), errors }).toEqual(got("Go", "Got 3 3."));
  });

  // The converter reads a line's statements as one unit, so it binds the
  // closure's read and write to the local written before it on the line.
  test("reads a local declared on its `&` line after a `;`", () => {
    expect(
      run(inScene(["& local a = 1; local g = function() return a end", "Got {tostring(g())}."])),
    ).toEqual(got("Got 1."));
  });

  test("writes a local declared on its `&` line", () => {
    expect(run(inScene(["& local a = 1; local g = function() a = 5 end", "& g()", "Got {a}."]))).toEqual(
      got("Got 5."),
    );
  });

  // A closure keeps the cell of a local its entry binds (a name a store, a
  // const, a top-level function or a stdlib entry would answer), as it does
  // one it captures, so a closure built before its scene runs again keeps
  // the local it was built over.
  test.each([
    ["a store", "store a = 0"],
    ["a const", "const a = 0"],
    ["a top-level function", "function a() return 0 end"],
    ["nothing", "store other = 0"],
  ])("keeps the scene's local over %s of its name across the scene's next run", (_, decl) => {
    expect(
      run([
        decl,
        "store fs = {}",
        "scene start",
        "  -> S(1)",
        "end",
        "scene S(v)",
        "  local a = v",
        "  & fs[v] = function() return a end",
        "  if v == 1 then",
        "    -> S(2)",
        "  end",
        "  Got {fs[1]()} {fs[2]()} {a}.",
        "end",
      ]),
    ).toEqual(got("Got 1 2 2."));
  });

  // The closure keeps the cell it captured, which a save taken as its call
  // enters holds: taking one does not change what the game shows.
  test("keeps the cell it kept across a save taken as its call enters", () => {
    const story = new ProgramStory(
      rootOf([
        "store a = 0",
        "store fs = {}",
        "scene start",
        "  -> S(1)",
        "end",
        "scene S(v)",
        "  local a = v",
        "  & fs[v] = function() return a end",
        "  if v == 1 then",
        "    -> S(2)",
        "  end",
        "  Ready.",
        "  local result = fs[1]()",
        "  Got {result} {fs[2]()}.",
        "end",
      ]),
    );
    story.onError = () => {};
    story.keepBeatImages = true;
    expect(quiet(() => story.Continue())?.trim()).toBe("Ready.");
    const frames = () => (story as any).state.callStack.elements.length as number;
    for (let step = 0; frames() < 2 && step < 10000; step += 1) {
      quiet(() => story.ContinueAsync());
    }
    expect(frames()).toBe(2);
    quiet(() => story.toSave());
    expect(quiet(() => story.Continue())?.trim()).toBe("Got 1 2.");
  });

  test("keeps a scene's stdlib-named local across the scene's next run", () => {
    expect(
      run([
        "store fs = {}",
        "scene start",
        "  -> S(1)",
        "end",
        "scene S(v)",
        "  local print = v",
        "  & fs[v] = function() return print end",
        "  if v == 1 then",
        "    -> S(2)",
        "  end",
        "  Got {fs[1]()} {fs[2]()}.",
        "end",
      ]),
    ).toEqual(got("Got 1 2."));
  });

  // A later statement of a loop's body reads the loop's variable as a
  // global; it is the loop's local, whatever the root frame's own scope
  // declares of its name.
  test.each([
    ["a numeric loop's variable over a redeclared local of the scene", ["local a = 1", "for a = 2, 2 do"], ["local a = 3"], []],
    ["a generic loop's variable over a redeclared local of the scene", ["local a = 1", "for _, a in {2} do"], ["local a = 3"], []],
    ["a numeric loop's variable where only a scene below declares the name", ["for a = 2, 2 do"], [], ["scene T", "  local a = 9", "end"]],
  ])("reads %s", (_, header, after, below) => {
    expect(
      run([...inScene([...header, "  local f = function() return a end", "  Got {f()}.", "end", ...after]), ...below]),
    ).toEqual(got("Got 2."));
  });

  test.each([
    ["numeric", "for print = 2, 2 do"],
    ["generic", "for _, print in {2} do"],
  ])("reads a %s loop's stdlib-named variable", (_, header) => {
    expect(
      run(inScene([header, "  local f = function() return print end", "  Got {tostring(f())}.", "end"])),
    ).toEqual(got("Got 2."));
  });

  // The block's local is declared on a statement before the closure's, which
  // the converter reads apart from it (I-1468).
  test("reads a stdlib-named local an if block declares above it", () => {
    expect(
      run(inScene(["if true then", "  local print = 2", "  local f = function() return print end", "  Got {tostring(f())}.", "end"])),
    ).toEqual(got("Got 2."));
  });

  // Each arm of an `if` is a scope of its own, so another arm's local of a
  // stdlib name leaves the builtin.
  test.each([
    ["an elseif", ["if false then", "  local print = 2", "elseif true then", "  local f = function() return type(print) end", "  Got {f()}.", "end"]],
    ["an else", ["if false then", "  local print = 2", "else", "  local f = function() return type(print) end", "  Got {f()}.", "end"]],
    ["the first arm", ["if true then", "  local f = function() return type(print) end", "  Got {f()}.", "else", "  local print = 2", "end"]],
  ])("reads the builtin for a stdlib name another arm declares, in %s", (_, lines) => {
    expect(run(inScene(lines))).toEqual(got("Got function."));
  });

  // An `&` line's loop is a block too, and the closure after its `end` on
  // the same line reads the scene's local in scope again.
  test.each([
    ["numeric", "for a = 2, 2 do"],
    ["generic", "for _, a in {2} do"],
  ])("reads an `&` line's %s loop's variable, and the scene's local after the loop", (_, header) => {
    expect(
      run([
        "store fs = {}",
        ...inScene([
          "local a = 1",
          `& ${header} fs[1] = function() return a end end; fs[2] = function() return a end`,
          "local a = 3",
          "Got {fs[1]()} {fs[2]()}.",
        ]),
      ]),
    ).toEqual(got("Got 2 1."));
  });

  // A closure written inside a block of a scene binds its names by name, as
  // before the index: it reads the block's own local or loop variable,
  // whatever the root frame's own scope declares of the name.
  test.each([
    ["an `if`", ["if true then", "  local a = 2", "  & f = function() return a end", "end"]],
    ["an `elseif`", ["if false then", "elseif true then", "  local a = 2", "  & f = function() return a end", "end"]],
    ["an `else`", ["if false then", "else", "  local a = 2", "  & f = function() return a end", "end"]],
    ["a `do` block", ["do", "  local a = 2", "  & f = function() return a end", "end"]],
    ["a numeric `for` loop", ["for a = 2, 2 do", "  & f = function() return a end", "end"]],
    ["a generic `for` loop", ["for _, a in {2} do", "  & f = function() return a end", "end"]],
    ["a `while` loop", ["while true do", "  local a = 2", "  & f = function() return a end", "  break", "end"]],
    ["a `repeat` loop", ["repeat", "  local a = 2", "  & f = function() return a end", "until true"]],
    ["an `&` line's `for` loop", ["& for a = 2, 2 do f = function() return a end end"]],
    ["an `&` line's `while` loop", ["& while true do local a = 2 f = function() return a end break end"]],
  ])("written inside %s, reads the block's local by name", (_, block) => {
    expect(
      run(["store f = nil", ...inScene(["local a = 1", ...block, "local a = 3", "Got {f()}."])]),
    ).toEqual(got("Got 2."));
  });

  // After the block's `end` on the same line, the closure reads the global
  // again, though scene T holds a binding of the name as S runs.
  test("written after a block's end on the same line, reads the global", () => {
    expect(
      run([
        "store f = nil",
        "scene start",
        "  local a = 9",
        "  -> S",
        "end",
        "scene S",
        "  & if true then end f = function() return a end",
        "  Got {tostring(f())}.",
        "end",
      ]),
    ).toEqual(got("Got nil."));
  });

  // What binds no name inside a block leaves the closure reading the global,
  // since scene T's local is bound in T's scope, which S's frame does not
  // hold: a `for` loop variable's type annotation, and a local of another
  // arm of an `if` or of another choice (I-1468).
  test.each([
    ["a numeric loop variable's type annotation", ["for i: typeof(a) = 2, 2 do", "  & f = function() return a end", "end"]],
    ["a generic loop variable's type annotation", ["for _, i: typeof(a) in {2} do", "  & f = function() return a end", "end"]],
    ["a local of the `if` arm before the `else`", ["if false then", "  local a = 2", "else", "  & f = function() return a end", "end"]],
    ["a local of the `if` arm before the `elseif`", ["if false then", "  local a = 2", "elseif true then", "  & f = function() return a end", "end"]],
    ["a local of an `&` line's `if` arm before the `else`", ["& if false then local a = 2 else f = function() return a end end"]],
  ])("reads the global past %s (Luau: Got nil., I-1468)", (_, body) => {
    expect(
      run([
        "store f = nil",
        "scene start",
        "  local a = 9",
        "  -> S",
        "end",
        "scene S",
        ...body.map((line) => `  ${line}`),
        "  Got {tostring(f())}.",
        "end",
      ]),
    ).toEqual(got("Got nil."));
  });

  // A loop's condition reads the global too, so the loop never runs and
  // builds no closure.
  test.each([
    ["a narrative `while` loop's condition", ["while a == 9 do", "  & f = function() return a end", "  break", "end"]],
    ["an `&` line's `while` loop's condition", ["& while a == 9 do f = function() return a end break end"]],
  ])("reads the global in %s", (_, body) => {
    expect(
      run([
        "store f = nil",
        "scene start",
        "  local a = 9",
        "  -> S",
        "end",
        "scene S",
        ...body.map((line) => `  ${line}`),
        "  Got {tostring(f)}.",
        "end",
      ]),
    ).toEqual(got("Got nil."));
  });

  test("reads the global past a local of another choice of a `choose` in an `if` (Luau: Got nil., I-1468)", () => {
    const story = new ProgramStory(
      rootOf([
        "store f = nil",
        "scene start",
        "  local a = 9",
        "  -> S",
        "end",
        "scene S",
        "  if true then",
        "    choose",
        "      + One",
        "        local a = 2",
        "      + Two",
        "        & f = function() return a end",
        "    end",
        "  end",
        "  Got {tostring(f())}.",
        "end",
      ]),
    );
    quiet(() => storyBeats(story));
    story.ChooseChoiceIndex(1);
    const { beats, errors } = quiet(() => storyBeats(story));
    expect({ texts: beats.map((b) => b.text.trim()), errors }).toEqual(got("Two", "Got nil."));
  });

  // A choice's body declares in the root frame's own scope too, whatever
  // another scene declares there.
  test("reads a local of the choice body it is written in, though another scene declares the name", () => {
    const story = new ProgramStory(
      rootOf([
        "scene Other",
        "  local x = 9",
        "end",
        "scene start",
        "  choose",
        "    + Go",
        "      local x = 3",
        "      local f = function() return x end",
        "      Got {tostring(f())}.",
        "  end",
        "end",
      ]),
    );
    quiet(() => storyBeats(story));
    story.ChooseChoiceIndex(0);
    const { beats, errors } = quiet(() => storyBeats(story));
    expect({ texts: beats.map((b) => b.text.trim()), errors }).toEqual(got("Go", "Got 3."));
  });

  test("reads a local of the choice body it is written in", () => {
    const story = new ProgramStory(
      rootOf([
        "scene start",
        "  choose",
        "    + Go",
        "      local x = 3",
        "      local f = function() return x end",
        "      Got {tostring(f())}.",
        "  end",
        "end",
      ]),
    );
    quiet(() => storyBeats(story));
    story.ChooseChoiceIndex(0);
    const { beats, errors } = quiet(() => storyBeats(story));
    expect({ texts: beats.map((b) => b.text.trim()), errors }).toEqual(got("Go", "Got 3."));
  });

  test("reads the parameter of the scene it is written in", () => {
    expect(
      run(["scene start", "  -> S(5)", "end", "scene S(x)", "  local f = function() return x end", "  Got {tostring(f())}.", "end"]),
    ).toEqual(got("Got 5."));
  });

  test("reads the parameter of the branch it is written in", () => {
    expect(
      run([
        "scene start",
        "  -> B(7)",
        "  branch B(y)",
        "    local f = function() return y end",
        "    Got {tostring(f())}.",
        "  end",
        "end",
      ]),
    ).toEqual(got("Got 7."));
  });

  test("reads a stdlib-named local declared above it", () => {
    expect(
      run(inScene(["local print = 5", "local f = function() return print end", "Got {f()}."])),
    ).toEqual(got("Got 5."));
  });

  test("reads the builtin for a stdlib-named local declared below it", () => {
    expect(
      run(inScene(["local f = function() return type(print) end", "local print = 5", "Got {f()}."])),
    ).toEqual(got("Got function."));
  });

  // A scene's local, and not a top-level one, can share a store's or a
  // const's name (#1177).
  test.each([
    ["a store", "store a = 1"],
    ["a const", "const a = 1"],
  ])("reads a scene's local that shadows %s of its name", (_, decl) => {
    expect(
      run([decl, "scene start", "  local a = 2", "  local f = function()", "    return a", "  end", "  Got {tostring(f())}.", "end"]),
    ).toEqual(got("Got 2."));
  });

  test("written before the scene's local, reads the store", () => {
    expect(
      run(["store a = 1", "scene start", "  local f = function()", "    return a", "  end", "  local a = 2", "  Got {tostring(f())}.", "end"]),
    ).toEqual(got("Got 1."));
  });

  test("reads a scene's local that shadows a top-level function of its name", () => {
    expect(
      run(["function a()", "  return 1", "end", ...inScene(["local a = 2", "local f = function()", "  return a", "end", "Got {tostring(f())}."])]),
    ).toEqual(got("Got 2."));
  });

  test("written before that local, reads the function", () => {
    expect(
      run(["function a()", "  return 1", "end", ...inScene(["local f = function()", "  return a()", "end", "local a = 2", "Got {tostring(f())}."])]),
    ).toEqual(got("Got 1."));
  });

  test("of a local function, reads what the function reads", () => {
    expect(
      run([
        "function a()",
        "  return 1",
        "end",
        ...inScene([
          "local a = 2",
          "local function g()",
          "  return function() return a end",
          "end",
          "Got {tostring(g()())}.",
        ]),
      ]),
    ).toEqual(got("Got 2."));
  });
});

describe("a top-level local beside a store of its name", () => {
  test("is a compile error", () => {
    const { program } = quiet(() => compileScript(["store a = 1", "local a = 2", "scene start", "  Hi.", "end", ""].join("\n")));
    expect(errorsOf(program).map(([, message]) => message)).toEqual([LOCAL_PLACEMENT]);
  });
});

describe("a save taken after a local function wrote a local redeclared after it", () => {
  test("loads into a fresh game, where the function and a closure still share the local", () => {
    const lines = inScene([
      "local a = 1",
      "local f = function() return a end",
      "local function inc()",
      "  a = a + 1",
      "  return a",
      "end",
      "local a = 10",
      "First {inc()} {f()} {a}.",
      "Second {inc()} {f()} {a}.",
    ]);
    const story = new ProgramStory(rootOf(lines));
    story.onError = () => {};
    expect(story.Continue()?.trim()).toBe("First 2 2 10.");
    const save = story.toSave();
    const loaded = new ProgramStory(rootOf(lines));
    loaded.loadSave(save);
    const { beats, errors } = storyBeats(loaded);
    expect({ texts: beats.map((b) => b.text.trim()), errors }).toEqual(got("Second 3 3 10."));
  });
});

describe("an incremental compile", () => {
  // Each edit leaves the reader's own lines as they were, so the chunks that
  // hold them are carried unless a read of the locals above them is asked
  // again.
  const base = [
    "store b = 0",
    "scene start",
    "  local a = 1",
    "  local function g()",
    "    return a",
    "  end",
    "  local f = function() return a end",
    "  local a = 3",
    "  Hi.",
    "  Got {tostring(g())} {tostring(f())} {a}.",
    "end",
    "",
  ].join("\n");

  const expectCold = (edits: [string, string][], expected: string[]) => {
    const session = programSession(base);
    let root = session.root;
    for (const [before, after] of edits) {
      root = session.edit(before, after);
    }
    const cold = run([session.text]);
    expect(quiet(() => shown(root))).toEqual(cold);
    expect(programListing(root)).toEqual(programListing(rootOf([session.text])));
    expect(cold.texts).toEqual(expected);
  };

  test("shows what a cold compile shows with a local of the name inserted above the readers", () => {
    expectCold([["  local a = 1", "  local a = 1\n  local a = 2"]], ["Hi.", "Got 2 2 3."]);
  });

  test("shows what a cold compile shows with the local the readers read removed", () => {
    expectCold([["  local a = 1\n", ""]], ["Hi.", "Got nil nil 3."]);
  });

  test("shows what a cold compile shows with the local the readers read moved below them", () => {
    expectCold(
      [["  local a = 1\n", ""], ["  local a = 3", "  local a = 1\n  local a = 3"]],
      ["Hi.", "Got nil nil 3."],
    );
  });

  test("shows what a cold compile shows with the readers' local declared once, then twice", () => {
    expectCold(
      [["  local a = 3\n", ""], ["  Hi.", "  local a = 9"]],
      ["Got 1 1 9."],
    );
  });

  test("shows what a cold compile shows with a parameter of the name added to the reader's scene", () => {
    const session = programSession(
      ["scene start", "  -> S", "end", "scene S", "  local f = function() return a end", "  Got {tostring(f())}.", "end", ""].join("\n"),
    );
    session.edit("-> S", "-> S(9)");
    const root = session.edit("scene S", "scene S(a)");
    const cold = run([session.text]);
    expect(quiet(() => shown(root))).toEqual(cold);
    expect(programListing(root)).toEqual(programListing(rootOf([session.text])));
    expect(cold.texts).toEqual(["Got 9."]);
  });

  test("shows what a cold compile shows with a later local of the name added, then removed", () => {
    expectCold(
      [["  Hi.", "  local a = 9"], ["  local a = 9", "  Hi."]],
      ["Hi.", "Got 1 1 3."],
    );
  });
});
