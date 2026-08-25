// #380 — what stops the route planner searching.
//
// The planner walks the story looking for a way to reach the line the author
// clicked. It has to give up eventually, because an author can write a story
// that never ends. What it gives up ON decides two things an author can feel:
//
//   - whether a long but perfectly ordinary scene can be previewed at all, and
//   - whether the same click behaves the same way twice.
//
// So the ceiling is expressed in work done — story advances and node
// expansions — rather than in elapsed time. A budget counted in work is the
// same budget on an idle machine and a busy one, which is what makes a failure
// reproducible and lets these tests exist at all.
//
// What must hold:
//   - a scene far longer than any real script still plans end to end;
//   - the verdict is a function of the declared budget, and repeating a search
//     at the same budget always reaches the same verdict;
//   - a story that genuinely never terminates still gives up;
//   - every branch of a decision stays reachable (the search must not mistake
//     two siblings of one fork for the same position and drop one of them).

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { planRoute } from "@impower/sparkdown/src/compiler/utils/planRoute";
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

const newGame = (program: unknown) =>
  new Game({
    program: program as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);

/** A single scene of `beats` display lines. Its last beat is on line
 *  `beats + 2`, counting from zero. */
function longScene(beats: number): string {
  const lines = ["-> start", "", "scene start"];
  for (let i = 0; i < beats; i += 1) {
    lines.push(`  Beat number ${i} of the long scene.`);
  }
  lines.push("end", "");
  return lines.join("\n");
}

/** Resolve a source line to the runtime path the preview would target. */
function targetPathForLine(program: unknown, line: number): string {
  const game = newGame(program);
  game.setStartFrom({ file: URI, line });
  return (game as any).startPath as string;
}

describe("a long scene is not mistaken for an unreachable one", () => {
  // A scene of 24,000 display lines needs about 168,000 story advances to
  // reach its last beat, which takes well over a second on this machine. A
  // ceiling counted in seconds therefore rejects it — and tells the author the
  // line cannot be reached, which is false. A ceiling counted in work accepts
  // it, because the work is ordinary; there is just a lot of it.
  test("a 24,000 line scene plans a complete route to its last beat", () => {
    const beats = 24_000;
    const program = compileSrc(longScene(beats));
    const toPath = targetPathForLine(program, beats + 2);
    expect(toPath).not.toBe("0");

    const game = newGame(program);
    const route = Game.planRoute(
      game.story,
      program as any,
      Game.getSimulateFromPath(toPath),
      toPath,
    );

    expect(route).toBeTruthy();
    // The route really does span the scene rather than stopping early.
    expect(route!.steps.length).toBeGreaterThan(100_000);
    expect(route!.steps.at(-1)!.path).toBe(toPath);
    expect(route!.toPath).toBe(toPath);
  }, 300_000);
});

describe("the declared budget decides the verdict, and decides it the same way every time", () => {
  // The budget is calibrated here rather than hard-coded, so this keeps
  // testing the property (the budget is what decides) even if the number of
  // advances a scene costs changes for unrelated reasons.
  const SCENE = longScene(300);

  const planWithBudget = (program: unknown, toPath: string, maxSteps: number) =>
    planRoute(newGame(program).story, "start", toPath, {
      stayWithinKnot: true,
      maxSteps,
    });

  test("one advance below what the scene needs fails, and at it succeeds", () => {
    const program = compileSrc(SCENE);
    const toPath = targetPathForLine(program, 302);
    expect(toPath).not.toBe("0");

    // Smallest budget that still finds the route.
    let low = 1;
    let high = 200_000;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (planWithBudget(program, toPath, mid)) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    const needed = low;
    expect(needed).toBeGreaterThan(1_000);

    // Repeating the same search at the same budget always reaches the same
    // verdict. Under a wall clock these two lines are a coin toss on a loaded
    // machine; under a work ceiling they are a fact about the story.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(planWithBudget(program, toPath, needed)).toBeTruthy();
      expect(planWithBudget(program, toPath, needed - 1)).toBeNull();
    }
  }, 300_000);
});

describe("a story that never terminates still gives up", () => {
  // Nothing the planner can be clever about saves it here: the story really
  // does run forever, so only a ceiling on work ends the search. Both shapes
  // below revisit the same position endlessly.
  const DIVERT_LOOP = `-> start

scene start
  Going round.
  -> start
end
`;

  const CHOICE_LOOP = `-> start

scene start
  Before the loop.
  choose
  + [Go around again]
    Round we go.
    -> start
  + [Move on]
    Leaving the loop.
  then
    After the choice.
  end
end
`;

  test.each([
    ["a scene that diverts to itself", DIVERT_LOOP],
    ["a choice that loops back to the top", CHOICE_LOOP],
  ])("%s ends the search instead of hanging", (_name, src) => {
    const program = compileSrc(src);
    const route = planRoute(
      newGame(program).story,
      "start",
      "start.NO_SUCH_PATH",
      { stayWithinKnot: true, maxSteps: 5_000, maxNodes: 500 },
    );
    expect(route).toBeNull();
  }, 120_000);
});

describe("every branch of a decision stays reachable", () => {
  // The two branches of one `if` fork from the SAME story state — the decision
  // that separates them is applied while each child runs, not before it is
  // queued. Anything that treats a repeated state as a position already
  // covered has to account for that, or it drops the second branch and the
  // author is told a line they can plainly see is unreachable.
  //
  // Forks are queued true-first, so the false side is the sibling at risk.
  const TWO_BRANCHES = `store flag = false

-> start

scene start
  Opening beat.
  if flag
    Went down the true side.
  else
    Went down the false side.
  end
  Shared beat after the branch.
end
`;

  test("the true side and the false side both plan a route", () => {
    const program = compileSrc(TWO_BRANCHES);

    const truePath = targetPathForLine(program, 7);
    const falsePath = targetPathForLine(program, 9);
    expect(truePath).not.toBe("0");
    expect(falsePath).not.toBe("0");
    // The two sides really are different places in the story.
    expect(truePath).not.toBe(falsePath);

    const planTo = (toPath: string) =>
      Game.planRoute(
        newGame(program).story,
        program as any,
        Game.getSimulateFromPath(toPath),
        toPath,
      );

    const viaTrue = planTo(truePath);
    expect(viaTrue).toBeTruthy();
    expect(viaTrue!.conditions.map((c) => c.selected)).toEqual([true]);
    expect(viaTrue!.steps.at(-1)!.path).toBe(truePath);

    const viaFalse = planTo(falsePath);
    expect(viaFalse).toBeTruthy();
    expect(viaFalse!.conditions.map((c) => c.selected)).toEqual([false]);
    expect(viaFalse!.steps.at(-1)!.path).toBe(falsePath);
  }, 120_000);

  test("a beat after the branch is still reachable", () => {
    const program = compileSrc(TWO_BRANCHES);
    const toPath = targetPathForLine(program, 11);
    expect(toPath).not.toBe("0");
    const route = Game.planRoute(
      newGame(program).story,
      program as any,
      Game.getSimulateFromPath(toPath),
      toPath,
    );
    expect(route).toBeTruthy();
    expect(route!.steps.at(-1)!.path).toBe(toPath);
  }, 120_000);
});
