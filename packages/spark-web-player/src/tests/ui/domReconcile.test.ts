import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const V1 = `layout main with
  stage {
    backdrop {
      image
    }
    portrait {
      image
    }
  }
  textbox {
    dialogue {
      text
    }
  }
end
`;

const V2 = `layout main with
  stage {
    backdrop {
      image
    }
  }
  textbox {
    dialogue {
      text
    }
  }
end
`;

const BTN = `store hp = 100
function heal()
  hp = hp + 5
end
layout main with
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

    expect(h.overlay.querySelector(".main .backdrop")).toBe(backdrop);
    expect(h.overlay.querySelector(".main .portrait")).toBe(portrait);
    expect(h.overlay.querySelector(".main .dialogue")).toBe(dialogue);
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

    await h.rerender(V2);

    expect(h.overlay.querySelector(".main .backdrop")).toBe(backdrop);
    expect(h.overlay.querySelector(".main .dialogue")).toBe(dialogue);
    expect(h.overlay.querySelector(".main .portrait")).toBeNull();
    expect(h.overlay.querySelectorAll(".main .backdrop").length).toBe(1);
  });

  test("an added element appears while its siblings are reused", async () => {
    const h = createDOMHarness(V2, 0, { reactive: true });
    await h.ready;
    await flushMicrotasks();
    const backdrop = h.overlay.querySelector(".main .backdrop");
    expect(h.overlay.querySelector(".main .portrait")).toBeNull();

    await h.rerender(V1);

    expect(h.overlay.querySelector(".main .backdrop")).toBe(backdrop);
    expect(h.overlay.querySelector(".main .portrait")).toBeTruthy();
    expect(h.overlay.querySelectorAll(".main .portrait").length).toBe(1);
  });

  test("a resent create writes back the content a ui/update replaced on the reused node (#1223)", async () => {
    const SRC = `store mode = false
layout main with
  badge {
    text "{mode}"
  }
end
`;
    const h = createDOMHarness(SRC, 0, { reactive: true });
    await h.ready;
    await flushMicrotasks();
    const span = () => h.overlay.querySelector(".main .badge span") as HTMLElement;
    const node = span();
    expect(node.textContent).toBe("false");
    const id = (node as any).__sdId as string;

    await h.ui.onReceiveRequest({
      jsonrpc: "2.0",
      id: "u1",
      method: "ui/update",
      params: { element: id, content: { text: "changed-by-update" } },
    } as any);
    expect(node.textContent).toBe("changed-by-update");

    await h.rerender(SRC);

    expect(span()).toBe(node);
    expect(node.textContent).toBe("false");
  });

  test("repeated re-renders don't leak DOM (element count stays stable)", async () => {
    const h = createDOMHarness(V1, 0, { reactive: true });
    await h.ready;
    await flushMicrotasks();
    const count = () => h.overlay.querySelectorAll("[id]").length;
    await h.rerender(V1);
    const steady = count();
    expect(steady).toBeGreaterThan(0);
    for (let i = 0; i < 3; i += 1) {
      await h.rerender(V1);
    }
    expect(count()).toBe(steady);
  });

  test("a reused observed element isn't double-bound after re-observe", async () => {
    const h = createDOMHarness(BTN, 0, { reactive: true });
    await h.ready;
    await flushMicrotasks();
    const button = h.overlay.querySelector(".main .button") as HTMLElement | null;
    expect(button).toBeTruthy();

    await h.rerender(BTN);
    expect(h.overlay.querySelector(".main .button")).toBe(button);

    let emits = 0;
    (h.ui as any).app.emit = () => {
      emits += 1;
    };
    button!.click();
    expect(emits).toBe(1);
  });
});
