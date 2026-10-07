// Expressions, variables, conditionals and loops compiled to statement chunks
// and run by the program engine (#695, docs/engine/binary-program.md): what
// the writer emits for each class of the parsed hierarchy, what each
// instruction does to the eval stack, the output and the frame, a block
// statement's bodies and the scopes around them, a continue that returns
// between two lines, a decision the route simulator forces, parity with the
// current engine, and the fallback, which none of these constructs causes.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { buildRouteSimulator } from "../../compiler/utils/planRoute";
import { Identifier } from "../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { IncDecExpression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/IncDecExpression";
import { MultipleConditionExpression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/MultipleConditionExpression";
import { NumberExpression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { describeInstruction } from "../../program/BinaryProgramWriter";
import {
  ConstValue,
  JUMP_DECISION,
  Op,
  flagsOf,
} from "../../program/ProgramInstructions";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import {
  BLOCK_LOOP,
  BLOCK_PASS_SCOPE,
  B_BREAK,
  B_RESUME,
  HEADER_WORDS,
  blockCount,
  blockField,
  blockFlags,
  blockScopes,
  type StatementChunk,
} from "../../program/StatementChunk";
import { compileScript, MAIN_URI, storyBeats } from "./programHarness";
import {
  handWrittenProgram,
  traceHandWritten,
  traceSteps,
  type TracedStep,
} from "./programTrace";

const chunked = (text: string): ProgramRoot => {
  const { program } = compileScript(text, { programChunks: true });
  expect(program.fallback).toBeUndefined();
  return program.chunks!;
};

const instructionsOf = (root: ProgramRoot, chunk: StatementChunk): string[] =>
  [...new BinaryProgramReader(root).instructions(chunk)].map(({ offset }) =>
    describeInstruction(chunk, offset, root.table),
  );

/** The code of each statement of a script's top-level flow. */
const code = (text: string): string[][] => {
  const root = chunked(text);
  return root
    .flowNamed("")!
    .arrays.chunks.map((chunk) => instructionsOf(root, chunk));
};

/** The code of each statement of body `k` of top-level statement `entry`. */
const bodyCode = (text: string, entry: number, k = 0): string[][] => {
  const root = chunked(text);
  const owner = root.flowNamed("")!.arrays.chunks[entry]!;
  return root.body(owner, k)!.arrays.chunks.map((chunk) => instructionsOf(root, chunk));
};

/** Every instruction a script runs from its top, with the state it left. */
const trace = (text: string): TracedStep[] =>
  traceSteps(new ProgramStory(chunked(text)));

const START: TracedStep = { op: "", stack: [], output: [], scopes: [{}], blocks: 0 };

/** The `nth` step that ran `op`, the step before it and the op after it. */
const around = (steps: TracedStep[], op: string, nth = 0) => {
  const at = steps.flatMap((step, i) => (step.op === op ? [i] : []))[nth];
  if (at === undefined) {
    throw new Error(`no step ${nth} ran ${op}: ${steps.map((s) => s.op).join(", ")}`);
  }
  return {
    before: steps[at - 1] ?? START,
    after: steps[at]!,
    next: steps[at + 1]?.op,
  };
};

describe("the writer", () => {
  it("emits a number as Int, Num or Const, and nil as Const", () => {
    expect(code("local a = 5\nlocal b = 2.5\nlocal c = true\nlocal d = nil\n")).toEqual([
      ["Int 5", "SetVar a flags 1"],
      ["Num 2.5 float", "SetVar b flags 1"],
      ["Const true", "SetVar c flags 1"],
      ["Const nil", "SetVar d flags 1"],
    ]);
  });

  it("emits an interpolated string as its text captured between BeginString and EndString", () => {
    expect(code('local a = 5\nlocal s = "v{a}w"\n')[1]).toEqual([
      "BeginString",
      'Text "v"',
      "GetVar a",
      "Out",
      'Text "w"',
      "EndString",
      "SetVar s flags 1",
    ]);
  });

  it("emits a table with a computed key as each key and value, then MakeTable", () => {
    expect(code('local a = 5\nlocal t = { x = 1, [a + 1] = "six" }\n')[1]).toEqual([
      'Str "x"',
      "Int 1",
      "GetVar a",
      "Int 1",
      "Native +/2",
      'Str "six"',
      "MakeTable 2",
      "SetVar t flags 1",
    ]);
  });

  it("emits operators as Native, and `and` and `or` as JumpIfKeep", () => {
    const [, sum, negate, not, or, and] = code(
      "local a = 5\nlocal f = a + 1\nlocal u = -a\nlocal w = not a\nlocal g = false or 3\nlocal h = a and nil\n",
    );
    expect(sum).toEqual(["GetVar a", "Int 1", "Native +/2", "SetVar f flags 1"]);
    expect(negate).toEqual(["GetVar a", "Native _/1", "SetVar u flags 1"]);
    expect(not).toEqual(["GetVar a", "Native not/1", "SetVar w flags 1"]);
    // The jump's target is the SetVar: the right side is not evaluated when
    // the left decides.
    expect(or).toEqual(["Const false", "JumpIfKeep 8 flags 1", "Int 3", "Unpack 1", "SetVar g flags 1"]);
    expect(and).toEqual(["GetVar a", "JumpIfKeep 8", "Const nil", "Unpack 1", "SetVar h flags 1"]);
  });

  it("emits an index as Index and a stored property as StoreIndex", () => {
    const [, read, store] = code("local t = { x = 1 }\nlocal v = t[1]\nt.x = 5\n");
    expect(read).toEqual(["GetVar t", "Int 1", "Index", "SetVar v flags 1"]);
    expect(store).toEqual(["GetVar t", 'Str "x"', "Int 5", "StoreIndex"]);
  });

  it("emits an `if` expression as a Luau test, a jump past the other value, and a parenthesized one as its first value", () => {
    const [, , ternary, single] = code(
      'local a = 1\nlocal b = 2\nlocal x = if a > b then "big" else "small"\nlocal p = (if a then 1 else 2)\n',
    );
    expect(ternary).toEqual([
      "GetVar a",
      "GetVar b",
      "Native >/2",
      "JumpIfFalse 12 flags 1",
      'Str "big"',
      "Jump 14",
      'Str "small"',
      "SetVar x flags 1",
    ]);
    expect(single!.slice(-2)).toEqual(["Unpack 1", "SetVar p flags 1"]);
  });

  it("emits a multiple assignment as its values packed, then unpacked into each target", () => {
    expect(code("local a, b = 1, 2\n")[0]).toEqual([
      "Int 1",
      "Int 2",
      "Pack 2",
      "Unpack 2",
      "SetVar a flags 1",
      "SetVar b flags 1",
    ]);
  });

  // A compound assignment to a property stashes its base and key in names
  // the compiler generates, which the chunk names by their order in it.
  it("gives the names the compiler generates for a statement names of the chunk's own", () => {
    expect(code("local t = { p = { q = 1 } }\nt.p.q += 1\n")[1]).toEqual([
      "GetVar t",
      'Str "p"',
      "Index",
      "SetVar __t$0 flags 1",
      'Str "q"',
      "SetVar __t$1 flags 1",
      "GetVar __t$0",
      "GetVar __t$1",
      "GetVar __t$0",
      "GetVar __t$1",
      "Index",
      "Int 1",
      "Native +/2",
      "StoreIndex",
    ]);
  });

  // No lowering makes these two, which the parsed hierarchy still defines.
  it("emits an increment and a chain of conditions", () => {
    const written = (emit: Parameters<typeof handWrittenProgram>[0]) => {
      const root = handWrittenProgram(emit);
      return instructionsOf(root, root.flowNamed("")!.arrays.chunks[0]!);
    };
    expect(
      written((e) => e.emitObject(new IncDecExpression(new Identifier("n"), true))),
    ).toEqual(["GetVar n", "Int 1", "Native +/2", "SetVar n"]);
    expect(
      written((e) =>
        e.emitObject(
          new MultipleConditionExpression([
            new NumberExpression(true, "bool"),
            new NumberExpression(false, "bool"),
          ]),
        ),
      ),
    ).toEqual(["Const true", "Const false", "Native and/2"]);
  });

  it("emits an `if` as one chunk whose branches enter blocks, each test a decision", () => {
    const text = "store x = 2\nif x > 1 then\n  Big.\nelseif x == 1 then\n  One.\nelse\n  Small.\nend\n";
    expect(code(text)).toEqual([
      [
        "GetVar x",
        "Int 1",
        "Native >/2",
        "Native TRUTHY/1",
        "JumpIfFalse 18 flags 2",
        "BeginScope",
        "EnterBlock 0",
        "EndScope",
        "Jump 44",
        "GetVar x",
        "Int 1",
        "Native ==/2",
        "Native TRUTHY/1",
        "JumpIfFalse 36 flags 2",
        "BeginScope",
        "EnterBlock 1",
        "EndScope",
        "Jump 44",
        "BeginScope",
        "EnterBlock 2",
        "EndScope",
        "Jump 44",
      ],
    ]);
    expect(bodyCode(text, 0, 2)).toEqual([
      [
        "LineStart",
        'Str "target"',
        'Str "action"',
        'Str "text"',
        'Str "Small."',
        "MakeTable 2",
        "CallStd display/1 flags 1",
      ],
    ]);
  });

  // A `match` compares its value with each arm's key, keeping a copy for the
  // next arm, and pops the copy in the arm it takes.
  it("emits a match as its value duplicated for each arm's test", () => {
    const [match] = code('store x = "b"\nmatch (x)\n| a = Ay.\n| b = Bee.\nend\n');
    expect(match!.slice(0, 7)).toEqual([
      "GetVar x",
      "Dup",
      'Str "a"',
      "Native ==/2",
      "JumpIfFalse 30 flags 2",
      "Newline",
      "Pop",
    ]);
  });

  it("emits each loop as one chunk whose body is a loop block", () => {
    const text = [
      "local n = 0",
      "while n < 3 do",
      "  n = n + 1",
      "end",
      "for i = 1, 2 do",
      "  n = n + i",
      "end",
      "for k, v in { a = 1 } do",
      "  n = n + v",
      "end",
      "repeat",
      "  n = n - 1",
      "until n <= 0",
      "",
    ].join("\n");
    const root = chunked(text);
    const chunks = root.flowNamed("")!.arrays.chunks;
    const [whileLoop, forLoop, forIn, repeat] = chunks.slice(1).map((chunk) => ({
      code: instructionsOf(root, chunk),
      blocks: blockCount(chunk),
      loop: (blockFlags(chunk, 0) & BLOCK_LOOP) !== 0,
      passScope: (blockFlags(chunk, 0) & BLOCK_PASS_SCOPE) !== 0,
      resume: blockField(chunk, 0, B_RESUME),
      break: blockField(chunk, 0, B_BREAK),
      scopes: blockScopes(chunk, 0),
    }));
    // The test is a decision; each pass opens the body's scope, which the
    // engine closes when the body runs out; the body resumes at the test and
    // breaks past the loop. The `EndScope` after the body's `EnterBlock`
    // never runs and makes the count read in order the depth at the exit
    // (#1575).
    expect(whileLoop).toEqual({
      code: ["GetVar n", "Int 3", "Native </2", "Native TRUTHY/1", "JumpIfFalse 18 flags 2", "Newline", "BeginScope", "EnterBlock 0", "EndScope"],
      blocks: 1,
      loop: true,
      passScope: true,
      resume: 0,
      break: 18,
      scopes: 1,
    });
    // The hidden index, stop and step have the chunk's names; the body
    // resumes at the step, inside the loop's scope.
    expect(forLoop!.code.slice(0, 7)).toEqual([
      "BeginScope",
      "Int 1",
      "SetVar __forIdx$ flags 1",
      "Int 2",
      "SetVar __forStop$ flags 1",
      "Int 1",
      "SetVar __forStep$ flags 1",
    ]);
    expect(forLoop!.code.slice(-8)).toEqual([
      "SetVar i flags 1",
      "EnterBlock 0",
      "GetVar __forIdx$",
      "GetVar __forStep$",
      "Native +/2",
      "SetVar __forIdx$",
      "Jump 14",
      "EndScope",
    ]);
    expect(forLoop).toMatchObject({ blocks: 1, loop: true, passScope: false, resume: 62, break: 72, scopes: 1 });
    // The iterator is called as a value with the state and the control.
    expect(forIn!.code).toContain("CallStd __adjust_iter/3");
    expect(forIn!.code).toContain("CallValue 2");
    expect(forIn!.code.filter((op) => op.startsWith("SetVar __forIn_"))).toEqual([
      "SetVar __forIn_iter$ flags 1",
      "SetVar __forIn_state$ flags 1",
      "SetVar __forIn_ctrl$ flags 1",
      "SetVar __forIn_iter$",
      "SetVar __forIn_state$",
      "SetVar __forIn_ctrl$",
      "SetVar __forIn_ctrl$",
    ]);
    expect(forIn).toMatchObject({ blocks: 1, loop: true, passScope: false, scopes: 1 });
    // The body runs first and resumes at the test.
    expect(repeat!.code).toEqual([
      "BeginScope",
      "EnterBlock 0",
      "GetVar n",
      "Int 0",
      "Native <=/2",
      "Native not/1",
      "JumpIfFalse 18 flags 2",
      "Newline",
      "Jump 2",
      "EndScope",
    ]);
    expect(repeat).toMatchObject({ blocks: 1, loop: true, resume: 4, break: 18, scopes: 1 });
  });

  // A `break` or `continue` closes the scopes opened inside the loop's body
  // before it leaves.
  it("emits break and continue as Leave, after the scopes they close", () => {
    const text = [
      "for i = 1, 3 do",
      "  if i == 1 then",
      "    continue",
      "  end",
      "  do",
      "    break",
      "  end",
      "end",
      "",
    ].join("\n");
    const root = chunked(text);
    const loop = root.flowNamed("")!.arrays.chunks[0]!;
    const body = root.body(loop, 0)!.arrays.chunks;
    const ifBody = root.body(body[0]!, 0)!.arrays.chunks;
    const doBody = root.body(body[1]!, 0)!.arrays.chunks;
    expect(instructionsOf(root, ifBody[0]!)).toEqual(["EndScope", "Leave continue"]);
    expect(instructionsOf(root, body[1]!)).toEqual(["BeginScope", "EnterBlock 0", "EndScope"]);
    expect(instructionsOf(root, doBody[0]!)).toEqual(["EndScope", "Leave"]);
  });
});

describe("one instruction at a time", () => {
  it("Int pushes its integer", () => {
    const { before, after } = around(trace("local a = 5\n"), "Int 5");
    expect([before.stack, after.stack]).toEqual([[], ["5"]]);
    expect(after.output).toEqual([]);
  });

  it("Num pushes its number, a whole float as a float", () => {
    const steps = trace("local b = 2.5\nlocal c = 3.0\n");
    expect(around(steps, "Num 2.5 float").after.stack).toEqual(["2.5"]);
    expect(around(steps, "Num 3 float").after.stack).toEqual(["3.0"]);
  });

  it("Const pushes nil, true or false", () => {
    const steps = trace("local d = nil\nlocal e = true\nlocal f = false\n");
    expect(around(steps, "Const nil").after.stack).toEqual(["nil"]);
    expect(around(steps, "Const true").after.stack).toEqual(["true"]);
    expect(around(steps, "Const false").after.stack).toEqual(["false"]);
  });

  it("BeginString opens a capture, Out writes a value into it, and EndString pushes what it caught", () => {
    const steps = trace('local a = 5\nlocal s = "v{a}w"\n');
    expect(around(steps, "BeginString").after.output).toEqual(["<BeginString>"]);
    const out = around(steps, "Out");
    expect([out.before.stack, out.after.stack]).toEqual([["5"], []]);
    expect(out.after.output).toEqual(["<BeginString>", '"v"', '"5"']);
    const end = around(steps, "EndString");
    expect([end.after.stack, end.after.output]).toEqual([['"v5w"'], []]);
  });

  it("Out writes nothing for void", () => {
    const steps = traceHandWritten((e) => {
      e.emit(Op.Const, 0, ConstValue.Void);
      e.emit(Op.Out);
    });
    expect(steps.map((s) => [s.op, s.stack, s.output])).toEqual([
      ["Const void", ["void"], []],
      ["Out", [], []],
    ]);
  });

  it("Native pops its arguments and pushes the result", () => {
    const { before, after } = around(trace("local a = 5\nlocal f = a + 1\n"), "Native +/2");
    expect([before.stack, after.stack]).toEqual([["5", "1"], ["6"]]);
  });

  it("JumpIfKeep keeps a value that decides and jumps, and pops one that does not", () => {
    const steps = trace("local g = false or 3\nlocal h = 1 or 3\nlocal i = nil and 3\n");
    const pops = around(steps, "JumpIfKeep 8 flags 1", 0);
    expect([pops.before.stack, pops.after.stack, pops.next]).toEqual([["false"], [], "Int 3"]);
    const keeps = around(steps, "JumpIfKeep 8 flags 1", 1);
    expect([keeps.after.stack, keeps.next]).toEqual([["1"], "SetVar h flags 1"]);
    const keepsNil = around(steps, "JumpIfKeep 8");
    expect([keepsNil.after.stack, keepsNil.next]).toEqual([["nil"], "SetVar i flags 1"]);
  });

  it("JumpIfFalse pops its test and jumps when it is false; Jump jumps", () => {
    const steps = trace("local x = if false then 1 else 2\nlocal y = if true then 1 else 2\n");
    const test = around(steps, "JumpIfFalse 8 flags 1", 0);
    expect([test.before.stack, test.after.stack, test.next]).toEqual([["false"], [], "Int 2"]);
    const taken = around(steps, "JumpIfFalse 8 flags 1", 1);
    expect(taken.next).toEqual("Int 1");
    const jump = around(steps, "Jump 10");
    expect([jump.after.stack, jump.next]).toEqual([["1"], "SetVar y flags 1"]);
  });

  it("GetVar pushes a temporary's or a global's value", () => {
    const steps = trace("store g = 7\nlocal a = 5\nlocal f = a + g\n");
    expect(around(steps, "GetVar a").after.stack).toEqual(["5"]);
    expect(around(steps, "GetVar g").after.stack).toEqual(["5", "7"]);
  });

  it("SetVar declares a temporary in the innermost scope, and assigns a global through the globals", () => {
    const text = "store g = 7\nlocal a = 5\ndo\n  local b = 6\n  g = 8\nend\n";
    const story = new ProgramStory(chunked(text));
    const steps = traceSteps(story);
    expect(around(steps, "SetVar a flags 1").after.scopes).toEqual([{ a: "5" }]);
    expect(around(steps, "SetVar b flags 1").after.scopes).toEqual([{ a: "5" }, { b: "6" }]);
    const global = around(steps, "SetVar g");
    expect([global.before.stack, global.after.stack]).toEqual([["8"], []]);
    expect(global.after.scopes).toEqual([{ a: "5" }, { b: "6" }]);
    expect(story.variablesState.$("g")).toBe(8);
  });

  it("Index pops a key and a base and pushes the member", () => {
    const { before, after } = around(trace("local t = { 10, 20 }\nlocal v = t[2]\n"), "Index");
    expect([before.stack, after.stack]).toEqual([["{1=10,2=20}", "2"], ["20"]]);
  });

  it("StoreIndex pops a value, a key and a base and stores the member", () => {
    const { before, after } = around(trace("local t = { x = 1 }\nt.x = 5\n"), "StoreIndex");
    expect([before.stack, after.stack]).toEqual([['{x=1}', '"x"', "5"], []]);
    expect(after.scopes).toEqual([{ t: "{x=5}" }]);
  });

  it("MakeTable pops its pairs, a computed key's value as the key, and pushes the table", () => {
    const { before, after } = around(
      trace('local a = 5\nlocal t = { x = 1, [a + 1] = "six" }\n'),
      "MakeTable 2",
    );
    expect([before.stack, after.stack]).toEqual([
      ['"x"', "1", "6", '"six"'],
      ['{x=1,6="six"}'],
    ]);
  });

  // No construct of this slice packs a multiple value as a table's last
  // value (a call does), so the statement is written by hand.
  it("MakeTable spreads a multiple value in the last pair over the keys that follow", () => {
    const steps = traceHandWritten((e) => {
      e.emit(Op.Int, 1);
      e.emit(Op.Int, 10);
      e.emit(Op.Int, 2);
      e.emit(Op.Int, 20);
      e.emit(Op.Int, 30);
      e.emit(Op.Pack, 2);
      e.emit(Op.MakeTable, 2);
    });
    const { before, after } = around(steps, "MakeTable 2");
    expect([before.stack, after.stack]).toEqual([
      ["1", "10", "2", "(20,30)"],
      ["{1=10,2=20,3=30}"],
    ]);
  });

  it("Dup pushes the top again, and Pop pops it", () => {
    const steps = trace('store x = "b"\nmatch (x)\n| a = Ay.\n| b = Bee.\nend\n');
    const dup = around(steps, "Dup");
    expect([dup.before.stack, dup.after.stack]).toEqual([['"b"'], ['"b"', '"b"']]);
    const pop = around(steps, "Pop");
    expect([pop.before.stack, pop.after.stack]).toEqual([['"b"'], []]);
  });

  it("BeginScope opens a scope on the frame and EndScope closes it with its temporaries", () => {
    const steps = trace("local a = 1\ndo\n  local b = 2\nend\n");
    const begin = around(steps, "BeginScope");
    expect([begin.before.scopes, begin.after.scopes]).toEqual([[{ a: "1" }], [{ a: "1" }, {}]]);
    const end = around(steps, "EndScope");
    expect([end.before.scopes, end.after.scopes]).toEqual([[{ a: "1" }, { b: "2" }], [{ a: "1" }]]);
  });

  it("EnterBlock enters a body, which resumes its owner when it runs out", () => {
    const steps = trace("do\n  local b = 2\nend\n");
    const enter = around(steps, "EnterBlock 0");
    expect([enter.before.blocks, enter.after.blocks, enter.next]).toEqual([0, 1, "Int 2"]);
    // The body's last statement ran inside the block; the owner's EndScope
    // runs outside it.
    const end = around(steps, "EndScope");
    expect([end.before.blocks, end.after.blocks]).toEqual([1, 0]);
  });

  it("Leave leaves the blocks up to the loop body and resumes after the loop, or at its next pass", () => {
    const text = [
      "local n = 0",
      "for i = 1, 3 do",
      "  if i == 1 then",
      "    continue",
      "  end",
      "  n = n + i",
      "  if i == 2 then",
      "    break",
      "  end",
      "end",
      "",
    ].join("\n");
    const story = new ProgramStory(chunked(text));
    const steps = traceSteps(story);
    const again = around(steps, "Leave continue");
    expect([again.before.blocks, again.after.blocks, again.next]).toEqual([2, 0, "GetVar __forIdx$"]);
    const out = around(steps, "Leave");
    expect([out.before.blocks, out.after.blocks, out.next]).toEqual([2, 0, "EndScope"]);
    expect(steps.at(-1)!.scopes).toEqual([{ n: "2" }]);
  });
});

describe("a break from inside nested scoped blocks", () => {
  it("leaves the frame's scope depth where the loop found it", () => {
    const text = [
      "local n = 0",
      "while n < 5 do",
      "  n = n + 1",
      "  if n == 2 then",
      "    do",
      "      local inner = n",
      "      break",
      "    end",
      "  end",
      "end",
      "After {n}.",
      "",
    ].join("\n");
    const story = new ProgramStory(chunked(text));
    const steps = traceSteps(story);
    const found = around(steps, "SetVar n flags 1").after.scopes.length;
    // Inside the `while` body's pass scope, the `if` branch's scope and the
    // `do` block's.
    expect(around(steps, "SetVar inner flags 1").after.scopes).toHaveLength(found + 3);
    const leave = around(steps, "Leave");
    expect(leave.after.scopes).toHaveLength(found);
    expect(leave.after.blocks).toBe(0);
    expect(steps.at(-1)!.scopes).toEqual([{ n: "2" }]);
    expect(story.state.frame!.temporaryScopes).toHaveLength(found);
  });
});

describe("a jump and a save inside a body", () => {
  const text = [
    "scene MAIN",
    "  local a = 1",
    "  for i = 1, 3 do",
    "    local d = i * 2",
    "    if d > 2 then",
    "      Pass {i} {d} {a}.",
    "    end",
    "  end",
    "  After {a}.",
    "end",
    "",
  ].join("\n");
  // The line of `Pass`, counting from 0, whose address the game jumps to.
  const PASS_LINE = 5;
  const scopeNames = (story: ProgramStory) =>
    story.state.frame!.temporaryScopes.map((scope) => [...scope.keys()]);

  // The current engine's `ChoosePathString` resets its call stack, so a
  // flow chosen after another holds none of its temporaries.
  it("starts a jump that resets the call stack with a fresh frame", () => {
    const story = new ProgramStory(chunked(text));
    story.ChoosePathString("MAIN");
    storyBeats(story);
    expect(scopeNames(story)).toEqual([["a"]]);
    story.ChoosePathString("MAIN");
    expect(scopeNames(story)).toEqual([[]]);
  });

  // A jump to a line inside the `if` inside the loop enters both bodies,
  // with the loop's scope and the branch's open, however often it is made.
  it("opens the scopes of the bodies a jump enters, the same on every jump", () => {
    const root = chunked(text);
    const story = new ProgramStory(root);
    const pass = root.addressAt(MAIN_URI, PASS_LINE)!;
    story.ChooseAddress(pass);
    expect(story.state.blockStack).toHaveLength(2);
    expect(story.state.frame!.temporaryScopes).toHaveLength(3);
    story.ChooseAddress(pass);
    expect(story.state.blockStack).toHaveLength(2);
    expect(story.state.frame!.temporaryScopes).toHaveLength(3);
  });

  // A save inside the loop's `if` holds temporaries in three scopes and two
  // blocks; a story loaded from it shows what the saving story shows next.
  it("restores a state saved inside nested bodies, with its temporaries by scope", () => {
    const root = chunked(text);
    const whole = storyBeats(new ProgramStory(root), "MAIN").beats;
    expect(whole.map((b) => b.text)).toEqual([
      "Pass 2 4 1.\n",
      "Pass 3 6 1.\n",
      "After 1.\n",
    ]);
    const story = new ProgramStory(root);
    story.ChoosePathString("MAIN");
    story.Continue();
    expect(story.state.blockStack).toHaveLength(2);
    expect(scopeNames(story)).toEqual([["a"], ["__forIdx$", "__forStop$", "__forStep$", "i", "d"], []]);
    const saved = story.state.toJson();
    const resumed = new ProgramStory(root);
    resumed.state.LoadJson(saved);
    expect(resumed.state.toJson()).toBe(saved);
    expect(resumed.state.blockStack).toHaveLength(2);
    expect(scopeNames(resumed)).toEqual(scopeNames(story));
    expect(storyBeats(resumed).beats).toEqual(whole.slice(1));
  });

  // A `while` body runs each pass in a scope its owner opens before entering
  // it, which its block row counts, so a jump or a load into the body opens
  // it, and the pass that runs out closes it.
  const whileText = [
    "scene MAIN",
    "  local a = 1",
    "  local i = 0",
    "  while i < 3 do",
    "    i = i + 1",
    "    local d = i * 2",
    "    if d > 2 then",
    "      Pass {i} {d} {a}.",
    "    end",
    "  end",
    "  After {a} {i}.",
    "end",
    "",
  ].join("\n");
  const WHILE_PASS_LINE = 7;

  it("opens a while body's pass scope on a jump into it, the same on every jump", () => {
    const root = chunked(whileText);
    const story = new ProgramStory(root);
    const pass = root.addressAt(MAIN_URI, WHILE_PASS_LINE)!;
    story.ChooseAddress(pass);
    expect(story.state.blockStack).toHaveLength(2);
    // The flow's scope, the pass scope and the branch's.
    expect(story.state.frame!.temporaryScopes).toHaveLength(3);
    story.ChooseAddress(pass);
    expect(story.state.blockStack).toHaveLength(2);
    expect(story.state.frame!.temporaryScopes).toHaveLength(3);
  });

  it("restores a state saved inside a while body, and closes the pass scope after it", () => {
    const root = chunked(whileText);
    const whole = storyBeats(new ProgramStory(root), "MAIN").beats;
    expect(whole.map((b) => b.text)).toEqual([
      "Pass 2 4 1.\n",
      "Pass 3 6 1.\n",
      "After 1 3.\n",
    ]);
    const story = new ProgramStory(root);
    story.ChoosePathString("MAIN");
    story.Continue();
    expect(story.state.blockStack).toHaveLength(2);
    expect(scopeNames(story)).toEqual([["a", "i"], ["d"], []]);
    const saved = story.state.toJson();
    const resumed = new ProgramStory(root);
    resumed.state.LoadJson(saved);
    expect(resumed.state.toJson()).toBe(saved);
    expect(resumed.state.blockStack).toHaveLength(2);
    expect(scopeNames(resumed)).toEqual(scopeNames(story));
    expect(storyBeats(resumed).beats).toEqual(whole.slice(1));
    expect(scopeNames(resumed)).toEqual([["a", "i"]]);
  });
});

describe("a continue that returns between two lines", () => {
  // #779: the continue returns at the first line's newline without running
  // the assignment after it, and the next continue runs it once.
  it("leaves a variable assigned between them as it was until the next continue", () => {
    const root = chunked(
      "store count = 0\nFirst {count}.\ncount = count + 1\nSecond {count}.\n",
    );
    const story = new ProgramStory(root);
    // The steps the declarations took when the story was made.
    const declared = story.stepCount;
    expect(story.Continue()).toBe("First 0.\n");
    expect(story.variablesState.$("count")).toBe(0);
    expect(story.Continue()).toBe("Second 1.\n");
    expect(story.variablesState.$("count")).toBe(1);
    story.Continue();
    expect(story.canContinue).toBe(false);
    // Each instruction ran once: one step per instruction of the flow, and
    // the step that finds it over.
    const reader = new BinaryProgramReader(root);
    const instructions = root
      .flowNamed("")!
      .arrays.chunks.reduce((n, chunk) => n + [...reader.instructions(chunk)].length, 0);
    expect(story.stepCount - declared).toBe(instructions + 1);
  });

  it("consumes a verdict the route simulator forces once, on the continue that reaches the decision", () => {
    const root = chunked(
      "store flag = true\nFirst.\nif flag then\n  Yes.\nelse\n  No.\nend\nLast.\n",
    );
    const reader = new BinaryProgramReader(root);
    const conditional = root.flowNamed("")!.arrays.chunks[1]!;
    const decisions = [...reader.instructions(conditional)]
      .filter(
        ({ op, offset }) =>
          op === Op.JumpIfFalse &&
          (flagsOf(conditional[HEADER_WORDS + offset]!) & JUMP_DECISION) !== 0,
      )
      .map(({ offset }) => ProgramStory.addressOf(conditional, offset));
    expect(decisions).toHaveLength(1);
    const site = decisions[0]!;
    const simulator = buildRouteSimulator([{ kind: "condition", path: site, value: false }]);
    const story = new ProgramStory(root);
    story.simulator = simulator;
    const cursors: (number | undefined)[] = [];
    const lines: string[] = [];
    while (story.canContinue) {
      lines.push(story.Continue() ?? "");
      cursors.push(simulator.saveSnapshot().conditionPointer[site]);
    }
    // The plan takes the `else` branch although `flag` is true.
    expect(lines).toEqual(["First.\n", "No.\n", "Last.\n", ""]);
    expect(cursors).toEqual([undefined, 1, 1, 1]);
  });
});

// Each script runs from its top on both engines.
const PARITY: Record<string, string> = {
  "nested scopes that shadow a name": [
    "local n = 1",
    "do",
    "  local n = 2",
    "  if n == 2 then",
    "    local n = 3",
    "    Inner {n}.",
    "  end",
    "  Middle {n}.",
    "end",
    "Outer {n}.",
    "",
  ].join("\n"),
  "a loop that breaks from inside a nested if": [
    "local n = 0",
    "while true do",
    "  n = n + 1",
    "  if n > 2 then",
    "    if n == 3 then",
    "      break",
    "    end",
    "  end",
    "  Pass {n}.",
    "end",
    "After {n}.",
    "",
  ].join("\n"),
  // A `while` body runs each pass in a scope of its own (#1064): its locals
  // end with the pass, however the pass ends.
  "a while body's local that shadows an outer one": [
    "local x = \"outer\"",
    "local i = 0",
    "while i < 3 do",
    "  i = i + 1",
    "  local x = i",
    "  Inner {x}.",
    "end",
    "Outer {x} after {i}.",
    "",
  ].join("\n"),
  "a while body's local across a continue": [
    "local v = \"outer\"",
    "local i = 0",
    "local sum = 0",
    "while i < 5 do",
    "  i = i + 1",
    "  local v = i * 10",
    "  if v == 30 then",
    "    continue",
    "  end",
    "  sum = sum + v",
    "end",
    "Sum {sum} and {v}.",
    "",
  ].join("\n"),
  "a while body's local across a break from a nested block": [
    "local x = \"outer\"",
    "while true do",
    "  local x = \"inner\"",
    "  if x == \"inner\" then",
    "    local y = 1",
    "    break",
    "  end",
    "end",
    "After {x}.",
    "",
  ].join("\n"),
  "nested while loops that each shadow a name": [
    "local x = \"outer\"",
    "local i = 0",
    "local seen = \"\"",
    "while i < 2 do",
    "  i = i + 1",
    "  local x = \"a\" .. i",
    "  local k = 0",
    "  while k < 2 do",
    "    k = k + 1",
    "    local x = \"b\" .. k",
    "    seen = seen .. x",
    "  end",
    "  seen = seen .. x",
    "end",
    "Seen {seen} and {x}.",
    "",
  ].join("\n"),
  "a loop that continues from inside a nested if": [
    "for i = 1, 4 do",
    "  if i % 2 == 0 then",
    "    if i > 0 then",
    "      continue",
    "    end",
    "  end",
    "  Odd {i}.",
    "end",
    "local k = 0",
    "repeat",
    "  k = k + 1",
    "  if k == 2 then",
    "    continue",
    "  end",
    "  Repeat {k}.",
    "until k >= 3",
    "",
  ].join("\n"),
  "interpolation of every value type": [
    "store t = { x = 1 }",
    'Values {5} {2.5} {3.0} {"s"} {true} {false} {nil} {t.x} {1 / 0} {-0.5} {10 // 3} {2 ^ 10} {"a" .. "b"}.',
    "",
  ].join("\n"),
  "operators and coercion": [
    "local a = 7",
    "local b = 2",
    "Math {a + b} {a - b} {a * b} {a / b} {a % b} {a // b} {-a} {a ^ b}.",
    'Compare {a == b} {a ~= b} {a < b} {a <= b} {a > b} {a >= b} {"a" < "b"}.',
    'Logic {a and b} {nil or b} {not a} {false and a} {nil and a or "d"}.',
    'Strings {"n" .. a} {#"four"} {a .. b}.',
    "",
  ].join("\n"),
  "tables and properties": [
    "local t = { 10, 20, x = { y = 1 }, [2 + 1] = 30 }",
    "t.x.y = t.x.y + 1",
    't["z"] = "zed"',
    "t.x.y += 5",
    "local a, b = 1, 2",
    "a, b = b, a",
    "Table {#t} {t[3]} {t.x.y} {t.z} {a} {b}.",
    "",
  ].join("\n"),
  "globals of every kind": [
    "store count = 1",
    "store name = \"Ann\"",
    "const LIMIT = 3",
    "const DOUBLE = LIMIT * 2",
    "define hero as character with",
    '  name = "Hero"',
    "end",
    "count += LIMIT",
    "Globals {count} {name} {DOUBLE} {hero.name}.",
    "",
  ].join("\n"),
  "a generic for over a table": [
    "local total = 0",
    "for k, v in { a = 1, b = 2 } do",
    "  total = total + v",
    "end",
    "for i, v in { 5, 6 } do",
    "  Item {i} {v}.",
    "end",
    "Total {total}.",
    "",
  ].join("\n"),
  "a match with keyed and keyless arms": [
    'store x = "b"',
    "match (x)",
    "| a = Ay.",
    "| b = Bee.",
    "| other = Else.",
    "end",
    "store n = 2",
    "match (n)",
    "| 1 = Uno.",
    "| 2 = Dos.",
    "end",
    "",
  ].join("\n"),
  "a scene with logic": [
    "store visits = 0",
    "scene MAIN",
    "  visits += 1",
    "  if visits > 0 then",
    "    HERO: Visit {visits}.",
    "  end",
    "  for i = 1, 2 do",
    "    Step {i}.",
    "  end",
    "end",
    "",
  ].join("\n"),
};

describe("the engine", () => {
  for (const [name, text] of Object.entries(PARITY)) {
    it(`shows ${name} as the current engine does`, () => {
      const from = text.includes("scene MAIN") ? "MAIN" : undefined;
      const current = compileScript(text);
      current.story.ResetState();
      const expected = storyBeats(current.story, from);
      const actual = storyBeats(new ProgramStory(chunked(text)), from);
      expect(actual).toEqual(expected);
      expect(expected.beats.length).toBeGreaterThan(0);
    });
  }

  it("ends a while body's local with its pass", () => {
    const text = PARITY["a while body's local that shadows an outer one"]!;
    const { beats } = storyBeats(new ProgramStory(chunked(text)));
    expect(beats.map((beat) => beat.text)).toEqual([
      "Inner 1.\n",
      "Inner 2.\n",
      "Inner 3.\n",
      "Outer outer after 3.\n",
    ]);
  });

  // The current engine's story of a compile has no debug metadata for an
  // operator, so it names the error's place by its runtime path; the program
  // engine names the line of its line table row.
  it("raises a runtime error in an expression as the current engine does, with its line", () => {
    const text = "local z = nil\nBefore.\nlocal w = z + 1\nAfter.\n";
    const current = compileScript(text);
    current.story.ResetState();
    const expected = storyBeats(current.story);
    const actual = storyBeats(new ProgramStory(chunked(text)));
    expect(actual.beats).toEqual(expected.beats);
    expect(actual.errors).toEqual([
      "1: RUNTIME ERROR: 'main' line 3: Attempting to perform + on a nil value.",
    ]);
    expect(expected.errors.map((e) => e.replace(/\(Ink Pointer[^)]*\): /, ""))).toEqual([
      "1: RUNTIME ERROR: Attempting to perform + on a nil value.",
    ]);
  });
});

// Each construct of this slice, in a script that holds nothing the writer
// does not emit: a compile builds its chunks, and no construct is named.
const CONSTRUCTS: Record<string, string> = {
  "an expression and an operator": "local a = 1 + 2 * 3\n",
  "a comparison and a logical operator": "local a = 1 < 2 and not false or nil\n",
  "an `if` expression": "local a = if true then 1 else 2\n",
  "interpolation in display text": "local a = 1\nShown {a}.\n",
  "interpolation in a string": 'local a = 1\nlocal s = "a is {a}"\n',
  "a table with computed keys": "local t = { 1, x = 2, [1 + 2] = 3 }\n",
  "an index and a property store": "local t = { x = 1 }\nt.x = t[1]\n",
  "a local": "local a = 1\n",
  "an assignment to a temporary": "local a = 1\na = 2\n",
  "a global": "store g = 1\ng = 2\n",
  "a constant": "const C = 2\nlocal a = C\n",
  "a define": 'define hero as character with\n  name = "Hero"\nend\n',
  "a multiple assignment": "local a, b = 1, 2\na, b = b, a\n",
  "a compound assignment": "local t = { p = { q = 1 } }\nt.p.q += 1\n",
  "an `if` block": "if true then\n  A.\nelseif false then\n  B.\nelse\n  C.\nend\n",
  "a match": 'store x = 1\nmatch (x)\n| a = A.\n| other = B.\nend\n',
  "a `while` loop": "local n = 0\nwhile n < 2 do\n  n = n + 1\nend\n",
  "a numeric `for` loop": "for i = 1, 2 do\n  A {i}.\nend\n",
  "a generic `for` loop": "for k, v in { 1 } do\n  A {v}.\nend\n",
  "a `repeat` loop": "local n = 0\nrepeat\n  n = n + 1\nuntil n > 1\n",
  "a `break`": "while true do\n  break\nend\n",
  "a `continue`": "for i = 1, 2 do\n  continue\nend\n",
  "a `do` block": "do\n  local a = 1\nend\n",
};

describe("the fallback", () => {
  for (const [name, text] of Object.entries(CONSTRUCTS)) {
    it(`names no construct for ${name}`, () => {
      const { program } = compileScript(text, { programChunks: true });
      expect(program.fallback?.construct).toBeUndefined();
      expect(program.chunks).toBeDefined();
    });
  }

  // The story takes a function out of a `do` block written at the top level,
  // and leaves one in any other block, where its body runs; both are emitted
  // (programFunctions.test.ts runs them).
  it("names no construct for a function defined inside a block", () => {
    for (const text of [
      "do\n  function run()\n    return 1\n  end\nend\nHello.\n",
      "store x = true\nif x then\n  function run()\n    return 1\n  end\nend\nHello.\n",
      "while false do\n  function run()\n    return 1\n  end\nend\nHello.\n",
    ]) {
      const { program } = compileScript(text, { programChunks: true });
      expect(program.fallback?.construct).toBeUndefined();
      expect(program.chunks).toBeDefined();
    }
  });

  // A value the parser could not read is reported once by the compiler; the
  // assignment assigns nothing and the local is declared nil, so the program
  // emits the story and runs it as the current engine does (#1433).
  it.each([
    ["an assignment", "store x = 0\n& x =\nx is {x}.\n", ["x is 0.\n"]],
    ["a compound assignment", "store x = 1\n& x +=\nx is {x}.\n", ["x is 1.\n"]],
    ["a local", "local a = \nHello {a == nil}.\n", ["Hello true.\n"]],
    ["several locals", "local a, b =\nb = 2\nHello {a == nil} {b}.\n", ["Hello true 2.\n"]],
  ])("emits and runs %s the parser left without its value", (_name, text, beats) => {
    expect(storyBeats(new ProgramStory(chunked(text))).beats.map((b) => b.text)).toEqual(beats);
  });

  // `MakeTable`'s pair count is the instruction's 32-bit operand.
  it("emits a table literal of more than 65,535 pairs", () => {
    const pairs = 70_000;
    const values = Array.from({ length: pairs }, (_, i) => String(i + 1)).join(", ");
    const root = chunked(`local t = { ${values} }\nSize {#t} last {t[${pairs}]}.\n`);
    const reader = new BinaryProgramReader(root);
    const table = root.flowNamed("")!.arrays.chunks[0]!;
    const makes = [...reader.instructions(table)].filter(({ op }) => op === Op.MakeTable);
    expect(makes.map(({ offset }) => describeInstruction(table, offset, root.table))).toEqual([
      `MakeTable ${pairs}`,
    ]);
    expect(storyBeats(new ProgramStory(root)).beats.map((b) => b.text)).toEqual([
      `Size ${pairs} last ${pairs}.\n`,
    ]);
  }, 60_000);

  // An address is a chunk id times 2 ** 21 plus an offset, so a chunk of
  // that many code words would name the next chunk's instructions.
  it("names a statement too long for an address", () => {
    expect(() =>
      handWrittenProgram((e) => {
        for (let i = 0; i < 2 ** 20; i += 1) {
          e.emit(Op.Int, i);
        }
      }),
    ).toThrow("a statement longer than an address holds");
    expect(() =>
      handWrittenProgram((e) => {
        for (let i = 0; i < 2 ** 20 - 1; i += 1) {
          e.emit(Op.Int, i);
        }
      }),
    ).not.toThrow();
  }, 60_000);

  // A builtin's argument count is a 16-bit operand.
  it("names an operand wider than its field", () => {
    const args = Array.from({ length: 70_000 }, () => "1").join(", ");
    const { program } = compileScript(`local n = tonumber(${args})\n`, {
      programChunks: true,
    });
    expect(program.chunks).toBeUndefined();
    expect(program.fallback?.construct).toBe("an operand of CallStd");
  }, 60_000);
});
