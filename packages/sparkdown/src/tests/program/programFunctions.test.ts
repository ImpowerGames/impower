// Functions, closures, builtin calls and define tables compiled to statement
// chunks and run by the program engine (#698, docs/engine/binary-program.md,
// sections 2, 3, 7 and 10).
import "../../inkjs/engine/Container";
import { afterEach, describe, expect, it } from "vitest";
import { CallStack } from "../../inkjs/engine/CallStack";
import type { InkObject } from "../../inkjs/engine/Object";
import { Path } from "../../inkjs/engine/Path";
import {
  DivertTargetValue,
  MultiValue,
  ObjectValue,
  SymbolValue,
  VariablePointerValue,
} from "../../inkjs/engine/Value";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import { exportCount, exportSymbol } from "../../program/StatementChunk";
import {
  compileScript,
  describeRoot,
  MAIN_URI,
  programCompiler,
  storyBeats,
} from "./programHarness";

/** A script's beats on both engines, after checking that its program has
 *  its chunks. */
const bothEngines = (text: string) => {
  const { program } = compileScript(text, { programChunks: true });
  expect(program.fallback).toBeUndefined();
  const current = compileScript(text);
  current.story.ResetState();
  return {
    expected: storyBeats(current.story),
    actual: storyBeats(new ProgramStory(program.chunks!)),
  };
};

const texts = (beats: { text: string }[]) => beats.map((beat) => beat.text);

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

/** A compiler over one script with statement chunks on, which edits it and
 *  compiles, or compiles an edit as a preview. */
function session(initial: string) {
  const c = programCompiler({ [MAIN_URI]: initial }, { programChunks: true });
  let text = initial;
  let version = 1;
  let root = c.compile().program.chunks!;
  const change = (find: string, replace: string) => {
    const offset = text.indexOf(find);
    expect(offset, `"${find}" is in the script`).toBeGreaterThanOrEqual(0);
    return {
      range: {
        start: posAt(text, offset),
        end: posAt(text, offset + find.length),
      },
      replace,
      after: text.slice(0, offset) + replace + text.slice(offset + find.length),
    };
  };
  return {
    get root(): ProgramRoot {
      return root;
    },
    get text(): string {
      return text;
    },
    get store() {
      return c.compiler.chunkStore!;
    },
    /** Replaces the first `find` with `replace` and compiles. */
    edit(find: string, replace: string): ProgramRoot {
      const { range, after } = change(find, replace);
      version += 1;
      c.compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version },
        contentChanges: [{ range, text: replace }],
      });
      text = after;
      const program = c.compile().program;
      expect(program.fallback).toBeUndefined();
      root = program.chunks!;
      return root;
    },
    /** Compiles the edit as a preview, which leaves the script as it was. */
    preview(find: string, replace: string): ProgramRoot {
      const { range } = change(find, replace);
      const preview = c.compiler.previewCompile({
        textDocument: { uri: MAIN_URI, version },
        contentChanges: [{ range, text: replace }],
        root: { uri: MAIN_URI },
        startFrom: { file: MAIN_URI, line: 0 },
      });
      return preview.program!.chunks!;
    },
  };
}

/** A cold compile's root of `text`. */
const cold = (text: string): ProgramRoot =>
  programCompiler({ [MAIN_URI]: text }, { programChunks: true }).compile()
    .program.chunks!;

// The chunk of entry `entry` of the top-level flow, and the symbol of the
// first function it writes.
const entryOf = (root: ProgramRoot, entry: number) =>
  root.flowNamed("")!.arrays.chunks[entry]!;
const functionOf = (root: ProgramRoot, entry: number) => {
  const chunk = entryOf(root, entry);
  expect(exportCount(chunk)).toBeGreaterThan(0);
  return exportSymbol(chunk, 0);
};

