// Live-preview DOM reconcile (the HMR DOM-patching win).
//
// The Layer-1 goldens cover a SINGLE render. These cover the cross-render
// behavior that the player added: on a live-preview edit the overlay DOM is
// NOT torn down and rebuilt — the persistent UIManager adopts the previous
// render's nodes, the re-emitted create stream reuses unchanged ones by their
// (now deterministic, structural) id, and a mark-and-sweep tail removes whatever
// disappeared. `h.rerender(src)` models exactly what
// GamePlayerController.updatePreview does on an edit (minus pixi).

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

// Two nested regions + leaves under one screen. V2 drops `portrait` (a structural
// edit); everything else is identical, so the unchanged subtrees must keep their
// node identity across the re-render.
const V1 = `screen main with
  stage:
    backdrop:
      image
    portrait:
      image
  textbox:
    dialogue:
      text
end
`;

const V2 = `screen main with
  stage:
    backdrop:
      image
  textbox:
    dialogue:
      text
end
`;

const BTN = `store hp = 100
function heal()
  hp = hp + 5
end
screen main with
  button "Heal" @click=heal
end
`;

describe("UIManager reconcile (live-preview DOM patching)", () => {
  test("an identical re-render reuses every node in place (no teardown)", async () => {
    const h = createDOMHarness(V1, 0, { reactive: true });
    await h.ready;
    await flushMicrotasks();
    const backdrop = h.overlay.querySelector(".main .backdrop");
    const portrait = h.overlay.querySelector(".main .portrait");
    const dialogue = h.overlay.querySelector(".main .dialogue");
    expect(backdrop && portrait && dialogue).toBeTruthy();

    await h.rerender(V1);

    // SAME node objects — reused in place, not rebuilt. (A torn-down/rebuilt tree
    // would yield brand-new elements here.)
    expect(h.overlay.querySelector(".main .backdrop")).toBe(backdrop);
    expect(h.overlay.querySelector(".main .portrait")).toBe(portrait);
    expect(h.overlay.querySelector(".main .dialogue")).toBe(dialogue);
    // …and no duplicates were introduced by replaying the create stream.
    expect(h.overlay.querySelectorAll(".main .backdrop").length).toBe(1);
    expect(h.overlay.querySelectorAll(".main .dialogue").length).toBe(1);
  });

  test("a structural edit reuses unchanged nodes and sweeps the removed one", async () => {
    const h = createDOMHarness(V1, 0, { reactive: true });
    await h.ready;
    await flushMicrotasks();
    const backdrop = h.overlay.querySelector(".main .backdrop");
    const dialogue = h.overlay.querySelector(".main .dialogue");
    expect(h.overlay.querySelector(".main .portrait")).toBeTruthy();

    await h.rerender(V2); // portrait removed

    // Unchanged subtrees keep their identity (focus / scroll / decoded bg survive).
    expect(h.overlay.querySelector(".main .backdrop")).toBe(backdrop);
    expect(h.overlay.querySelector(".main .dialogue")).toBe(dialogue);
    // The removed element (and its subtree) is gone — swept, not orphaned.
    expect(h.overlay.querySelector(".main .portrait")).toBeNull();
    expect(h.overlay.querySelectorAll(".main .backdrop").length).toBe(1);
  });

  test("an added element appears while its siblings are reused", async () => {
    const h = createDOMHarness(V2, 0, { reactive: true });
    await h.ready;
    await flushMicrotasks();
    const backdrop = h.overlay.querySelector(".main .backdrop");
    expect(h.overlay.querySelector(".main .portrait")).toBeNull();

    await h.rerender(V1); // portrait added back

    expect(h.overlay.querySelector(".main .backdrop")).toBe(backdrop); // reused
    expect(h.overlay.querySelector(".main .portrait")).toBeTruthy(); // created
    expect(h.overlay.querySelectorAll(".main .portrait").length).toBe(1);
  });

  test("repeated re-renders don't leak DOM (element count stays stable)", async () => {
    const h = createDOMHarness(V1, 0, { reactive: true });
    await h.ready;
    await flushMicrotasks();
    const count = () => h.overlay.querySelectorAll("[id]").length;
    const initial = count();
    expect(initial).toBeGreaterThan(0);
    for (let i = 0; i < 3; i += 1) {
      await h.rerender(V1);
    }
    expect(count()).toBe(initial);
  });

  test("a reused observed element isn't double-bound after re-observe", async () => {
    const h = createDOMHarness(BTN, 0, { reactive: true });
    await h.ready;
    await flushMicrotasks();
    const button = h.overlay.querySelector(".main .button") as HTMLElement | null;
    expect(button).toBeTruthy();

    await h.rerender(BTN);
    // The button node is reused (so it was re-observed, not recreated).
    expect(h.overlay.querySelector(".main .button")).toBe(button);

    // One click must produce exactly one engine event. A stacked duplicate
    // listener (re-observe that didn't remove the prior handler) would fire twice.
    let emits = 0;
    (h.ui as any).app.emit = () => {
      emits += 1;
    };
    button!.click();
    expect(emits).toBe(1);
  });
});
