// Every stream the game sends carries an epoch, and the page drops what an
// older stream still had in flight once a newer one has begun. With the game
// on another thread, a superseded preview's messages can arrive after the
// preview that replaced it started; they must not paint over it.

import { compileUI } from "@impower/spark-engine/src/tests/ui/harness/uiTestHarness";
import { cloneMessage } from "@impower/spark-engine/src/tests/harness/cloneMessage";
import { describe, expect, test } from "vitest";
import { MessageRouter } from "../../app/MessageRouter";
import { createDOMHarness, flushMicrotasks, serializeDOM } from "./domTestHarness";

const EARLIER = `layout main with
  stage:
    earlier_panel:
      text
end
`;

const LATER = `layout main with
  stage:
    later_panel:
      text
end
`;

describe("stream epochs", () => {
  test("an earlier stream's messages that arrive after a later one began do not change the DOM", async () => {
    const h = createDOMHarness(EARLIER, 0, { reactive: true });
    await h.ready;
    await flushMicrotasks(10);

    // The game's second stream shows EARLIER; what it sends is kept, to
    // arrive again once the third stream has begun.
    const late: any[] = [];
    await h.game.connect((message) => {
      const arrived = cloneMessage(message);
      late.push(arrived);
      h.router.receive(arrived);
    });
    await flushMicrotasks(10);
    expect(late.length).toBeGreaterThan(0);
    expect(new Set(late.map((m) => m.epoch))).toEqual(new Set([2]));

    // The third stream shows LATER.
    h.game.updateProgram(compileUI(LATER).program as any);
    await h.game.connect((message) => h.router.receive(cloneMessage(message)));
    await flushMicrotasks(10);
    h.game.module.ui.sweepReconcile();
    await flushMicrotasks(10);
    expect(h.router.epoch).toBe(3);
    expect(h.overlay.querySelector(".later_panel")).not.toBeNull();
    expect(h.overlay.querySelector(".earlier_panel")).toBeNull();
    const shown = serializeDOM(h.overlay);

    for (const message of late) {
      h.router.receive(message);
    }
    await flushMicrotasks(10);

    expect(serializeDOM(h.overlay)).toEqual(shown);
    expect(h.overlay.querySelector(".earlier_panel")).toBeNull();

    // The same messages do paint on a page that has not seen the later
    // stream: what kept them off this one is their epoch.
    const unaware = new MessageRouter(() => [h.ui], () => {});
    for (const message of late) {
      unaware.receive(message);
    }
    await flushMicrotasks(10);
    expect(h.overlay.querySelector(".earlier_panel")).not.toBeNull();
  });
});