describe("functions on the program engine", () => {
  it("runs a script that calls a function, a closure, a builtin and a define's method as the current engine does", () => {
    const { expected, actual } = bothEngines(
      [
        "define counter with",
        "  count = 0",
        "  function bump(by)",
        "    self.count = self.count + by",
        "    return self.count",
        "  end",
        "end",
        "",
        "store r = 0",
        "r = run(3)",
        "The result is {r}.",
        "done",
        "",
        "function run(n)",
        "  local total = 0",
        "  local add = function(x) total = total + x end",
        "  for i = 1, n do",
        "    add(i)",
        "  end",
        "  counter:bump(total)",
        "  return string.format(\"%d/%d\", total, counter.count)",
        "end",
      ].join("\n"),
    );
    expect(actual).toEqual(expected);
    expect(texts(expected.beats)).toEqual(["The result is 6/6.\n"]);
  });

  it("returns several values, spreads them into a variadic function and packs its extras", () => {
    const { expected, actual } = bothEngines(
      [
        "store s = \"\"",
        "s = run()",
        "Got {s}.",
        "done",
        "",
        "function pair()",
        "  return 1, 2",
        "end",
        "",
        "function count(...)",
        "  return select(\"#\", ...)",
        "end",
        "",
        "function run()",
        "  local a, b = pair()",
        "  local packed = table.pack(pair())",
        "  return a .. \",\" .. b .. \",\" .. count(pair()) .. \",\" .. count(a, pair()) .. \",\" .. packed.n",
        "end",
      ].join("\n"),
    );
    expect(actual).toEqual(expected);
    expect(texts(expected.beats)).toEqual(["Got 1,2,2,3,2.\n"]);
  });

  // The story takes a function written at the top level inside a `do` block
  // out of the block as a function of its own. It leaves one written inside
  // any other block where it stands, and the current engine runs its body
  // there as the block's content: the name defines no function, and a
  // `return` in the body returns from none.
  it("runs a function defined inside a block where the story places it, as the current engine does", () => {
    const cases: { text: string; beats: string[]; errors: string[]; defined: boolean }[] = [
      {
        text: [
          "do",
          "  function run(n)",
          "    if n > 0 then",
          "      return n + run(n - 1)",
          "    end",
          "    return 0",
          "  end",
          "  function walk()",
          "    return run(3)",
          "  end",
          "end",
          "Hello {walk()} {run(2)}.",
        ].join("\n"),
        beats: ["Hello 6 3.\n"],
        errors: [],
        defined: true,
      },
      {
        text: "store y = 0\nif true then\n  function run()\n    y = 5\n  end\nend\nHello {y}.\n",
        beats: ["Hello 5.\n"],
        errors: [],
        defined: false,
      },
      {
        text: "store n = 0\nfor i = 1, 2 do\n  function run()\n    n = n + i\n  end\nend\nHello {n}.\n",
        beats: ["Hello 3.\n"],
        errors: [],
        defined: false,
      },
      {
        text: "if true then\n  function run(a)\n    return a\n  end\nend\nHello.\n",
        beats: [],
        errors: [
          "1: RUNTIME ERROR: 'main' line 3: Found function return statement (return), when expected end of flow (-> END or choice)",
        ],
        defined: false,
      },
    ];
    for (const { text, beats, errors, defined } of cases) {
      const { expected, actual } = bothEngines(text);
      expect(actual).toEqual(expected);
      expect(texts(expected.beats)).toEqual(beats);
      expect(expected.errors).toEqual(errors);
      const { program } = compileScript(text, { programChunks: true });
      expect(new ProgramStory(program.chunks!).HasFunction("run")).toBe(defined);
    }
  });
});

/** Every value `story` holds: its globals, the temporaries and the open
 *  cells of its frames, its eval stack and its output, and every table,
 *  metatable, closed cell, multiple value and function value's target they
 *  reach. */
const heldValues = (story: ProgramStory): unknown[] => {
  const seen = new Set<unknown>();
  const visit = (value: unknown) => {
    if (value == null || typeof value !== "object" || seen.has(value)) {
      return;
    }
    seen.add(value);
    if (value instanceof ObjectValue) {
      for (const entry of value.value?.values() ?? []) visit(entry);
      visit(value.metatable);
    } else if (value instanceof VariablePointerValue) {
      visit(value.closedValue);
    } else if (value instanceof MultiValue) {
      value.values.forEach(visit);
    } else if (value instanceof DivertTargetValue || value instanceof SymbolValue) {
      visit(value.value);
    }
  };
  const globals = story.variablesState as unknown as {
    _globalVariables: Map<string, InkObject>;
    _defaultGlobalVariables: Map<string, InkObject> | null;
  };
  for (const value of globals._globalVariables.values()) visit(value);
  for (const value of globals._defaultGlobalVariables?.values() ?? []) visit(value);
  for (const element of story.state.callStack.elements) {
    for (const scope of element.temporaryScopes) {
      for (const value of scope.values()) visit(value);
    }
    element.openUpvalues.forEach(visit);
  }
  story.state.evaluationStack.forEach(visit);
  story.state.outputStream.forEach(visit);
  return [...seen];
};

