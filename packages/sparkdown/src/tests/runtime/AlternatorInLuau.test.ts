// An alternator Luau code uses as a value (I-1284) or writes as a statement
// (I-1397), inside a function's body or at the top level, runs as a displayed
// one does: it selects its arm with the same counting, keyed to the
// alternator in the script, so every call of a function shares one count; a
// value alternator gives the selected arm's value (nil for an empty arm, or
// for one no `match` arm takes), and a statement alternator runs the selected
// arm's statements and calls. It never reads as nil silently and is never
// dropped. Its count is saved and loaded as a displayed one's, and an edit to
// an arm compiles incrementally as it does cold.

import { describe, expect, test } from "vitest";
import { testStory } from "../engineUnderTest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, describeRoot, errorsOf, programSession, storyRun } from "../program/programHarness";
import { makeRuntimeStoryFromSource, runToEnd } from "./runtimeTestHarness";

const lines = (...parts: string[]) => parts.join("\n") + "\n";

const run = (source: string) => {
  const ctx = makeRuntimeStoryFromSource(source);
  return { output: runToEnd(ctx.story), errors: ctx.errorMessages };
};

/** The values `f()` gives over `n` calls, one displayed line each. */
const calls = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1} {f()}.`);
const valuesOf = (output: string) =>
  output
    .trim()
    .split("\n")
    .map((line) => line.replace(/^\d+ (.*)\.$/, "$1"));

// A function that records what each arm ran, read after the calls.
const TRAIL = ['store trail = ""', "function add(s)", "  trail = trail .. s", "end"];

const isPermutation = (values: string[], of: string[]) => [...values].sort().join() === [...of].sort().join();

// The sequential forms: what five calls give from the arms `a`, `b`, `c`,
// and what a shuffling form's draws must satisfy.
const SEQUENTIAL: [string, (values: string[]) => void][] = [
  ["queue", (v) => expect(v).toEqual(["a", "b", "c", "nil", "nil"])],
  ["cycle", (v) => expect(v).toEqual(["a", "b", "c", "a", "b"])],
  ["chain", (v) => expect(v).toEqual(["a", "b", "c", "c", "c"])],
  [
    "shuffle",
    (v) => {
      expect(isPermutation(v.slice(0, 3), ["a", "b", "c"])).toBe(true);
      expect(v.slice(3).every((x) => ["a", "b", "c"].includes(x))).toBe(true);
    },
  ],
  [
    "shuffle queue",
    (v) => {
      expect(isPermutation(v.slice(0, 3), ["a", "b", "c"])).toBe(true);
      expect(v.slice(3)).toEqual(["nil", "nil"]);
    },
  ],
  [
    "shuffle cycle",
    (v) => {
      expect(isPermutation(v.slice(0, 3), ["a", "b", "c"])).toBe(true);
      expect(v.slice(3).every((x) => ["a", "b", "c"].includes(x))).toBe(true);
    },
  ],
  [
    "shuffle chain",
    (v) => {
      expect(isPermutation(v.slice(0, 2), ["a", "b"])).toBe(true);
      expect(v.slice(2)).toEqual(["c", "c", "c"]);
    },
  ],
];

describe("a sequential alternator used as a value in a function (I-1284)", () => {
  test.each(SEQUENTIAL)("%s, in a local's value, shares one count across calls", (keyword, check) => {
    const { output, errors } = run(lines("function f()", `  local v = ${keyword} | "a" | "b" | "c" end`, "  return v", "end", ...calls(5)));
    expect(errors).toEqual([]);
    check(valuesOf(output));
  });

  test.each(SEQUENTIAL)("%s, returned", (keyword, check) => {
    const { output, errors } = run(lines("function f()", `  return ${keyword} | "a" | "b" | "c" end`, "end", ...calls(5)));
    expect(errors).toEqual([]);
    check(valuesOf(output));
  });

  test.each(SEQUENTIAL)("%s, nested in an `if` block", (keyword, check) => {
    const { output, errors } = run(
      lines("function f()", "  if true then", `    return ${keyword} | "a" | "b" | "c" end`, "  end", "  return 0", "end", ...calls(5)),
    );
    expect(errors).toEqual([]);
    check(valuesOf(output));
  });

  test("the ticket's function: the arm after the first `|` (a head is no arm, I-1446)", () => {
    expect(run(lines("function f()", '  local line = cycle "a" | "b" end', "  return line", "end", "Value {f()}."))).toEqual({
      output: "Value b.\n",
      errors: [],
    });
  });

  test("a value of any kind, and an argument", () => {
    const { output, errors } = run(lines("function f()", '  return tostring(cycle | 1 | { 2 } | "x" end) .. "!"', "end", ...calls(3)));
    expect(errors).toEqual([]);
    expect(valuesOf(output)).toEqual(["1!", expect.stringMatching(/^table/), "x!"]);
  });

  test("an empty arm gives nil", () => {
    const { output, errors } = run(lines("function f()", '  return cycle | "a" | | "c" end', "end", ...calls(3)));
    expect(errors).toEqual([]);
    expect(valuesOf(output)).toEqual(["a", "nil", "c"]);
  });

  test("an arm's calls run, and its last value is the value", () => {
    const { output, errors } = run(lines(...TRAIL, "function f()", '  return cycle | add("a") "A" | add("b") "B" end', "end", ...calls(3), "Log {trail}."));
    expect(errors).toEqual([]);
    expect(output).toBe("1 A.\n2 B.\n3 A.\nLog aba.\n");
  });

  test("at the top level, in a local's and a store's value", () => {
    expect(run(lines('local v = cycle | "a" | "b" end', 'store s = queue | "x" | "y" end', "Top {v} {s}."))).toEqual({
      output: "Top a x.\n",
      errors: [],
    });
  });

  test("in a Luau string's interpolation, where nil is written as Luau writes it", () => {
    const { output, errors } = run(lines("function f()", '  return "x{queue | "a" | "b" end}"', "end", ...calls(3)));
    expect(errors).toEqual([]);
    expect(valuesOf(output)).toEqual(["xa", "xb", "xnil"]);
  });
});

describe("an arm's last call gives one value, as an if expression's arm does (round 1, comment 6346619040)", () => {
  const PAIR = ['function pair() return "a", "b" end', "function none() end"];

  test.each([
    ["cycle", "cycle | pair() end", "cycle | none() end"],
    ["match", 'match "k" | k = pair() end', 'match "k" | k = none() end'],
    ["plural", "plural(1) | one = pair() | other = 0 end", "plural(1) | one = none() | other = 0 end"],
  ])("%s: a call's values are cut to its first, and none is nil", (_name, several, none) => {
    const { output, errors } = run(
      lines(
        ...PAIR,
        "function f()",
        `  return select("#", (${several})) .. " " .. select("#", ${several}) .. " " .. tostring(${several})`,
        "end",
        "function g()",
        `  return select("#", (${none})) .. " " .. select("#", ${none}) .. " " .. tostring(${none})`,
        "end",
        "Several {f()}.",
        "None {g()}.",
      ),
    );
    expect(errors).toEqual([]);
    expect(output).toBe("Several 1 1 a.\nNone 1 1 nil.\n");
    const all = run(lines(...PAIR, "function f()", `  local a, b, c = ${several}`, "  return tostring(a) .. tostring(b) .. tostring(c)", "end", "Values {f()}."));
    expect(all).toEqual({ output: "Values anilnil.\n", errors: [] });
  });

  test("a keyed table field takes one value", () => {
    expect(run(lines(...PAIR, "function f()", "  local t = { [1] = cycle | pair() end }", "  return tostring(t[1]) .. tostring(t[2])", "end", "Fields {f()}."))).toEqual({
      output: "Fields anil.\n",
      errors: [],
    });
  });
});

describe("the names an alternator's head and arms read, in a closure (round 1, comment 6347276089)", () => {
  test("a value arm reads the parameter the closure captured, not a global of its name", () => {
    expect(
      run(lines("store x = 99", "function make(x)", "  return function()", "    return cycle | x end", "  end", "end", "local g = make(7)", "Value {g()}.")),
    ).toEqual({ output: "Value 7.\n", errors: [] });
  });

  test("a statement arm's call reaches the locals the closure captured", () => {
    expect(
      run(
        lines(
          "function counter()",
          "  local n = 0",
          "  local function bump() n = n + 1 end",
          "  return function()",
          "    queue",
          "      | bump()",
          "      | bump()",
          "    end",
          "    return n",
          "  end",
          "end",
          "local c = counter()",
          "Value {c()} {c()} {c()}.",
        ),
      ),
    ).toEqual({ output: "Value 1 2 2.\n", errors: [] });
  });

  test("a match's condition reads the captured parameter", () => {
    expect(run(lines("function make(x)", "  return function()", '    return match x | a = "A" | other = "O" end', "  end", "end", 'Value {make("a")()}.'))).toEqual({
      output: "Value A.\n",
      errors: [],
    });
  });

  test("an arm reads a local the closure declares before it, not one outside", () => {
    expect(
      run(lines('local y = "out"', "function make()", "  return function()", '    local y = "in"', "    return cycle | y end", "  end", "end", "Value {make()()} {y}.")),
    ).toEqual({ output: "Value in out.\n", errors: [] });
  });

  // Round 1, comment 6347863425: a local of a name is the arm's only where
  // it is in scope at the alternator.
  test.each([
    ["a block's local that ended before it", ["    do local x = 1 end", "    return cycle | x end"]],
    ["another function's parameter", ["    local function identity(x) return x end", "    return cycle | x end"]],
    ["the local its own value declares", ["    local x = cycle | x end", "    return x"]],
    ["a block's local that ended before a match's condition", ["    do local x = 1 end", '    return match x | other = x end']],
  ])("an arm reads the captured parameter, not %s", (_name, body) => {
    expect(run(lines("store x = 99", "function make(x)", "  return function()", ...body, "  end", "end", "local g = make(7)", "Value {g()}."))).toEqual({
      output: "Value 7.\n",
      errors: [],
    });
  });

  // Round 2, comment 6348352524: a name an arm's own statement declared
  // before it is that local, so the closure captures nothing of its name
  // and keeps nothing alive in a save.
  test("an arm reads the local its statement declares, capturing no outer local of its name", () => {
    const source = lines(
      "function make(y)",
      "  return function()",
      "    return cycle | local y = 3 y end",
      "  end",
      "end",
      'local g = make(string.rep("retention-marker", 100))',
      "Value {g()}.",
    );
    const { story, errorMessages } = makeRuntimeStoryFromSource(source);
    expect(errorMessages).toEqual([]);
    expect(runToEnd(story)).toBe("Value 3.\n");
    expect(story.state.toJson().includes("retention-marker")).toBe(false);
  });

  test("a top-level function's arm reads a top-level local", () => {
    expect(run(lines('local greeting = "hi"', "function f()", "  return cycle | greeting end", "end", "Value {f()}."))).toEqual({
      output: "Value hi.\n",
      errors: [],
    });
  });
});

describe("a conditional alternator used as a value in a function (I-1284)", () => {
  test("match gives the matching arm's value, and nil where none matches", () => {
    const { output, errors } = run(
      lines("function f(x)", '  return match x | a = "A" | b = "B" end', "end", '1 {f("a")}.', '2 {f("b")}.', '3 {f("z")}.'),
    );
    expect(errors).toEqual([]);
    expect(valuesOf(output)).toEqual(["A", "B", "nil"]);
  });

  test("match's `other` takes what no arm before it matches", () => {
    const { output } = run(lines("function f(x)", '  return match x | a = "A" | other = "O" end', "end", '1 {f("a")}.', '2 {f("z")}.'));
    expect(valuesOf(output)).toEqual(["A", "O"]);
  });

  test("a keyless arm of a match takes a value that holds", () => {
    const { output, errors } = run(lines("function f(x)", '  return match x | "K" | z = "Z" end', "end", '1 {f("a")}.', "2 {f(false)}."));
    expect(errors).toEqual([]);
    expect(valuesOf(output)).toEqual(["K", "nil"]);
  });

  test("plural, keyed and positional", () => {
    const keyed = run(lines("function f(n)", '  return plural(n) | one = "apple" | other = "apples" end', "end", "1 {f(1)}.", "2 {f(2)}."));
    const positional = run(lines("function f(n)", '  return plural(n) | "apple" | "apples" end', "end", "1 {f(1)}.", "2 {f(2)}."));
    expect(keyed).toEqual({ output: "1 apple.\n2 apples.\n", errors: [] });
    expect(positional).toEqual(keyed);
  });

  test("at the top level, with its condition in its head", () => {
    expect(run(lines('local v = match "b" | a = 1 | b = 2 end', 'store s = match "z" | z = 3 end', "Top {v} {s}."))).toEqual({
      output: "Top 2 3.\n",
      errors: [],
    });
  });

  test("a match whose condition is another alternator", () => {
    expect(run(lines("function f()", '  return match match("x") | x = "mage" end | mage = 2 end', "end", "Value {f()}."))).toEqual({
      output: "Value 2.\n",
      errors: [],
    });
  });
});

describe("an alternator written as a statement in a function (I-1397)", () => {
  test("the ticket's queue statement runs its arm", () => {
    expect(
      run(lines("function sequential()", "  local n = 0", "  local function touch() n = 7 end", "  queue", "    | touch()", "  end", "  return n", "end", "Queue effect {sequential()}.")),
    ).toEqual({ output: "Queue effect 7.\n", errors: [] });
  });

  test("the ticket's match statement runs its arm", () => {
    expect(
      run(lines("function conditional()", "  local n = 0", "  local function touch() n = 8 end", '  match "one"', "    | one = touch()", "  end", "  return n", "end", "Match effect {conditional()}.")),
    ).toEqual({ output: "Match effect 8.\n", errors: [] });
  });

  test("the ticket's inline queue used as a value runs its arm", () => {
    expect(
      run(lines("function valued()", "  local n = 0", "  local function touch() n = 9 end", "  local v = queue | touch() end", "  return n", "end", "Value effect {valued()}.")),
    ).toEqual({ output: "Value effect 9.\n", errors: [] });
  });

  // What five calls of each form record, in the order of `SEQUENTIAL`.
  const statementTrail = (keyword: string, form: "block" | "line") =>
    run(
      lines(
        ...TRAIL,
        "function f()",
        ...(form === "block" ? [`  ${keyword}`, '    | add("a")', '    | add("b")', '    | add("c")', "  end"] : [`  ${keyword} | add("a") | add("b") | add("c") end`]),
        "end",
        "& f()",
        "& f()",
        "& f()",
        "& f()",
        "& f()",
        "Log {trail}.",
      ),
    );
  const TRAILS: [string, (trail: string) => void][] = SEQUENTIAL.map(([keyword, check]) => [
    keyword,
    (trail: string) => check([...trail.padEnd(5, "-")].map((c) => (c === "-" ? "nil" : c))),
  ]);

  test.each(TRAILS)("%s, written on lines of its own, runs one arm per call", (keyword, check) => {
    const { output, errors } = statementTrail(keyword, "block");
    expect(errors).toEqual([]);
    check(output.replace(/^Log (.*)\.\n$/, "$1"));
  });

  test.each(TRAILS)("%s, written on one line, runs one arm per call", (keyword, check) => {
    const { output, errors } = statementTrail(keyword, "line");
    expect(errors).toEqual([]);
    check(output.replace(/^Log (.*)\.\n$/, "$1"));
  });

  test("an arm runs each of its calls", () => {
    expect(run(lines(...TRAIL, "function f()", "  cycle", '    | add("a")', '    | add("b") add("x")', "  end", "end", "& f()", "& f()", "& f()", "Log {trail}."))).toEqual({
      output: "Log abxa.\n",
      errors: [],
    });
  });

  test("match runs the matching arm, and nothing where none matches", () => {
    expect(
      run(lines(...TRAIL, "function f(x)", "  match x", '    | a = add("A")', '    | b = add("B")', "  end", "end", '& f("a")', '& f("z")', '& f("b")', "Log {trail}.")),
    ).toEqual({ output: "Log AB.\n", errors: [] });
  });

  test("plural runs its category's arm", () => {
    expect(
      run(lines(...TRAIL, "function f(n)", "  plural(n)", '    | one = add("1")', '    | other = add("n")', "  end", "end", "& f(1)", "& f(3)", "Log {trail}.")),
    ).toEqual({ output: "Log 1n.\n", errors: [] });
  });

  test("in a loop's body, every pass shares the count", () => {
    expect(
      run(lines(...TRAIL, "function f()", "  for i = 1, 3 do", "    cycle", '      | add("a")', '      | add("b")', "    end", "  end", "end", "& f()", "& f()", "Log {trail}.")),
    ).toEqual({ output: "Log ababab.\n", errors: [] });
  });

  test("a scene's `&` statement runs one arm each time the line runs", () => {
    // The pass count bounds the loop whatever the alternator does (round 1,
    // comment 6347863425).
    const { program } = compileScript(
      lines(
        ...TRAIL,
        "store passes = 0",
        "scene main",
        "  label top",
        "  & passes = passes + 1",
        '  & cycle | add("a") | add("b") end',
        "  if passes < 3 then",
        "    -> top",
        "  end",
        "  Log {trail}.",
        "end",
      ),
    );
    expect(errorsOf(program)).toEqual([]);
    expect(storyRun(new ProgramStory(program.chunks!), [], { from: "main" }).beats.map((beat) => beat.text)).toEqual(["Log aba.\n"]);
  });

  test("in a `do` block", () => {
    expect(
      run(lines(...TRAIL, "function f()", "  do", "    chain", '      | add("a")', '      | add("b")', "    end", "  end", "end", "& f()", "& f()", "& f()", "Log {trail}.")),
    ).toEqual({ output: "Log abb.\n", errors: [] });
  });
});

describe("an unread token in an arm (I-1284)", () => {
  const UNREAD = ["Unexpected '!'; did you mean 'not'?", "Expected identifier when parsing expression, got <eof>"];

  test("in a value alternator's arm, reported once", () => {
    expect(run(lines("function f()", '  local line = cycle | "a" | ! | "b" end', "  return line", "end", "Value {f()}.")).errors).toEqual(UNREAD);
  });

  test("in a statement alternator's arm, reported once", () => {
    expect(run(lines("function f()", "  cycle", "    | !", "  end", "end", "& f()")).errors).toEqual(UNREAD);
  });
});

describe("a displayed alternator keeps its behaviour", () => {
  test("in story braces and as a story block", () => {
    expect(run(lines('1 {cycle | "a" | "b" end}.', '2 {queue | "a" end}.', "cycle", "  | A.", "  | B.", "end"))).toEqual({
      output: "1 a.\n2 a.\nA.\n",
      errors: [],
    });
  });

  test("a story match with a keyless arm keeps its line", () => {
    expect(run(lines('Value {match "x" | | x = "m" end}.', 'Then {match "x" | "k" | x = "m" end}.'))).toEqual({
      output: "Value .\nThen k.\n",
      errors: [],
    });
  });

  // Round 1, comment 6347276089: a value that holds for no arm after a
  // keyless first arm is popped, so the line keeps its text.
  test.each(["false", "nil"])("a story match on %s that no arm takes after a keyless first arm keeps its line", (condition) => {
    expect(run(lines(`store c = ${condition}`, 'Value {match c | "k" | x = "m" end}.', "After."))).toEqual({ output: "Value .\nAfter.\n", errors: [] });
  });
});

describe("an alternator in Luau code's count is saved and loaded (I-1284)", () => {
  test("a value alternator continues with its second arm after a save taken after the first call", () => {
    const source = lines("function f()", '  return cycle | "a" | "b" | "c" end', "end", "First {f()}.", "Second {f()}.");
    const { story, root } = makeRuntimeStoryFromSource(source);
    expect(story.Continue()).toBe("First a.\n");
    const saved = story.state.toJson();
    const loaded = testStory(root);
    loaded.state.LoadJson(saved);
    expect(loaded.Continue()).toBe("Second b.\n");
  });

  test("a statement alternator continues with its second arm after a save taken after the first call", () => {
    const source = lines(...TRAIL, "function f()", "  cycle", '    | add("a")', '    | add("b")', "  end", "end", "& f()", "One {trail}.", "& f()", "Two {trail}.");
    const { story, root } = makeRuntimeStoryFromSource(source);
    expect(story.Continue()).toBe("One a.\n");
    const saved = story.state.toJson();
    const loaded = testStory(root);
    loaded.state.LoadJson(saved);
    expect(loaded.Continue()).toBe("Two ab.\n");
  });
});

describe("an edit to an arm of an alternator in Luau code (I-1284)", () => {
  const SOURCE = lines("function f()", '  local v = cycle | "a" | "b" end', "  return v", "end", "function g()", "  queue", '    | print("x")', "  end", "end", "1 {f()}.", "2 {f()}.", "& g()");

  test.each([
    ["a value arm's text", '"b" end', '"B" end'],
    ["a statement arm's call", 'print("x")', 'print("y")'],
    ["an arm added", '"b" end', '"b" | "c" end'],
  ])("%s compiles incrementally as it does cold", (_name, before, after) => {
    const session = programSession(SOURCE);
    const edited = session.edit(before, after);
    const cold = compileScript(session.text).program.chunks!;
    expect(describeRoot(edited)).toEqual(describeRoot(cold));
    expect(testStory(edited).ContinueMaximally()).toBe(testStory(cold).ContinueMaximally());
  });

  test("the edited arm is the one that runs", () => {
    const session = programSession(SOURCE);
    const edited = session.edit('"b" end', '"B" end');
    expect(testStory(edited).ContinueMaximally()).toBe("1 a.\n2 B.\nx\n");
  });
});
