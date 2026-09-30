// Functions, closures, builtin calls and define tables compiled to statement
// chunks and run by the program engine (#698, docs/engine/binary-program.md,
// sections 2, 3, 7 and 10).
import "../../inkjs/engine/Container";
import { afterEach, describe, expect, it } from "vitest";
import { CallStack } from "../../inkjs/engine/CallStack";
import { ObjectValue, SymbolValue } from "../../inkjs/engine/Value";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import { exportCount, exportSymbol } from "../../program/StatementChunk";
import {
  compileScript,
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
        textDocument: { uri: MAIN_URI, version: version + 1 },
        contentChanges: [{ range, text: replace }],
        root: { uri: MAIN_URI },
        startFrom: { file: MAIN_URI, line: 0 },
      });
      return preview.program!.chunks!;
    },
  };
}

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