describe("a function value", () => {
  // A function read by its name, a closure, a define's method, a comparator,
  // an `__index` function and a protected call.
  const text = [
    "store byName = nil",
    "store made = nil",
    "store sorted = \"\"",
    "store proxied = \"\"",
    "store guarded = \"\"",
    "define counter with",
    "  count = 0",
    "  function bump(by)",
    "    self.count = self.count + by",
    "    return self.count",
    "  end",
    "end",
    "byName = double",
    "made = adder(3)",
    "sorted = sortDescending()",
    "proxied = viaIndex()",
    "guarded = viaPcall()",
    "Values {byName(2)} {made(1)} {sorted} {proxied} {guarded} {counter:bump(5)}.",
    "done",
    "",
    "function double(x) return x * 2 end",
    "function adder(n) return function(x) return x + n end end",
    "function sortDescending()",
    "  local t = {3, 1, 2}",
    "  table.sort(t, function(a, b) return a > b end)",
    "  return table.concat(t, \",\")",
    "end",
    "function viaIndex()",
    "  local t = setmetatable({}, { __index = function(_, key) return key .. \"!\" end })",
    "  return t.hi",
    "end",
    "function viaPcall()",
    "  local ok, message = pcall(function() error(\"no\", 0) end)",
    "  return tostring(ok) .. \":\" .. message",
    "end",
  ].join("\n");

  it("is a symbol value wherever the current engine holds a divert target, and no value holds a path", () => {
    const { expected, actual } = bothEngines(text);
    expect(actual).toEqual(expected);
    expect(texts(expected.beats)).toEqual(["Values 4 4 3,2,1 hi! false:no 5.\n"]);

    const { program } = compileScript(text, { programChunks: true });
    const story = new ProgramStory(program.chunks!);
    // Every value the run pushes, and every value the story holds after it.
    const pushed: unknown[] = [];
    const push = story.state.PushEvaluationStack.bind(story.state);
    story.state.PushEvaluationStack = (obj: InkObject) => {
      pushed.push(obj, ...(obj instanceof MultiValue ? obj.values : []));
      push(obj);
    };
    storyBeats(story);
    const values = [...pushed, ...heldValues(story)];
    const paths = values.filter(
      (value) => value instanceof DivertTargetValue || value instanceof Path,
    );
    expect(paths).toEqual([]);
    // The flow-name fallback of a read, and a closure's function.
    expect(story.variablesState.GetVariableWithName("byName")).toBeInstanceOf(
      SymbolValue,
    );
    const made = story.variablesState.GetVariableWithName("made") as ObjectValue;
    expect(made.value!.get("__closure_fn")).toBeInstanceOf(SymbolValue);
    expect(values.filter((value) => value instanceof SymbolValue).length).toBeGreaterThan(3);
  });
});

