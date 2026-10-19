// A preview compile's root shares with the real root, by identity, every
// chunk and every array it did not change, and leaves the real root's arrays
// as they were; and a body an edit removed has no row in the root it leaves.
//
// The helpers are in ./incrementalOracleHarness; the oracle's shape is set
// out there. Each top-level describe of the former programIncrementalOracles
// test file runs from a file of its own (#1932).
import { describe, expect, it } from "vitest";
import type { ProgramRoot, SequenceRow } from "../../program/ProgramRoot";
import {
  B_SEQUENCE,
  blockCount,
  blockField,
  type ProgramChunk,
} from "../../program/ProgramChunk";
import { describeRoot, MAIN_URI, programCompiler, rootChunks } from "./programHarness";
import { CONFIG, preview, quiet, stable, update } from "./incrementalOracleHarness";

// A scene whose `choose` has a `then` clause holding an `if` with a body of
// three lines, statements before and after the `if`, and a statement of the
// scene after the `choose`; then a second scene.
const SHARING = [
  "store gold = 0",
  "",
  "scene FIRST",
  "  Opening line.",
  "  choose",
  "    * Take the coin",
  "      You take it.",
  "    * Leave it",
  "      You leave it.",
  "  then",
  "    You stand in the hall.",
  "    You look around.",
  "    if gold < 3 then",
  "      The hall is bright.",
  "      & gold = gold + 1",
  "      It glitters.",
  "    end",
  "    You walk on.",
  "    The door closes.",
  "  end",
  "  After the choice.",
  "  -> SECOND",
  "end",
  "",
  "scene SECOND",
  "  The second scene.",
  "  done",
  "end",
  "",
].join("\n");

const INSERTED = "    A new line in the clause.\n";
const AT_INSERT = "    You look around.\n";
const IF_LINES = "    if gold < 3 then\n      The hall is bright.\n      & gold = gold + 1\n      It glitters.\n    end\n";

/** The scene's `choose` chunk, its `then` clause (the body that holds a
 *  block statement), the `if` chunk in it and the sequence ids of the `if`'s
 *  bodies. */
function sharingParts(root: ProgramRoot) {
  const scene = root.flowNamed("FIRST")!;
  const choose = scene.arrays.chunks.find((chunk) => blockCount(chunk) > 0)!;
  let clause: SequenceRow | undefined;
  for (let k = 0; k < blockCount(choose); k++) {
    const body = root.body(choose, k);
    if (body?.arrays.chunks.some((chunk) => blockCount(chunk) > 0)) clause = body;
  }
  const ifChunk = clause?.arrays.chunks.find((chunk) => blockCount(chunk) > 0);
  const ifBodies = ifChunk
    ? Array.from({ length: blockCount(ifChunk) }, (_, k) => blockField(ifChunk, k, B_SEQUENCE))
    : [];
  return { scene, choose, clause, ifChunk, ifBodies };
}

const rowName = (root: ProgramRoot, row: SequenceRow) =>
  `${row.id}(${row.flow >= 0 ? JSON.stringify(root.table.symbols[row.flow]) : "declarations"} owner ${row.owner} block ${row.block})`;

/** Every array of a root, with a copy of its contents. */
function snapshot(root: ProgramRoot) {
  return [...root.sequences()].map((row) => ({
    row,
    arrays: row.arrays,
    chunks: row.arrays.chunks,
    lineStarts: row.arrays.lineStarts,
    chunkCopy: [...row.arrays.chunks],
    startsCopy: [...row.arrays.lineStarts],
    words: row.arrays.chunks.map((chunk: ProgramChunk) => chunk.join(",")),
  }));
}

