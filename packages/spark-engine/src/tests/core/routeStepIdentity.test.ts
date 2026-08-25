// #376 — a planned route used to carry its own history in every step: step N
// stored the paths of steps 1..N joined together, so a route of N steps held
// O(N²) characters. `Game.simulateRoute` keys a map by those strings, which
// forces V8 to flatten each one into its own copy, so the cost was paid in
// live memory: 241 MB of strings at 5,786 steps on a real project, ~1.8 GB at
// 15,831, and an out-of-memory kill (taking the editor's renderer with it) at
// ~23,800.
//
// The identity is only ever compared for equality — it tells a re-plan which
// steps of the previous plan are still valid, so their checkpoints can be
// reused — so it is now a fixed-width hash of the history. What must hold:
//   - identity semantics: same history in, same value out; different history,
//     different value (otherwise `patchRoute` resumes from a checkpoint that
//     belongs to a different story position);
//   - the size of a step's identity does not grow with how deep it sits.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { extendSeq } from "@impower/sparkdown/src/compiler/utils/planRoute";
import { Game } from "../../game/core/classes/Game";

const URI = "inmemory:///main.sd";

function compileSrc(src: string) {
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
        text: src,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  const result = compiler.compile({
    textDocument: { uri: URI },
    countAllVisits: true,
  });
  if (!result.program.compiled) {
    throw new Error("fixture failed to compile");
  }
  return result.program;
}

/** A scene with `beats` display lines, so a route to the end has many steps. */
function longScene(beats: number): string {
  const lines = ["-> start", "", "scene start"];
  for (let i = 0; i < beats; i += 1) {
    lines.push(`  Beat number ${i} of the long scene.`);
  }
  lines.push("end", "");
  return lines.join("\n");
}

describe("step identity is a fixed-width hash of the history", () => {
  test("the same history yields the same identity", () => {
    const a = extendSeq(extendSeq(extendSeq("", "0.1"), "0.2"), "0.3");
    const b = extendSeq(extendSeq(extendSeq("", "0.1"), "0.2"), "0.3");
    expect(a).toBe(b);
  });

  test("a different history yields a different identity", () => {
    const base = extendSeq(extendSeq("", "0.1"), "0.2");
    expect(extendSeq(base, "0.3")).not.toBe(extendSeq(base, "0.4"));
    // Order matters: the same paths in a different sequence are a different
    // position in the story.
    const forward = extendSeq(extendSeq("", "0.1"), "0.2");
    const reversed = extendSeq(extendSeq("", "0.2"), "0.1");
    expect(forward).not.toBe(reversed);
  });

  test("a revisit is distinguished from a first visit", () => {
    // A loop that comes back to the same path must not look like the first
    // time it was there, or a re-plan would resume from the wrong checkpoint.
    const first = extendSeq(extendSeq("", "loop.0"), "loop.1");
    const second = extendSeq(extendSeq(first, "loop.0"), "loop.1");
    expect(second).not.toBe(first);
  });

  test("identity stays a fixed width however deep the history goes", () => {
    let shallow = extendSeq("", "path.0");
    let deep = "";
    for (let i = 0; i < 5_000; i += 1) {
      deep = extendSeq(deep, `some.long.container.path.${i}`);
    }
    expect(deep.length).toBeLessThanOrEqual(shallow.length + 4);
    expect(deep.length).toBeLessThan(20);
  });
});

describe("a planned route does not grow quadratically", () => {
  test("total identity size scales with the number of steps, not their depth", () => {
    const program = compileSrc(longScene(400));
    const game = new Game({
      program: program as any,
      now: () => 0,
      setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
        fn(...a);
        return 0;
      }) as any,
    } as any);
    // Target the last beat so the route spans the whole scene.
    game.setStartFrom({ file: URI, line: 400 });
    const toPath = (game as any).startPath as string;
    const route = Game.planRoute(
      game.story,
      program as any,
      Game.getSimulateFromPath(toPath),
      toPath,
    );
    expect(route).toBeTruthy();
    const steps = route!.steps;
    expect(steps.length).toBeGreaterThan(50);

    const totalSeqChars = steps.reduce((n, s) => n + s.seq.length, 0);
    const longestSeq = Math.max(...steps.map((s) => s.seq.length));

    // Joining the history would put the deepest step's identity at roughly
    // `steps.length * pathLength` characters on its own, and the total at the
    // square of that. A fixed-width identity keeps every step small and the
    // total linear.
    expect(longestSeq).toBeLessThan(20);
    expect(totalSeqChars).toBeLessThan(steps.length * 20);

    // Identities still have to be unique per step, or checkpoint reuse would
    // resume from the wrong place.
    expect(new Set(steps.map((s) => s.seq)).size).toBe(steps.length);
  });
});
