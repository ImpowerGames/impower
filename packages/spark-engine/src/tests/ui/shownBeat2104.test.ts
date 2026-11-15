import { describe, expect, test } from "vitest";
import type { Clock } from "../../game/core/classes/Clock";
import { GameShownBeatMessage } from "../../game/core/classes/messages/GameShownBeatMessage";
import {
  createHarness,
  flushMicrotasks,
} from "./harness/uiTestHarness";

const SLOW = `define action as typewriter with
  letter_pause = 1
end
`;

const STORY = `scene start
  Go on
  choose
    * Pick
      -> after
  end
end

scene after
  Done
end
`;

const STEP_MS = 50;

function live(prelude: string) {
  const h = createHarness(`${prelude}\n${STORY}`, 0, {
    reactive: true,
    autoOpenAll: false,
  });
  const shown: { finished: boolean; at: number }[] = [];
  let now = 0;
  h.game.connection.outgoing.addListener(GameShownBeatMessage.method, (msg) => {
    if (GameShownBeatMessage.type.isNotification(msg)) {
      shown.push({ finished: msg.params.finished, at: now });
    }
  });
  const tick = async (ms: number) => {
    for (let t = 0; t < ms; t += STEP_MS) {
      await flushMicrotasks(2);
      now += STEP_MS;
      h.game.update({ deltaMS: STEP_MS, elapsedMS: now } as unknown as Clock);
    }
  };
  const lastLetterMs = (text: string) => {
    const beat = (h.game as any)._shownBeatOnScreen;
    const events = Object.values(beat?.text ?? {}).flat() as any[];
    expect(events.map((e) => e.text).join("")).toBe(text);
    return Math.max(...events.map((e) => (e.after ?? 0) * 1000));
  };
  const click = () =>
    h.game.connection.receive({
      jsonrpc: "2.0",
      method: "event",
      params: { type: "pointerdown", button: 0, currentTargetId: "game" },
    } as never);
  return { h, shown, tick, lastLetterMs, click, now: () => now };
}

describe("the game reports when a shown beat has finished (#2104)", () => {
  test("a slow line reports finished only after its last letter's own pause, and a click before then only finishes it", async () => {
    const g = live(SLOW);
    await g.h.ready;
    g.h.game.start();
    await g.tick(STEP_MS);
    expect(g.shown).toEqual([{ finished: false, at: 0 }]);
    const started = g.now();
    const last = g.lastLetterMs("Go on");
    expect(last).toBeGreaterThanOrEqual(4000);
    await g.tick(last + 500);
    expect(g.shown.filter((s) => s.finished)).toEqual([]);
    expect((g.h.game.story.currentText ?? "").trim()).toBe("Go on");
    await g.tick(1000);
    const finished = g.shown.filter((s) => s.finished);
    expect(finished).toHaveLength(1);
    expect(finished[0]!.at - started).toBeGreaterThanOrEqual(last + 1000);
    g.click();
    await g.tick(STEP_MS * 2);
    expect(g.h.game.story.currentChoices).toHaveLength(1);
    expect(g.shown.map((s) => s.finished)).toEqual([false, true, false, true]);
  });

  test("a click during the last letter's pause finishes the beat and reports it, without advancing", async () => {
    const g = live(SLOW);
    await g.h.ready;
    g.h.game.start();
    await g.tick(STEP_MS);
    const last = g.lastLetterMs("Go on");
    await g.tick(last + 300);
    g.click();
    await g.tick(STEP_MS * 2);
    expect((g.h.game.story.currentText ?? "").trim()).toBe("Go on");
    expect(g.shown.map((s) => s.finished)).toEqual([false, true]);
  });

  test("a preview reports nothing", async () => {
    const h = createHarness(`${SLOW}\n${STORY}`, 1, {
      reactive: true,
      autoOpenAll: false,
    });
    const shown: unknown[] = [];
    h.game.connection.outgoing.addListener(GameShownBeatMessage.method, (msg) => {
      shown.push(msg);
    });
    await h.ready;
    await h.preview(1);
    await flushMicrotasks(10);
    expect(shown).toEqual([]);
  });
});
