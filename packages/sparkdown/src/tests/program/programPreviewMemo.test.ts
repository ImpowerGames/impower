import { describe, expect, it } from "vitest";
import { buildChunksFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { MemoStats, StatementMemoEntry } from "../../compiler/lower/statementMemo";
import { memosOf } from "../../compiler/lower/statementMemo";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { loweredOutsideRebuilt as loweredOutside } from "./memoLowering";
import { describeRoot, MAIN_URI, programCompiler } from "./programHarness";

const CHARACTERS = "inmemory:///scripts/characters.sd";

function posAt(text: string, offset: number) {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
}

const quietly = <T>(run: () => T): T => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

const fixture = () => {
  const { files } = buildChunksFixture({ scenes: 2, linesPerScene: 30, thenLines: 300 });
  return {
    [MAIN_URI]: files.get("main.sd")!,
    [CHARACTERS]: files.get("scripts/characters.sd")!,
  };
};

const clauseLineEnd = (text: string, back: number): number => {
  const lines = text.split("\n");
  const end = lines.lastIndexOf("  end");
  for (let at = end - back; at > 0; at -= 1) {
    const line = lines[at]!;
    if (/^ {6}\S/.test(line) && !/[{&\[]/.test(line)) {
      return lines.slice(0, at + 1).join("\n").length;
    }
  }
  throw new Error("No beat in the clause");
};

const memosHeld = (compiler: SparkdownCompiler) => {
  const served = new Set<StatementMemoEntry>();
  const lowered = new Set<StatementMemoEntry>();
  const iter = (compiler as any).documents.annotations(MAIN_URI).compilations.iter();
  while (iter.value) {
    const held = memosOf(iter.value.type.statement);
    for (const shape of held.served) served.add(shape.memo!);
    for (const shape of held.lowered) lowered.add(shape.memo!);
    iter.next();
  }
  return { served, lowered };
};

function session() {
  const c = programCompiler(fixture());
  let text = fixture()[MAIN_URI]!;
  let version = 1;
  let program: SparkProgram = quietly(() => c.compile().program);
  const compiler = c.compiler as SparkdownCompiler;
  let previewUpdate: MemoStats | undefined;
  let previewMemos: ReturnType<typeof memosHeld> | undefined;
  const compileStory = (compiler as any).compileStory;
  (compiler as any).compileStory = function (...args: unknown[]) {
    if ((compiler as any)._previewing) {
      previewUpdate = { ...compiler.memoStats(MAIN_URI)! };
      previewMemos = memosHeld(compiler);
    }
    return compileStory.apply(this, args);
  };
  return {
    compiler,
    get text() {
      return text;
    },
    get program() {
      return program;
    },
    preview(at: number, insert: string, to = at) {
      previewUpdate = undefined;
      const result = quietly(() =>
        compiler.previewCompile({
          root: { uri: MAIN_URI },
          textDocument: { uri: MAIN_URI, version },
          contentChanges: [{ range: { start: posAt(text, at), end: posAt(text, to) }, text: insert }],
        } as never),
      );
      expect(result.outdated ?? false).toBe(false);
      return {
        program: result.program as SparkProgram,
        update: previewUpdate!,
        memos: previewMemos!,
        memoized: compiler.programResolver!.passesLastResolve.memoized,
        text: text.slice(0, at) + insert + text.slice(to),
      };
    },
    update(at: number, insert: string, to = at) {
      version += 1;
      compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version },
        contentChanges: [{ range: { start: posAt(text, at), end: posAt(text, to) }, text: insert }],
      });
      text = text.slice(0, at) + insert + text.slice(to);
    },
    compile() {
      program = quietly(() => c.compile().program);
      return program;
    },
  };
}

const coldOf = (text: string) =>
  quietly(() => programCompiler({ ...fixture(), [MAIN_URI]: text }).compile().program);

