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

const liveHeap = () => {
  gc();
  gc();
  return process.memoryUsage().heapUsed;
};

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

function retainedBySimulation(beats: number) {
  const program = compileScene(beats);
  const game = new Game({
    program: program as any,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);
  const anyGame = game as any;
  game.setStartFrom({ file: URI, line: beats + 1 });
  const to = anyGame.startAddress as number;
  const route = Game.planRoute(game.story, program as any, anyGame.routeStartOf(to), to);
  expect(route).toBeTruthy();
  const before = liveHeap();
  game.patchAndSimulateRoute(route!);
  const after = liveHeap();
  expect(anyGame._simulation).toBe("success");
  expect(anyGame._checkpoints.length).toBeGreaterThan(beats - 10);
  return after - before;
}

function imageStore() {
  const live = { state: new RuntimeState() };
  const store = new CheckpointStore(
    {
      captureImage: (keyframe: boolean) => ({ keyframe }),
      saveWithoutStory: () =>
        JSON.stringify({
          modules: {},
          runtime: live.state.toJSONWithoutCollections(),
        }),
      storyOfImage: () => null,
      durableExecuted: (executed) => executed,
      snapshotRuntime: () => live.state.snapshotFull(),
      drainRuntime: () => live.state.drainDeltas(),
    },
    { baseInterval: 10 },
  );
  const expected: string[] = [];
  const capture = () => {
    expected[store.length] = live.state.toJSON();
    store.capture();
  };
  const runtimeOf = (i: number) => store.imageAt(i)!.save["runtime"] as string;
  return { live, store, expected, capture, runtimeOf };
}

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

  test("a resumption from a truncated store keeps the checkpoints before it and starts a chain with the loaded record", () => {
    const { live, store, expected, capture, runtimeOf } = imageStore();
    for (let n = 0; n < 33; n += 1) {
      runBeat(live.state, n);
      capture();
    }
    store.truncate(25);
    live.state = RuntimeState.fromJSON(runtimeOf(24));
    for (let n = 25; n < 52; n += 1) {
      runBeat(live.state, n + 100);
      capture();
    }
    expect((store as any)._entries[25].chainStart).toBe(true);
    for (let i = 0; i < store.length; i += 1) {
      expect(runtimeOf(i)).toBe(expected[i]);
    }
  });
});

describe("a route simulation retains memory linear in its beats", () => {
  test("doubling the beats at most about doubles what the simulation keeps", () => {
    const small = retainedBySimulation(2_000);
    const large = retainedBySimulation(4_000);
    const mb = (bytes: number) => `${Math.round(bytes / 1048576)} MB`;
    expect(
      large / small,
      `retained ${mb(small)} at 2,000 beats and ${mb(large)} at 4,000`,
    ).toBeLessThan(2.5);
  }, 600_000);
});