/** How `root` no longer holds what `snap` took of it. */
function changedSince(root: ProgramRoot, snap: ReturnType<typeof snapshot>): string[] {
  const out: string[] = [];
  for (const s of snap) {
    const name = rowName(root, s.row);
    if (root.sequence(s.row.id) !== s.row) out.push(`${name}: row replaced`);
    if (s.row.arrays !== s.arrays) out.push(`${name}: arrays replaced`);
    if (s.arrays.chunks !== s.chunks) out.push(`${name}: chunks array replaced`);
    if (s.arrays.lineStarts !== s.lineStarts) out.push(`${name}: line starts replaced`);
    if (s.chunks.length !== s.chunkCopy.length || s.chunks.some((chunk, i) => chunk !== s.chunkCopy[i])) {
      out.push(`${name}: chunks array edited`);
    }
    if (stable(s.lineStarts) !== stable(s.startsCopy)) out.push(`${name}: line starts edited`);
    if (s.chunks.some((chunk, i) => chunk.join(",") !== s.words[i])) out.push(`${name}: a chunk's words edited`);
  }
  return out;
}

/** How `next`, built from `previous` by inserting a line into the `then`
 *  clause above the `if`, fails to share with it: every chunk but the one
 *  emitted, the chunks array of every sequence but the clause's, the line
 *  starts of every sequence but the clause's and the scene's (which holds
 *  statements below the `choose`), and the rows of the `if`'s bodies. */
function sharingProblems(previous: ProgramRoot, next: ProgramRoot): string[] {
  const out: string[] = [];
  const before = sharingParts(previous);
  const after = sharingParts(next);
  if (!before.clause || !after.clause) return ["no then clause holding a block statement"];
  if (after.clause.id !== before.clause.id) out.push("the clause has another sequence id");
  if (after.scene.id !== before.scene.id) out.push("the scene has another sequence id");
  const held = new Set(rootChunks(previous));
  const fresh = rootChunks(next).filter((chunk) => !held.has(chunk));
  if (fresh.length !== 1) out.push(`${fresh.length} chunks the previous root does not hold, not 1`);
  const enclosing = new Set([before.scene.id]);
  for (const row of previous.sequences()) {
    const now = next.sequence(row.id);
    const name = rowName(previous, row);
    if (!now) {
      out.push(`${name}: no row`);
      continue;
    }
    if (row.id === before.clause.id) {
      if (now.arrays.chunks === row.arrays.chunks) out.push(`${name}: the clause's chunks array is shared`);
      if (now.arrays.lineStarts === row.arrays.lineStarts) out.push(`${name}: the clause's line starts are shared`);
      continue;
    }
    if (now.arrays.chunks !== row.arrays.chunks) out.push(`${name}: chunks array not shared`);
    if (enclosing.has(row.id)) {
      if (now.arrays.lineStarts === row.arrays.lineStarts) out.push(`${name}: the scene's line starts are shared`);
    } else if (now.arrays.lineStarts !== row.arrays.lineStarts) {
      out.push(`${name}: line starts not shared`);
    }
  }
  const rows = (root: ProgramRoot) => [...root.sequences()].length;
  if (rows(next) !== rows(previous)) out.push(`${rows(next)} rows, not ${rows(previous)}`);
  if (stable(after.ifBodies) !== stable(before.ifBodies)) out.push("the if's bodies have other ids");
  for (const id of before.ifBodies) {
    if (next.sequence(id) !== previous.sequence(id)) out.push(`the if's body ${id}: row not shared`);
  }
  return out;
}

