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

    interpreter._state.buffer = [
      { text: { action: [{ text: "STALE ABANDONED BEAT" }] }, end: 1 },
    ];
    expect(interpreter.shouldFlush()).toBe(true);

    (h.game as any)._simulation = "fail";
    h.reset();
    await h.preview(2);
    await flushMicrotasks(10);

    const stream = JSON.stringify(h.messages);
    expect(stream).not.toContain("STALE ABANDONED BEAT");
    expect(stream).toContain("Fresh line.");
  });

  test("clearQueuedBeats empties the FIFO and the run's remembered routing", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    const interpreter: any = h.game.module.interpreter;
    interpreter._state.buffer = [{ text: {}, end: 1 }];
    interpreter._routing = {
      target: "dialogue",
      character: "STALE",
      group: "inmemory:///main.sd#1",
    };
    interpreter.clearQueuedBeats();
    expect(interpreter._state.buffer).toEqual([]);
    expect(interpreter._routing).toBeUndefined();
    expect(interpreter.shouldFlush()).toBe(false);
  });
});
