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
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { CheckpointStore } from "../../game/core/classes/CheckpointStore";
import { Game } from "../../game/core/classes/Game";
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
  // Absolute numbers on the machine this was written on, for this workload:
  // copying takes ~6,000ms; journalling takes ~15ms. The 1,500ms budget sits
  // 4x below the broken implementation and 100x above the fixed one, so it
  // survives a slow or instrumented CI box and still fails the moment a
  // per-snapshot copy returns.
  const lookaheads = 4_000;
  const existing = 32_000;

  test("4,000 lookaheads over a 32,000-entry collection stay well under budget", () => {
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

    expect(elapsed).toBeLessThan(1_500);
    // The rewinds also have to have worked: every speculative path is gone and
    // the collection is exactly what it was.
    expect(set.size).toBe(existing);
    expect(set.has("speculative.0")).toBe(false);
  });

  test("the Game's lookahead snapshot holds no copy of the collection", () => {
    // The cost tests above exercise `RecencySet` directly, so they would stay
    // green if `Game` went back to snapshotting by copying (e.g.
    // `RecencySet.from(this._runtimeState.pathsExecutedThisFrame)`) — which is
    // precisely the shape that made this O(N²). Pin the wiring: what `Game`
    // retains for a lookahead must be independent of how much has executed.
    const compiler = new SparkdownCompiler();
    const uri = "inmemory:///main.sd";
    compiler.configure({
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
      files: [
        {
          uri,
          type: "script",
          name: "main",
          ext: "sd",
          text: "-> start\n\nscene start\n  A beat.\n  Another beat.\nend\n",
          version: 1,
          languageId: "sparkdown",
        },
      ],
    } as never);
    const program = compiler.compile({ textDocument: { uri } }).program;
    const game = new Game({
      program: program as any,
      now: () => 0,
      setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
        fn(...a);
        return 0;
      }) as any,
    } as any);

    // Take a lookahead snapshot the way the ink runtime does.
    (game as any).story.onSaveStateSnapshot();
    const snapshot = (game as any)._runtimeSnapshot;
    expect(snapshot).toBeTruthy();
    // The per-beat mirror, two array lengths, and a REFERENCE to the live
    // collection (identity check, not a copy) — never a copy of it.
    expect(Object.keys(snapshot).sort()).toEqual([
      "choicesLength",
      "conditionsLength",
      "executedSinceCheckpoint",
      "paths",
    ]);
    expect(snapshot.paths).toBe(
      (game as any)._runtimeState.pathsExecutedThisFrame,
    );
  });

  test("the per-beat mirror is drained in BOTH checkpoint modes", () => {
    // `executedSinceCheckpoint` is still copied per lookahead, which is only
    // affordable because a checkpoint empties it every beat. Non-incremental
    // checkpointing used to skip that drain, so in the DEFAULT configuration
    // the mirror grew for the whole simulation and its per-lookahead copy was
    // quadratic all over again — the same defect, one collection along.
    for (const incremental of [false, true]) {
      const state = new RuntimeState();
      const store = new CheckpointStore(
        {
          save: () => "{}",
          saveDeltaBody: () => "{}",
          snapshotCounts: () => ({ vc: [], ti: [] }),
          drainCountDeltas: () => ({ vc: [], ti: [] }),
          snapshotRuntime: () => state.snapshotFull(),
          drainRuntime: () => state.drainDeltas(),
        } as never,
        { incremental, verify: false, baseInterval: 50 },
      );
      for (let beat = 0; beat < 200; beat += 1) {
        state.recordExecution(`0.${beat}`);
        store.capture();
      }
      expect(state.pathsExecutedThisFrame.size).toBe(200);
      // Emptied every beat, so it never accumulates regardless of mode.
      expect(state.executedSinceCheckpoint.size).toBe(0);
    }
  });

  test("a rewind is skipped entirely when the runtime state was replaced", () => {
    // The undo journal lives on the collection instance, so a snapshot taken
    // before the whole runtime state is swapped out (a load, a fresh
    // simulation) describes an abandoned run. Rewinding the OTHER collections
    // while that one silently no-ops would leave them describing different
    // moments, so the restore is skipped wholesale.
    const compiler = new SparkdownCompiler();
    const uri = "inmemory:///main.sd";
    compiler.configure({
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
      files: [
        {
          uri,
          type: "script",
          name: "main",
          ext: "sd",
          text: "-> start\n\nscene start\n  A beat.\nend\n",
          version: 1,
          languageId: "sparkdown",
        },
      ],
    } as never);
    const program = compiler.compile({ textDocument: { uri } }).program;
    const game = new Game({
      program: program as any,
      now: () => 0,
      setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
        fn(...a);
        return 0;
      }) as any,
    } as any);
    const anyGame = game as any;

    anyGame._runtimeState.choicesEncountered.push({
      options: ["a"],
      selected: 0,
    });
    anyGame.story.onSaveStateSnapshot();
    // A new run begins: the runtime state is replaced wholesale.
    anyGame._runtimeState = new RuntimeState();
    anyGame._runtimeState.recordExecution("0.1");
    anyGame._runtimeState.choicesEncountered.push({
      options: ["b"],
      selected: 0,
    });

    anyGame.story.onRestoreStateSnapshot();

    // The new state is untouched — not truncated to the abandoned run's
    // lengths, and not stripped of its recorded path.
    expect(anyGame._runtimeState.choicesEncountered.length).toBe(1);
    expect(anyGame._runtimeState.pathsExecutedThisFrame.toArray()).toEqual([
      "0.1",
    ]);
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