describe("a preview compile's root", () => {
  const coldRoot = (text: string) =>
    quiet(() => programCompiler({ [MAIN_URI]: text }, CONFIG).compile().program.chunks!);

  it("shares with the real root every chunk and array it did not change, and leaves the real root as it was", () => {
    quiet(() => {
      const c = programCompiler({ [MAIN_URI]: SHARING }, CONFIG);
      const first = c.compile().program;
      expect(first.chunks).toBeDefined();
      const real = first.chunks!;
      const store = c.compiler.chunkStore!;
      expect(store.current === real, "the compile's root is current").toBe(true);
      const parts = sharingParts(real);
      expect(parts.clause, "a then clause holding the if").toBeDefined();
      expect(parts.ifBodies.length).toBeGreaterThan(0);
      for (const id of parts.ifBodies) {
        expect(real.sequence(id), `the if's body ${id}`).toBeDefined();
      }
      const snap = snapshot(real);

      // Insert a line of dialogue into the clause above the `if`.
      const at = SHARING.indexOf(AT_INSERT);
      const inserted = SHARING.slice(0, at) + INSERTED + SHARING.slice(at);
      const result = preview(c.compiler, 1, at, at, SHARING, INSERTED);
      expect(result.outdated ?? false).toBe(false);
      expect(result.program?.chunks).toBeDefined();
      const previewRoot = result.program!.chunks!;
      expect(c.compiler.lastProgramBuild?.root === previewRoot, "the preview's build is its program's root").toBe(true);
      expect(previewRoot === real, "the preview built a root of its own").toBe(false);
      expect(store.current === real, "the store's current root is the real one").toBe(true);
      expect(store.emittedLastBuild).toBe(1);
      expect(sharingProblems(real, previewRoot)).toEqual([]);
      expect(changedSince(real, snap)).toEqual([]);
      expect(describeRoot(previewRoot).join("\n")).toBe(describeRoot(coldRoot(inserted)).join("\n"));

      // Delete the whole `if` from the clause.
      const ifAt = SHARING.indexOf(IF_LINES);
      const removed = SHARING.slice(0, ifAt) + SHARING.slice(ifAt + IF_LINES.length);
      const second = preview(c.compiler, 1, ifAt, ifAt + IF_LINES.length, SHARING, "");
      expect(second.program?.chunks).toBeDefined();
      const without = second.program!.chunks!;
      expect(store.current === real, "the store's current root is the real one").toBe(true);
      expect(parts.ifBodies.filter((id) => without.sequence(id) !== undefined)).toEqual([]);
      expect(parts.ifBodies.filter((id) => real.sequence(id) === undefined)).toEqual([]);
      expect(changedSince(real, snap)).toEqual([]);
      expect(describeRoot(without).join("\n")).toBe(describeRoot(coldRoot(removed)).join("\n"));

      // The insertion made for real, after the previews, is built from the
      // real root as the first preview was.
      update(c.compiler, SHARING, 2, at, at, INSERTED);
      const next = c.compile().program.chunks!;
      expect(store.current === next, "the real edit's root is current").toBe(true);
      expect(store.emittedLastBuild).toBe(1);
      expect(sharingProblems(real, next)).toEqual([]);
      expect(changedSince(real, snap)).toEqual([]);
      expect(describeRoot(next).join("\n")).toBe(describeRoot(coldRoot(inserted)).join("\n"));
    });
  }, 120_000);

  it("of a real edit shares with the previous root in the same way, and drops the rows of a body the edit removed", () => {
    quiet(() => {
      const c = programCompiler({ [MAIN_URI]: SHARING }, CONFIG);
      const real = c.compile().program.chunks!;
      const store = c.compiler.chunkStore!;
      const parts = sharingParts(real);
      const snap = snapshot(real);

      const at = SHARING.indexOf(AT_INSERT);
      const inserted = update(c.compiler, SHARING, 2, at, at, INSERTED);
      const next = c.compile().program.chunks!;
      expect(store.current === next, "the edit's root is current").toBe(true);
      expect(store.emittedLastBuild).toBe(1);
      expect(sharingProblems(real, next)).toEqual([]);
      expect(changedSince(real, snap)).toEqual([]);
      expect(describeRoot(next).join("\n")).toBe(describeRoot(coldRoot(inserted)).join("\n"));

      const nextSnap = snapshot(next);
      const ifAt = inserted.indexOf(IF_LINES);
      const removed = update(c.compiler, inserted, 3, ifAt, ifAt + IF_LINES.length, "");
      const without = c.compile().program.chunks!;
      expect(store.current === without, "the edit's root is current").toBe(true);
      expect(parts.ifBodies.filter((id) => without.sequence(id) !== undefined)).toEqual([]);
      expect(parts.ifBodies.filter((id) => next.sequence(id) === undefined)).toEqual([]);
      expect(changedSince(real, snap)).toEqual([]);
      expect(changedSince(next, nextSnap)).toEqual([]);
      expect(describeRoot(without).join("\n")).toBe(describeRoot(coldRoot(removed)).join("\n"));
    });
  }, 120_000);
});
