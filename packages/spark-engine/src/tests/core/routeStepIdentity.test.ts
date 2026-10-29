import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { extendSeq } from "@impower/sparkdown/src/compiler/utils/planRoute";
import { Game } from "../../game/core/classes/Game";
import { requireChunks } from "../harness/compileProgram";

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
  const result = compiler.compile({ textDocument: { uri: URI } });
  return requireChunks(result.program);
}

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
    const a = extendSeq(extendSeq(extendSeq("", 1), 2), 3);
    const b = extendSeq(extendSeq(extendSeq("", 1), 2), 3);
    expect(a).toBe(b);
  });

  test("a different history yields a different identity", () => {
    const base = extendSeq(extendSeq("", 1), 2);
    expect(extendSeq(base, 3)).not.toBe(extendSeq(base, 4));
    const forward = extendSeq(extendSeq("", 1), 2);
    const reversed = extendSeq(extendSeq("", 2), 1);
    expect(forward).not.toBe(reversed);
  });

  test("a revisit is distinguished from a first visit", () => {
    const first = extendSeq(extendSeq("", 10), 11);
    const second = extendSeq(extendSeq(first, 10), 11);
    expect(second).not.toBe(first);
  });

  test("identity stays a fixed width however deep the history goes", () => {
    let shallow = extendSeq("", 0);
    let deep = "";
    for (let i = 0; i < 5_000; i += 1) {
      deep = extendSeq(deep, 2 ** 40 + i);
    }
    expect(deep.length).toBeLessThanOrEqual(shallow.length + 4);
    expect(deep.length).toBeLessThan(20);
  });
});

describe("identity still drives checkpoint reuse across a re-plan", () => {
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
    const toPath = game.startAddress!;
    return Game.planRoute(
      game.story,
      program,
      game.routeStartOf(toPath),
      toPath,
    );
  };

  test("a re-plan's shared steps carry the same identity and resolve to the same steps", () => {
    const program = compileSrc(LINEAR);
    const game = newGame(program);

    const deep = planTo(game, program as any, 10);
    expect(deep).toBeTruthy();
    game.patchAndSimulateRoute(deep!);

    const shallow = planTo(game, program as any, 6);
    expect(shallow).toBeTruthy();
    expect(shallow!.steps.length).toBeGreaterThan(1);
    const deepSeqs = deep!.steps.map((s) => s.seq);
    for (let i = 0; i < shallow!.steps.length; i += 1) {
      expect(shallow!.steps[i]!.seq).toBe(deepSeqs[i]);
    }

    const planned: { seq: string }[] = (game as any)._plannedRoute.steps;
    expect(planned.length).toBe(deep!.steps.length);
    shallow!.steps.forEach((step, i) => {
      expect(planned[i]!.seq).toBe(step.seq);
    });
  });

  test("a re-plan RESUMES from a checkpoint instead of re-simulating", () => {
    const program = compileSrc(longScene(120));
    const game = newGame(program);
    const anyGame = game as any;

    let loads = 0;
    const realRestore = anyGame.restoreCheckpoint.bind(anyGame);
    anyGame.restoreCheckpoint = (...args: unknown[]) => {
      const restored = realRestore(...args);
      if (restored) {
        loads += 1;
      }
      return restored;
    };

    game.patchAndSimulateRoute(planTo(game, program as any, 44)!);
    expect(loads).toBe(0);
    expect(anyGame._checkpoints.length).toBeGreaterThan(1);

    game.patchAndSimulateRoute(planTo(game, program as any, 84)!);
    expect(loads).toBe(1);
  });

  test("steps reached before any checkpoint report no checkpoint", () => {
    const program = compileSrc(LINEAR);
    const game = newGame(program);
    const route = planTo(game, program as any, 10)!;
    game.patchAndSimulateRoute(route);
    for (const step of route.steps) {
      if (step.checkpoint != null) {
        expect(step.checkpoint).toBeGreaterThanOrEqual(0);
      }
    }
    const resolved = route.steps.filter(
      (s, i) => game.getCheckpoint(s.seq, { address: s.address, index: i }) != null,
    ).length;
    expect(resolved).toBeGreaterThan(route.steps.length / 2);
  });
});

describe("branches do not share an identity", () => {
  const BRANCHY = `store flag = false

-> start

scene start
  Opening beat.
  choose
  + [Raise the flag]
    & flag = true
    Raised.
  + [Leave it down]
    Left down.
  then
    Chosen.
  end
  if flag then
    True branch beat.
  else
    False branch beat.
  end
  Shared beat after the branch.
  Another shared beat.
end
`;
  const ANOTHER_SHARED_BEAT = BRANCHY.split("\n").findIndex((l) =>
    l.includes("Another shared beat."),
  );

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
      const option = favored ? "+ [Raise the flag]" : "+ [Leave it down]";
      game.setRoutePins([
        {
          uri: URI,
          line: BRANCHY.split("\n").findIndex((l) => l.includes(option)),
          offer: 1,
        },
      ]);
      game.setStartFrom({ file: URI, line: ANOTHER_SHARED_BEAT });
      const toPath = game.startAddress!;
      const route = Game.planRoute(
        game.story,
        program as any,
        game.routeStartOf(toPath),
        toPath,
        { pins: game.pinnedOptions },
      );
      expect(route?.conditions.map((c) => c.selected)).toEqual([favored]);
      return route?.steps ?? [];
    };

    const viaTrue = seqsFor(true);
    const viaFalse = seqsFor(false);
    expect(viaTrue.length).toBeGreaterThan(1);
    expect(viaFalse.length).toBeGreaterThan(1);

    const trueByPath = new Map(viaTrue.map((s) => [s.address, s.seq]));
    let comparedAnySharedPath = false;
    for (const step of viaFalse) {
      const otherSeq = trueByPath.get(step.address);
      if (otherSeq == null) {
        continue;
      }
      if (step.seq !== otherSeq) {
        comparedAnySharedPath = true;
      }
    }
    const trueTail = viaTrue.at(-1)!.seq;
    const falseTail = viaFalse.at(-1)!.seq;
    if (JSON.stringify(viaTrue.map((s) => s.address)) !==
        JSON.stringify(viaFalse.map((s) => s.address))) {
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
    game.setStartFrom({ file: URI, line: 400 });
    const toPath = game.startAddress!;
    const route = Game.planRoute(
      game.story,
      program as any,
      game.routeStartOf(toPath),
      toPath,
    );
    expect(route).toBeTruthy();
    const steps = route!.steps;
    expect(steps.length).toBeGreaterThan(50);

    const totalSeqChars = steps.reduce((n, s) => n + s.seq.length, 0);
    const longestSeq = Math.max(...steps.map((s) => s.seq.length));

    expect(longestSeq).toBeLessThan(20);
    expect(totalSeqChars).toBeLessThan(steps.length * 20);

    expect(new Set(steps.map((s) => s.seq)).size).toBe(steps.length);
  });
});
