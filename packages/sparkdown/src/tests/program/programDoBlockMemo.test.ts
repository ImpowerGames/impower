import { describe, expect, it } from "vitest";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { memosOf } from "../../compiler/lower/statementMemo";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { MAIN_URI, programCompiler, programSession } from "./programHarness";

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

const diagnosticsOf = (program: SparkProgram): string[] =>
  Object.values(program.diagnostics ?? {})
    .flat()
    .map((d) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      return `${d.range.start.line}:${d.range.start.character} ${message}`;
    })
    .sort();

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

const PAD = `// ${"a".repeat(140)}\n`;
const FILL = Array.from({ length: 6 }, (_, i) => `  local f${i} = ${i}`).join("\n");
const script = (block: string) =>
  `${PAD}function reckon()\n${FILL}\n${block}\n    t.a = t.a + i\n  end\n  local y = 1\nend\n`;

const ELSEWHERE: [string, string][] = [
  ["local f5 = 5", "local f5 = 6"],
  ["local f5 = 6", "local f5 = 7"],
];

function replay(start: string, edits: [string, string][]) {
  const session = programSession(start);
  let diagnostics: string[] = [];
  for (const [i, [find, replace]] of edits.entries()) {
    session.edit(find, replace);
    diagnostics = diagnosticsOf(session.program);
    const cold = quiet(() => diagnosticsOf(programCompiler({ [MAIN_URI]: session.text }).compile().program));
    expect(diagnostics, `after edit ${i + 1}`).toEqual(cold);
  }
  return { served: servesABlockStatement(session.compiler), diagnostics };
}

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

  it("and drops them once a name its body reads is declared", () => {
    const { diagnostics } = replay(script(" 1, 2 do"), [...ELSEWHERE, ["function reckon()", "store i = 1\nfunction reckon()"]]);
    expect(diagnostics.filter((d) => d.includes("`i`"))).toEqual([]);
  });

  it("as a plain do block", () => {
    const { served, diagnostics } = replay(script("  do"), [...ELSEWHERE, ["local f0 = 0", "local f0 = 1"]]);
    expect(served, "the last compile serves the block from its memo").toBe(true);
    expect(diagnostics).toEqual(expect.arrayContaining(BODY_DIAGNOSTICS));
    expect(diagnostics.filter((d) => d.includes("Unknown global"))).toEqual([]);
  });
});
