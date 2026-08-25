// The fail-branch replay (`Game.start`/`preview` with `simulation: "fail"`)
// deliberately keeps module state across the story rewind — mounted layouts,
// event handlers, and the audio bookkeeping that mirrors still-playing
// renderer audio. The one piece that must NOT survive is the interpreter's
// beat FIFO: queued-but-unflushed beats from the abandoned run sit at the
// queue's head and would render FIRST in the replay (#370 residue audit).

import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SOURCE = `-> start
scene start
  Fresh line.
end
`;

describe("fail-branch replay discards the abandoned run's queued beats", () => {
  test("a stale queued beat does not render in the fail-branch replay", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    const interpreter: any = h.game.module.interpreter;

    // What an abandoned simulation leaves behind: an unflushed beat at the
    // FIFO's head.
    interpreter._state.buffer = [
      { text: { action: [{ text: "STALE ABANDONED BEAT" }] }, end: 1 },
    ];
    expect(interpreter.shouldFlush()).toBe(true);

    (h.game as any)._simulation = "fail";
    h.reset(); // capture only what the replay emits
    h.preview(2); // the "Fresh line." beat — drives the preview fail arm
    await flushMicrotasks(10);

    // The replay re-queued from the preview path; its display must carry
    // nothing from the abandoned run. The MESSAGE STREAM is the observation
    // surface — the coordinator flushes the FIFO internally during the
    // replay, so inspecting the queue afterwards proves nothing.
    const stream = JSON.stringify(h.messages);
    expect(stream).not.toContain("STALE ABANDONED BEAT");
    expect(stream).toContain("Fresh line.");
  });

  test("clearQueuedBeats empties only the FIFO", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    const interpreter: any = h.game.module.interpreter;
    interpreter._state.buffer = [{ text: {}, end: 1 }];
    interpreter.clearQueuedBeats();
    expect(interpreter._state.buffer).toEqual([]);
    expect(interpreter.shouldFlush()).toBe(false);
  });
});
