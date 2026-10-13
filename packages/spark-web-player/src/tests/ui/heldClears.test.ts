// The page's held clears (`ui/reconcile-clear`, #1820), message by message.
//
// A preview display has the page hold its clears and apply each, element by
// element, with the message that next touches that element: its hiding with
// the next update, its content with the next write to it. The page handles
// each message as a task of its own and a frame can render between any two,
// so the state after every message below is a frame the author could see.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import UIManager from "../../app/managers/UIManager";
import { createStubApp, flushMicrotasks, installJSDOM } from "./domTestHarness";

let restore: () => void = () => {};
let overlay: HTMLElement;
let page: UIManager;
let next = 0;

beforeEach(() => {
  const dom = installJSDOM();
  restore = dom.restore;
  overlay = dom.overlay;
  page = new UIManager(createStubApp(overlay, () => {}));
});

afterEach(() => {
  restore();
});

const request = (method: string, params: Record<string, unknown>) =>
  page.onReceiveRequest({ jsonrpc: "2.0", id: `r${next++}`, method, params } as any);

const create = (element: string, parent: string | null, name: string, extra = {}) =>
  request("ui/create", { element, parent, type: "div", name, ...extra });

const show = (target: string, picture: string) =>
  request("ui/write-image", {
    target,
    instant: true,
    instructions: [
      {
        control: "show",
        content: {
          background: `url("https://example.com/${picture}.png")`,
          imageNames: picture,
          srcs: [],
        },
      },
    ],
  });

const hold = (
  target: string,
  elements: string[],
  kind: { text?: boolean; image?: boolean } = { text: true, image: true },
) =>
  page.onReceiveNotification({
    jsonrpc: "2.0",
    method: "ui/reconcile-clear",
    params: { targets: [{ target, elements, ...kind }] },
  } as any);

/** The pictures each `.portrait` shows: none when it is hidden. */
const portraits = () =>
  Array.from(overlay.querySelectorAll(".portrait")).map((p) =>
    (p as HTMLElement).style.display === "none"
      ? []
      : Array.from(p.querySelectorAll(":scope > .image > .instance[image]")).map(
          (l) => l.getAttribute("image"),
        ),
  );

/** A stage holding two portraits, each showing a picture, from an earlier
 *  pass, so this pass reuses them rather than creating them. */
async function twoPortraitsShowing() {
  const build = async () => {
    await create("e", null, "stage");
    for (const i of [0, 1]) {
      await create(`e-portrait-${i}`, "e", "portrait");
      await create(`e-portrait-${i}-image-0`, `e-portrait-${i}`, "image");
    }
  };
  await build();
  await show("portrait#0", "old0");
  await show("portrait#1", "old1");
  await flushMicrotasks();
  // The next display's connect: a new pass whose create stream reuses them.
  page.beginReconcilePass();
  await build();
  expect(portraits()).toEqual([["old0"], ["old1"]]);
}

describe("held clears (#1820)", () => {
  test("an indexed write releases only the clear of the instance it replaces", async () => {
    await twoPortraitsShowing();
    hold("portrait", ["e-portrait-0", "e-portrait-1"]);
    const frames = [portraits()];

    for (const i of [0, 1]) {
      await request("ui/update", {
        element: `e-portrait-${i}`,
        style: { display: null },
      });
      frames.push(portraits());
      await show(`portrait#${i}`, `new${i}`);
      frames.push(portraits());
    }
    page.sweepReconcile();
    frames.push(portraits());

    const old = ["old0", "old1"];
    const fresh = ["new0", "new1"];
    for (const [n, frame] of frames.entries()) {
      for (const i of [0, 1]) {
        expect(
          [[old[i]], [fresh[i]]],
          `frame ${n}, portrait ${i}: ${JSON.stringify(frame[i])}`,
        ).toContainEqual(frame[i]);
      }
    }
    expect(frames.at(-1)).toEqual([["new0"], ["new1"]]);
  });

  test("the sweep empties only the elements the clear addressed, not ones created after it", async () => {
    // A layout the beat opens after the clear brings a `portrait` of its
    // own. Applied at once, the clear came before that element existed.
    const run = async (held: boolean) => {
      await twoPortraitsShowing();
      if (held) {
        hold("portrait", ["e-portrait-0", "e-portrait-1"]);
      } else {
        for (const i of [0, 1]) {
          await request("ui/update", {
            element: `e-portrait-${i}`,
            style: { display: "none" },
            attributes: { text: null },
          });
        }
        await request("ui/write-text", { target: "portrait", instructions: [], instant: true });
        await request("ui/write-image", { target: "portrait", instructions: [], instant: true });
      }
      await create("e-hud-0", "e", "hud");
      await create("e-hud-0-portrait-0", "e-hud-0", "portrait");
      await create("e-hud-0-portrait-0-text-0", "e-hud-0-portrait-0", "text", {
        content: { text: "HUD caption" },
      });
      page.sweepReconcile();
      return {
        caption: overlay.querySelector(".hud .portrait > .text")?.textContent,
        stage: Array.from(overlay.querySelectorAll(".stage > .portrait")).map(
          (p) => (p as HTMLElement).style.display,
        ),
      };
    };

    const immediate = await run(false);
    restore();
    const dom = installJSDOM();
    restore = dom.restore;
    overlay = dom.overlay;
    page = new UIManager(createStubApp(overlay, () => {}));
    const held = await run(true);

    // The control: the clear applied at once leaves the caption.
    expect(immediate.caption).toBe("HUD caption");
    expect(held).toEqual(immediate);
  });

  test("an update re-shows the element with what it showed, and the write replaces it in one task", async () => {
    await twoPortraitsShowing();
    hold("portrait", ["e-portrait-0", "e-portrait-1"]);

    await request("ui/update", { element: "e-portrait-0", style: { display: null } });
    expect(portraits()[0]).toEqual(["old0"]);
    await show("portrait#0", "new0");
    expect(portraits()[0]).toEqual(["new0"]);
  });
});
