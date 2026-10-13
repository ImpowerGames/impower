// What the page holds back from the screen, and when it lets it go (#1820):
// a beat's frame until its close, a preview display until its sweep, and
// neither for longer than the screen can wait.

import { BeginReconcileMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/BeginReconcileMessage";
import { FrameMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/FrameMessage";
import { SweepReconcileMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/SweepReconcileMessage";
import { WriteImageMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { WriteTextMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteTextMessage";
import { afterEach, describe, expect, test, vi } from "vitest";
import AssetManager from "../../app/managers/AssetManager";
import {
  createDOMHarness,
  createStubApp,
  flushMicrotasks,
  untilShown,
} from "./domTestHarness";

const SOURCE = `-> start

scene start
  HERO: Do you understand?
end
`;

const LINE = SOURCE.split("\n").findIndex((l) => l.includes("Do you understand?"));

/** A page showing the dialogue beat, as a preview leaves it. */
async function showing() {
  const h = createDOMHarness(SOURCE, LINE);
  await h.ready;
  await h.rerender(SOURCE, LINE);
  await flushMicrotasks(10);
  const dialogue = () =>
    h.overlay.querySelector(".dialogue > .text")?.textContent ?? "";
  expect(dialogue()).toBe("Do you understand?");
  return { h, dialogue };
}

/** A write of the dialogue: an empty one clears it, as the game's does. */
const write = (text?: string) =>
  WriteTextMessage.type.request({
    target: "dialogue",
    instructions: text == null ? [] : [{ text } as any],
    instant: true,
  });

afterEach(() => {
  vi.useRealTimers();
});

describe("the page's hold (#1820)", () => {
  test("a beat's frame puts up what it holds in the task that closes it", async () => {
    const { h, dialogue } = await showing();

    h.ui.onReceiveNotification(FrameMessage.type.notification({ open: true }));
    const cleared = h.ui.onReceiveRequest(write());
    const written = h.ui.onReceiveRequest(write("Do you know?"));
    await flushMicrotasks(10);
    expect(dialogue()).toBe("Do you understand?");

    h.ui.onReceiveNotification(FrameMessage.type.notification({ open: false }));
    // No await: the close's own task applies the clear and the write.
    expect(dialogue()).toBe("Do you know?");
    // The game is answered once they are applied.
    await expect(cleared).resolves.toBeDefined();
    await expect(written).resolves.toBeDefined();
  });

  test("a frame's clear and its rewrite of what the target shows leave it as it is", async () => {
    const { h, dialogue } = await showing();
    const text = h.overlay.querySelector(".dialogue > .text")!;
    const win = h.overlay.ownerDocument.defaultView as any;
    const changed: MutationRecord[] = [];
    const observer = new win.MutationObserver((records: MutationRecord[]) =>
      changed.push(...records),
    );
    observer.observe(text, { childList: true, subtree: true, characterData: true });
    const shown = JSON.parse(JSON.stringify((h.overlay.querySelector(".dialogue") as any).__sdTxt));

    h.ui.onReceiveNotification(FrameMessage.type.notification({ open: true }));
    void h.ui.onReceiveRequest(write());
    void h.ui.onReceiveRequest(
      WriteTextMessage.type.request({
        target: "dialogue",
        instructions: JSON.parse(shown),
        instant: true,
      }),
    );
    h.ui.onReceiveNotification(FrameMessage.type.notification({ open: false }));
    await flushMicrotasks(10);
    changed.push(...observer.takeRecords());
    observer.disconnect();

    expect(dialogue()).toBe("Do you understand?");
    expect(changed).toEqual([]);
  });

  test("a display taken over before its sweep keeps the screen as it was", async () => {
    const { h, dialogue } = await showing();

    await h.rerender(SOURCE, LINE, { connectOnly: true });

    expect(dialogue()).toBe("Do you understand?");
  });

  test("a pass that does not hold puts up what an earlier pass still held", async () => {
    // PLAY starts after a preview display that was taken over before its
    // sweep: what that display sent goes up first.
    const { h, dialogue } = await showing();
    await h.rerender(SOURCE, LINE, { connectOnly: true });
    expect(dialogue()).toBe("Do you understand?");

    h.ui.onReceiveNotification(BeginReconcileMessage.type.notification({}));

    // The held connect cleared the dialogue.
    expect(dialogue()).toBe("");
  });

  test("a display that never sweeps is let through rather than freezing the screen", async () => {
    const { h, dialogue } = await showing();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await h.rerender(SOURCE, LINE, { connectOnly: true });

    vi.advanceTimersByTime(9_000);
    expect(dialogue()).toBe("Do you understand?");
    // A newer display that takes over keeps the screen held for as long
    // again.
    await h.rerender(SOURCE, LINE, { connectOnly: true });
    vi.advanceTimersByTime(9_000);
    expect(dialogue()).toBe("Do you understand?");

    vi.advanceTimersByTime(1_000);
    expect(dialogue()).toBe("");
  });
});

const LAYOUT = (leaf: string) => `layout main with
  textbox {
    dialogue {
      ${leaf}
      stroke
    }
  }
end

${SOURCE}`;

describe("what the page holds goes up as it would have one message at a time (#1820)", () => {
  test("a clear is judged against what the target shows when the queue reaches it", async () => {
    // The target shows A. Cleared, written B, cleared again, written A:
    // applied one at a time that ends on A. The second clear is no no-op
    // just because the target showed A before the transaction began.
    const { h, dialogue } = await showing();
    // A, exactly as the target shows it.
    const shown = JSON.parse((h.overlay.querySelector(".dialogue") as any).__sdTxt);

    h.ui.onReceiveNotification(FrameMessage.type.notification({ open: true }));
    void h.ui.onReceiveRequest(write());
    void h.ui.onReceiveRequest(write("Do you know?"));
    void h.ui.onReceiveRequest(write());
    void h.ui.onReceiveRequest(
      WriteTextMessage.type.request({
        target: "dialogue",
        instructions: shown,
        instant: true,
      }),
    );
    h.ui.onReceiveNotification(FrameMessage.type.notification({ open: false }));
    await flushMicrotasks(10);

    expect(dialogue()).toBe("Do you understand?");
  });

  test("a clear is not skipped when the display changes what the target holds", async () => {
    // The layout's text leaf gains content while the same line is previewed:
    // the display's create puts it in the reused leaf, then the beat clears
    // the box and writes its line, which then is all the box shows.
    const before = LAYOUT("text");
    const h = createDOMHarness(before, LINE + 9);
    await h.ready;
    await h.rerender(before, LINE + 9);
    await flushMicrotasks(10);
    const text = () => h.overlay.querySelector(".dialogue > .text")?.textContent;
    expect(text()).toBe("Do you understand?");

    await h.rerender(LAYOUT('text "placeholder"'), LINE + 9);

    expect(text()).toBe("Do you understand?");
  });

  test("a played beat's frame goes up at the start its writes are stamped with, clears and all", async () => {
    const { h, dialogue } = await showing();
    const later = 200;

    h.ui.onReceiveNotification(FrameMessage.type.notification({ open: true }));
    void h.ui.onReceiveRequest(write());
    void h.ui.onReceiveRequest(
      WriteTextMessage.type.request({
        target: "dialogue",
        instructions: [{ text: "Do you know?" } as any],
        instant: false,
        time: later,
      }),
    );
    h.ui.onReceiveNotification(FrameMessage.type.notification({ open: false }));
    await flushMicrotasks(10);
    // The beat has not started: the old one is still whole, not cleared.
    expect(dialogue()).toBe("Do you understand?");

    await untilShown(h.overlay);
    expect(dialogue()).toBe("Do you know?");
  });

  test("a request answered when it was held reports a failure once applied", async () => {
    const { h } = await showing();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    (h.ui as any).applyRequest = () => Promise.reject(new Error("failed to apply"));

    h.ui.onReceiveNotification(BeginReconcileMessage.type.notification({ hold: true }));
    const answered = await h.ui.onReceiveRequest(write("Do you know?"));
    expect(answered).toBeDefined();
    h.ui.onReceiveNotification(SweepReconcileMessage.type.notification({}));
    await flushMicrotasks(10);

    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining("ui/write-text"),
      expect.objectContaining({ message: "failed to apply" }),
    );
    errors.mockRestore();
  });

  test("the pictures a held write will paint stay resident", async () => {
    const { h } = await showing();
    const assets = new AssetManager(createStubApp(h.overlay, () => {}));
    const src = "https://example.com/held.png";
    expect(assets.derivedPins().has(src)).toBe(false);

    h.ui.onReceiveNotification(FrameMessage.type.notification({ open: true }));
    void h.ui.onReceiveRequest(
      WriteImageMessage.type.request({
        target: "portrait",
        instructions: [{ control: "show", content: { srcs: [src] } } as any],
        instant: true,
      }),
    );

    expect(assets.derivedPins().has(src)).toBe(true);
  });
});
