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

  test("the sweep leaves a content slot created under a held element after its clear", async () => {
    // A branch the beat switches mounts a new text slot, with its own
    // content, under a target whose clear is held. Applied at once, the clear
    // came before the slot existed.
    const run = async (held: boolean) => {
      await twoPortraitsShowing();
      if (held) {
        hold("portrait", ["e-portrait-0"]);
      } else {
        await request("ui/update", {
          element: "e-portrait-0",
          style: { display: "none" },
          attributes: { text: null },
        });
        await request("ui/write-text", { target: "portrait#0", instructions: [], instant: true });
        await request("ui/write-image", { target: "portrait#0", instructions: [], instant: true });
      }
      await request("ui/update", { element: "e-portrait-0", style: { display: null } });
      await create("e-portrait-0-caption-0", "e-portrait-0", "text caption", {
        content: { text: "Caption" },
      });
      page.sweepReconcile();
      const portrait = overlay.querySelector(".portrait") as HTMLElement;
      return {
        caption: portrait.querySelector(":scope > .caption")?.textContent,
        display: portrait.style.display,
        pictures: portraits()[0],
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
    expect(immediate.caption).toBe("Caption");
    expect(held).toEqual(immediate);
  });

  test("a text write leaves the picture of a target that shows both until the image write", async () => {
    // A custom layout's transient target with a text slot and an image
    // slot: the beat writes its words, then its picture, in separate tasks.
    await create("e", null, "stage");
    await create("e-box-0", "e", "box");
    await create("e-box-0-text-0", "e-box-0", "text");
    await create("e-box-0-image-0", "e-box-0", "image");
    await request("ui/write-text", { target: "box", instructions: [{ text: "Old words." }], instant: true });
    await show("box", "old");
    await flushMicrotasks();
    page.beginReconcilePass();
    await create("e", null, "stage");
    await create("e-box-0", "e", "box");
    await create("e-box-0-text-0", "e-box-0", "text");
    await create("e-box-0-image-0", "e-box-0", "image");
    const box = () => {
      const el = overlay.querySelector(".box") as HTMLElement;
      return el.style.display === "none"
        ? { words: "", pictures: [] as (string | null)[] }
        : {
            words: el.querySelector(":scope > .text")?.textContent ?? "",
            pictures: Array.from(el.querySelectorAll(":scope > .image > .instance[image]")).map((l) =>
              l.getAttribute("image"),
            ),
          };
    };
    expect(box()).toEqual({ words: "Old words.", pictures: ["old"] });

    hold("box", ["e-box-0"]);
    const frames = [box()];
    await request("ui/update", { element: "e-box-0", style: { display: null } });
    frames.push(box());
    await request("ui/write-text", { target: "box", instructions: [{ text: "New words." }], instant: true });
    frames.push(box());
    await show("box", "new");
    frames.push(box());
    page.sweepReconcile();
    frames.push(box());

    for (const [n, frame] of frames.entries()) {
      expect(["Old words.", "New words."], `frame ${n} words`).toContain(frame.words);
      expect([["old"], ["new"]], `frame ${n} pictures: ${JSON.stringify(frame.pictures)}`).toContainEqual(
        frame.pictures,
      );
    }
    expect(frames.at(-1)).toEqual({ words: "New words.", pictures: ["new"] });
  });

  test("a content node the next display re-emits stays, when that display does not clear it", async () => {
    // A display holds the clear of a target whose text holds a structural
    // caption, and is taken over before its sweep. The next display no
    // longer clears that target (its layout changed), re-emits the caption
    // with new words and re-shows the target. Applied at once, the first
    // clear removed the caption and the re-emitting create put it back.
    const build = async (words: string) => {
      await create("e", null, "stage");
      await create("e-portrait-0", "e", "portrait");
      await create("e-portrait-0-text-0", "e-portrait-0", "text");
      await create("e-portrait-0-text-0-caption-0", "e-portrait-0-text-0", "caption", {
        content: { text: words },
      });
    };
    const run = async (held: boolean) => {
      await build("Old");
      page.beginReconcilePass();
      await build("Old");
      if (held) {
        hold("portrait", ["e-portrait-0"]);
      } else {
        await request("ui/update", {
          element: "e-portrait-0",
          style: { display: "none" },
          attributes: { text: null },
        });
        await request("ui/write-text", { target: "portrait", instructions: [], instant: true });
        await request("ui/write-image", { target: "portrait", instructions: [], instant: true });
      }
      // Taken over: the next display's pass, which clears nothing here.
      page.beginReconcilePass();
      await build("New");
      await request("ui/update", { element: "e-portrait-0", style: { display: null } });
      page.sweepReconcile();
      const portrait = overlay.querySelector(".portrait") as HTMLElement;
      return {
        caption: portrait.querySelector(".text > .caption")?.textContent,
        display: portrait.style.display,
        attribute: portrait.getAttribute("text"),
      };
    };

    const immediate = await run(false);
    restore();
    const dom = installJSDOM();
    restore = dom.restore;
    overlay = dom.overlay;
    page = new UIManager(createStubApp(overlay, () => {}));
    const held = await run(true);

    // The control: applied at once, the re-emitted caption shows its words.
    expect(immediate.caption).toBe("New");
    expect(held).toEqual(immediate);
  });

  test.each([
    ["swept between the two displays", true],
    ["the first taken over before its sweep", false],
  ])(
    "a clear that the empty-write signature makes a no-op stays one when held (%s)",
    async (_name, sweepFirst) => {
      // A portrait with a picture slot and a structural caption in its text
      // slot. Each display clears it and writes only its picture. Applied at
      // once, the first clear removes the caption and signs the text empty;
      // the next connect re-creates the caption, and its clear, an empty
      // write onto a target already signed empty, leaves it.
      const build = async () => {
        await create("e", null, "stage");
        await create("e-portrait-0", "e", "portrait");
        await create("e-portrait-0-text-0", "e-portrait-0", "text");
        await create("e-portrait-0-text-0-caption-0", "e-portrait-0-text-0", "caption", {
          content: { text: "Caption" },
        });
        await create("e-portrait-0-image-0", "e-portrait-0", "image");
      };
      const clear = async (held: boolean) => {
        if (held) {
          hold("portrait", ["e-portrait-0"]);
          return;
        }
        await request("ui/update", {
          element: "e-portrait-0",
          style: { display: "none" },
          attributes: { text: null },
        });
        await request("ui/write-text", { target: "portrait", instructions: [], instant: true });
        await request("ui/write-image", { target: "portrait", instructions: [], instant: true });
      };
      const display = async (held: boolean, picture: string, sweep: boolean) => {
        page.beginReconcilePass();
        await build();
        await clear(held);
        await request("ui/update", { element: "e-portrait-0", style: { display: null } });
        await show("portrait", picture);
        if (sweep) {
          page.sweepReconcile();
        }
      };
      const run = async (held: boolean) => {
        await build();
        await show("portrait", "p0");
        await flushMicrotasks();
        await display(held, "p1", sweepFirst);
        await display(held, "p2", true);
        const portrait = overlay.querySelector(".portrait") as HTMLElement;
        return {
          caption: portrait.querySelector(".text > .caption")?.textContent ?? null,
          pictures: portraits()[0],
        };
      };

      const immediate = await run(false);
      restore();
      const dom = installJSDOM();
      restore = dom.restore;
      overlay = dom.overlay;
      page = new UIManager(createStubApp(overlay, () => {}));
      const held = await run(true);

      // The control: applied at once, the second clear leaves the caption.
      expect(immediate).toEqual({ caption: "Caption", pictures: ["p2"] });
      expect(held).toEqual(immediate);
    },
  );

  test("a target inside content another clear removes is neither emptied nor signed by its own clear", async () => {
    // `portrait` sits in `panel`'s text slot. Applied at once, `panel`'s clear
    // detaches the portrait, and the portrait's clear, which resolves its
    // target among connected elements, finds nothing. The next display moves
    // things back, clears only the portrait and writes its picture: its text
    // was never signed empty, so that clear removes the re-created caption.
    const build = async (panelStyle: Record<string, string> | undefined) => {
      await create("e", null, "stage");
      await create("e-panel-0", "e", "panel", panelStyle ? { style: panelStyle } : {});
      await create("e-panel-0-stroke-0", "e-panel-0", "stroke");
      await create("e-panel-0-text-0", "e-panel-0", "text");
      await create("e-panel-0-text-0-portrait-0", "e-panel-0-text-0", "portrait");
      await create("e-panel-0-text-0-portrait-0-text-0", "e-panel-0-text-0-portrait-0", "text");
      await create(
        "e-panel-0-text-0-portrait-0-text-0-caption-0",
        "e-panel-0-text-0-portrait-0-text-0",
        "caption",
        { content: { text: "Caption" } },
      );
      await create("e-panel-0-text-0-portrait-0-image-0", "e-panel-0-text-0-portrait-0", "image");
    };
    const PANEL = "e-panel-0";
    const PORTRAIT = "e-panel-0-text-0-portrait-0";
    const clear = async (held: boolean, target: string, element: string) => {
      if (held) {
        hold(target, [element]);
        return;
      }
      await request("ui/update", { element, style: { display: "none" }, attributes: { text: null } });
      await request("ui/write-text", { target, instructions: [], instant: true });
      await request("ui/write-image", { target, instructions: [], instant: true });
    };
    const run = async (held: boolean) => {
      await build(undefined);
      page.beginReconcilePass();
      await build(undefined);
      await clear(held, "panel", PANEL);
      await clear(held, "portrait", PORTRAIT);
      // Taken over: the next display restyles the panel, so it shows again,
      // re-emits the portrait and clears only the portrait.
      page.beginReconcilePass();
      await build({ color: "red" });
      await clear(held, "portrait", PORTRAIT);
      await request("ui/update", { element: PORTRAIT, style: { display: null } });
      await show("portrait", "p1");
      page.sweepReconcile();
      const portrait = overlay.querySelector(".portrait") as HTMLElement | null;
      return {
        caption: portrait?.querySelector(".text > .caption")?.textContent ?? null,
        pictures: portraits()[0] ?? null,
        panel: (overlay.querySelector(".panel") as HTMLElement | null)?.style.display ?? null,
      };
    };

    const immediate = await run(false);
    restore();
    const dom = installJSDOM();
    restore = dom.restore;
    overlay = dom.overlay;
    page = new UIManager(createStubApp(overlay, () => {}));
    const held = await run(true);

    // The control: applied at once, the portrait's second clear removes the
    // caption.
    expect(immediate.caption).toBeNull();
    expect(immediate.pictures).toEqual(["p1"]);
    expect(held).toEqual(immediate);
  });

  test("a write to a target inside content a held clear removes writes nothing, as after the clear applied at once", async () => {
    // Applied at once, `panel`'s clear detaches the portrait in its text
    // slot, and a write to `portrait` then finds no connected target: it
    // writes nothing and signs nothing, which later writes' dedupe reads.
    const build = async () => {
      await create("e", null, "stage");
      await create("e-panel-0", "e", "panel");
      await create("e-panel-0-text-0", "e-panel-0", "text");
      await create("e-panel-0-text-0-portrait-0", "e-panel-0-text-0", "portrait");
      await create("e-panel-0-text-0-portrait-0-image-0", "e-panel-0-text-0-portrait-0", "image");
    };
    const run = async (held: boolean) => {
      await build();
      page.beginReconcilePass();
      await build();
      // The node itself, which the clear may detach.
      const portrait = overlay.querySelector(".portrait") as any;
      expect(portrait).toBeTruthy();
      if (held) {
        hold("panel", ["e-panel-0"]);
      } else {
        await request("ui/update", { element: "e-panel-0", style: { display: "none" }, attributes: { text: null } });
        await request("ui/write-text", { target: "panel", instructions: [], instant: true });
        await request("ui/write-image", { target: "panel", instructions: [], instant: true });
      }
      await show("portrait", "p1");
      page.sweepReconcile();
      return {
        connected: overlay.contains(portrait),
        signed: portrait.__sdImg ?? null,
        layers: portrait.querySelectorAll(".image > .instance[image]").length,
      };
    };

    const immediate = await run(false);
    restore();
    const dom = installJSDOM();
    restore = dom.restore;
    overlay = dom.overlay;
    page = new UIManager(createStubApp(overlay, () => {}));
    const held = await run(true);

    expect(immediate).toEqual({ connected: false, signed: null, layers: 0 });
    expect(held).toEqual(immediate);
  });

  test("an indexed write counts its instance among the elements a held clear has not removed", async () => {
    // Portrait A sits in `panel`'s text slot, portrait B on the stage.
    // Applied at once, `panel`'s clear detaches A, and `portrait#0` then
    // means B, the only connected match.
    const build = async () => {
      await create("e", null, "stage");
      await create("e-panel-0", "e", "panel");
      await create("e-panel-0-text-0", "e-panel-0", "text");
      await create("e-panel-0-text-0-portrait-0", "e-panel-0-text-0", "portrait");
      await create("e-panel-0-text-0-portrait-0-image-0", "e-panel-0-text-0-portrait-0", "image");
      await create("e-portrait-0", "e", "portrait");
      await create("e-portrait-0-image-0", "e-portrait-0", "image");
    };
    const run = async (held: boolean) => {
      await build();
      await show("portrait#1", "old");
      await flushMicrotasks();
      page.beginReconcilePass();
      await build();
      const b = overlay.querySelector("#e-portrait-0") as HTMLElement;
      if (held) {
        hold("panel", ["e-panel-0"]);
      } else {
        await request("ui/update", { element: "e-panel-0", style: { display: "none" }, attributes: { text: null } });
        await request("ui/write-text", { target: "panel", instructions: [], instant: true });
        await request("ui/write-image", { target: "panel", instructions: [], instant: true });
      }
      await show("portrait#0", "new");
      page.sweepReconcile();
      return Array.from(b.querySelectorAll(":scope > .image > .instance[image]")).map((l) =>
        l.getAttribute("image"),
      );
    };

    const immediate = await run(false);
    restore();
    const dom = installJSDOM();
    restore = dom.restore;
    overlay = dom.overlay;
    page = new UIManager(createStubApp(overlay, () => {}));
    const held = await run(true);

    // The control: applied at once, the write reaches B (this helper's write
    // keeps the earlier layer, having no hide animation for it).
    expect(immediate).toContain("new");
    expect(held).toEqual(immediate);
  });

  test("a new manager does not adopt what a held clear removes, as it could not after the clear applied at once", async () => {
    // A display holds `panel`'s clear, whose text slot holds portrait A, and
    // is taken over; the next display runs on a new manager, which adopts the
    // page. Applied at once, the clear had detached A, so the new manager's
    // create stream builds the portrait afresh rather than reusing A.
    const build = async () => {
      await create("e", null, "stage");
      await create("e-panel-0", "e", "panel");
      await create("e-panel-0-text-0", "e-panel-0", "text");
      await create("e-panel-0-text-0-portrait-0", "e-panel-0-text-0", "portrait");
      await create("e-panel-0-text-0-portrait-0-image-0", "e-panel-0-text-0-portrait-0", "image");
    };
    const run = async (held: boolean) => {
      await build();
      await show("portrait", "old");
      await flushMicrotasks();
      page.beginReconcilePass();
      await build();
      const a = overlay.querySelector(".portrait") as HTMLElement;
      if (held) {
        hold("panel", ["e-panel-0"]);
      } else {
        await request("ui/update", { element: "e-panel-0", style: { display: "none" }, attributes: { text: null } });
        await request("ui/write-text", { target: "panel", instructions: [], instant: true });
        await request("ui/write-image", { target: "panel", instructions: [], instant: true });
      }
      page.onDispose();
      page = new UIManager(createStubApp(overlay, () => {}));
      await page.onInit();
      page.beginReconcilePass();
      await build();
      page.sweepReconcile();
      const shown = Array.from(overlay.querySelectorAll(".portrait"));
      return {
        portraits: shown.length,
        reusedA: shown.includes(a),
        aConnected: overlay.contains(a),
        pictures: portraits(),
      };
    };

    const immediate = await run(false);
    restore();
    const dom = installJSDOM();
    restore = dom.restore;
    overlay = dom.overlay;
    page = new UIManager(createStubApp(overlay, () => {}));
    const held = await run(true);

    // The control: applied at once, the new manager built a fresh portrait.
    expect(immediate).toEqual({ portraits: 1, reusedA: false, aConnected: false, pictures: [[]] });
    expect(held).toEqual(immediate);
  });

  test("an update of a content slot alone leaves the picture until the write replaces it", async () => {
    // A saved style restored onto a portrait's image slot during the
    // connect changes the slot, not its picture.
    await twoPortraitsShowing();
    hold("portrait", ["e-portrait-0"], { image: true });

    await request("ui/update", { element: "e-portrait-0-image-0", style: { opacity: "0.5" } });
    expect(portraits()[0]).toEqual(["old0"]);
    await request("ui/update", { element: "e-portrait-0", style: { display: null } });
    expect(portraits()[0]).toEqual(["old0"]);
    await show("portrait#0", "new0");
    expect(portraits()[0]).toEqual(["new0"]);
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
