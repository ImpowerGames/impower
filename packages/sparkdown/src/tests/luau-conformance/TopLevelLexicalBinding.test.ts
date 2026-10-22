// A function, a define's method or a closure reads and writes the top-level
// local in scope where it is written, as Luau's upvalue does (I-1374): the
// newest `local` of the name declared above it in the root frame's own scope,
// which the top level and the bodies of its scenes share. Never a later
// `local` of the name in that scope (a scene's among them), a running block's
// local or a local declared below it, where it reads the global, or the
// builtin of a stdlib name. A closure written after a `local` that shadows a
// store, a `const` or a top-level function of its name reads the local, and
// one written before it reads what the name names there (I-1365); a
// top-level `local` beside a `store` of its name is a compile error (#1177).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { compileScript, errorsOf, programCompiler, programSession, storyBeats } from "../program/programHarness";
import { programListing } from "../programListing";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

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

describe("a function written at the top level", () => {
  test("keeps the local it is written after when a later local of the name is declared", () => {
    expect(
      run([
        "local a = 1",
        "local c = function() return a end",
        "function g()",
        "  return a",
        "end",
        "Before {g()} {c()}.",
        "local a = 2",
        "After {g()} {c()} {a}.",
      ]),
    ).toEqual(got("Before 1 1.", "After 1 1 2."));
  });

  test("writes the local it is written after, in the cell a closure over it shares", () => {
    expect(
      run([
        "local a = 1",
        "local c = function() return a end",
        "function set(v)",
        "  a = v",
        "end",
        "local a = 2",
        "& set(5)",
        "Got {c()} {a}.",
      ]),
    ).toEqual(got("Got 5 2."));
  });

  // The converter reads a line's statements as one unit, so it binds the
  // function's read to the local written before it on the line, which is a
  // declaration of the root frame's own scope.
  test.each([
    ["after a `;`", "& local a = 1; function g() return a end"],
    ["after a comment", "local a = 1 --[[c]] function g() return a end"],
  ])("reads a local declared on its line %s", (_, line) => {
    expect(run([line, "Got {tostring(g())}."])).toEqual(got("Got 1."));
  });

  test("writes a local declared on its line", () => {
    expect(run(["& local a = 1; function g() a = 5 end", "& g()", "Got {a}."])).toEqual(got("Got 5."));
  });

  test("reads the global for a local declared below it", () => {
    expect(run(["function g()", "  return a", "end", "local a = 1", "Got {tostring(g())}."])).toEqual(
      got("Got nil."),
    );
  });

  test("reads the top-level local, not a scene's local of the name", () => {
    expect(
      run(["local a = 1", "function g()", "  return a", "end", "-> S", "scene S", "  local a = 5", "  Got {g()} {a}.", "end"]),
    ).toEqual(got("Got 1 5."));
  });

  test("reads the global, not a scene's local of the name", () => {
    expect(
      run(["function g()", "  return a", "end", "-> S", "scene S", "  local a = 5", "  Got {tostring(g())}.", "end"]),
    ).toEqual(got("Got nil."));
  });

  test("reads the global, not the variable of a loop that is running", () => {
    expect(
      run(["function g()", "  return i", "end", "for i = 1, 1 do", "  Got {tostring(g())}.", "end"]),
    ).toEqual(got("Got nil."));
  });

  test("reads the global, not the local of an if that is running", () => {
    expect(
      run(["function g()", "  return a", "end", "if true then", "  local a = 5", "  Got {tostring(g())}.", "end"]),
    ).toEqual(got("Got nil."));
  });

  test("reads the top-level local, not the local of an if that shadows it", () => {
    expect(
      run(["local a = 1", "function g()", "  return a", "end", "if true then", "  local a = 5", "  Got {g()} {a}.", "end"]),
    ).toEqual(got("Got 1 5."));
  });

  test("reads the builtin for a stdlib-named local declared below it", () => {
    expect(
      run(["function g()", "  return type(print)", "end", "local print = 5", "Got {g()}."]),
    ).toEqual(got("Got function."));
  });

  test("reads the builtin, not a scene's local of a stdlib name", () => {
    expect(
      run([
        "function g()",
        "  return type(print)",
        "end",
        "-> S",
        "scene S",
        "  local print = 3",
        "  Got {g()}.",
        "end",
      ]),
    ).toEqual(got("Got function."));
  });

  // A function statement in a top-level `do` block is a function of the
  // story, built before the block runs, and closes over none of its locals
  // (I-1444).
  test.fails("written in a top-level do block, reads the block's local", () => {
    expect(
      run(["local x = 7", "do", "  local x = 1", "  function g()", "    return x", "  end", "end", "Got {tostring(g())}."]),
    ).toEqual(got("Got 1."));
  });

  test.each([
    ["scene", ["-> S(5)", "scene S(x)", "  function g()", "    return x", "  end", "  local x = 7", "  Got {g()} {x}.", "end"]],
    [
      "branch",
      ["-> S", "scene S", "  -> B(5)", "  branch B(x)", "    function g()", "      return x", "    end", "    local x = 7", "    Got {g()} {x}.", "  end", "end"],
    ],
  ])("written in a %s, keeps its parameter when a later local of the name is declared", (_, lines) => {
    expect(run(lines)).toEqual(got("Got 5 7."));
  });

  test("keeps the top-level local where a choice's body declares the name", () => {
    const story = new ProgramStory(
      rootOf([
        "local x = 1",
        "function g()",
        "  return x",
        "end",
        "-> S",
        "scene S",
        "  choose",
        "    + Go",
        "      local x = 3",
        "      Got {g()} {x}.",
        "  end",
        "end",
      ]),
    );
    quiet(() => storyBeats(story));
    story.ChooseChoiceIndex(0);
    const { beats, errors } = quiet(() => storyBeats(story));
    expect({ texts: beats.map((b) => b.text.trim()), errors }).toEqual(got("Go", "Got 1 3."));
  });

  // A name a script declares once is bound by name in the scope every
  // script's scenes share (I-1455).
  test.fails("keeps the top-level local where a scene of another script declares the name", () => {
    const { program } = quiet(() =>
      programCompiler({
        "inmemory:///main.sd": ["local x = 1", "function g()", "  return x", "end", "-> S", ""].join("\n"),
        "inmemory:///other.sd": ["scene S", "  local x = 5", "  Got {g()} {x}.", "end", ""].join("\n"),
      }).compile(),
    );
    expect(errorsOf(program)).toEqual([]);
    expect(quiet(() => shown(program.chunks!))).toEqual(got("Got 1 5."));
  });

  test("written in a scene, reads the scene's parameter", () => {
    expect(
      run(["-> S(5)", "scene S(x)", "  function g()", "    return x", "  end", "  Got {tostring(g())}.", "end"]),
    ).toEqual(got("Got 5."));
  });

  test("written in a scene, reads the scene's local declared above it", () => {
    expect(
      run([
        "local a = 1",
        "-> S",
        "scene S",
        "  local a = 5",
        "  function g()",
        "    return a",
        "  end",
        "  Got {g()}.",
        "end",
      ]),
    ).toEqual(got("Got 5."));
  });
});