describe("the write barrier", () => {
  // Each statement between the two beats changes a table in place, or what a
  // table is beside its entries, or writes a closed upvalue cell: a counter
  // closure whose variable outlived the frame that declared it.
  const text = [
    "store t = { 1, 2 }",
    "store removed = { 1, 2, 3 }",
    "store sorted = { 3, 1, 2 }",
    "store moved = {}",
    "store raw = {}",
    "store stored = {}",
    "store target = {}",
    "store proxied = setmetatable({}, { __newindex = target })",
    "store frozen = {}",
    "store shaped = {}",
    "store cleared = { 1, 2, 3 }",
    "store hinted = { 1, 2, 3 }",
    "store n = 0",
    "store count = 0",
    "store counter = makeCounter()",
    "One.",
    "& table.insert(t, 3)",
    "& table.remove(removed)",
    "& table.sort(sorted)",
    "& table.move(sorted, 1, 2, 1, moved)",
    "& rawset(raw, \"k\", 1)",
    "stored.k = 1",
    "proxied.k = 1",
    "& table.freeze(frozen)",
    "& setmetatable(shaped, { __index = { x = 1 } })",
    "& table.clear(cleared)",
    "n = #hinted",
    "& counter()",
    "Two {#t} {count} {n}.",
    "done",
    "",
    "function makeCounter()",
    "  local c = 0",
    "  return function()",
    "    c = c + 1",
    "    count = c",
    "  end",
    "end",
  ].join("\n");
  const changed = [
    "t",
    "removed",
    "sorted",
    "moved",
    "raw",
    "stored",
    "target",
    "frozen",
    "shaped",
    "cleared",
    "hinted",
  ];

  it("marks every table a builtin changes in place, and the closed cell a closure writes, once the statement that changes it runs", () => {
    const { expected, actual } = bothEngines(text);
    expect(actual).toEqual(expected);
    expect(texts(expected.beats)).toEqual(["One.\n", "Two 3 1 3.\n"]);

    const { program } = compileScript(text, { programChunks: true });
    const story = new ProgramStory(program.chunks!);
    const globals = story.variablesState;
    globals.trackWrites = true;
    const table = (name: string) => globals.GetVariableWithName(name) as ObjectValue;
    const cell = () =>
      (table("counter").value!.get("__closure_upvals") as ObjectValue).value!.get(
        "0",
      ) as VariablePointerValue;
    const what = () => ({
      t: table("t").value!.size,
      removed: table("removed").value!.size,
      sorted: [...table("sorted").value!.values()].map((v) => v.valueObject),
      moved: table("moved").value!.size,
      raw: table("raw").value!.size,
      stored: table("stored").value!.size,
      target: table("target").value!.size,
      frozen: table("frozen").isFrozen,
      shaped: table("shaped").metatable !== null,
      cleared: table("cleared").value!.size,
      hint: (table("hinted").value as { __luauBoundary?: number }).__luauBoundary,
      cell: (cell().closedValue as { valueObject?: unknown } | null)
        ?.valueObject,
      count: globals.$("count"),
    });

    // The continue that returns the first beat stops at its newline: no
    // statement after it has run, so nothing is changed or marked.
    expect(story.Continue()).toBe("One.\n");
    const before = what();
    expect(before).toEqual({
      t: 2,
      removed: 3,
      sorted: [3, 1, 2],
      moved: 0,
      raw: 0,
      stored: 0,
      target: 0,
      frozen: false,
      shaped: false,
      cleared: 3,
      hint: undefined,
      cell: 0,
      count: 0,
    });
    const first = globals.TakeWrites();
    expect([...first.tables]).toEqual([]);
    expect([...first.cells]).toEqual([]);

    // The next continue runs them, each once, and the barrier marks each
    // table and the cell.
    expect(story.Continue()).toBe("Two 3 1 3.\n");
    expect(what()).toEqual({
      t: 3,
      removed: 2,
      sorted: [1, 2, 3],
      moved: 2,
      raw: 1,
      stored: 1,
      target: 1,
      frozen: true,
      shaped: true,
      cleared: 0,
      hint: 3,
      cell: 1,
      count: 1,
    });
    const second = globals.TakeWrites();
    for (const name of changed) {
      expect(second.tables.has(table(name)), name).toBe(true);
    }
    expect([...second.cells]).toEqual([cell()]);
  });
});

