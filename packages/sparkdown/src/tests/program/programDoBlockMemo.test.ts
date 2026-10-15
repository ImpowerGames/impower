// A `do` block served from its statement memo reports what the statements of
// its body reported (#1846). A `do` block's lowering places its body's
// statements beside its scope markers rather than inside an object of its
// own, so the block's memo used to be completed with none of its body's
// resolution diagnostics; once the block was served whole from that memo, an
// incremental compile lost them, and the typechecker's `Unknown global`
// warnings, which those diagnostics suppress, appeared in their place. Each
// case edits a statement of the function elsewhere twice, so the second
// compile serves the block from the memo the first completed, and compares
// the diagnostics after every edit with a cold compile's.
import { describe, expect, it } from "vitest";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { memosOf } from "../../compiler/lower/statementMemo";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { MAIN_URI, programCompiler } from "./programHarness";

function quiet<T>(fn: () => T): T {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

function posAt(text: string, offset: number) {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
}

const diagnosticsOf = (program: SparkProgram): string[] =>
  Object.values(program.diagnostics ?? {})
    .flat()
    .map((d) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      return `${d.range.start.line}:${d.range.start.character} ${message}`;
    })
    .sort();

/** Whether a compiled block of the main script holds a block statement
 *  served whole from its memo. */
const servesABlockStatement = (compiler: SparkdownCompiler): boolean => {
  const iter = (compiler as any).documents.annotations(MAIN_URI).compilations.iter();
  while (iter.value) {
    if (memosOf(iter.value.type.statement).served.some((shape) => !!shape.memo?.owner)) {
      return true;
    }
    iter.next();
  }
  return false;
};

// A comment line long enough that the incremental parse restarts inside the
// function rather than reparsing it whole.
const PAD = `// ${"a".repeat(140)}\n`;
const FILL = Array.from({ length: 6 }, (_, i) => `  local f${i} = ${i}`).join("\n");
const script = (block: string) =>
  `${PAD}function reckon()\n${FILL}\n${block}\n    t.a = t.a + i\n  end\n  local y = 1\nend\n`;

// Edits elsewhere in the function, the second of which serves the block.
const ELSEWHERE: [string, string][] = [
  ["local f5 = 5", "local f5 = 6"],
  ["local f5 = 6", "local f5 = 7"],
];

/** Compiles `start`, then makes each edit, replacing the first `find` with
 *  `replace`, and compiles again, comparing the diagnostics after every edit
 *  with a cold compile's. Returns whether the last compile served a block
 *  statement from its memo, and its diagnostics. */
function replay(start: string, edits: [string, string][]) {
  return quiet(() => {
    const incremental = programCompiler({ [MAIN_URI]: start });
    incremental.compile();
    let text = start;
    let version = 2;
    let diagnostics: string[] = [];
    for (const [i, [find, replace]] of edits.entries()) {
      const from = text.indexOf(find);
      expect(from, `"${find}" is in the document`).toBeGreaterThanOrEqual(0);
      const to = from + find.length;
      incremental.compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version: version++ },
        contentChanges: [{ range: { start: posAt(text, from), end: posAt(text, to) }, text: replace }],
      });
      text = text.slice(0, from) + replace + text.slice(to);
      diagnostics = diagnosticsOf(incremental.compile().program);
      const cold = diagnosticsOf(programCompiler({ [MAIN_URI]: text }).compile().program);
      expect(diagnostics, `after edit ${i + 1}`).toEqual(cold);
    }
    return { served: servesABlockStatement(incremental.compiler), diagnostics };
  });
}

// The body statement's resolution diagnostics, on line 9 of every script.
const BODY_DIAGNOSTICS = [
  "9:10 Cannot find item or path named `t.a`",
  "9:16 Cannot find variable named `i`",
  "9:4 Cannot find variable named `t`",
];

describe("a do block served from its memo reports its body's diagnostics (#1846)", () => {
  it("under a broken `for` header, which reads as a do block", () => {
    const { served, diagnostics } = replay(script(" 1, 2 do"), ELSEWHERE);
    expect(served, "the last compile serves the block from its memo").toBe(true);
    expect(diagnostics).toEqual(expect.arrayContaining(BODY_DIAGNOSTICS));
    expect(diagnostics.filter((d) => d.includes("Unknown global"))).toEqual([]);
  });

  it("under a `for` header an edit breaks", () => {
    const { served, diagnostics } = replay(script("  for k = 1, 2 do"), [["  for k =", " "], ...ELSEWHERE]);
    expect(served, "the last compile serves the block from its memo").toBe(true);
    expect(diagnostics).toEqual(expect.arrayContaining(BODY_DIAGNOSTICS));
    expect(diagnostics.filter((d) => d.includes("Unknown global"))).toEqual([]);
  });

  it("as a plain do block", () => {
    const { served, diagnostics } = replay(script("  do"), [...ELSEWHERE, ["local f0 = 0", "local f0 = 1"]]);
    expect(served, "the last compile serves the block from its memo").toBe(true);
    expect(diagnostics).toEqual(expect.arrayContaining(BODY_DIAGNOSTICS));
    expect(diagnostics.filter((d) => d.includes("Unknown global"))).toEqual([]);
  });
});