describe("a define's method written in a top-level function", () => {
  // The function binds a top-level local only its define's methods read, as
  // the scan of its syntax node finds them (I-1373), at the declaration in
  // scope where the function is written.
  test("reads the top-level local the function is written after", () => {
    expect(
      run([
        "local x = 3",
        "function install()",
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
    ).toEqual(got("Got 3 4."));
  });
});

describe("a define's method written at the top level", () => {
  test("keeps the local it is written after when a later local of the name is declared", () => {
    expect(
      run([
        "local a = 1",
        "define thing with",
        "  function get()",
        "    return a",
        "  end",
        "end",
        "local a = 2",
        "Got {thing.get()} {a}.",
      ]),
    ).toEqual(got("Got 1 2."));
  });

  test("reads the global for a local declared below it", () => {
    expect(
      run(["define thing with", "  function get()", "    return a", "  end", "end", "local a = 1", "Got {tostring(thing.get())}."]),
    ).toEqual(got("Got nil."));
  });
});

describe("a closure written in the root frame", () => {
  test("keeps the top-level local where a scene declared the name before it was built", () => {
    expect(
      run([
        "local a = 1",
        "-> S",
        "scene S",
        "  local a = 5",
        "  -> T",
        "end",
        "scene T",
        "  local f = function() return a end",
        "  Got {f()} {a}.",
        "end",
      ]),
    ).toEqual(got("Got 1 5."));
  });

  test("reads the global, not a local another scene left in the scope", () => {
    expect(
      run([
        "-> S",
        "scene S",
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
        "-> S",
        "scene S",
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
        "-> S(1)",
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

  // The call binds the kept cell as it enters the closure's frame, in the
  // frame's own state, which a save taken before the entry's code runs
  // holds: taking one does not change what the game shows.
  test("keeps the cell it kept across a save taken as its call enters", () => {
    const story = new ProgramStory(
      rootOf([
        "store a = 0",
        "store fs = {}",
        "-> S(1)",
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
        "-> S(1)",
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
    ["a numeric loop's variable over a redeclared top-level local", "for a = 2, 2 do", ["local a = 1"], ["local a = 3"]],
    ["a generic loop's variable over a redeclared top-level local", "for _, a in {2} do", ["local a = 1"], ["local a = 3"]],
    ["a numeric loop's variable where only a scene below declares the name", "for a = 2, 2 do", [], ["-> T", "scene T", "  local a = 9", "end"]],
  ])("reads %s", (_, header, before, after) => {
    expect(
      run([...before, header, "  local f = function() return a end", "  Got {f()}.", "end", ...after]),
    ).toEqual(got("Got 2."));
  });

  test.each([
    ["numeric", "for print = 2, 2 do"],
    ["generic", "for _, print in {2} do"],
  ])("reads a %s loop's stdlib-named variable", (_, header) => {
    expect(
      run([header, "  local f = function() return print end", "  Got {tostring(f())}.", "end"]),
    ).toEqual(got("Got 2."));
  });

  // A choice's body declares in the root frame's own scope too, whatever
  // another scene declares there.
  test("reads a local of the choice body it is written in, though another scene declares the name", () => {
    const story = new ProgramStory(
      rootOf([
        "-> S",
        "scene Other",
        "  local x = 9",
        "end",
        "scene S",
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
        "-> S",
        "scene S",
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
      run(["-> S(5)", "scene S(x)", "  local f = function() return x end", "  Got {tostring(f())}.", "end"]),
    ).toEqual(got("Got 5."));
  });

  test("reads the parameter of the branch it is written in", () => {
    expect(
      run([
        "-> S",
        "scene S",
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
      run(["local print = 5", "local f = function() return print end", "Got {f()}."]),
    ).toEqual(got("Got 5."));
  });

  test("reads the builtin for a stdlib-named local declared below it", () => {
    expect(
      run(["local f = function() return type(print) end", "local print = 5", "Got {f()}."]),
    ).toEqual(got("Got function."));
  });

  // A scene's local, and not a top-level one, can share a store's or a
  // const's name (#1177).
  test.each([
    ["a store", "store a = 1"],
    ["a const", "const a = 1"],
  ])("reads a scene's local that shadows %s of its name", (_, decl) => {
    expect(
      run([decl, "-> S", "scene S", "  local a = 2", "  local f = function()", "    return a", "  end", "  Got {tostring(f())}.", "end"]),
    ).toEqual(got("Got 2."));
  });

  test("written before the scene's local, reads the store", () => {
    expect(
      run(["store a = 1", "-> S", "scene S", "  local f = function()", "    return a", "  end", "  local a = 2", "  Got {tostring(f())}.", "end"]),
    ).toEqual(got("Got 1."));
  });

  test("reads a top-level local that shadows a top-level function of its name", () => {
    expect(
      run(["function a()", "  return 1", "end", "local a = 2", "local f = function()", "  return a", "end", "Got {tostring(f())}."]),
    ).toEqual(got("Got 2."));
  });

  test("written before that local, reads the function", () => {
    expect(
      run(["function a()", "  return 1", "end", "local f = function()", "  return a()", "end", "local a = 2", "Got {tostring(f())}."]),
    ).toEqual(got("Got 1."));
  });

  test("of a function, reads what the function reads", () => {
    expect(
      run([
        "function a()",
        "  return 1",
        "end",
        "local a = 2",
        "function g()",
        "  return function() return a end",
        "end",
        "Got {tostring(g()())}.",
      ]),
    ).toEqual(got("Got 2."));
  });
});

describe("a top-level local beside a store of its name", () => {
  test("is still a compile error", () => {
    const { program } = quiet(() => compileScript(["store a = 1", "local a = 2", "Hi.", ""].join("\n")));
    expect(errorsOf(program).map(([, message]) => message)).toEqual([
      "Duplicate identifier `a`. A var named `a` already exists on null",
      "Duplicate identifier `a`. A temp named `a` already exists on line 2 of 'main'",
    ]);
  });
});

describe("the entry of a function", () => {
  test("binds a name declared once by name, and one of several by the declaration's slot", () => {
    const listing = programListing(
      rootOf(["local a = 1", "local b = 1", "function g()", "  return a + b", "end", "local b = 2", "Got {g()}."]),
    );
    expect(listing.filter((line) => line.startsWith("BindRoot"))).toEqual([
      "BindRoot a",
      expect.stringMatching(/^BindRoot b\$1\$\S+ flags 1$/),
    ]);
  });

  test("binds nothing for a name no local above it takes", () => {
    const listing = programListing(rootOf(["function g()", "  return a + math.abs(-1)", "end", "local a = 1", "Got {g()}."]));
    expect(listing.filter((line) => line.startsWith("BindRoot"))).toEqual([]);
  });
});

describe("a save written by an engine that bound top-level locals by name", () => {
  // `redeclared-local-value-save-0a06f357b.json` is the save the engine at
  // 0a06f357b wrote of `redeclared-local-value.sd` after `First.`: the scope
  // holds the second `a` and no slot. The function and the closure, which
  // read the second declaration, reach the binding by name, as that engine
  // did.
  test("loads, and a function and a closure read the local it holds", () => {
    const text = readFileSync(join(FIXTURES, "redeclared-local-value.sd"), "utf-8");
    const save = readFileSync(join(FIXTURES, "redeclared-local-value-save-0a06f357b.json"), "utf-8");
    const loaded = new ProgramStory(rootOf([text.trimEnd()]));
    loaded.loadSave(save);
    const { beats, errors } = storyBeats(loaded);
    expect({ texts: beats.map((b) => b.text.trim()), errors }).toEqual(got("Got 2 2."));
  });

  // `redeclared-after-load-save-ae10deabd.json` is the save the engine at
  // ae10deabd wrote of `redeclared-after-load.sd` after `First 1.`: the scope
  // holds the first `a`, which `f` captured, and no slot. The scene's `local a`
  // that runs after the load keeps that binding's cell (`<name>$0`), which the
  // function, written after the first declaration, reads in place of the slot
  // that engine never wrote.
  test("loads, and a later declaration keeps the binding it left for the function", () => {
    const text = readFileSync(join(FIXTURES, "redeclared-after-load.sd"), "utf-8");
    const save = readFileSync(join(FIXTURES, "redeclared-after-load-save-ae10deabd.json"), "utf-8");
    const loaded = new ProgramStory(rootOf([text.trimEnd()]));
    loaded.loadSave(save);
    const { beats, errors } = storyBeats(loaded);
    expect({ texts: beats.map((b) => b.text.trim()), errors }).toEqual(got("Got 1 1 2."));
  });
});

describe("a save taken after a function bound the slot of a declaration", () => {
  test("loads into a fresh game, where the function and a closure still share the local", () => {
    const lines = [
      "local a = 1",
      "local f = function() return a end",
      "function inc()",
      "  a = a + 1",
      "  return a",
      "end",
      "local a = 10",
      "-> S",
      "scene S",
      "  First {inc()} {f()} {a}.",
      "  Second {inc()} {f()} {a}.",
      "end",
    ];
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
  // again (`rootLocal`, `rootDeclaration`).
  const base = [
    "local a = 1",
    "store b = 0",
    "function g()",
    "  return a",
    "end",
    "local f = function() return a end",
    "local a = 3",
    "-> S",
    "scene S",
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
    expectCold([["store b = 0", "store b = 0\nlocal a = 2"]], ["Hi.", "Got 2 2 3."]);
  });

  test("shows what a cold compile shows with the local the readers read removed", () => {
    expectCold([["local a = 1\n", ""]], ["Hi.", "Got nil nil 3."]);
  });

  test("shows what a cold compile shows with the local the readers read moved below them", () => {
    expectCold(
      [["local a = 1\n", ""], ["local a = 3", "local a = 1\nlocal a = 3"]],
      ["Hi.", "Got nil nil 3."],
    );
  });

  test("shows what a cold compile shows with the readers' local declared once, then twice", () => {
    expectCold(
      [["local a = 3\n", ""], ["  Hi.", "  local a = 9"]],
      ["Got 1 1 9."],
    );
  });

  test("shows what a cold compile shows with a parameter of the name added to the reader's scene", () => {
    const session = programSession(
      ["-> S", "scene S", "  local f = function() return a end", "  Got {tostring(f())}.", "end", ""].join("\n"),
    );
    session.edit("-> S", "-> S(9)");
    const root = session.edit("scene S", "scene S(a)");
    const cold = run([session.text]);
    expect(quiet(() => shown(root))).toEqual(cold);
    expect(programListing(root)).toEqual(programListing(rootOf([session.text])));
    expect(cold.texts).toEqual(["Got 9."]);
  });

  test("shows what a cold compile shows with a scene's local of the name removed", () => {
    expectCold(
      [["  Hi.", "  local a = 9"], ["  local a = 9", "  Hi."]],
      ["Hi.", "Got 1 1 3."],
    );
  });
});
