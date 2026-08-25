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

describe("identity still drives checkpoint reuse across a re-plan", () => {
  // This is what step identity EXISTS for: when the cursor moves and the route
  // is planned again, the shared prefix must be recognised so its checkpoints
  // are reused instead of re-simulated. Identity that changed shape (or
  // collided) would silently break this — the preview would still be correct,
  // just re-simulated from scratch every time, so nothing else would notice.
  const LINEAR = `store score = 0

-> start

scene start
  First beat.
  & score = 1
  Second beat.
  & score = 2
  Third beat.
  & score = 3
  Fourth beat.
end
`;

  const newGame = (program: unknown) =>
    new Game({
      program: program as any,
      now: () => 0,
      setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
        fn(...a);
        return 0;
      }) as any,
    } as any);

  const planTo = (game: Game, program: any, line: number) => {
    game.setStartFrom({ file: URI, line });
    const toPath = (game as any).startPath as string;
    return Game.planRoute(
      game.story,
      program,
      Game.getSimulateFromPath(toPath),
      toPath,
    );
  };

  test("a re-plan's shared steps carry the same identity and resolve to the same steps", () => {
    const program = compileSrc(LINEAR);
    const game = newGame(program);

    // Simulate out to the third beat.
    const deep = planTo(game, program as any, 10);
    expect(deep).toBeTruthy();
    game.patchAndSimulateRoute(deep!);

    // Re-plan to an EARLIER beat. Its steps are a prefix of the deep route, so
    // every one of them must carry the identity it had in the first plan —
    // that equality is the whole mechanism by which a re-plan recognises work
    // it has already done.
    const shallow = planTo(game, program as any, 6);
    expect(shallow).toBeTruthy();
    expect(shallow!.steps.length).toBeGreaterThan(1);
    const deepSeqs = deep!.steps.map((s) => s.seq);
    for (let i = 0; i < shallow!.steps.length; i += 1) {
      expect(shallow!.steps[i]!.seq).toBe(deepSeqs[i]);
    }

    // The identities the simulated route indexed are the ones the re-plan
    // produces, so a re-plan can find the work already done.
    const stepMap: Record<string, number> = (game as any)._plannedRouteStepMap;
    expect(Object.keys(stepMap).length).toBe(deep!.steps.length);
    for (const step of shallow!.steps) {
      expect(stepMap[step.seq]).toBeDefined();
    }
  });

  test("a re-plan RESUMES from a checkpoint instead of re-simulating", () => {
    // The end-to-end property identity exists to serve. If identities stopped
    // matching across plans, everything above could still pass while every
    // preview silently re-simulated its scene from the top — so assert the
    // resume itself: the engine loads a checkpoint, and only once it has a
    // simulated prefix to resume from.
    //
    // The scene has to be long enough for the first pass to capture
    // checkpoints at all (they are captured per beat, so a four-beat fixture
    // can finish with none and nothing to reuse).
    const program = compileSrc(longScene(120));
    const game = newGame(program);
    const anyGame = game as any;

    let loads = 0;
    const realLoad = anyGame.load.bind(anyGame);
    anyGame.load = (...args: unknown[]) => {
      loads += 1;
      return realLoad(...args);
    };

    // First preview: nothing to resume from.
    game.patchAndSimulateRoute(planTo(game, program as any, 44)!);
    expect(loads).toBe(0);
    expect(anyGame._checkpoints.length).toBeGreaterThan(1);

    // Second preview, deeper in the same scene: the shared prefix was already
    // simulated, so this one resumes rather than starting over.
    game.patchAndSimulateRoute(planTo(game, program as any, 84)!);
    expect(loads).toBe(1);
  });

  test("steps reached before any checkpoint report no checkpoint", () => {
    // They used to record -1, which sent `getCheckpoint` to the store for
    // index -1 and got null back — a real absence dressed up as a lookup miss.
    const program = compileSrc(LINEAR);
    const game = newGame(program);
    const route = planTo(game, program as any, 10)!;
    game.patchAndSimulateRoute(route);
    for (const step of route.steps) {
      if (step.checkpoint != null) {
        expect(step.checkpoint).toBeGreaterThanOrEqual(0);
      }
    }
    // And the great majority of a simulated route does resolve to one.
    const resolved = route.steps.filter(
      (s, i) => game.getCheckpoint(s.seq, { path: s.path, index: i }) != null,
    ).length;
    expect(resolved).toBeGreaterThan(route.steps.length / 2);
  });
});

describe("branches do not share an identity", () => {
  // A fork usually happens with no pending step recorded, so the child node
  // has to inherit the PARENT's identity. Restarting the chain at a fork gave
  // two sibling branches identical identities for every path they later share,
  // which a re-plan would read as "already simulated" and resume from the
  // wrong branch's checkpoint.
  const BRANCHY = `store flag = false

-> start

scene start
  Opening beat.
  if flag
    True branch beat.
  else
    False branch beat.
  end
  Shared beat after the branch.
  Another shared beat.
end
`;

  test("a step after a fork differs from the same path on the other branch", () => {
    const program = compileSrc(BRANCHY);
    const seqsFor = (favored: boolean) => {
      const game = new Game({
        program: program as any,
        now: () => 0,
        setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
          fn(...a);
          return 0;
        }) as any,
      } as any);
      game.setStartFrom({ file: URI, line: 12 });
      const toPath = (game as any).startPath as string;
      const route = Game.planRoute(
        game.story,
        program as any,
        Game.getSimulateFromPath(toPath),
        toPath,
        { [Game.getSimulateFromPath(toPath)]: { favoredConditions: [favored] } },
      );
      return route?.steps ?? [];
    };

    const viaTrue = seqsFor(true);
    const viaFalse = seqsFor(false);
    expect(viaTrue.length).toBeGreaterThan(1);
    expect(viaFalse.length).toBeGreaterThan(1);

    // Wherever the two routes reach the SAME path having taken different
    // branches, their identities must differ.
    const trueByPath = new Map(viaTrue.map((s) => [s.path, s.seq]));
    let comparedAnySharedPath = false;
    for (const step of viaFalse) {
      const otherSeq = trueByPath.get(step.path);
      if (otherSeq == null) {
        continue;
      }
      if (step.seq !== otherSeq) {
        comparedAnySharedPath = true;
      }
    }
    // At minimum the routes must not be identity-identical end to end.
    const trueTail = viaTrue.at(-1)!.seq;
    const falseTail = viaFalse.at(-1)!.seq;
    if (JSON.stringify(viaTrue.map((s) => s.path)) !==
        JSON.stringify(viaFalse.map((s) => s.path))) {
      expect(trueTail).not.toBe(falseTail);
      comparedAnySharedPath = true;
    }
    expect(comparedAnySharedPath).toBe(true);
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
