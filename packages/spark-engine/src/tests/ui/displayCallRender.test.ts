// End-to-end engine wiring for the display-as-Luau-call transport: a
// `display(<table>)` beat must travel the SAME per-beat path a normal text beat
// does — Game's continue loop → interpreter buffer → shouldFlush → flush →
// Coordinator fan-out → renderer message — but carrying a pre-parsed structured
// table instead of a flat string the interpreter re-scans char-by-char.
//
// This closes the loop the Story-level spike (displayCall.spike.test.ts) left
// open: that proved the table reaches `story.currentDisplayInstructions`; this
// proves the engine then routes it via `interpreter.queueInstructions` to a
// flushed, rendered beat.

import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";
import { WriteTextMessage } from "../../game/modules/ui/classes/messages/WriteTextMessage";

const SCREEN = `screen main with
  action:
    text
end
`;

async function beatFor(body: string, instant = true) {
  const harness = createHarness(
    `${SCREEN}\n-> start\n\nscene start\n${body}\nend\n`,
  );
  await harness.ready;
  harness.jumpTo("start");
  harness.reset();
  const beat = harness.nextBeat();
  await harness.display(beat!, instant);
  await flushMicrotasks();
  return { harness, beat };
}

describe("display() call → rendered beat (engine wiring)", () => {
  test("a display({target,text}) beat flushes structured text instructions", async () => {
    const { harness, beat } = await beatFor(
      `  & display({ target = "action", text = "Hello." })`,
    );
    // The beat routed via the table (target from the call, not a regex/tag);
    // the body text renders through the same per-glyph parse() as legacy, so the
    // events concatenate back to the body.
    expect(Object.keys(beat?.text ?? {})).toEqual(["action"]);
    expect(textOf(beat, "action")).toBe("Hello.");
    // And the Coordinator fanned the flushed beat out to the renderer.
    const writes = harness.messages.filter(
      (m) => m.method === WriteTextMessage.method,
    );
    expect(writes.length).toBeGreaterThan(0);
  });

  test("consecutive display() calls render as separate beats", async () => {
    // Each call is its own beat (the display-count boundary from the spike), so
    // nextBeat() returns the first; the second is still pending.
    const harness = createHarness(
      `${SCREEN}\n-> start\n\nscene start\n` +
        `  & display({ target = "action", text = "first" })\n` +
        `  & display({ target = "action", text = "second" })\n` +
        `end\n`,
    );
    await harness.ready;
    harness.jumpTo("start");
    harness.reset();

    const first = harness.nextBeat();
    expect(textOf(first, "action")).toBe("first");

    const second = harness.nextBeat();
    expect(textOf(second, "action")).toBe("second");
  });
});

/** Concatenate a target's text events back into the rendered string (parse()
 *  emits one event per glyph/chunk for the typewriter). */
function textOf(
  beat: { text?: Record<string, { text?: string }[]> } | undefined,
  target: string,
): string {
  return (beat?.text?.[target] ?? [])
    .map((e) => e.text ?? "")
    .join("");
}
