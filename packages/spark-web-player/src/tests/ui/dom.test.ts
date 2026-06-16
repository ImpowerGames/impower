// Layer 1 — DOM-render golden master.
//
// Pipes the real engine's message stream into the real `UIManager` under jsdom
// and snapshots the resulting overlay DOM. This is the strongest regression
// net: it stays invariant across the engine→consumer relocation refactors.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const SCREEN = `define HERO as character with
  name = "HERO"
end

define BG as image with
  src = "https://example.com/bg.png"
end

screen main with
  stage:
    backdrop:
      image
  textbox:
    character_info:
      character_name:
        text
    dialogue:
      text
end
`;

function story(body: string) {
  return `${SCREEN}\n-> start\n\nscene start\n${body}\nend\n`;
}

describe("dom render", () => {
  test("screen tree renders into overlay", async () => {
    const harness = createDOMHarness(story(`  Hi.`));
    await harness.ready;
    expect(harness.snapshotDOM()).toMatchSnapshot();
  });

  test("dialogue line renders per-glyph text spans", async () => {
    const harness = createDOMHarness(story(`  HERO: Hi.`));
    await harness.ready;
    harness.jumpTo("start");
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotDOM()).toMatchSnapshot();
  });

  test("image show renders background span + img", async () => {
    const harness = createDOMHarness(story(`  [[show backdrop BG]]`));
    await harness.ready;
    harness.jumpTo("start");
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotDOM()).toMatchSnapshot();
  });

  test("inline-styled dialogue (bold) sets font-weight on the styled span", async () => {
    const harness = createDOMHarness(story(`  HERO: This is **bold**.`));
    await harness.ready;
    harness.jumpTo("start");
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotDOM()).toMatchSnapshot();
  });
});

const CHOICE_SCREEN = `screen main with
  dialogue:
    text
  choice 0:
    text
  choice 1:
    text
end
`;

const CHOICE_STORY = `${CHOICE_SCREEN}
-> start

scene start
  Pick:
  choose
    + (a) Apple
      Chose apple.
      -> DONE
    + (b) Banana
      Chose banana.
      -> DONE
  end
end
`;

describe("dom render · choices + real click", () => {
  test("choices render into overlay", async () => {
    const harness = createDOMHarness(CHOICE_STORY);
    await harness.ready;
    harness.jumpTo("start");
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotDOM()).toMatchSnapshot();
  });

  // A real DOM click fires the UIManager's click listener → app.emit(Event)
  // → engine → chosePathToContinue, whose handler clears + hides the choices.
  // (The next beat's text is clock-gated in the real Coordinator and not
  // rendered in this module-level harness; the click→clear is the invariant.)
  test("a real DOM click on a choice clears the choices", async () => {
    const harness = createDOMHarness(CHOICE_STORY);
    await harness.ready;
    harness.jumpTo("start");
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();

    // Find a rendered choice element and dispatch a real jsdom click event.
    // `observe` set pointer-events:auto + a click listener that emits an
    // EventMessage; the stub app routes it back into the engine.
    const choiceEl = harness.overlay.querySelector(
      "[image], .choice, [class*='choice']",
    ) as HTMLElement | null;
    const clickable =
      choiceEl ??
      (Array.from(harness.overlay.querySelectorAll("*")).find((el) =>
        (el as HTMLElement).className?.split(" ").includes("choice"),
      ) as HTMLElement | undefined);
    expect(clickable).toBeTruthy();
    const win = harness.overlay.ownerDocument.defaultView!;
    clickable!.dispatchEvent(
      new win.MouseEvent("click", { bubbles: true, button: 0 }),
    );
    await flushMicrotasks();
    // The choices were cleared + hidden by the round-trip handler.
    expect(harness.snapshotDOM()).toMatchSnapshot();
  });
});
