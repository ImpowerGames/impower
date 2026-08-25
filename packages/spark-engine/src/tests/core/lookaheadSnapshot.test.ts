// #376 — the ink runtime snapshots and rewinds `pathsExecutedThisFrame` around
// EVERY lookahead, and that collection grows for the whole length of a preview
// simulation. Copying it per snapshot made previewing deep inside a long scene
// cost O(beats²) memory: 15,831 beats of the R&B project grew the heap by ~1 GB
// and 23,788 beats exhausted a 6 GB heap outright, killing the editor.
//
// Two things have to hold, and the second is what regressed:
//   - a rewind restores the collection EXACTLY (membership and recency order),
//     because `Game.continue` ends a simulation the moment the start path shows
//     up in it — a speculative lookahead that peeked past the target and then
//     rewound must not leave it behind;
//   - the cost of a snapshot/rewind does not grow with how much the collection
//     already holds.

import { describe, expect, test } from "vitest";
import { RecencySet } from "../../game/core/classes/RecencySet";
import { RuntimeState } from "../../game/core/classes/RuntimeState";

describe("recency set rewinds exactly", () => {
  test("a rewound lookahead restores membership and order", () => {
    const set = RecencySet.from(["a", "b", "c", "d"]);

    set.beginSnapshot();
    set.add("e"); // new entry
    set.add("b"); // existing entry moves to the end
    set.add("a"); // another move, from the head
    expect(set.toArray()).toEqual(["c", "d", "e", "b", "a"]);

    set.restoreSnapshot();
    expect(set.toArray()).toEqual(["a", "b", "c", "d"]);
    expect(set.has("e")).toBe(false);
    expect(set.size).toBe(4);
  });

  test("rewinding twice is a no-op, as re-assigning a copy was", () => {
    const set = RecencySet.from(["a", "b"]);
    set.beginSnapshot();
    set.add("c");
    set.restoreSnapshot();
    set.restoreSnapshot();
    expect(set.toArray()).toEqual(["a", "b"]);
  });

  test("a discarded lookahead keeps its changes", () => {
    const set = RecencySet.from(["a", "b"]);
    set.beginSnapshot();
    set.add("c");
    set.add("a");
    set.discardSnapshot();
    set.restoreSnapshot(); // no window open — nothing to undo
    expect(set.toArray()).toEqual(["b", "c", "a"]);
  });

  test("re-adding the most recent entry is not a change to undo", () => {
    const set = RecencySet.from(["a", "b"]);
    set.beginSnapshot();
    set.add("b");
    set.restoreSnapshot();
    expect(set.toArray()).toEqual(["a", "b"]);
  });

  test("the tail survives a rewind that moved it (the start-path case)", () => {
    // `Game.continue` asks whether the start path has executed yet. A
    // lookahead that executes it and then rewinds must leave it absent.
    const set = RecencySet.from(["intro.0", "intro.1"]);
    set.beginSnapshot();
    set.add("target.0");
    expect(set.has("target.0")).toBe(true);
    set.restoreSnapshot();
    expect(set.has("target.0")).toBe(false);
    expect(set.toArray()).toEqual(["intro.0", "intro.1"]);
  });

  test("the same entry moved repeatedly inside one window still rewinds", () => {
    const set = RecencySet.from(["a", "b", "c"]);
    set.beginSnapshot();
    set.add("a");
    set.add("b");
    set.add("a");
    set.add("c");
    set.restoreSnapshot();
    expect(set.toArray()).toEqual(["a", "b", "c"]);
  });
});

describe("recency set matches what a Set did", () => {
  // The previous implementation was a plain Set with delete-then-add. Anything
  // downstream (executed-line highlighting, the last-executed lookup, save
  // files) reads this order, so it has to be identical.
  test("delete-then-add ordering is reproduced", () => {
    const paths = ["a", "b", "c", "a", "d", "b", "a"];
    const reference = new Set<string>();
    const set = new RecencySet();
    for (const p of paths) {
      reference.delete(p);
      reference.add(p);
      set.add(p);
    }
    expect(set.toArray()).toEqual(Array.from(reference));
  });

  test("RuntimeState round-trips through JSON unchanged", () => {
    const state = new RuntimeState();
    for (const p of ["0.1", "0.2", "0.1", "0.3"]) {
      state.recordExecution(p);
    }
    const restored = RuntimeState.fromJSON(state.toJSON());
    expect(restored.pathsExecutedThisFrame.toArray()).toEqual([
      "0.2",
      "0.1",
      "0.3",
    ]);
  });

  test("`global ` paths are still ignored", () => {
    const state = new RuntimeState();
    state.recordExecution("global decl");
    state.recordExecution("0.1");
    expect(state.pathsExecutedThisFrame.toArray()).toEqual(["0.1"]);
  });
});

describe("snapshot cost does not grow with the collection", () => {
  // The defect is a complexity one: each snapshot copied the whole collection,
  // so the work scaled with everything executed so far. The pin is therefore a
  // budget for many lookaheads over a LARGE collection — the case that broke.
  //
  // A ratio between two sizes looked tempting and is the wrong instrument: once
  // the copy is gone both measurements are a few milliseconds, where map-size
  // and GC effects move the ratio around more than the defect would.
  //
  // Absolute numbers on the machine this was written on: copying took 14,299ms;
  // journalling takes ~7ms. The 500ms budget sits ~28x below the broken
  // implementation and ~70x above the fixed one, so it survives a slow CI box
  // and still fails the moment a per-snapshot copy returns.
  const lookaheads = 2_000;
  const existing = 32_000;

  test("2,000 lookaheads over a 32,000-entry collection stay well under budget", () => {
    const set = new RecencySet();
    for (let i = 0; i < existing; i += 1) {
      set.add(`path.${i}`);
    }

    const started = performance.now();
    for (let i = 0; i < lookaheads; i += 1) {
      set.beginSnapshot();
      // One beat's worth of work inside the window: a fresh path, plus a
      // revisit of an existing one (the recency move that a Set cannot undo).
      set.add(`speculative.${i}`);
      set.add(`path.${i % existing}`);
      set.restoreSnapshot();
      set.discardSnapshot();
    }
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(500);
    // The rewinds also have to have worked: every speculative path is gone and
    // the collection is exactly what it was.
    expect(set.size).toBe(existing);
    expect(set.has("speculative.0")).toBe(false);
  });

  test("the collection is intact after all that snapshotting", () => {
    const set = RecencySet.from(["a", "b", "c"]);
    for (let i = 0; i < 100; i += 1) {
      set.beginSnapshot();
      set.add(`tmp.${i}`);
      set.restoreSnapshot();
      set.discardSnapshot();
    }
    expect(set.toArray()).toEqual(["a", "b", "c"]);
  });
});