describe("a preview compile that follows a preview compile", () => {
  it("serves every statement of the block the parse did not rebuild, as an edit's compile does", () => {
    const s = session();
    const at = clauseLineEnd(s.text, 120);
    s.preview(at, " One.");
    const second = s.preview(at, " Two.");
    expect(loweredOutside(second.update, second.text)).toEqual([]);
    expect(second.update.lowered).toBeGreaterThan(0);
    expect(second.update.served).toBeGreaterThan(80);
    const edits = session();
    edits.update(at, " One.");
    edits.compile();
    edits.update(at, " Two.", at + " One.".length);
    edits.compile();
    expect(second.update.served).toBe(edits.compiler.memoStats(MAIN_URI)!.served);
    expect(second.memoized).toBe(edits.compiler.programResolver!.passesLastResolve.memoized);
    const rebuilt = second.update.rebuilt!;
    expect(rebuilt.from <= at && at <= rebuilt.to).toBe(true);
    const third = s.preview(at, " Three.");
    expect(loweredOutside(third.update, third.text)).toEqual([]);
    expect(third.update.served).toBe(second.update.served);
  });

  it("leaves a real compile after it serving only memos a real compile completed, and compiling what a cold compile does", () => {
    const s = session();
    const at = clauseLineEnd(s.text, 120);
    s.update(at, " Edit.");
    s.compile();
    const completed = new Set<StatementMemoEntry>();
    for (const entry of [...memosHeld(s.compiler).served, ...memosHeld(s.compiler).lowered]) {
      if (entry.complete) completed.add(entry);
    }
    expect(completed.size).toBeGreaterThan(80);
    const recorded = new Set<StatementMemoEntry>();
    const other = clauseLineEnd(s.text, 40);
    for (const [where, insert] of [
      [at, " One."],
      [at, " Two."],
      [other, " Three."],
      [at, " Four."],
    ] as const) {
      const before = memosHeld(s.compiler);
      const known = new Set([...before.served, ...before.lowered]);
      const preview = s.preview(where, insert);
      expect(loweredOutside(preview.update, preview.text)).toEqual([]);
      expect(preview.update.served).toBeGreaterThan(80);
      for (const entry of preview.memos.lowered) {
        if (!known.has(entry)) recorded.add(entry);
      }
    }
    expect(recorded.size).toBeGreaterThan(0);
    expect([...recorded].filter((entry) => entry.complete)).toEqual([]);
    const third = clauseLineEnd(s.text, 200);
    s.update(third, " Real.");
    const stats = s.compiler.memoStats(MAIN_URI)!;
    expect(loweredOutside(stats, s.text)).toEqual([]);
    const { served } = memosHeld(s.compiler);
    expect(served.size).toBeGreaterThan(80);
    expect([...served].filter((entry) => !completed.has(entry))).toEqual([]);
    const program = s.compile();
    const cold = coldOf(s.text);
    expect(describeRoot(program.chunks!)).toEqual(describeRoot(cold.chunks!));
  });

  it("that changes a block statement's own line or the statements' shape compiles as a cold compile does, and so does the real compile after it", () => {
    const s = session();
    const at = clauseLineEnd(s.text, 120);
    s.update(at, " Edit.");
    s.compile();
    const completed = new Set<StatementMemoEntry>();
    for (const entry of [...memosHeld(s.compiler).served, ...memosHeld(s.compiler).lowered]) {
      if (entry.complete) completed.add(entry);
    }
    const condition = s.text.indexOf("    if trust > 16 then");
    expect(condition).toBeGreaterThan(0);
    const bound = condition + "    if trust > ".length;
    const other = clauseLineEnd(s.text, 40);
    const pair = "and the heat at {heat}.\n\n    The lamp gutters, then steadies.";
    const join = s.text.lastIndexOf(pair) + "and the heat at {heat}.".length;
    expect(join).toBeGreaterThan(s.text.lastIndexOf("\n  end", at));
    const statements = (text: string) => text.split("\n").filter((line) => line.trim()).length;
    for (const [from, insert, to, added] of [
      [bound, "17", bound + 2, 0],
      [bound, "15", bound + 2, 0],
      [other, "\n    A line the suggestion adds.", other, 1],
      [join, " ", join + "\n\n    ".length, -1],
    ] as const) {
      const preview = s.preview(from, insert, to);
      expect(preview.text).not.toBe(s.text);
      expect(statements(preview.text) - statements(s.text)).toBe(added);
      const cold = coldOf(preview.text);
      expect(describeRoot(preview.program.chunks!)).toEqual(describeRoot(cold.chunks!));
    }
    s.update(bound, "18", bound + 2);
    const { served } = memosHeld(s.compiler);
    expect(served.size).toBeGreaterThan(80);
    expect([...served].filter((entry) => !completed.has(entry))).toEqual([]);
    const program = s.compile();
    const cold = coldOf(s.text);
    expect(describeRoot(program.chunks!)).toEqual(describeRoot(cold.chunks!));
  });
});
