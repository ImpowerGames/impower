// A spaced `>` break ends a beat that waits for a click, even when the beat
// has no text: a line holding only `>` shows its box empty, and a picture line
// ending in `>` shows the picture and waits, rather than folding into the next
// line's beat.

import { describe, expect, test } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { findClosestPath } from "../../game/core/utils/findClosestPath";
import {
  compileUI,
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

  test("an inherited beat and a newer continuation can share a step", async () => {
    // `.. C > D ..` holds the next line open, so the step that shows `D`
    // also carries the continuation for `F`. The beat inherits by the group
    // that asked to inherit, while the step is remembered by the group whose
    // break produces the next beat; every beat here joined HERO.
    const harness = createHarness(
      `${DEFS}\n-> start\n\nscene start\n  HERO: A -> later\nend\n\nscene later\n  VILLAIN: B\n  .. C > D ..\n  E > F\nend\n`,
    );
    await harness.ready;
    harness.jumpTo("start");
    const beats = [
      harness.nextBeat(),
      harness.nextBeat(),
      harness.nextBeat(),
    ];
    expect(beats.map(typed)).toEqual(["A B C", "D E", "F"]);
    expect(beats.map(cue)).toEqual(["HERO", "HERO", "HERO"]);
  });

  test("a comment between a line and its continuation keeps the cue", async () => {
    // A `//` line shows nothing, so the `..` reaches across it at run time;
    // the line after it continues the line before it, and the beat after its
    // break keeps that line's cue.
    for (const body of [
      `  HERO: A ..\n  // note\n  B > C`,
      `  HERO: A\n  // note\n  .. B > C`,
    ]) {
      const harness = createHarness(story(body));
      await harness.ready;
      harness.jumpTo("start");
      const joined = harness.nextBeat();
      expect(typed(joined)).toBe("A B");
      const after = harness.nextBeat();
      expect(typed(after)).toBe("C");
      expect(cue(after)).toBe("HERO");
    }
  });

  test("routing a continuation remembers does not outlive its run", async () => {
    // The beats of an abandoned run are not this run's, so the beat a
    // continuation would inherit from is gone with them. The continuation is
    // reached by a divert from HERO but is written under VILLAIN, so the two
    // answers differ: after the run is dropped, the beat takes the cue its
    // own line reads.
    const source = `${DEFS}\n-> start\n\nscene start\n  HERO: A -> later\nend\n\nscene later\n  VILLAIN: B\n  .. joined > After.\nend\n`;
    const line = source.split("\n").findIndex((l) => l.includes("joined"));
    const primed = async () => {
      const harness = createHarness(source);
      await harness.ready;
      harness.jumpTo("start");
      // The joined beat remembers HERO for the continuation.
      expect(cue(harness.nextBeat())).toBe("HERO");
      return harness;
    };
    const lastBeatOf = (harness: any) =>
      findClosestPath(
        { file: MAIN_URI, line },
        harness.game.program.pathLocations,
        Object.keys(harness.game.program.scripts),
        "last",
      )!;

    // The run is abandoned, which is what every abandoning path does.
    const abandoned = await primed();
    abandoned.game.module.interpreter.clearQueuedBeats();
    abandoned.jumpTo(lastBeatOf(abandoned));
    const afterAbandon = abandoned.nextBeat();
    expect(typed(afterAbandon)).toBe("After.");
    expect(cue(afterAbandon)).toBe("VILLAIN");

    // The program is replaced, which an edit does. The source is the same
    // length, so the continuation keeps its name.
    const updated = await primed();
    updated.game.updateProgram(compileUI(source).program as any);
    updated.jumpTo(lastBeatOf(updated));
    const afterUpdate = updated.nextBeat();
    expect(typed(afterUpdate)).toBe("After.");
    expect(cue(afterUpdate)).toBe("VILLAIN");
  });

  test("a beat never inherits from a continuation of another file", async () => {
    // Source offsets start again in every script, so both continuations
    // begin at the same offset in their own file. Priming the first file's
    // continuation and then jumping straight into the second must not carry
    // the first file's cue across.
    const INCLUDE = "inmemory:///evil.sd";
    const main = `${DEFS}\ninclude evil.sd\n\n-> start\n\nscene start\n  HERO: A.\n  .. joined > After.\nend\n`;
    const head = `scene evil\n  EVIL: `;
    const evil = `${head}${"B".repeat(
      main.indexOf("  .. joined") - head.length - 2,
    )}.\n  .. joined > After.\nend\n`;
    // The continuations of the two files start at the same offset.
    expect(evil.indexOf("  .. joined")).toBe(main.indexOf("  .. joined"));
    const harness = createHarness(main, 0, { scripts: { [INCLUDE]: evil } });
    await harness.ready;
    harness.jumpTo("start");
    expect(cue(harness.nextBeat())).toBe("HERO");

    const line = evil.split("\n").findIndex((l) => l.includes("joined"));
    const path = findClosestPath(
      { file: INCLUDE, line },
      harness.game.program.pathLocations,
      Object.keys(harness.game.program.scripts),
      "last",
    );
    expect(path).toBeTruthy();
    harness.jumpTo(path!);
    const beat = harness.nextBeat();
    expect(typed(beat)).toBe("After.");
    expect(cue(beat)).toBe("EVIL");
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
