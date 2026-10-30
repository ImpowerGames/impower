// A call by name whose scope decides whether it reaches a block's local or a
// variadic function of an enclosing function (I-810) records the same reads
// when an edit above it only moves it (I-1354). What a statement's lowering
// reads through the lowering context is its memo's key and part of its
// chunk's read key (`recordLowering`, `readsKey`), so a read of where the
// local's block starts and ends, counted from the start of the document,
// would lower and emit the statement again after every edit above it that
// changes the text's length. Since I-1360 a variadic function is a local like
// any other, and the call is a call of whichever local of the name is in
// scope where it runs, so its lowering asks no local where it is in scope
// (I-1434).
import { describe, expect, it } from "vitest";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { CompiledBlock } from "../../compiler/classes/annotators/CompilationAnnotator";
import { resolveCallableBinding, scopeDeclaredLocals } from "../../compiler/lower/expression/bindings";
import { readsHold, recordLowering } from "../../compiler/lower/recordingContext";
import type { StatementShape } from "../../compiler/lower/utils/statementShape";
import { ProgramStory } from "../../program/ProgramStory";
import { describeRoot, MAIN_URI, programCompiler, programSession, storyBeats } from "./programHarness";

const quietly = <T>(run: () => T): T => {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

// Statements between the edits and the call, so that the incremental parse
// rebuilds none of the call's lines.
const PADDING = Array.from({ length: 10 }, (_, i) => `    local p${i} = ${i}`);

// `foo(n, ...)` returns `n` plus the count of its further arguments, so
// `foo(1, 2)` is 2; the local function of its name that hides it in its
// block returns 100.
const script = (block: string) =>
  [
    "function run()",
    '  function foo(n, ...) return n + select("#", ...) end',
    "  local function g()",
    "    local x = 1",
    `    ${block}`,
    ...PADDING,
    "    return foo(1, 2)",
    "  end",
    "  return g()",
    "end",
    "scene start",
    "  Got {run()}.",
    "end",
    "",
  ].join("\n");

const BLOCK = "do local function foo(u) return u * 100 end end";
const UNBLOCKED = "local function foo(u) return u * 100 end";

type Session = ReturnType<typeof programSession>;

/** What the lowering of the call's statement recorded of the context, as
 *  its memo and its chunk's read key hold it. */
const callReads = (compiler: SparkdownCompiler): string | undefined => {
  const found: StatementShape[] = [];
  const document = compiler.documents.get(MAIN_URI)!;
  const visit = (shape: StatementShape, base: number) => {
    if (document.getText().slice(base + shape.from, base + shape.to).trim() === "return foo(1, 2)") {
      found.push(shape);
    }
    for (const body of shape.bodies) {
      for (const nested of body.statements) visit(nested, base);
    }
  };
  const cur = compiler.documents.annotations(MAIN_URI).compilations.iter();
  while (cur.value) {
    const block = cur.value.type as CompiledBlock;
    if (block.statement) visit(block.statement, cur.from);
    cur.next();
  }
  expect(found, "one statement holds the call").toHaveLength(1);
  const recorded = found[0]!.reads.recorded;
  expect(recorded, "the call's lowering was recorded").toBeDefined();
  return recorded;
};

/** What the program shows, and the errors it reports. */
const shown = (s: Session): string[] => {
  const { beats, errors } = storyBeats(new ProgramStory(s.program.chunks!));
  return [beats.map((beat) => beat.text.trim()).join(" "), ...errors];
};

const sameAsCold = (s: Session) => {
  const cold = quietly(() => programCompiler({ [MAIN_URI]: s.text }).compile().program);
  expect(describeRoot(s.program.chunks!)).toEqual(describeRoot(cold.chunks!));
};

describe("a call whose scope decides between a block's local and a variadic function (I-1354)", () => {
  it.each([
    ["to one of the same length", "local x = 2"],
    ["to a longer one", "local x = 1000"],
  ])("records the same reads when an initializer above it changes %s", (_, edit) => {
    const s = programSession(script(BLOCK));
    const before = callReads(s.compiler);
    s.edit("local x = 1", edit);
    expect(callReads(s.compiler)).toBe(before);
    sameAsCold(s);
    expect(shown(s)).toEqual(["Got 2."]);
  });

  // Since I-1360 the variadic function is a local of `run` too, which `g`
  // captures, so the call is a call of whichever `foo` is in scope where it
  // runs, by name, either way: it records the same reads, and an incremental
  // compile still gives what a cold one does.
  it.each([
    ["out of its block, so the call reaches it", BLOCK, UNBLOCKED, "100"],
    ["into a block, so the call reaches the function", UNBLOCKED, BLOCK, "2"],
  ])("records the same reads when an edit moves the local %s", (_, from, to, result) => {
    const s = programSession(script(from));
    const before = callReads(s.compiler);
    s.edit(from, to);
    expect(callReads(s.compiler)).toBe(before);
    sameAsCold(s);
    expect(shown(s)).toEqual([`Got ${result}.`]);
  });
});

describe("the recorded scope of a call by name (I-1354)", () => {
  // The function lowering around the call declares `foo` in a block that
  // spans [10, 30], from 20; the call is written in the statement that
  // starts at 35, past the block. The enclosing function's frame holds a
  // rebind of `foo` when `rebound` is set (`recordRebind`).
  const context = (shift: number, rebound = false) => {
    const frame = new Set(["foo"]);
    scopeDeclaredLocals(
      frame,
      [{ name: "foo", isConst: false, from: 20 + shift, blockFrom: 10 + shift, blockTo: 30 + shift }],
      new Set(),
    );
    const siblings = new Map(rebound ? [["foo", { rebound: true }]] : []);
    return {
      declaredLocalsStack: [new Set<string>(), frame],
      siblingSubFlowNamesStack: [siblings, new Map()],
      read: () => "",
      lineNumber: () => 0,
      characterNumber: () => 0,
    } as never;
  };
  const record = (ctx: never, from: number) => {
    const { ctx: recorded, finish } = recordLowering(ctx, from, from + 20);
    const binding = resolveCallableBinding("foo", recorded);
    return { binding, recording: finish() };
  };

  it.each([
    ["a local of the name", false],
    ["a local and a rebind of the name", true],
  ])("records no read of where a name is in scope with %s", (_, rebound) => {
    const { binding, recording } = record(context(0, rebound), 35);
    expect(binding).toBe("local");
    expect(recording.unkeyable).toBeNull();
    // Nothing asked the frame where its names are in scope, so the reads
    // hold wherever the block is.
    const paths = recording.reads.flatMap((read) => (read.kind === "path" ? [JSON.stringify(read.path)] : []));
    expect(paths.filter((path) => path.includes("bindings") || path.includes("inScope"))).toEqual([]);
    expect(readsHold(context(100, rebound), 135, recording.reads)).toBe(true);
  });
});