describe("upvalues", () => {
  // Two closures made by one call capture one variable: an increment through
  // one is read through the other, after the frame that owned the variable
  // has returned. Each pass of a loop closes its own copy of the loop
  // variable.
  const text = [
    "store shared = 0",
    "store looped = \"\"",
    "shared = sharedCount()",
    "looped = eachPass()",
    "Shared {shared}, looped {looped}.",
    "done",
    "",
    "function make()",
    "  local n = 0",
    "  local inc = function() n = n + 1 end",
    "  local get = function() return n end",
    "  return inc, get",
    "end",
    "",
    "function sharedCount()",
    "  local inc, get = make()",
    "  inc()",
    "  inc()",
    "  return get()",
    "end",
    "",
    "function eachPass()",
    "  local fns = {}",
    "  for i = 1, 3 do",
    "    fns[i] = function() return i end",
    "  end",
    "  return fns[1]() .. fns[2]() .. fns[3]()",
    "end",
  ].join("\n");
  const shown = () => {
    const { program } = compileScript(text, { programChunks: true });
    expect(program.fallback).toBeUndefined();
    return texts(storyBeats(new ProgramStory(program.chunks!)).beats);
  };
  const findOpenUpvalue = CallStack.prototype.FindOpenUpvalue;
  const setTemporaryVariable = CallStack.prototype.SetTemporaryVariable;
  afterEach(() => {
    CallStack.prototype.FindOpenUpvalue = findOpenUpvalue;
    CallStack.prototype.SetTemporaryVariable = setTemporaryVariable;
  });

  it("are shared by sibling closures, and each pass of a loop closes its own", () => {
    const { expected, actual } = bothEngines(text);
    expect(actual).toEqual(expected);
    expect(shown()).toEqual(["Shared 2, looped 123.\n"]);
  });

  // The fixture fails when the rule is broken: a closure that opened a cell
  // of its own, rather than taking the open one its sibling opened, keeps
  // the value the variable had when its frame returned.
  it("fails when sibling closures do not share their cell", () => {
    CallStack.prototype.FindOpenUpvalue = () => null;
    expect(shown()).not.toEqual(["Shared 2, looped 123.\n"]);
  });

  // A pass that declares the loop variable again leaves the cell of the pass
  // before it open, so every closure reads the variable's last value.
  it("fails when a pass does not close the cell of the pass before it", () => {
    CallStack.prototype.SetTemporaryVariable = function (
      this: CallStack,
      name: string,
      value: unknown,
      declareNew: boolean,
      contextIndex = -1,
    ) {
      const index =
        contextIndex === -1 ? this.currentElementIndex + 1 : contextIndex;
      const element = this.callStack[index - 1];
      const open = element?.openUpvalues ?? [];
      if (element && declareNew) {
        element.openUpvalues = [];
      }
      try {
        return setTemporaryVariable.call(this, name, value, declareNew, contextIndex);
      } finally {
        if (element && declareNew) {
          element.openUpvalues = [...open, ...element.openUpvalues];
        }
      }
    };
    expect(shown()).not.toEqual(["Shared 2, looped 123.\n"]);
  });
});

describe("a stack trace", () => {
  it("names each frame by its function's symbol as the current engine names it", () => {
    const { expected, actual } = bothEngines(
      [
        "store trace = \"\"",
        "store names = \"\"",
        "trace = outer()",
        "names = frames()",
        "{trace}",
        "Names {names}.",
        "done",
        "",
        "function outer()",
        "  return inner()",
        "end",
        "",
        "function inner()",
        "  return debug.traceback(\"here\")",
        "end",
        "",
        "function frames()",
        "  local closure = function()",
        "    return debug.info(1, \"n\") .. \"/\" .. debug.info(2, \"s\") .. \"/\" .. debug.info(3, \"s\")",
        "  end",
        "  return closure()",
        "end",
      ].join("\n"),
    );
    expect(actual).toEqual(expected);
    const shown = texts(expected.beats).join("");
    expect(shown).toContain("<SOMEWHERE IN 0>");
    expect(shown).toContain("<SOMEWHERE IN outer>");
    expect(shown).toContain("<SOMEWHERE IN inner>");
    expect(shown).toContain("Names __synth_0/frames/0.");
  });
});

