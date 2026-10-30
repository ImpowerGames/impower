import { compileUI } from "@impower/spark-engine/src/tests/ui/harness/uiTestHarness";
import { cloneMessage } from "@impower/spark-engine/src/tests/harness/cloneMessage";
import { describe, expect, test } from "vitest";
import { MessageRouter } from "../../app/MessageRouter";
import { createDOMHarness, flushMicrotasks, serializeDOM } from "./domTestHarness";

const EARLIER = `layout main with
  stage {
    earlier_panel {
      text
    }
  }
end
`;

const LATER = `layout main with
  stage {
    later_panel {
      text
    }
  }
end
`;

describe("stream epochs", () => {
  test("an earlier stream's messages that arrive after a later one began do not change the DOM", async () => {
    const h = createDOMHarness(EARLIER, 0, { reactive: true });
    await h.ready;
    await flushMicrotasks(10);

    const late: any[] = [];
    await h.game.connect((message) => {
      const arrived = cloneMessage(message);
      late.push(arrived);
      h.router.receive(arrived);
    });
    await flushMicrotasks(10);
    expect(late.length).toBeGreaterThan(0);
    expect(new Set(late.map((m) => m.epoch))).toEqual(new Set([2]));

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

    const unaware = new MessageRouter(() => [h.ui], () => {});
    for (const message of late) {
      unaware.receive(message);
    }
    await flushMicrotasks(10);
    expect(h.overlay.querySelector(".earlier_panel")).not.toBeNull();
  });
});
