// The statement memo across preview compiles (#1757; docs/engine/
// binary-program.md, What is built, The statement memo): a preview compile,
// the compile behind a highlighted suggestion, serves the statements of the
// edited block from their memos as an edit's compile does, and the memos it
// records itself, which no compile completes, never stand in for the memos a
// real compile completed. A real compile after a run of previews serves only
// memos a real compile completed.
import { describe, expect, it } from "vitest";
import { buildChunksFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { MemoStats, StatementMemoEntry } from "../../compiler/lower/statementMemo";
import { memosOf } from "../../compiler/lower/statementMemo";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
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

// A scene that ends in a `choose` block whose `then` clause holds the rest of
// the scene, 300 lines of beats, as the preview benchmark's fixture writes it.
const fixture = () => {
  const { files } = buildChunksFixture({ scenes: 2, linesPerScene: 30, thenLines: 300 });
  return {
    [MAIN_URI]: files.get("main.sd")!,
    [CHARACTERS]: files.get("scripts/characters.sd")!,
  };
};

/** The end of a line of the `then` clause, `back` lines above its `end`,
 *  that writes a beat of dialogue or action. */
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

/** The memos the statements of the main script's compiled blocks hold, those
 *  served and those lowered. */
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

/**
 * A compiler over the fixture, compiled cold, as the editor's worker is when
 * a project opens, and a preview compile of a suggestion at a position of its
 * main script, which reports the memo's counts for the update the preview
 * made (before the text is put back) and the resolver's.
 */
function session() {
  const c = programCompiler(fixture());
  let text = fixture()[MAIN_URI]!;
  let version = 1;
  let program: SparkProgram = quietly(() => c.compile().program);
  const compiler = c.compiler as SparkdownCompiler;
  // What the update a preview makes lowered and served, read as its compile
  // starts, before the text is put back.
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
    /** Previews replacing `[at, to)` with `insert`. */
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
    /** Replaces `[at, to)` with `insert` for real; does not compile. */
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

/** Where the statement starting at `at` ends: before the first line after
 *  it, other than a blank one, indented no deeper than its first line, or
 *  past that line when it closes the statement (`end`, `else`), as
 *  `programStatementMemo.test.ts` reads it. */
const statementEnd = (text: string, at: number): number => {
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  const indent = (line: string) => line.length - line.trimStart().length;
  const depth = indent(text.slice(lineStart, text.indexOf("\n", at)));
  let next = text.indexOf("\n", at) + 1;
  while (next > 0 && next < text.length) {
    const end = text.indexOf("\n", next);
    const line = text.slice(next, end < 0 ? text.length : end);
    if (line.trim() && indent(line) <= depth) {
      return /^(end|else|elseif|until)\b/.test(line.trim()) ? (end < 0 ? text.length : end) : next;
    }
    next = end + 1;
  }
  return text.length;
};

/** The first lines of the statements an update lowered that the incremental
 *  parse rebuilt none of, in `text`, the text the update made. */
const loweredOutside = (stats: MemoStats, text: string) => {
  const rebuilt = stats.rebuilt;
  const lineAt = (at: number) => text.slice(at, text.indexOf("\n", at)).trim();
  return stats.loweredAt
    .filter((at) => !rebuilt || at > rebuilt.to || statementEnd(text, at) <= rebuilt.from)
    .map(lineAt);
};

const coldOf = (text: string) =>
  quietly(() => programCompiler({ ...fixture(), [MAIN_URI]: text }).compile().program);

describe("a preview compile that follows a preview compile", () => {
  it("serves every statement of the block the parse did not rebuild, as an edit's compile does", () => {
    const s = session();
    const at = clauseLineEnd(s.text, 120);
    // The first preview after the cold compile reparses the whole block, as
    // the first edit does, so it lowers every statement of it.
    s.preview(at, " One.");
    const second = s.preview(at, " Two.");
    expect(loweredOutside(second.update, second.text)).toEqual([]);
    expect(second.update.lowered).toBeGreaterThan(0);
    expect(second.update.served).toBeGreaterThan(80);
    // As many as an edit's compile serves, the second of two edits that write
    // the same suggestions for real.
    const edits = session();
    edits.update(at, " One.");
    edits.compile();
    edits.update(at, " Two.", at + " One.".length);
    edits.compile();
    expect(second.update.served).toBe(edits.compiler.memoStats(MAIN_URI)!.served);
    expect(second.memoized).toBe(edits.compiler.programResolver!.passesLastResolve.memoized);
    // The suggestion is the statement it lowered: the parse rebuilt it.
    const rebuilt = second.update.rebuilt!;
    expect(rebuilt.from <= at && at <= rebuilt.to).toBe(true);
    // A third, with other text again, serves as many.
    const third = s.preview(at, " Three.");
    expect(loweredOutside(third.update, third.text)).toEqual([]);
    expect(third.update.served).toBe(second.update.served);
  });

  it("leaves a real compile after it serving only memos a real compile completed, and compiling what a cold compile does", () => {
    const s = session();
    const at = clauseLineEnd(s.text, 120);
    // An edit and its compile complete the memos of the whole block.
    s.update(at, " Edit.");
    s.compile();
    const completed = new Set<StatementMemoEntry>();
    for (const entry of [...memosHeld(s.compiler).served, ...memosHeld(s.compiler).lowered]) {
      if (entry.complete) completed.add(entry);
    }
    expect(completed.size).toBeGreaterThan(80);
    // Previews with different suggestion text at the same line, then at
    // another line of the block.
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
      // The memos the preview's lowering recorded.
      for (const entry of preview.memos.lowered) {
        if (!known.has(entry)) recorded.add(entry);
      }
    }
    // No memo a preview recorded was completed.
    expect(recorded.size).toBeGreaterThan(0);
    expect([...recorded].filter((entry) => entry.complete)).toEqual([]);
    // A real edit at a third line serves only memos a real compile
    // completed, and lowers only what the parse rebuilt.
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
    for (const [from, insert, to] of [
      // The `if` block's own condition, the suggestion on an owner statement.
      [bound, "17", bound + 2],
      [bound, "15", bound + 2],
      // A suggestion that writes a statement of its own after a line, and
      // one that joins two lines.
      [other, "\n    A line the suggestion adds.", other],
      [at, " ", at + 1],
    ] as const) {
      const preview = s.preview(from, insert, to);
      const cold = coldOf(preview.text);
      expect(describeRoot(preview.program.chunks!)).toEqual(describeRoot(cold.chunks!));
    }
    // A real edit at the `if` block's line.
    s.update(bound, "18", bound + 2);
    const { served } = memosHeld(s.compiler);
    expect(served.size).toBeGreaterThan(80);
    expect([...served].filter((entry) => !completed.has(entry))).toEqual([]);
    const program = s.compile();
    const cold = coldOf(s.text);
    expect(describeRoot(program.chunks!)).toEqual(describeRoot(cold.chunks!));
  });
});
