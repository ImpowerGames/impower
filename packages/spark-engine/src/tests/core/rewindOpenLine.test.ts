// #386 — what the engine does with a line the story is part-way through when
// it needs to rewind, reload, jump, or plan a route.
//
// The runtime refuses to replace story state while a line is still open, so
// every one of those paths had to deal with the open line first, and each did
// it by running the line to its end. That was always wasted work — they all
// replace the story state immediately afterwards — and it could not be
// declined: a story sitting in a loop that never completes a line never
// finishes, so the call ran forever with no error raised and nothing to stop
// it.
//
// That shape is reachable, not hypothetical, and by more than one door. The
// route planner reaches it as a matter of course: it drives the story one step
// at a time and stops on its own step budget, so it is mid-line whenever it
// tidies up. The preview's recovery path reaches it too, running precisely
// when execution was stopped part-way through a loop for running out of
// budget.
//
// What must hold now:
//   - letting go of an open line advances the story ZERO times, on every path
//     that does it, so no story can make it take long, let alone forever;
//   - the story is genuinely left replaceable, so the rewind the discard
//     exists to enable actually happens;
//   - the look-ahead snapshot of the discarded run is cleared — it lives on
//     the story rather than the story state, so replacing the state does not
//     clear it, and a stale one could roll a later run back into a story state
//     that had already been thrown away;
//   - ordinary content still resets and replays exactly as before.
//
// Every assertion counts story advances rather than elapsed time. A test for a
// hang that waits on a clock reaches a different verdict on a busy machine;
// counting advances makes "this used to run forever" fail in under a second,
// the same way every time.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
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

/** A story that can always continue and never completes a line: two scenes
 *  that divert to each other and emit nothing. Every other guard in the engine
 *  counts completed lines or bounded stretches of execution, so this is the
 *  one shape that slips past them all. */
const UNFINISHABLE_LINE = [
  "-> a",
  "",
  "scene a",
  "  -> b",
  "end",
  "",
  "scene b",
  "  -> a",
  "end",
  "",
].join("\n");

/** Ordinary content, for the cases that must be unaffected. */
const ORDINARY = [
  "-> start",
  "",
  "scene start",
  "  The first thing that happens.",
  "  The second thing that happens.",
  "  The third thing that happens.",
  "end",
  "",
].join("\n");

