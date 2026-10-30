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

const PADDING = Array.from({ length: 10 }, (_, i) => `    local p${i} = ${i}`);

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
    const paths = recording.reads.flatMap((read) => (read.kind === "path" ? [JSON.stringify(read.path)] : []));
    expect(paths.filter((path) => path.includes("bindings") || path.includes("inScope"))).toEqual([]);
    expect(readsHold(context(100, rebound), 135, recording.reads)).toBe(true);
  });
});