describe("a function's symbol", () => {
  // The statement that writes `keep`'s function stands below the one an edit
  // inserts, whose function takes a symbol of its own.
  const inserted = "local other = function() return \"other\" end\n";

  it("stays with its function, and its statement's chunk too, when another statement writing a function is inserted above", () => {
    const s = session(
      [
        "store keep = nil",
        "keep = function() return \"kept\" end",
        "Kept {keep()}.",
        "",
      ].join("\n"),
    );
    const chunk = entryOf(s.root, 0);
    const symbol = functionOf(s.root, 0);
    const current = s.root;
    // A preview compile of the insertion keeps both, and leaves the store's
    // root as it was.
    const preview = s.preview("keep = function", `${inserted}keep = function`);
    expect(entryOf(preview, 1)).toBe(chunk);
    expect(functionOf(preview, 1)).toBe(symbol);
    expect(s.store.current).toBe(current);
    // So does the compile of the edit.
    const root = s.edit("keep = function", `${inserted}keep = function`);
    expect(entryOf(root, 1)).toBe(chunk);
    expect(functionOf(root, 1)).toBe(symbol);
    expect(functionOf(root, 0)).not.toBe(symbol);
    expect(texts(storyBeats(new ProgramStory(root)).beats)).toEqual([
      "Kept kept.\n",
    ]);
  });

  // A closure made before an edit calls the function it was made from, by
  // that function's symbol, in the root an engine runs on.
  const callKeep = (root: ProgramRoot, keep: unknown) => {
    const story = new ProgramStory(root);
    story.variablesState.SetGlobal("keep", keep as never);
    return story.EvaluateFunction("call_keep");
  };

  it("stays with its function when a function is inserted above it in its own statement, whose chunk is emitted again", () => {
    const s = session(
      [
        "store fns = nil",
        "store keep = nil",
        "fns = { function() return \"first\" end }",
        "First {fns[1]()}.",
        "done",
        "",
        "function call_keep()",
        "  return keep()",
        "end",
        "",
      ].join("\n"),
    );
    const chunk = entryOf(s.root, 0);
    const symbol = functionOf(s.root, 0);
    const before = new ProgramStory(s.root);
    expect(texts(storyBeats(before).beats)).toEqual(["First first.\n"]);
    const made = (
      before.variablesState.GetVariableWithName("fns") as ObjectValue
    ).value!.get("1")!;
    const root = s.edit(
      "fns = { function()",
      "fns = { function() return \"inserted\" end, function()",
    );
    // The statement is emitted again, and its old function keeps its symbol
    // as the second function it writes; the inserted one takes a new one.
    const after = entryOf(root, 0);
    expect(after).not.toBe(chunk);
    expect(exportCount(after)).toBe(2);
    expect(exportSymbol(after, 1)).toBe(symbol);
    expect(exportSymbol(after, 0)).not.toBe(symbol);
    // The closure made before the edit calls its own function's new code.
    expect(callKeep(root, made)).toBe("first");
  });

  // A call's code depends on its callee's parameters: a variadic callee
  // takes its extra arguments packed. The function's symbol's facts in the
  // callers' reference tables name them.
  it("re-emits the callers of a function whose parameter list changes, and no other statement", () => {
    const s = session(
      [
        "store r = 0",
        "r = first(1)",
        "Line one {r}.",
        "Line two.",
        "r = first(2) + 1",
        "Line three {r}.",
        "done",
        "",
        "function first(a, ...)",
        "  return a * 10",
        "end",
        "",
        "function other()",
        "  return 5",
        "end",
        "",
      ].join("\n"),
    );
    const flow = s.root.flowNamed("")!.arrays.chunks;
    const otherChunks = s.root.flowNamed("other")!.arrays.chunks;
    const root = s.edit("function first(a, ...)", "function first(a)");
    // The function's definition and its two callers.
    expect(s.store.emittedLastBuild).toBe(3);
    const after = root.flowNamed("")!.arrays.chunks;
    expect(after[0]).not.toBe(flow[0]);
    expect(after[1]).toBe(flow[1]);
    expect(after[2]).toBe(flow[2]);
    expect(after[3]).not.toBe(flow[3]);
    expect(after[4]).toBe(flow[4]);
    expect(root.flowNamed("other")!.arrays.chunks).toBe(otherChunks);
    expect(describeRoot(root)).toEqual(describeRoot(cold(s.text)));
    expect(texts(storyBeats(new ProgramStory(root)).beats)).toEqual([
      "Line one 10.\n",
      "Line two.\n",
      "Line three 21.\n",
    ]);
  });

  // A closure captures a name its function does not declare as an upvalue
  // unless a function of that name is declared at the top level, which its
  // statement records as a read; and its body calls the name as that
  // function or as a variable, which its reference table records.
  it("re-emits the statement of a closure that calls a function added or removed at the top level, as a cold compile emits it (#935)", () => {
    const s = session(
      [
        "store r = 0",
        "r = bottom()",
        "Result {r}.",
        "done",
        "",
        "function bottom()",
        "  local g = function() return helper() end",
        "  return g()",
        "end",
        "",
      ].join("\n"),
    );
    const closureOf = (root: ProgramRoot) => {
      const definition = root.flowNamed("bottom")!.arrays.chunks[0]!;
      return root.body(definition, 0)!.arrays.chunks[0]!;
    };
    const before = closureOf(s.root);
    expect(storyBeats(new ProgramStory(s.root)).errors).toHaveLength(1);

    const added = s.edit(
      "  return g()\nend\n",
      "  return g()\nend\n\nfunction helper()\n  return 7\nend\n",
    );
    // The new function's definition and body, and the closure's statement
    // and the statement of its body that calls the function.
    expect(s.store.emittedLastBuild).toBe(4);
    const withHelper = closureOf(added);
    expect(withHelper).not.toBe(before);
    expect(describeRoot(added)).toEqual(describeRoot(cold(s.text)));
    expect(texts(storyBeats(new ProgramStory(added)).beats)).toEqual([
      "Result 7.\n",
    ]);

    const removed = s.edit("\nfunction helper()\n  return 7\nend\n", "");
    expect(s.store.emittedLastBuild).toBe(2);
    expect(closureOf(removed)).not.toBe(withHelper);
    expect(describeRoot(removed)).toEqual(describeRoot(cold(s.text)));
    const coldRun = storyBeats(new ProgramStory(cold(s.text)));
    expect(storyBeats(new ProgramStory(removed))).toEqual(coldRun);
  });

  // A chunk is kept while the names its code assigns are assigned as they
  // were: those of an assignment, of a multiple assignment and of a loop's
  // variables, and the locals a function's entry declares for the functions
  // its body declares without `local`.
  it("keeps the chunk of every statement an edit to another line leaves, whatever functions it writes or runs", () => {
    const s = session(
      [
        "Before.",
        "store total = 0",
        "define counter with",
        "  count = 0",
        "  function bump(by)",
        "    function helper() return by end",
        "    self.count = self.count + helper()",
        "    return self.count",
        "  end",
        "end",
        "local a, b = pair(1)",
        "for k, v in pairs({ 1 }) do",
        "  total = total + v",
        "end",
        "local make = function()",
        "  function inner() return 2 end",
        "  return inner()",
        "end",
        "do",
        "  function twice(n)",
        "    function half() return n / 2 end",
        "    return n * 2 + half()",
        "  end",
        "end",
        "if total < 0 then",
        "  function reset()",
        "    function again() return 0 end",
        "    total = again()",
        "  end",
        "end",
        "Got {a} {b} {make()} {twice(2)} {counter:bump(1)} {total}.",
        "done",
        "",
        "function pair(n)",
        "  function one() return 1 end",
        "  return n, n + one()",
        "end",
        "",
      ].join("\n"),
    );
    const root = s.edit("Before.", "Before!");
    expect(s.store.emittedLastBuild).toBe(1);
    expect(texts(storyBeats(new ProgramStory(root)).beats)).toEqual([
      "Before!\n",
      "Got 1 2 2 5 1 1.\n",
    ]);
  });

  it("carries a closure made before the table is reseeded to its own function after it", () => {
    const s = session(
      [
        "store keep = nil",
        "keep = function() return \"kept\" end",
        "Kept {keep()}.",
        "done",
        "",
        "function call_keep()",
        "  return keep()",
        "end",
        "",
      ].join("\n"),
    );
    const before = new ProgramStory(s.root);
    storyBeats(before);
    const made = before.variablesState.GetVariableWithName("keep")!;
    const fn =
      made instanceof ObjectValue ? made.value!.get("__closure_fn")! : made;
    // Its symbol value has no name to resolve by.
    expect(fn).toBeInstanceOf(SymbolValue);
    const ref = (fn as SymbolValue).ref;
    expect(ref.name).toBeNull();
    expect(ref.generation).toBe(s.root.generation);
    s.store.reseed();
    const root = s.edit("Kept {keep()}.", "Still kept {keep()}.");
    expect(root.generation).toBe(ref.generation + 1);
    expect(callKeep(root, made)).toBe("kept");
  });
});
