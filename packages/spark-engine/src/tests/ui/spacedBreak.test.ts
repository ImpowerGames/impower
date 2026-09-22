// A spaced `>` break ends a beat that waits for a click, even when the beat
// has no text: a line holding only `>` shows its box empty, and a picture line
// ending in `>` shows the picture and waits, rather than folding into the next
// line's beat.

import { describe, expect, test } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { findClosestPath } from "../../game/core/utils/findClosestPath";
import {
  createHarness,
  flushMicrotasks,
  MAIN_URI,
} from "./harness/uiTestHarness";

const DEFS = `define HERO as character with
  name = "HERO"
end

define VILLAIN as character with
  name = "VILLAIN"
end

define BG as image with
  src = "https://example.com/bg.png"
end

layout main with
  stage:
    backdrop:
      image
  textbox:
    character_info:
      character_name:
        text
    dialogue:
      text
    action:
      text
end
`;

function story(body: string) {
  return `${DEFS}\n-> start\n\nscene start\n${body}\nend\n`;
}

/** Every character a beat types into its body, leaving out the cue. */
const typed = (beat: any): string =>
  Object.entries(beat?.text ?? {})
    .filter(([target]) => !target.startsWith("character_"))
    .flatMap(([, events]) => events as any[])
    .map((event: any) => event.text ?? "")
    .join("");

/** The cue a beat shows, if any. */
const cue = (beat: any): string =>
  ((beat?.text?.character_name ?? []) as any[])
    .map((event: any) => event.text ?? "")
    .join("");

/** Whether the beat, just shown, would move on without a click. */
const advancesByItself = (harness: any, beat: any): boolean =>
  new Coordinator(harness.game, beat).shouldContinue() > 0;

describe("spaced `>` break", () => {
  test("a lone `>` shows an empty box and waits for a click", async () => {
    const harness = createHarness(
      story(`  HERO: Hi.\n  >\n  HERO: Bye.`),
    );
    await harness.ready;
    harness.jumpTo("start");
    expect(typed(harness.nextBeat())).toBe("Hi.");

    const pause = harness.nextBeat();
    expect(pause?.text).toBeDefined();
    expect(typed(pause)).toBe("");
    expect(advancesByItself(harness, pause)).toBe(false);
    harness.reset();
    await harness.display(pause!, true);
    await flushMicrotasks();
    expect(harness.snapshotWire("ui/")).toMatchSnapshot();

    expect(typed(harness.nextBeat())).toBe("Bye.");
  });

  test("a break on a glued continuation keeps the cue of the line it continues", async () => {
    const harness = createHarness(story(`  HERO: Hi.\n  .. more > Bye.`));
    await harness.ready;
    harness.jumpTo("start");
    const joined = harness.nextBeat();
    expect(typed(joined)).toBe("Hi. more");
    expect(Object.keys(joined?.text ?? {}).sort()).toEqual([
      "character_name",
      "dialogue",
    ]);
    expect(advancesByItself(harness, joined)).toBe(false);
    const after = harness.nextBeat();
    expect(typed(after)).toBe("Bye.");
    expect(Object.keys(after?.text ?? {}).sort()).toEqual([
      "character_name",
      "dialogue",
    ]);
  });

  test("a continuation's beat reached on its own keeps its own line's cue", async () => {
    // What a preview does when the route to the point failed: it jumps
    // straight to the beat. Nothing joined this continuation, so the beat
    // after its break takes the cue the line it continues reads, and never
    // the cue of a beat that happens to have run before.
    const source = story(
      `  HERO: A.\n  .. hero joined > Hero after.\n  VILLAIN: V.\n  .. villain joined > Villain after.`,
    );
    const harness = createHarness(source);
    await harness.ready;
    // Run the HERO line first, so a beat with another cue is what the
    // interpreter last queued.
    harness.jumpTo("start");
    expect(cue(harness.nextBeat())).toBe("HERO");

    // Then jump straight to the last beat of the VILLAIN continuation.
    const program = harness.game.program;
    const line = source
      .split("\n")
      .findIndex((l) => l.includes("villain joined"));
    const path = findClosestPath(
      { file: MAIN_URI, line },
      program.pathLocations,
      Object.keys(program.scripts),
      "last",
    );
    expect(path).toBeTruthy();
    harness.jumpTo(path!);
    const beat = harness.nextBeat();
    expect(typed(beat)).toBe("Villain after.");
    expect(cue(beat)).toBe("VILLAIN");
  });

  test("a step holding several continuations is remembered by the last", async () => {
    // Glue keeps every continuation of the step open, so its tables name
    // several continuations. The beat after the break belongs to the LAST of
    // them, and keeps the cue of the beat the run actually joined (HERO),
    // not the cue its own line reads (VILLAIN).
    const harness = createHarness(
      `${DEFS}\n-> start\n\nscene start\n  HERO: A -> later\nend\n\nscene later\n  VILLAIN: B\n  .. C\n  .. D > E\nend\n`,
    );
    await harness.ready;
    harness.jumpTo("start");
    const joined = harness.nextBeat();
    expect(typed(joined)).toBe("A B C D");
    expect(cue(joined)).toBe("HERO");
    const after = harness.nextBeat();
    expect(typed(after)).toBe("E");
    expect(cue(after)).toBe("HERO");
  });

  test("routing a continuation remembers does not outlive its run", async () => {
    // The beats of an abandoned run are not this run's, so the beat a
    // continuation would inherit from is gone with them. `clearQueuedBeats`
    // is what every abandoning path calls.
    const source = story(`  HERO: A.\n  .. joined > After.`);
    const harness = createHarness(source);
    await harness.ready;
    harness.jumpTo("start");
    expect(cue(harness.nextBeat())).toBe("HERO");

    const interpreter: any = harness.game.module.interpreter;
    expect(interpreter._state.routing).toBeTruthy();
    interpreter.clearQueuedBeats();
    expect(interpreter._state.routing).toBeUndefined();

    const line = source.split("\n").findIndex((l) => l.includes("joined"));
    const path = findClosestPath(
      { file: MAIN_URI, line },
      harness.game.program.pathLocations,
      Object.keys(harness.game.program.scripts),
      "last",
    );
    harness.jumpTo(path!);
    // Nothing joined the continuation in this run, so the beat names the
    // line its own source reads, which is the same cue here; what matters is
    // that it is read from the table and not from the run that was dropped.
    const beat = harness.nextBeat();
    expect(typed(beat)).toBe("After.");
    expect(cue(beat)).toBe("HERO");
  });

  test("a picture line ending in `>` shows the picture and waits", async () => {
    const harness = createHarness(
      story(`  [[show backdrop BG]] >\n  Next.`),
    );
    await harness.ready;
    harness.jumpTo("start");

    const picture = harness.nextBeat();
    expect(picture?.image).toBeDefined();
    expect(typed(picture)).toBe("");
    expect(advancesByItself(harness, picture)).toBe(false);

    expect(typed(harness.nextBeat())).toBe("Next.");
  });
});
