// A box carried on after a click (`First > .. second.`) is written as the text
// it already shows, at once, and then the continuation, revealed. The page
// lays the two writes out as it would one: the continuation goes on in the
// line and word the first write stopped in, and the text the element reads out
// is the whole box.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const SCREEN = `define HERO as character with
  name = "HERO"
end

layout main with
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

/** The dialogue's lines, each as its words. */
function lines(overlay: HTMLElement): string[][] {
  const text = overlay.querySelector(".dialogue .text");
  return [...(text?.querySelectorAll(".text_line") ?? [])].map((line) =>
    [...line.querySelectorAll(".text_word")].map((word) => word.textContent ?? ""),
  );
}

async function shownAfterClick(body: string) {
  const harness = createDOMHarness(story(body));
  await harness.ready;
  harness.jumpTo("start");
  const first = harness.nextBeat()!;
  await harness.display(first, false);
  // Every beat clears the transient text before it writes, as the
  // Coordinator does.
  const ui = harness.game.module.ui;
  await ui.text.clearAll(ui.getTransientTargets());
  const second = harness.nextBeat()!;
  expect(second.extended).toBeDefined();
  await harness.display(second, false);
  await flushMicrotasks();
  return harness;
}

async function shownAtOnce(body: string) {
  const harness = createDOMHarness(story(body));
  await harness.ready;
  harness.jumpTo("start");
  await harness.display(harness.nextBeat()!, false);
  await flushMicrotasks();
  return harness;
}

describe("a box carried on after a click", () => {
  test.each([
    [`  HERO: First > .. second.`, `  HERO: First second.`],
    [`  HERO: Abso >..\n  lutely!`, `  HERO: Absolutely!`],
    [`  HERO: One > .. two > .. three.`, `  HERO: One two three.`],
  ])("%s lays out as %s", async (extended, whole) => {
    const harness = await shownAfterClick(extended);
    if (extended.includes("three")) {
      // The third part carries on after a second click.
      const ui = harness.game.module.ui;
      await ui.text.clearAll(ui.getTransientTargets());
      await harness.display(harness.nextBeat()!, false);
      await flushMicrotasks();
    }
    const reference = await shownAtOnce(whole);
    expect(lines(harness.overlay)).toEqual(lines(reference.overlay));
    expect(lines(harness.overlay)).toHaveLength(1);
    const dialogue = harness.overlay.querySelector(".dialogue");
    expect(dialogue?.getAttribute("text")).toBe(
      reference.overlay.querySelector(".dialogue")?.getAttribute("text"),
    );
  });
});
