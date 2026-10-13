// Redrawing the preview must never paint a frame with the box's text, the name
// or the portrait gone (#1820).
//
// Every display connects the game, and the connect clears each clear-on-continue
// target (the portrait, the dialogue, the name, the choices); the beat then
// clears them again before it writes them. The page handles each message as a
// task of its own and can render a frame between any two, so a clear applied
// when it arrived showed frames with the box and the portrait empty: always
// between the connect and the restore, sometimes between the beat's clear and
// its writes. A preview display now has the page hold its clears and apply
// each with the message that next touches the target, so every frame shows
// either what the target showed before the display or what it shows after.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const SCREEN = `define a as image with
  src = "https://example.com/a.png"
end

define b as image with
  src = "https://example.com/b.png"
end
`;

const source = (picture: string, words: string) => `${SCREEN}
-> start

scene start
  The rain has not let up.

  HERO:
    [[${picture}]]
    ${words}
end
`;

const BEFORE = source("a", "Do you understand?");

const lineOf = (src: string, text: string) =>
  src.split("\n").findIndex((l) => l.includes(text));

const ACTION_LINE = lineOf(BEFORE, "The rain has not let up.");
const DIALOGUE_LINE = lineOf(BEFORE, "Do you understand?");

/** Whether the element and every ancestor up to the overlay are displayed. */
function displayed(el: Element | null, overlay: HTMLElement): boolean {
  if (!el) {
    return false;
  }
  for (let n: Element | null = el; n && n !== overlay; n = n.parentElement) {
    if ((n as HTMLElement).style.display === "none") {
      return false;
    }
  }
  return true;
}

type Frame = ReturnType<typeof frame>;

/** What the page shows of the beat, as a person would read the frame. */
function frame(overlay: HTMLElement) {
  const text = (selector: string) => {
    const el = overlay.querySelector(selector);
    return el && displayed(el, overlay)
      ? (el.querySelector(":scope > .text")?.textContent ?? "")
      : "";
  };
  const portrait = overlay.querySelector(".portrait");
  return {
    textbox: displayed(overlay.querySelector(".textbox"), overlay),
    dialogue: text(".dialogue"),
    name: text(".character_name"),
    action: text(".action"),
    portrait:
      portrait && displayed(portrait, overlay)
        ? Array.from(
            portrait.querySelectorAll(":scope > .image > .instance[image]"),
          ).map((l) => l.getAttribute("image"))
        : [],
  };
}

/** The beat on the dialogue line, on screen as a preview leaves it, with
 *  every frame the page could show recorded while `recording` is on. */
async function previewingTheDialogue() {
  const frames: Frame[] = [];
  let recording = false;
  const h = createDOMHarness(BEFORE, DIALOGUE_LINE, {
    afterEachMessage: () => {
      if (recording) {
        frames.push(frame(h.overlay));
      }
    },
  });
  await h.ready;
  await h.rerender(BEFORE, DIALOGUE_LINE);
  await flushMicrotasks(10);
  return {
    h,
    frames,
    record: (on: boolean) => {
      recording = on;
    },
  };
}

/** The parts of `seen` that show neither what was there before nor after. */
function torn(seen: Frame[], before: Frame, after: Frame) {
  const parts = Object.keys(before) as (keyof Frame)[];
  return seen.flatMap((f, i) =>
    parts
      .filter(
        (part) =>
          JSON.stringify(f[part]) !== JSON.stringify(before[part]) &&
          JSON.stringify(f[part]) !== JSON.stringify(after[part]),
      )
      .map((part) => `message ${i}: ${part} = ${JSON.stringify(f[part])}`),
  );
}

describe("redrawing the preview keeps the beat on screen (#1820)", () => {
  test("the dialogue beat is on screen before the edit", async () => {
    // The control: the tests below compare against this frame.
    const { h } = await previewingTheDialogue();
    expect(frame(h.overlay)).toEqual({
      textbox: true,
      dialogue: "Do you understand?",
      name: "HERO",
      action: "",
      portrait: ["a"],
    });
  });

  test("an edited dialogue line shows the old line or the new one in every frame", async () => {
    const { h, frames, record } = await previewingTheDialogue();
    const before = frame(h.overlay);
    const edited = source("a", "Do you know?");

    record(true);
    await h.rerender(edited, lineOf(edited, "Do you know?"));
    record(false);

    const after = frame(h.overlay);
    expect(after).toEqual({ ...before, dialogue: "Do you know?" });
    expect(frames.length).toBeGreaterThan(0);
    expect(torn(frames, before, after)).toEqual([]);
  });

  test("a changed portrait shows the old picture or the new one in every frame, never both", async () => {
    const { h, frames, record } = await previewingTheDialogue();
    const before = frame(h.overlay);
    const edited = source("b", "Do you understand?");

    record(true);
    await h.rerender(edited, DIALOGUE_LINE);
    record(false);

    const after = frame(h.overlay);
    expect(after).toEqual({ ...before, portrait: ["b"] });
    expect(torn(frames, before, after)).toEqual([]);
  });

  test("after a display taken over before its sweep, the next one still shows the old portrait or the new one in every frame", async () => {
    // Arrowing through suggestions: a display connects, a newer one takes
    // over before it writes its beat, and the newer one's create stream
    // rebuilds the layout inside the portrait while the first one's clears
    // are still held.
    const { h, frames, record } = await previewingTheDialogue();
    const before = frame(h.overlay);
    const edited = source("b", "Do you understand?");

    record(true);
    await h.rerender(BEFORE, DIALOGUE_LINE, { connectOnly: true });
    await h.rerender(edited, DIALOGUE_LINE);
    record(false);

    const after = frame(h.overlay);
    expect(after).toEqual({ ...before, portrait: ["b"] });
    expect(torn(frames, before, after)).toEqual([]);
  });

  test("while the display waits for its beat, the page still shows the last one", async () => {
    const { h } = await previewingTheDialogue();
    const before = frame(h.overlay);
    let between: Frame | undefined;

    await h.rerender(source("b", "Do you know?"), DIALOGUE_LINE, {
      afterConnect: () => {
        between = frame(h.overlay);
      },
    });

    expect(between).toEqual(before);
  });

  test("a beat that writes none of them still takes them away, by the sweep", async () => {
    const { h } = await previewingTheDialogue();

    await h.rerender(BEFORE, ACTION_LINE);

    expect(frame(h.overlay)).toEqual({
      textbox: true,
      dialogue: "",
      name: "",
      action: "The rain has not let up.",
      portrait: [],
    });
  });

  test("a display taken over before its sweep leaves its clears to the next one", async () => {
    const { h } = await previewingTheDialogue();

    // Connected, never previewed, never swept: a later display took it over.
    await h.rerender(BEFORE, DIALOGUE_LINE, { connectOnly: true });
    await h.rerender(BEFORE, ACTION_LINE);

    expect(frame(h.overlay)).toEqual({
      textbox: true,
      dialogue: "",
      name: "",
      action: "The rain has not let up.",
      portrait: [],
    });
  });

  test("a first connect on an empty page hides the empty targets at once", async () => {
    // Elements the connect has just created have nothing to keep showing: an
    // empty box must not paint while the first display waits for its beat.
    const h = createDOMHarness(BEFORE, DIALOGUE_LINE);
    await h.ready;
    for (const target of [".dialogue", ".character_name", ".portrait"]) {
      expect(displayed(h.overlay.querySelector(target), h.overlay)).toBe(false);
    }
  });
});
