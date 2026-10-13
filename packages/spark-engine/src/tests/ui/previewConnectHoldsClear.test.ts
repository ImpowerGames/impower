// A preview display sends its clears of the clear-on-continue targets for the
// page to hold, from its connect until its beat is written (#1820). The page
// applies each with whatever next touches the target, or at the sweep. Sent
// to be applied at once, the connect's clear reached the page frames before
// the restore and the beat, and the beat's own clear could land a frame before
// its writes, and the preview showed those frames with the box's text, the
// name and the portrait gone.

import { describe, expect, test } from "vitest";
import {
  createHarness,
  flattenMessages,
  flushMicrotasks,
} from "./harness/uiTestHarness";

const SOURCE = `define a as image with
  src = "https://example.com/a.png"
end

-> start

scene start
  HERO:
    [[a]]
    Do you understand?
end
`;

const DIALOGUE_LINE = SOURCE.split("\n").findIndex((l) =>
  l.includes("Do you understand?"),
);

const CLEARED = ["dialogue", "character_name", "portrait"];

/** The dialogue beat shown, as the last display left it. */
async function withBeatShown() {
  const h = createHarness(SOURCE);
  await h.ready;
  h.jumpToFlow("start");
  const beat = h.nextBeat();
  await h.display(beat!, true);
  await flushMicrotasks();
  const ui: any = h.game.module.ui;
  // The control: the beat recorded what it shows.
  expect(ui._state.text?.dialogue).toBeDefined();
  expect(ui._state.image?.portrait).toBeDefined();
  return h;
}

type HeldTarget = {
  target: string;
  elements: string[];
  text?: boolean;
  image?: boolean;
};

const heldClears = (messages: any[]): HeldTarget[] =>
  flattenMessages(messages)
    .filter((m) => m.method === "ui/reconcile-clear")
    .flatMap((m) => m.params.targets);

/** What was sent that clears a target on the page at once. */
function immediateClears(messages: any[]) {
  return flattenMessages(messages).filter(
    (m) =>
      ((m.method === "ui/write-text" || m.method === "ui/write-image") &&
        m.params.instructions.length === 0) ||
      (m.method === "ui/update" && m.params.style?.display === "none"),
  );
}

describe("a preview display holds its clears (#1820)", () => {
  test("the connect sends the page its text and image clears to hold, and nothing that clears at once", async () => {
    const h = await withBeatShown();
    h.reset();

    await h.reconnect();

    const held = heldClears(h.messages);
    for (const name of CLEARED) {
      const entries = held.filter((t) => t.target === name);
      expect(entries.some((t) => t.text), name).toBe(true);
      expect(entries.some((t) => t.image), name).toBe(true);
      expect(entries[0]?.elements.length, name).toBeGreaterThan(0);
    }
    expect(immediateClears(h.messages)).toEqual([]);
  });

  test("the state goes at once, so the restore does not put the beat back", async () => {
    const h = await withBeatShown();
    h.reset();

    await h.reconnect();

    const ui: any = h.game.module.ui;
    expect(ui._state.text?.dialogue).toBeUndefined();
    expect(ui._state.text?.character_name).toBeUndefined();
    expect(ui._state.image?.portrait).toBeUndefined();
    const restored = flattenMessages(h.messages).filter(
      (m) =>
        (m.method === "ui/write-text" || m.method === "ui/write-image") &&
        CLEARED.includes(m.params.target),
    );
    expect(restored).toEqual([]);
  });

  test("the beat's own clear is held too, and clears after the beat apply at once", async () => {
    const h = await withBeatShown();
    await h.reconnect();
    h.reset();

    await h.preview(DIALOGUE_LINE);
    await flushMicrotasks(10);

    // The beat cleared its targets before writing them: held, not applied.
    expect(heldClears(h.messages).map((t) => t.target)).toEqual(
      expect.arrayContaining(CLEARED),
    );
    expect(immediateClears(h.messages)).toEqual([]);
    // The preview has written its beat: a clear now is applied at once.
    h.reset();
    await h.game.module.ui.text.clear("dialogue");
    expect(heldClears(h.messages)).toEqual([]);
    expect(
      immediateClears(h.messages).filter((m) => m.method === "ui/write-text"),
    ).toHaveLength(1);
  });

  test("the sweep ends the hold", async () => {
    const h = await withBeatShown();
    await h.reconnect();
    h.game.module.ui.sweepReconcile();
    h.reset();

    await h.game.module.ui.image.clear("portrait");

    expect(heldClears(h.messages)).toEqual([]);
    expect(
      immediateClears(h.messages).filter((m) => m.method === "ui/write-image"),
    ).toHaveLength(1);
  });

  test("a connect that is not a preview still clears at once", async () => {
    // PLAY's connect: no sweep follows it, so nothing would apply a held clear.
    const h = await withBeatShown();
    h.game.context.system.previewing = undefined;
    h.reset();

    await h.reconnect();

    expect(heldClears(h.messages)).toEqual([]);
    const cleared = immediateClears(h.messages)
      .filter((m) => m.method === "ui/write-text")
      .map((m) => m.params.target);
    expect(cleared).toEqual(expect.arrayContaining(CLEARED));
  });
});
