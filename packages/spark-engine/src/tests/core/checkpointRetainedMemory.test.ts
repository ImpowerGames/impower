// #1694 — the memory a route simulation retains grows with its beats, not
// with their square.
//
// A game checkpoints every beat of a simulated route, a keyframe every
// `baseInterval` beats and deltas between. The record of the positions the
// route executed grows with every beat, so a keyframe that held it whole (in
// its save and again in its runtime collections) made the checkpoints
// together quadratic in the beats: a 10,000-beat scene left 964 MB of the
// test's 1024 MB heap live after `patchAndSimulateRoute`.
//
// What must hold: doubling a scene's beats at most about doubles what the
// simulation leaves live once its garbage is collected; and every
// checkpoint still gives back the runtime collections its beat had, now
// that a keyframe holds only their changes.

import { describe, expect, test } from "vitest";
import v8 from "node:v8";
import vm from "node:vm";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { CheckpointStore } from "../../game/core/classes/CheckpointStore";
import { Game } from "../../game/core/classes/Game";
import { RuntimeState } from "../../game/core/classes/RuntimeState";
import { requireChunks } from "../harness/compileProgram";

v8.setFlagsFromString("--expose-gc");
const gc = vm.runInNewContext("gc") as () => void;

const URI = "inmemory:///main.sd";

/** Live heap after a forced collection, in bytes. */
const liveHeap = () => {
  gc();
  gc();
  return process.memoryUsage().heapUsed;
};

// Built in its own function, so that nothing holds the compiler while the
// heap is read.
function compileScene(beats: number) {
  const lines = ["-> start", "", "scene start"];
  for (let i = 0; i < beats; i += 1) {
    lines.push(`  Beat number ${i} of the very long scene.`);
  }
  lines.push("end", "");
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: lines.join("\n"),
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return requireChunks(
    compiler.compile({ textDocument: { uri: URI } } as never)
      .program,
  );
}

/** What simulating the route to the scene's last beat leaves live, in
 *  bytes, with the game still held. */
function retainedBySimulation(beats: number) {
  const program = compileScene(beats);
  const game = new Game({
    program: program as any,
    incrementalCheckpoints: true,
    verifyCheckpoints: false,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);
  const anyGame = game as any;
  game.setStartFrom({ file: URI, line: beats + 1 });
  const to = anyGame.startAddress as string;
  const route = Game.planRoute(game.story, program as any, anyGame.routeStartOf(to), to);
  expect(route).toBeTruthy();
  const before = liveHeap();
  game.patchAndSimulateRoute(route!);
  const after = liveHeap();
  expect(anyGame._simulation).toBe("success");
  // A checkpoint for every beat the route passed.
  expect(anyGame._checkpoints.length).toBeGreaterThan(beats - 10);
  return after - before;
}

/** A store that keeps images, over a live runtime record the test drives:
 *  each capture records what the record held, which the checkpoint must
 *  give back. */
function imageStore() {
  const live = { state: new RuntimeState() };
  const store = new CheckpointStore(
    {
      captureImage: (keyframe: boolean) => ({ keyframe }),
      // As `Game.buildSave` writes it: the collections emptied when asked.
      saveWithoutStory: (omitDeltaState: boolean) =>
        JSON.stringify({
          modules: {},
          runtime: omitDeltaState
            ? live.state.toJSONWithoutCollections()
            : live.state.toJSON(),
        }),
      save: () => "",
      saveDeltaBody: () => "",
      snapshotCounts: () => ({ vc: [], ti: [] }),
      drainCountDeltas: () => ({ vc: [], ti: [] }),
      snapshotRuntime: () => live.state.snapshotFull(),
      drainRuntime: () => live.state.drainDeltas(),
    },
    { incremental: true, baseInterval: 10 },
  );
  const expected: string[] = [];
  const capture = () => {
    expected[store.length] = live.state.toJSON();
    store.capture();
  };
  const runtimeOf = (i: number) => store.imageAt(i)!.save["runtime"] as string;
  return { live, store, expected, capture, runtimeOf };
}

/** Runs beat `n`: a position of its own, a revisit of an earlier one, and
 *  every seventh beat a choice and a condition. */
function runBeat(state: RuntimeState, n: number) {
  state.recordExecution(1000 + n);
  state.recordExecution(1000 + Math.floor(n / 3));
  if (n % 7 === 0) {
    state.choicesEncountered.push({ options: [`a${n}`, `b${n}`], selected: n % 2 });
    state.recordCondition(n % 2 === 0);
  }
}

describe("a checkpoint's runtime collections are its beat's", () => {
  test("across keyframes, a keyframe holding the changes since the entry before", () => {
    const { live, store, expected, capture, runtimeOf } = imageStore();
    for (let n = 0; n < 45; n += 1) {
      runBeat(live.state, n);
      capture();
    }
    for (let i = 0; i < store.length; i += 1) {
      expect(runtimeOf(i)).toBe(expected[i]);
    }
    // The keyframe at 40 holds that beat's changes, not the 41 positions run
    // so far, and its save holds no collections.
    const entry = (store as any)._entries[40];
    expect(entry.keyframe).toBe(true);
    expect(entry.rt.pe.length).toBeLessThan(3);
    expect(entry.body).not.toContain("1000");
  });

  test("a keyframe after the collections were replaced starts a chain of its own", () => {
    const { live, store, expected, capture, runtimeOf } = imageStore();
    for (let n = 0; n < 20; n += 1) {
      runBeat(live.state, n);
      capture();
    }
    // A reset just before the keyframe at 20 (a route started again).
    live.state = new RuntimeState();
    for (let n = 20; n < 35; n += 1) {
      runBeat(live.state, n);
      capture();
    }
    expect((store as any)._entries[20].chainStart).toBe(true);
    for (let i = 0; i < store.length; i += 1) {
      expect(runtimeOf(i)).toBe(expected[i]);
    }
  });

  test("a resumption from a truncated store continues the chain it kept", () => {
    const { live, store, expected, capture, runtimeOf } = imageStore();
    for (let n = 0; n < 33; n += 1) {
      runBeat(live.state, n);
      capture();
    }
    // Resume at checkpoint 24, as a route resumed there loads its save.
    store.truncate(25);
    live.state = RuntimeState.fromJSON(runtimeOf(24));
    for (let n = 25; n < 52; n += 1) {
      runBeat(live.state, n + 100);
      capture();
    }
    for (let i = 0; i < store.length; i += 1) {
      expect(runtimeOf(i)).toBe(expected[i]);
    }
  });
});

describe("a route simulation retains memory linear in its beats", () => {
  test("doubling the beats at most about doubles what the simulation keeps", () => {
    const small = retainedBySimulation(2_000);
    const large = retainedBySimulation(4_000);
    // Linear growth doubles (about 2.0 measured); the quadratic store this
    // replaces more than tripled (3.2 between 2,500 and 5,000 beats).
    const mb = (bytes: number) => `${Math.round(bytes / 1048576)} MB`;
    expect(
      large / small,
      `retained ${mb(small)} at 2,000 beats and ${mb(large)} at 4,000`,
    ).toBeLessThan(2.5);
  }, 600_000);
});
