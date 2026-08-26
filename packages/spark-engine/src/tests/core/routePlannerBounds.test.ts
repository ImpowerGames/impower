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
import {
  DEFAULT_MAX_STEPS,
  lastSearchStats,
  planRoute,
} from "@impower/sparkdown/src/compiler/utils/planRoute";
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

describe("the ceiling is calibrated against what the editor compiles", () => {
  // A fixture built here is far coarser than the program the editor compiles
  // from the same script: about seven advances per display line against about
  // thirty-six. Calibrating the ceiling on a fixture therefore sets it several
  // times too low, and the symptom is not a failing test — it is the editor
  // reporting a reachable line as unreachable, which no fixture-based test can
  // see. Measured in the running editor, a 17,000-line scene needs 611,984
  // advances.
  //
  // This guards the margin rather than the measurement, so lowering the
  // ceiling back under a real script's cost fails here instead of in someone's
  // preview.
  const MEASURED_EDITOR_COST_17K_LINES = 611_984;

  test("the default leaves room for a scene several times longer", () => {
    expect(DEFAULT_MAX_STEPS).toBeGreaterThan(
      MEASURED_EDITOR_COST_17K_LINES * 3,
    );
  });
});

describe("a budget of N permits N, not N minus one", () => {
  // A node is charged before it runs. If that charge also counted as
  // exhausting the budget, the last permitted expansion would be dequeued and
  // abandoned before advancing the story once — so `maxNodes: 1` would explore
  // nothing at all, and every budget would quietly mean one less than it says.
  test("a fork-free scene plans with a single node expansion", () => {
    const program = compileSrc(longScene(20));
    const toPath = targetPathForLine(program, 22);
    expect(toPath).not.toBe("0");

    // No decisions anywhere in this scene, so one expansion is the whole
    // search. If it needs two, the budget is being charged twice.
    const route = planRoute(newGame(program).story, "start", toPath, {
      stayWithinKnot: true,
      maxNodes: 1,
    });
    expect(route).toBeTruthy();
    expect(route!.steps.at(-1)!.path).toBe(toPath);
  }, 120_000);

  test("a budget of zero nodes explores nothing", () => {
    const program = compileSrc(longScene(20));
    const toPath = targetPathForLine(program, 22);
    const route = planRoute(newGame(program).story, "start", toPath, {
      stayWithinKnot: true,
      maxNodes: 0,
    });
    expect(route).toBeNull();
  }, 120_000);
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
      {
        stayWithinKnot: true,
        maxSteps: 5_000,
        maxNodes: 500,
        searchTimeout: Number.MAX_SAFE_INTEGER,
      },
    );
    expect(route).toBeNull();
    // A ceiling is what ended it. Without this the test would pass just as
    // happily if the fixture had quietly stopped looping, which would leave
    // nothing here exercising the ceiling at all.
    expect(lastSearchStats.exhaustedBudget).toBe(true);
  }, 120_000);
});

describe("a position already expanded is not expanded again", () => {
  // The skip itself, which nothing else here reaches: the other fixtures
  // either have no decision at all or pass each one only once, so the check
  // always claims and never rejects. A decision INSIDE a loop is the shape
  // that arrives at the same position twice, and it is the commonest loop
  // anyone writes.
  //
  // This matters because the skip is the one piece of the search whose failure
  // mode is silent: skip too eagerly and a reachable line is reported
  // unreachable, with no error anywhere.
  const BRANCH_IN_LOOP = `store flag = false

-> start

scene start
  Opening beat.
  if flag
    Went down the true side.
  else
    Went down the false side.
  end
  -> start
end
`;

  // Same loop, no decision in it, so no fork site can ever repeat.
  const PLAIN_LOOP = `-> start

scene start
  Going round.
  -> start
end
`;

  const searchForMissingTarget = (src: string) => {
    const program = compileSrc(src);
    planRoute(newGame(program).story, "start", "start.NO_SUCH_PATH", {
      stayWithinKnot: true,
      maxSteps: 400_000,
      maxNodes: 10_000,
      // These assertions are about work done, so the wall-clock backstop must
      // not be able to reach the finish line first on a slow machine.
      searchTimeout: Number.MAX_SAFE_INTEGER,
    });
    return { ...lastSearchStats };
  };

  test("a decision inside a loop stops early instead of running to the ceiling", () => {
    const withBranch = searchForMissingTarget(BRANCH_IN_LOOP);
    // The skip is what ended it, asserted directly rather than inferred from
    // the search finishing early: a fixture that had quietly stopped looping
    // would also finish early, and would satisfy every other assertion here.
    expect(withBranch.forkSitesSkipped).toBeGreaterThan(0);
    expect(withBranch.exhaustedBudget).toBe(false);
    expect(withBranch.stepsUsed).toBeLessThan(100_000);
  }, 300_000);

  test("a loop with no decision in it has nothing to skip, and runs to the ceiling", () => {
    // The control. Without it, the test above would pass just as well if the
    // fixture had quietly stopped looping.
    const plain = searchForMissingTarget(PLAIN_LOOP);
    expect(plain.forkSitesSkipped).toBe(0);
    expect(plain.exhaustedBudget).toBe(true);
    expect(plain.stepsUsed).toBeGreaterThanOrEqual(400_000);
  }, 300_000);
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
