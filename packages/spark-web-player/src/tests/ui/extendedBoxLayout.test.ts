import { describe, expect, test } from "vitest";
import { writeBeatText } from "@impower/spark-engine/src/game/core/classes/Coordinator";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const SCREEN = `define HERO as character with
  name = "HERO"
end

layout main with
  textbox {
    character_info {
      character_name {
        text
      }
    }
    dialogue {
      text
    }
  }
end
`;

function story(body: string) {
  return `${SCREEN}\n-> start\n\nscene start\n${body}\nend\n`;
}

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
  test("the box's letters start now, and only the continuation's at the beat", async () => {
    const harness = createDOMHarness(story(`  HERO: First .. > .. second.`));
    await harness.ready;
    harness.jumpTo("start");
    await harness.display(harness.nextBeat()!, false);
    const ui = harness.game.module.ui;
    await ui.text.clearAll(ui.getTransientTargets());
    const second = harness.nextBeat()!;
    await Promise.all(writeBeatText(ui, second, false, 5000));
    await flushMicrotasks();
    const letters = [
      ...(harness.overlay
        .querySelector(".dialogue .text")
        ?.querySelectorAll(".text_letter") ?? []),
    ] as any[];
    const starts = letters.map((letter) => letter.__sdReveal?.startTime);
    const carried = second.extended?.["dialogue"] ?? 0;
    expect(carried).toBe("First ".length);
    const now = starts.slice(0, carried);
    const later = starts.slice(carried);
    expect(now.every((start) => start === 0)).toBe(true);
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((start) => start > 0)).toBe(true);
  });

  test("the box shows at once, without waiting for the beat", async () => {
    const extended = await shownAfterClick(`  HERO: First .. > .. second.`);
    const box = extended.overlay.querySelector(".dialogue") as any;
    expect(box?.__sdWait).toBeUndefined();
    const ordinary = await shownAtOnce(`  HERO: First second.`);
    const plain = ordinary.overlay.querySelector(".dialogue") as any;
    expect(plain?.__sdWait).toBeDefined();
  });

  test.each([
    [`  HERO: First .. > .. second.`, `  HERO: First second.`],
    [`  HERO: First   .. > .. second.`, `  HERO: First   second.`],
    [`  HERO: Abso.. >\n  ..lutely!`, `  HERO: Absolutely!`],
    [`  HERO: A.. >\n  ..A`, `  HERO: AA`],
    [`  HERO: One .. > .. two .. > .. three.`, `  HERO: One two three.`],
  ])("%s lays out as %s", async (extended, whole) => {
    const harness = await shownAfterClick(extended);
    if (extended.includes("three")) {
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