const newGame = (program: unknown, executionStepLimit?: number) =>
  new Game({
    program: program as any,
    now: () => performance.now(),
    ...(executionStepLimit ? { executionStepLimit } : {}),
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);

interface Probe {
  game: Game;
  /** Runtime errors the engine reported to its host. */
  errors: string[];
  /** Story advances taken so far — the thing that used to be unbounded. */
  advances(): number;
  /** Throw instead of running forever, so an unbounded path FAILS this test
   *  rather than hanging the suite. */
  capAdvances(extra: number): void;
  /** True while a line is open: the state that forces the discard to happen. */
  midLine(): boolean;
  /** The look-ahead snapshot, which lives on the story rather than on the
   *  story state — so replacing the state does NOT clear it. */
  lookaheadSnapshot(): unknown;
  /** How many times the engine let go of an open line, and how many story
   *  advances it spent doing so. Recorded at the engine's own seam so that a
   *  path which stopped calling it — by going back to a bare `Continue()`, say
   *  — reads as zero discards rather than as zero cost. */
  discards(): { count: number; advancesSpent: number };
}

const probe = (game: Game): Probe => {
  const anyGame = game as any;
  const errors: string[] = [];
  const realError = anyGame.Error.bind(anyGame);
  anyGame.Error = (message: string, ...rest: unknown[]) => {
    errors.push(String(message));
    return realError(message, ...rest);
  };

  const story: any = game.story;
  let advances = 0;
  let cap = Infinity;
  const realSingleStep = story.ContinueSingleStep.bind(story);
  story.ContinueSingleStep = () => {
    advances += 1;
    if (advances > cap) {
      throw new Error(
        `story advanced past the ${cap}-advance cap this test imposes: ` +
          `the path under test is unbounded`,
      );
    }
    return realSingleStep();
  };

  let discardCount = 0;
  let discardAdvances = 0;
  const realDiscard = anyGame.discardOpenStoryLine.bind(anyGame);
  anyGame.discardOpenStoryLine = () => {
    discardCount += 1;
    const before = advances;
    try {
      return realDiscard();
    } finally {
      discardAdvances += advances - before;
    }
  };

  return {
    game,
    errors,
    advances: () => advances,
    capAdvances: (extra: number) => {
      cap = advances + extra;
    },
    midLine: () => story.canContinue && !story.asyncContinueComplete,
    lookaheadSnapshot: () => story._stateSnapshotAtLastNewline,
    discards: () => ({ count: discardCount, advancesSpent: discardAdvances }),
  };
};

/** Reproduce the ticket's starting position: run the unfinishable story until
 *  the execution budget stops it, which leaves a line open part-way through. */
const stoppedMidUnfinishableLine = () => {
  const program = compileSrc(UNFINISHABLE_LINE);
  // Small only so the setup is quick; the shipped ceiling reaches the same
  // state, several seconds later.
  const p = probe(newGame(program, 5_000));
  p.game.start();

  // The precondition the rest of the file depends on.
  expect(p.errors.join("\n")).toContain("possible infinite loop");
  expect(p.midLine()).toBe(true);
  p.errors.length = 0;
  return p;
};

/** What a reset costs when there is no open line to deal with: re-declaring the
 *  story's globals, and nothing else. Any advance beyond this is the discard
 *  running the story, which is the thing that must not happen. */
const resetCostWithNothingOpen = () => {
  const p = probe(newGame(compileSrc(UNFINISHABLE_LINE), 5_000));
  const before = p.advances();
  p.game.reset();
  expect(p.midLine()).toBe(false);
  return p.advances() - before;
};

/** The assertion every path shares: the engine really did let go of the open
 *  line, and doing so ran the story not at all. A bounded-but-nonzero flush
 *  fails this just as an unbounded one does. */
const expectDiscardedForFree = (p: Probe) => {
  const { count, advancesSpent } = p.discards();
  expect(count).toBeGreaterThan(0);
  expect(advancesSpent).toBe(0);
};

/** Drive an ordinary story one advance at a time — the same unit the engine's
 *  own step loop uses — and stop on the step that takes a look-ahead snapshot
 *  while the continue is still open.
 *
 *  Reaching that state deliberately matters: the runtime only takes a snapshot
 *  after a line ends in a newline with more content to come, so a story that
 *  emits nothing never has one, and an assertion made against such a story
 *  would pass whatever the code did. */
const driveToOpenSnapshot = () => {
  const p = probe(newGame(compileSrc(ORDINARY)));
  const story: any = p.game.story;
  story.ChoosePathString("start");
  for (let i = 0; i < 60 && story.canContinue; i += 1) {
    story.ContinueAsync(Infinity);
    if (story._stateSnapshotAtLastNewline !== null && p.midLine()) {
      return p;
    }
  }
  throw new Error("fixture never reached an open line holding a snapshot");
};

describe("letting go of a line the story cannot finish", () => {
  test("the rewind does not advance the story at all", () => {
    const baseline = resetCostWithNothingOpen();
    expect(baseline).toBeGreaterThan(0); // the globals really are re-declared

    const p = stoppedMidUnfinishableLine();
    const before = p.advances();
    // Generous next to the baseline, nowhere near forever. The version that
    // finished the line blows straight through this.
    p.capAdvances(baseline + 100_000);
    p.game.reset();

    // The point of the change, stated exactly: an open line costs the same as
    // no open line, because it is discarded rather than run.
    expect(p.advances() - before).toBe(baseline);
    expectDiscardedForFree(p);
  }, 300_000);

  test("the story is genuinely left replaceable", () => {
    const p = stoppedMidUnfinishableLine();
    p.capAdvances(200_000);

    // `Story.ResetState` throws outright if a line is still open, so a discard
    // that failed to close the continue would surface here rather than as a
    // quietly skipped rewind.
    expect(() => p.game.reset()).not.toThrow();
    expect(p.midLine()).toBe(false);
  }, 300_000);

  test("jumping to a path lets go of the line the same way", () => {
    const baseline = resetCostWithNothingOpen();
    const p = stoppedMidUnfinishableLine();
    const before = p.advances();
    p.capAdvances(baseline + 100_000);

    expect(() => p.game.jumpToPath("a")).not.toThrow();
    expect(p.midLine()).toBe(false);
    // A jump re-declares globals like a reset does, and does nothing else.
    expect(p.advances() - before).toBe(baseline);
    expectDiscardedForFree(p);
  }, 300_000);

  test("loading a save lets go of the line the same way", () => {
    // `load` carries the same discard and is reached by the editor's own
    // checkpoint restore, so it needs its own coverage: with only `rewindStory`
    // and `jumpToPath` converted, everything else in this file still passes.
    const save = newGame(compileSrc(UNFINISHABLE_LINE), 5_000).save();
    const p = stoppedMidUnfinishableLine();
    p.capAdvances(200_000);

    expect(() => p.game.load(save)).not.toThrow();
    expect(p.midLine()).toBe(false);
    expectDiscardedForFree(p);
  }, 300_000);

  test("a save that cannot be read leaves the open line alone", () => {
    // Letting go of a line cannot be undone, so it must not happen until the
    // save is known to carry a story to put in its place. Discarding first and
    // then failing to load leaves the line torn in half with no replacement:
    // the next continue resumes from the middle of it, dropping the text and
    // the routing tag that decide how the beat is displayed.
    const p = driveToOpenSnapshot();
    expect(p.midLine()).toBe(true);

    expect(p.game.load("{ this is not a save")).toBe(false);

    expect(p.discards().count).toBe(0);
    expect(p.midLine()).toBe(true);
  }, 300_000);

  test("the STOP-to-PLAY restart lets go of the line the same way", () => {
    // The path the ticket names first. Pressing play after stop re-enters
    // `start`, and when the preceding simulation failed that takes the arm
    // which rewinds the story instead of resetting the modules.
    const p = stoppedMidUnfinishableLine();
    (p.game as any)._simulation = "fail";
    p.capAdvances(200_000);

    expect(() => p.game.start()).not.toThrow();
    expectDiscardedForFree(p);
  }, 300_000);

  test("the preview's own recovery path no longer re-enters the loop", () => {
    // The combination the ticket calls out, driven end to end through the real
    // entry point rather than by calling the rewind directly.
    //
    // Previewing a line whose route simulation failed recovers by rewinding
    // the story and replaying from the preview point. Preview one line and
    // that replay runs out of execution budget, which leaves the story
    // part-way through a line. Preview a second line and the recovery rewinds
    // THAT story — re-entering the very loop that had just been declared a
    // runaway, with nothing counting it.
    const p = probe(newGame(compileSrc(UNFINISHABLE_LINE), 5_000));

    (p.game as any)._simulation = "fail";
    expect(p.game.preview(URI, 3)).toBeTruthy();
    expect(p.errors.join("\n")).toContain("possible infinite loop");
    expect(p.midLine()).toBe(true);

    (p.game as any)._simulation = "fail";
    p.capAdvances(200_000);
    expect(p.game.preview(URI, 2)).toBeTruthy();

    // The replay this preview performs still costs what it costs. What must
    // not happen is any advance inside the discard in front of it — which is
    // exactly what a re-bounded flush, rather than a removed one, would spend.
    expectDiscardedForFree(p);
  }, 300_000);
});

describe("the route planner lets go of an open line too", () => {
  test("planning a route returns instead of running forever", () => {
    // The planner tidies the story up at the end of every search and before
    // every start node, and it is mid-line as a matter of course: it drives
    // the story one step at a time and stops on its own step budget. So it
    // carried the same unbounded flush, and reached it FIRST — the editor
    // plans a route on every cursor move, well before any of the engine's
    // recovery paths could run.
    const program = compileSrc(UNFINISHABLE_LINE);
    const game = newGame(program);
    const anyGame = game as any;
    const story: any = game.story;

    let advances = 0;
    const cap = 600_000;
    const realSingleStep = story.ContinueSingleStep.bind(story);
    story.ContinueSingleStep = () => {
      advances += 1;
      if (advances > cap) {
        throw new Error(
          `story advanced past the ${cap}-advance cap this test imposes: ` +
            `route planning is unbounded`,
        );
      }
      return realSingleStep();
    };

    game.setStartFrom({ file: URI, line: 3 });
    const toPath = anyGame.startPath as string;
    expect(toPath).toBeTruthy();

    expect(() =>
      Game.planRoute(
        game.story,
        program as any,
        Game.getSimulateFromPath(toPath),
        toPath,
      ),
    ).not.toThrow();
  }, 300_000);
});

describe("the look-ahead snapshot of the discarded run is cleared", () => {
  // The subtle half of the change, and the half a loop that emits nothing
  // cannot exercise at all: the runtime only takes a look-ahead snapshot after
  // a line actually ends in a newline with more content to come, so a story
  // with no text never sets one and an assertion made against it would pass
  // whatever the code did.
  //
  // So the tests below reach the state deliberately, via `driveToOpenSnapshot`.

  test("the state this test needs is actually reachable", () => {
    // Guards the test below from silently becoming vacuous: if the runtime
    // stops taking look-ahead snapshots here, this fails loudly rather than
    // leaving an assertion that passes because it never runs.
    const p = driveToOpenSnapshot();
    expect(p.lookaheadSnapshot()).not.toBeNull();
    expect(p.midLine()).toBe(true);
  }, 300_000);

  test("loading a save clears it, so no later run can roll back into it", () => {
    // Load is the path that proves this, and the only one that can. Reset and
    // jump both re-declare the story's globals afterwards, and that runs a
    // continue of its own whose own wrap-up happens to clear the snapshot — so
    // on those paths the discard could skip the rollback entirely and nothing
    // would show it. Load replaces the state outright and runs no continue, so
    // a discard that failed to roll the snapshot back leaves it dangling,
    // pointing at a story state that has just been thrown away.
    const save = newGame(compileSrc(ORDINARY)).save();
    const p = driveToOpenSnapshot();
    expect(p.lookaheadSnapshot()).not.toBeNull();
    p.capAdvances(200_000);

    expect(p.game.load(save)).toBe(true);

    expect(p.lookaheadSnapshot()).toBeNull();
    expect(p.midLine()).toBe(false);
    expectDiscardedForFree(p);
  }, 300_000);

  test("the route simulator's position is dropped, not handed to the next route", () => {
    // Reading ahead records a second thing alongside the story snapshot: where
    // the route simulator had got to in the decisions it feeds the story. It
    // lives on the story too, so replacing the state does not clear it — and
    // the simulator attached when the discard happens need not be the one the
    // abandoned run was reading from, because route simulation attaches the
    // NEXT route's simulator first. Putting one route's consumed position into
    // another route's simulator makes it skip the decisions it was meant to
    // force, and the replay silently takes the wrong branch.
    const p = probe(newGame(compileSrc(ORDINARY)));
    const story: any = p.game.story;

    const makeSimulator = (label: string) => ({
      label,
      restored: [] as unknown[],
      saveSnapshot: () => ({ label, at: "abandoned-run" }),
      restoreSnapshot(snap: unknown) {
        this.restored.push(snap);
      },
      forceChoice: () => null,
      forceCondition: () => null,
    });

    // The run that gets abandoned, reading from its own simulator.
    const abandoned = makeSimulator("route-a");
    story.simulator = abandoned;
    story.ChoosePathString("start");
    let reached = false;
    for (let i = 0; i < 60 && story.canContinue; i += 1) {
      story.ContinueAsync(Infinity);
      if (story._simulatorSnapshotAtLastNewline != null && p.midLine()) {
        reached = true;
        break;
      }
    }
    // Guards this test from going vacuous if the runtime stops recording it.
    expect(reached).toBe(true);

    // What route simulation does next: attach the new route's simulator, then
    // replace the story state.
    const next = makeSimulator("route-b");
    story.simulator = next;
    p.capAdvances(200_000);
    p.game.reset();

    expect(next.restored).toEqual([]);
    expect(story._simulatorSnapshotAtLastNewline).toBeNull();
  }, 300_000);

  test("rewinding clears it too, and the story still replays correctly", () => {
    const p = driveToOpenSnapshot();
    p.capAdvances(200_000);
    p.game.reset();

    expect(p.lookaheadSnapshot()).toBeNull();
    expect(p.midLine()).toBe(false);
    expectDiscardedForFree(p);

    const story: any = p.game.story;
    story.ChoosePathString("start");
    const lines: string[] = [];
    let guard = 0;
    while (story.canContinue && guard < 10_000) {
      guard += 1;
      const text = String(story.Continue() ?? "").trim();
      if (text) {
        lines.push(text);
      }
    }
    expect(lines).toEqual([
      "The first thing that happens.",
      "The second thing that happens.",
      "The third thing that happens.",
    ]);
  }, 300_000);
});

describe("a cancel is refused from inside a continue", () => {
  test("it throws rather than turning the running slice unbounded", () => {
    // Clearing the flag while a continue's own loop is still on the stack
    // disables the break that ends its slice, so the loop would run the line
    // to its end — and the line that cannot end is exactly what this whole
    // change exists to survive. Nothing in the engine does this today; the
    // guard is what keeps it that way.
    const game = newGame(compileSrc(ORDINARY));
    const story: any = game.story;
    story.ChoosePathString("start");

    let thrown: Error | null = null;
    const realStep = story.ContinueSingleStep.bind(story);
    story.ContinueSingleStep = () => {
      // Inside the continue's own loop: _recursiveContinueCount is non-zero.
      if (!thrown) {
        try {
          story.CancelAsyncContinue();
        } catch (e) {
          thrown = e as Error;
        }
      }
      return realStep();
    };

    story.ContinueAsync(Infinity);
    expect(thrown).not.toBeNull();
    expect(String(thrown)).toContain("CancelAsyncContinue");
  }, 300_000);
});

describe("ordinary content is unaffected", () => {
  test("a normal story resets with nothing reported", () => {
    const p = probe(newGame(compileSrc(ORDINARY)));
    p.game.start();
    p.game.reset();
    expect(p.errors).toEqual([]);
    expect(p.midLine()).toBe(false);
  }, 300_000);

  test("a normal story replays its lines in order after a rewind", () => {
    // Discarding an open line must not cost content on the paths that are not
    // broken: after the rewind the story has to replay from the top, in order,
    // exactly as it did the first time.
    const program = compileSrc(ORDINARY);
    const game = newGame(program);
    const story: any = game.story;

    const readAll = () => {
      const lines: string[] = [];
      let guard = 0;
      while (story.canContinue && guard < 10_000) {
        guard += 1;
        const text = String(story.Continue() ?? "").trim();
        if (text) {
          lines.push(text);
        }
      }
      return lines;
    };

    game.jumpToPath("start");
    const first = readAll();
    expect(first).toEqual([
      "The first thing that happens.",
      "The second thing that happens.",
      "The third thing that happens.",
    ]);

    game.jumpToPath("start");
    expect(readAll()).toEqual(first);
  }, 300_000);
});
