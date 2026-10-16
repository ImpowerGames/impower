// #1614's string case (the #1590 sweep's capture screenplay, seed 7): a line
// that starts with `#x` (a `#` run that is not a tag) after `t("end`. The
// line's rules ended at such a run where they began, so nothing matched the
// line's start and the tokenizer went through its empty-match backstop,
// which left zero-width nodes in the tree. An edit two lines below restarted
// the incremental parse at that line and kept the old parse's zero-width
// nodes beside its own, so the incremental tree held them twice. Each edit
// here goes through one compiler and is compared with a cold compile of the
// same text: the parse tree, the program's chunks by content and its
// diagnostics, with no backstop warning from either parse.
import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { describe, expect, it } from "vitest";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { describeRoot, MAIN_URI, programCompiler } from "./programHarness";

/** Runs `fn` with console output held back, returning its result and the
 *  warnings it logged. */
function quiet<T>(fn: () => T): { result: T; warnings: string[] } {
  const { warn, error } = console;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  console.error = () => {};
  try {
    return { result: fn(), warnings };
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

function posAt(text: string, offset: number) {
  const before = text.slice(0, offset);
  const line = before.split("\n").length - 1;
  return { line, character: offset - (before.lastIndexOf("\n") + 1) };
}

function offsetAt(text: string, line: number, character: number) {
  let offset = 0;
  for (let i = 0; i < line; i++) {
    offset = text.indexOf("\n", offset) + 1;
  }
  return offset + character;
}

const loops = (warnings: string[]) => warnings.filter((w) => /Possible infinite loop/.test(w));

/** Every node of the document's tree as `name from-to`, in tree order. */
function treeNodes(compiler: SparkdownCompiler): string[] {
  const nodes: string[] = [];
  compiler.documents.tree(MAIN_URI)!.iterate({
    enter(node) {
      nodes.push(`${node.name} ${node.from}-${node.to}`);
    },
  });
  return nodes;
}

/** What an incremental and a cold compile of the same text must agree on. */
const surface = (compiler: SparkdownCompiler, program: SparkProgram) => ({
  tree: treeNodes(compiler),
  chunks: program.chunks ? describeRoot(program.chunks) : null,
  diagnostics: Object.values(program.diagnostics ?? {})
    .flat()
    .map((d) => {
      const { start, end } = d.range;
      const message = typeof d.message === "string" ? d.message : d.message.value;
      return `sev${d.severity} ${start.line}:${start.character}-${end.line}:${end.character} ${message}`;
    })
    .sort(),
});

/** Compiles `start`, inserts `insert` at `line`:`character` through
 *  `updateDocument` and compiles again, beside a cold compile of the edited
 *  text. */
function editAndCompile(start: string, line: number, character: number, insert: string) {
  const incremental = quiet(() => {
    const compiler = programCompiler({ [MAIN_URI]: start });
    compiler.compile();
    const at = offsetAt(start, line, character);
    compiler.compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [{ range: { start: posAt(start, at), end: posAt(start, at) }, text: insert }],
    });
    const program = compiler.compile().program;
    const cached: any = compiler.compiler.documents.tree(MAIN_URI)?.prop(cachedCompilerProp as any);
    return {
      text: start.slice(0, at) + insert + start.slice(at),
      surface: surface(compiler.compiler, program),
      chunks: program.chunks,
      restart: (cached?.reparsedFrom ?? null) as number | null,
    };
  });
  const cold = quiet(() => {
    const compiler = programCompiler({ [MAIN_URI]: incremental.result.text });
    const program = compiler.compile().program;
    return { surface: surface(compiler.compiler, program), chunks: program.chunks };
  });
  return { incremental, cold };
}

describe("#1614: an edit below a `#x` line after an unterminated string", () => {
  const START = [
    "  end",
    "  return fend",
    "ctxal(...)",
    "    returnreturn",
    "    loclocal al base = 0",
    "  base",
    "    local step = 3",
    't("end',
    '#", .. .)',
    "    local step = 3",
  ].join("\n");

  it("compiles as a cold compile does, restarting the parse partway through", () => {
    const { incremental, cold } = editAndCompile(START, 9, 14, "local ");
    expect(incremental.result.chunks, "the incremental compile builds chunks").toBeTruthy();
    expect(cold.result.chunks, "the cold compile builds chunks").toBeTruthy();
    expect(incremental.result.restart, "the edit restarts the parse partway through").toBeGreaterThan(0);
    expect(incremental.result.surface).toEqual(cold.result.surface);
  });

  it("reaches the `#x` line through no empty-match backstop, cold or incremental", () => {
    const { incremental, cold } = editAndCompile(START, 9, 14, "local ");
    expect(loops(incremental.warnings)).toEqual([]);
    expect(loops(cold.warnings)).toEqual([]);
  });
});
