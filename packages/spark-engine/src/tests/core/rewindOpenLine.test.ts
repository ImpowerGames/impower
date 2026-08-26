// #386 — what the engine does with a line the story is part-way through when
// it needs to rewind, reload or jump.
//
// The runtime refuses to replace story state while a line is still open, so
// each of those paths had to deal with the open line first, and each did it by
// running the line to its end. That was always wasted work — all three replace
// the story state on the very next line — and it could not be declined: a
// story sitting in a loop that never completes a line never finishes, so the
// call ran forever with no error raised and nothing to stop it.
//
// That shape is reachable, not hypothetical. The preview's recovery path runs
// precisely when execution was stopped part-way through a loop for running out
// of budget, so the recovery re-entered the loop that had just been declared a
// runaway, this time with nothing counting the work.
//
// What must hold now:
//   - letting go of an open line advances the story ZERO times, so no story
//     can make it take long, let alone forever;
//   - the story is genuinely left replaceable, so the rewind the flush exists
//     to enable actually happens;
//   - the story that comes back is clean — in particular it does not carry a
//     look-ahead snapshot of the run that was just discarded;
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

  return {
    game,
    errors,
    advances: () => advances,
    capAdvances: (extra: number) => {
      cap = advances + extra;
    },
    midLine: () => story.canContinue && !story.asyncContinueComplete,
    lookaheadSnapshot: () => story._stateSnapshotAtLastNewline,
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

  test("no look-ahead snapshot of the discarded run survives", () => {
    // The subtle half of the change. The snapshot the runtime keeps while it
    // reads ahead past a newline belongs to the STORY, not to the story state,
    // so replacing the state does not clear it. Left behind, the next continue
    // would compare against — and could roll back into — a story state that
    // had already been thrown away.
    const p = stoppedMidUnfinishableLine();
    p.capAdvances(200_000);
    p.game.reset();
    expect(p.lookaheadSnapshot()).toBeNull();
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

    const before = p.advances();
    (p.game as any)._simulation = "fail";
    p.capAdvances(200_000);
    expect(p.game.preview(URI, 2)).toBeTruthy();

    // The replay this preview performs still costs what it costs; what must
    // not happen is the unbounded flush in front of it. The cap is the real
    // assertion — before the change this call never returned.
    expect(p.advances() - before).toBeLessThan(200_000);
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
